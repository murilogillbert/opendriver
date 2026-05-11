import { FastifyBaseLogger } from "fastify";

import { expireCashbackForAllUsers } from "./cashback.js";
import { findStalePendingOrders, reconcileOrderPaymentStatus } from "./payments.js";
import { execute, getPool, query, sqlTypes } from "./db.js";

type JobHandle = {
  stop: () => void;
};

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// Tries to acquire a session-level application lock in SQL Server. Returns true
// when this instance holds the lock — only then should the job actually run.
// `sp_getapplock` is automatically released when the connection closes, so even
// if a worker crashes another replica can pick up the next tick.
async function withDistributedLock<T>(
  resource: string,
  logger: FastifyBaseLogger,
  fn: () => Promise<T>
): Promise<T | null> {
  const pool = await getPool();
  // Dedicated connection so the Session-mode lock is released when we explicitly free it
  // (or when the connection drops). Without this, the pool would reuse the same
  // session and successive ticks could fail to acquire even after the prior one freed.
  const request = pool.request();
  const lockResult = await request
    .input("Resource", sqlTypes.NVarChar(255), `opendriver.job.${resource}`)
    .input("LockMode", sqlTypes.NVarChar(32), "Exclusive")
    .input("LockOwner", sqlTypes.NVarChar(32), "Session")
    .input("LockTimeout", sqlTypes.Int, 0)
    .output("Result", sqlTypes.Int)
    .execute("sp_getapplock");
  const code = Number(lockResult.output?.Result ?? -999);
  if (code < 0) {
    logger.debug({ resource, code }, "job_lock_skipped");
    return null;
  }
  try {
    return await fn();
  } finally {
    await pool
      .request()
      .input("Resource", sqlTypes.NVarChar(255), `opendriver.job.${resource}`)
      .input("LockOwner", sqlTypes.NVarChar(32), "Session")
      .execute("sp_releaseapplock")
      .catch(() => undefined);
  }
}

// Looks for orders still pending well after creation and asks Mercado Pago for the
// authoritative status. Catches the case where a webhook was lost or never delivered.
function startWebhookRetryJob(logger: FastifyBaseLogger): JobHandle {
  const intervalMs = HOUR_MS;
  let stopped = false;

  const run = async () => {
    if (stopped) return;
    await withDistributedLock("webhook_retry", logger, async () => {
      try {
        const stale = await findStalePendingOrders({ olderThanMinutes: 15, limit: 50 });
        for (const order of stale) {
          if (stopped) break;
          await reconcileOrderPaymentStatus({
            orderId: order.id,
            paymentId: order.mercado_pago_payment_id,
            externalReference: order.payment_reference,
            eventType: "scheduled_retry"
          }).catch((err) => {
            logger.warn({ err, orderId: order.id }, "webhook_retry_reconcile_failed");
          });
        }
        if (stale.length > 0) {
          logger.info({ scanned: stale.length }, "webhook_retry_job_completed");
        }
      } catch (err) {
        logger.error({ err }, "webhook_retry_job_failed");
      }
    });
  };

  const interval = setInterval(() => void run(), intervalMs);
  // Run once shortly after boot so we don't have to wait an hour after a deploy.
  setTimeout(() => void run(), 30_000);
  return { stop: () => { stopped = true; clearInterval(interval); } };
}

// Daily sweep: per-user, expire any cashback balance that came from credits older than the TTL.
function startCashbackExpirationJob(logger: FastifyBaseLogger): JobHandle {
  const intervalMs = DAY_MS;
  let stopped = false;

  const run = async () => {
    if (stopped) return;
    await withDistributedLock("cashback_expiration", logger, async () => {
      try {
        const result = await expireCashbackForAllUsers();
        if (result.totalExpired > 0 || result.usersAffected > 0) {
          logger.info(result, "cashback_expiration_completed");
        }
      } catch (err) {
        logger.error({ err }, "cashback_expiration_failed");
      }
    });
  };

  const interval = setInterval(() => void run(), intervalMs);
  setTimeout(() => void run(), 60_000);
  return { stop: () => { stopped = true; clearInterval(interval); } };
}

// Daily: mark benefit_activations as expired once their expires_at passes.
function startBenefitExpirationJob(logger: FastifyBaseLogger): JobHandle {
  const intervalMs = 6 * HOUR_MS;
  let stopped = false;

  const run = async () => {
    if (stopped) return;
    await withDistributedLock("benefit_expiration", logger, async () => {
      try {
        const result = await execute<{ id: number }>(
          `UPDATE dbo.benefit_activations
              SET status = 'expirado', updated_at = SYSUTCDATETIME()
            OUTPUT INSERTED.id
            WHERE status = 'ativo' AND expires_at IS NOT NULL AND expires_at < SYSUTCDATETIME()`
        );
        if (result.recordset.length > 0) {
          logger.info({ expired: result.recordset.length }, "benefit_expiration_completed");
        }
      } catch (err) {
        logger.error({ err }, "benefit_expiration_failed");
      }
    });
  };

  const interval = setInterval(() => void run(), intervalMs);
  setTimeout(() => void run(), 90_000);
  return { stop: () => { stopped = true; clearInterval(interval); } };
}

// Daily: notify users whose cashback is about to expire (within 7 days).
// Idempotent — uses notification's titulo to avoid duplicates per user/window.
function startCashbackExpiringNotificationJob(logger: FastifyBaseLogger): JobHandle {
  const intervalMs = DAY_MS;
  let stopped = false;

  const run = async () => {
    if (stopped) return;
    await withDistributedLock("cashback_expiring_notification", logger, async () => {
      try {
        // Find users with credit expiring in next 7 days, with a positive remaining balance.
        const targets = await query<{ user_id: number; total: number; next_expires: Date }>(
        `SELECT t.user_id, SUM(t.valor) AS total, MIN(t.expires_at) AS next_expires
           FROM dbo.cashback_transactions t
           JOIN dbo.users u ON u.id = t.user_id
          WHERE t.tipo = 'credito'
            AND t.expires_at IS NOT NULL
            AND t.expires_at > SYSUTCDATETIME()
            AND t.expires_at <= DATEADD(DAY, 7, SYSUTCDATETIME())
            AND COALESCE(u.cashback_balance, 0) > 0
          GROUP BY t.user_id`
      );

      let notified = 0;
      for (const target of targets) {
        if (stopped) break;
        const valor = Number(target.total ?? 0);
        if (valor <= 0) continue;

        // Idempotency: only insert if no notification with the same title was created in the last 5 days.
        const titulo = "Seu cashback vai expirar em breve";
        const exists = await query<{ id: number }>(
          `SELECT TOP 1 id FROM dbo.notifications
            WHERE user_id = @user_id
              AND titulo = @titulo
              AND created_at >= DATEADD(DAY, -5, SYSUTCDATETIME())`,
          (req) =>
            req
              .input("user_id", sqlTypes.BigInt, target.user_id)
              .input("titulo", sqlTypes.NVarChar(140), titulo)
        );
        if (exists[0]) continue;

        const valorFormatted = `R$ ${valor.toFixed(2).replace(".", ",")}`;
        const mensagem = `Voce tem ${valorFormatted} de cashback que vai expirar em breve. Use antes de perder!`;

        await execute(
          `INSERT INTO dbo.notifications (user_id, titulo, mensagem, canal)
           VALUES (@user_id, @titulo, @mensagem, 'app')`,
          (req) =>
            req
              .input("user_id", sqlTypes.BigInt, target.user_id)
              .input("titulo", sqlTypes.NVarChar(140), titulo)
              .input("mensagem", sqlTypes.NVarChar(500), mensagem)
        );
        notified += 1;
      }

        if (notified > 0) {
          logger.info({ notified }, "cashback_expiring_notifications_sent");
        }
      } catch (err) {
        logger.error({ err }, "cashback_expiring_notifications_failed");
      }
    });
  };

  const interval = setInterval(() => void run(), intervalMs);
  setTimeout(() => void run(), 120_000);
  return { stop: () => { stopped = true; clearInterval(interval); } };
}

export function startBackgroundJobs(logger: FastifyBaseLogger): JobHandle {
  const handles = [
    startWebhookRetryJob(logger),
    startCashbackExpirationJob(logger),
    startBenefitExpirationJob(logger),
    startCashbackExpiringNotificationJob(logger)
  ];
  return {
    stop: () => handles.forEach((handle) => handle.stop())
  };
}

// Re-exported for ad-hoc execution (admin endpoints, scripts).
export { findStalePendingOrders, expireCashbackForAllUsers };

void sqlTypes; // keep import in case a future job uses parameterised queries directly
