import { query, sqlTypes, withTransaction } from "./db.js";
import type { TxRunner } from "./db.js";

// Tier rates expressed as percentages of the paid amount.
// Tier always wins over product.cashback_percent UNLESS the product is set higher,
// in which case the per-product override applies (acts as a per-offer boost).
const TIER_RATES = {
  Bronze: 2,
  Prata: 5,
  Ouro: 8
} as const;

const CASHBACK_TTL_DAYS = 90;

export type CashbackTier = keyof typeof TIER_RATES;

export function tierForMonthlyAcquisitions(monthly: number): CashbackTier {
  if (monthly >= 10) return "Ouro";
  if (monthly >= 5) return "Prata";
  return "Bronze";
}

export function tierRate(tier: CashbackTier) {
  return TIER_RATES[tier];
}

export async function loadUserMonthlyAcquisitions(userId: number): Promise<number> {
  const rows = await query<{ count: number }>(
    `SELECT COUNT(*) AS count
       FROM dbo.product_orders
      WHERE user_id = @user_id
        AND status IN ('confirmado', 'enviado', 'entregue')
        AND created_at >= DATEFROMPARTS(YEAR(SYSUTCDATETIME()), MONTH(SYSUTCDATETIME()), 1)`,
    (request) => request.input("user_id", sqlTypes.BigInt, userId)
  );
  return Number(rows[0]?.count ?? 0);
}

export async function effectiveCashbackPercent(input: {
  userId: number;
  productCashbackPercent: number | null;
}) {
  const monthly = await loadUserMonthlyAcquisitions(input.userId);
  const tier = tierForMonthlyAcquisitions(monthly);
  const tierPct = tierRate(tier);
  const productPct = Number(input.productCashbackPercent ?? 0);
  // Tier sets the floor; an explicit per-product percent above the tier rate wins (admin override).
  return Math.max(tierPct, productPct);
}

export type CashbackBalance = {
  balance: number;
  tier: CashbackTier;
  monthlyAcquisitions: number;
  tierRate: number;
  expiringSoon: number;
};

export async function loadCashbackBalance(userId: number): Promise<CashbackBalance> {
  const rows = await query<{ cashback_balance: number }>(
    `SELECT COALESCE(cashback_balance, 0) AS cashback_balance FROM dbo.users WHERE id = @id`,
    (request) => request.input("id", sqlTypes.BigInt, userId)
  );
  const balance = Number(rows[0]?.cashback_balance ?? 0);

  const monthly = await loadUserMonthlyAcquisitions(userId);
  const tier = tierForMonthlyAcquisitions(monthly);

  // Money that will leave the wallet within 30 days if unused.
  const expiringRows = await query<{ total: number }>(
    `SELECT COALESCE(SUM(valor), 0) AS total
       FROM dbo.cashback_transactions
      WHERE user_id = @id
        AND tipo = 'credito'
        AND expires_at IS NOT NULL
        AND expires_at <= DATEADD(DAY, 30, SYSUTCDATETIME())
        AND expires_at > SYSUTCDATETIME()`,
    (request) => request.input("id", sqlTypes.BigInt, userId)
  );
  // The headline number is bounded by the actual balance, since old credits may have already been spent.
  const expiringSoon = Math.min(balance, Number(expiringRows[0]?.total ?? 0));

  return {
    balance,
    tier,
    monthlyAcquisitions: monthly,
    tierRate: tierRate(tier),
    expiringSoon
  };
}

type CreditInput = {
  userId: number;
  orderId: number | null;
  valor: number;
  descricao: string;
};

export async function creditCashback(tx: TxRunner, input: CreditInput) {
  if (input.valor <= 0) return null;

  // Bump the wallet balance under the row lock acquired earlier in the transaction
  // and read back the new balance for the ledger entry.
  const updated = await tx.query<{ saldo_apos: number }>(
    `UPDATE dbo.users
        SET cashback_balance = COALESCE(cashback_balance, 0) + @valor,
            updated_at = SYSUTCDATETIME()
       OUTPUT INSERTED.cashback_balance AS saldo_apos
      WHERE id = @id`,
    (request) =>
      request
        .input("id", sqlTypes.BigInt, input.userId)
        .input("valor", sqlTypes.Decimal(12, 2), input.valor)
  );
  const saldoApos = Number(updated[0]?.saldo_apos ?? 0);

  await tx.execute(
    `INSERT INTO dbo.cashback_transactions (user_id, order_id, tipo, valor, saldo_apos, descricao, expires_at)
     VALUES (@user_id, @order_id, 'credito', @valor, @saldo_apos, @descricao, DATEADD(DAY, ${CASHBACK_TTL_DAYS}, SYSUTCDATETIME()))`,
    (request) =>
      request
        .input("user_id", sqlTypes.BigInt, input.userId)
        .input("order_id", sqlTypes.BigInt, input.orderId)
        .input("valor", sqlTypes.Decimal(12, 2), input.valor)
        .input("saldo_apos", sqlTypes.Decimal(12, 2), saldoApos)
        .input("descricao", sqlTypes.NVarChar(240), input.descricao)
  );

  return saldoApos;
}

export type DebitResult =
  | { ok: true; saldoApos: number; valor: number }
  | { ok: false; reason: "insufficient_balance" };

type DebitInput = {
  userId: number;
  orderId: number | null;
  valor: number;
  descricao: string;
};

// Atomically debits the user's wallet inside a transaction. Refuses to overdraw.
export async function debitCashback(tx: TxRunner, input: DebitInput): Promise<DebitResult> {
  if (input.valor <= 0) return { ok: true, saldoApos: 0, valor: 0 };

  const updated = await tx.query<{ saldo_apos: number; affected: number }>(
    `UPDATE dbo.users
        SET cashback_balance = cashback_balance - @valor,
            updated_at = SYSUTCDATETIME()
       OUTPUT INSERTED.cashback_balance AS saldo_apos, 1 AS affected
      WHERE id = @id AND COALESCE(cashback_balance, 0) >= @valor`,
    (request) =>
      request
        .input("id", sqlTypes.BigInt, input.userId)
        .input("valor", sqlTypes.Decimal(12, 2), input.valor)
  );

  if (updated.length === 0) {
    return { ok: false, reason: "insufficient_balance" };
  }

  const saldoApos = Number(updated[0].saldo_apos);

  await tx.execute(
    `INSERT INTO dbo.cashback_transactions (user_id, order_id, tipo, valor, saldo_apos, descricao)
     VALUES (@user_id, @order_id, 'debito', @valor, @saldo_apos, @descricao)`,
    (request) =>
      request
        .input("user_id", sqlTypes.BigInt, input.userId)
        .input("order_id", sqlTypes.BigInt, input.orderId)
        .input("valor", sqlTypes.Decimal(12, 2), input.valor)
        .input("saldo_apos", sqlTypes.Decimal(12, 2), saldoApos)
        .input("descricao", sqlTypes.NVarChar(240), input.descricao)
  );

  return { ok: true, saldoApos, valor: input.valor };
}

// Reverses a previously applied debit (used when an order is refunded).
export async function refundCashbackDebit(tx: TxRunner, input: { userId: number; orderId: number; valor: number; descricao: string }) {
  if (input.valor <= 0) return null;

  const updated = await tx.query<{ saldo_apos: number }>(
    `UPDATE dbo.users
        SET cashback_balance = COALESCE(cashback_balance, 0) + @valor,
            updated_at = SYSUTCDATETIME()
       OUTPUT INSERTED.cashback_balance AS saldo_apos
      WHERE id = @id`,
    (request) =>
      request
        .input("id", sqlTypes.BigInt, input.userId)
        .input("valor", sqlTypes.Decimal(12, 2), input.valor)
  );
  const saldoApos = Number(updated[0]?.saldo_apos ?? 0);

  await tx.execute(
    `INSERT INTO dbo.cashback_transactions (user_id, order_id, tipo, valor, saldo_apos, descricao)
     VALUES (@user_id, @order_id, 'estornado', @valor, @saldo_apos, @descricao)`,
    (request) =>
      request
        .input("user_id", sqlTypes.BigInt, input.userId)
        .input("order_id", sqlTypes.BigInt, input.orderId)
        .input("valor", sqlTypes.Decimal(12, 2), input.valor)
        .input("saldo_apos", sqlTypes.Decimal(12, 2), saldoApos)
        .input("descricao", sqlTypes.NVarChar(240), input.descricao)
  );

  return saldoApos;
}

// Removes a previously credited cashback (used when an approved order is refunded).
// Caps at the current balance — if the user already spent the cashback, only what's left is removed.
export async function clawbackCashbackCredit(tx: TxRunner, input: { userId: number; orderId: number; valor: number; descricao: string }) {
  if (input.valor <= 0) return null;

  const userRow = await tx.query<{ cashback_balance: number }>(
    `SELECT COALESCE(cashback_balance, 0) AS cashback_balance FROM dbo.users WITH (UPDLOCK, ROWLOCK) WHERE id = @id`,
    (request) => request.input("id", sqlTypes.BigInt, input.userId)
  );
  const current = Number(userRow[0]?.cashback_balance ?? 0);
  const removable = Math.min(current, input.valor);
  if (removable <= 0) return current;

  const updated = await tx.query<{ saldo_apos: number }>(
    `UPDATE dbo.users
        SET cashback_balance = cashback_balance - @valor,
            updated_at = SYSUTCDATETIME()
       OUTPUT INSERTED.cashback_balance AS saldo_apos
      WHERE id = @id`,
    (request) =>
      request
        .input("id", sqlTypes.BigInt, input.userId)
        .input("valor", sqlTypes.Decimal(12, 2), removable)
  );
  const saldoApos = Number(updated[0]?.saldo_apos ?? 0);

  await tx.execute(
    `INSERT INTO dbo.cashback_transactions (user_id, order_id, tipo, valor, saldo_apos, descricao)
     VALUES (@user_id, @order_id, 'estornado', @valor, @saldo_apos, @descricao)`,
    (request) =>
      request
        .input("user_id", sqlTypes.BigInt, input.userId)
        .input("order_id", sqlTypes.BigInt, input.orderId)
        .input("valor", sqlTypes.Decimal(12, 2), removable)
        .input("saldo_apos", sqlTypes.Decimal(12, 2), saldoApos)
        .input("descricao", sqlTypes.NVarChar(240), input.descricao)
  );

  return saldoApos;
}

// Single-balance proportional expiration: at any point, "fresh credits" are credito
// rows still inside the TTL window. If the wallet balance is greater than fresh credits,
// the difference is by definition aged-out money and gets expired.
export async function expireCashbackForUser(userId: number) {
  return withTransaction(async (tx) => {
    const userRow = await tx.query<{ cashback_balance: number }>(
      `SELECT COALESCE(cashback_balance, 0) AS cashback_balance
         FROM dbo.users WITH (UPDLOCK, ROWLOCK)
        WHERE id = @id`,
      (request) => request.input("id", sqlTypes.BigInt, userId)
    );
    const balance = Number(userRow[0]?.cashback_balance ?? 0);
    if (balance <= 0) return { expired: 0, balance };

    const freshRows = await tx.query<{ fresh: number }>(
      `SELECT COALESCE(SUM(valor), 0) AS fresh
         FROM dbo.cashback_transactions
        WHERE user_id = @id
          AND tipo = 'credito'
          AND expires_at IS NOT NULL
          AND expires_at > SYSUTCDATETIME()`,
      (request) => request.input("id", sqlTypes.BigInt, userId)
    );
    const fresh = Number(freshRows[0]?.fresh ?? 0);

    const toExpire = Math.max(0, Number((balance - fresh).toFixed(2)));
    if (toExpire <= 0) return { expired: 0, balance };

    const updated = await tx.query<{ saldo_apos: number }>(
      `UPDATE dbo.users
          SET cashback_balance = cashback_balance - @valor,
              updated_at = SYSUTCDATETIME()
         OUTPUT INSERTED.cashback_balance AS saldo_apos
        WHERE id = @id`,
      (request) =>
        request
          .input("id", sqlTypes.BigInt, userId)
          .input("valor", sqlTypes.Decimal(12, 2), toExpire)
    );
    const saldoApos = Number(updated[0]?.saldo_apos ?? 0);

    await tx.execute(
      `INSERT INTO dbo.cashback_transactions (user_id, order_id, tipo, valor, saldo_apos, descricao)
       VALUES (@user_id, NULL, 'expirado', @valor, @saldo_apos, @descricao)`,
      (request) =>
        request
          .input("user_id", sqlTypes.BigInt, userId)
          .input("valor", sqlTypes.Decimal(12, 2), toExpire)
          .input("saldo_apos", sqlTypes.Decimal(12, 2), saldoApos)
          .input("descricao", sqlTypes.NVarChar(240), `Expiracao automatica apos ${CASHBACK_TTL_DAYS} dias.`)
    );

    return { expired: toExpire, balance: saldoApos };
  });
}

export async function expireCashbackForAllUsers() {
  // Candidates: anyone with positive balance whose oldest still-fresh credit is already smaller than the balance.
  // Cheaper to just scan users with balance > 0 and let the per-user check decide.
  const candidates = await query<{ id: number }>(
    `SELECT id FROM dbo.users WHERE COALESCE(cashback_balance, 0) > 0`
  );

  let totalExpired = 0;
  let usersAffected = 0;
  for (const row of candidates) {
    const result = await expireCashbackForUser(row.id).catch((err) => {
      console.error("expire_cashback_failed", { userId: row.id, err });
      return null;
    });
    if (result && result.expired > 0) {
      totalExpired += result.expired;
      usersAffected += 1;
    }
  }

  return { totalExpired, usersAffected, scanned: candidates.length };
}

export async function listCashbackTransactions(userId: number, limit = 50) {
  return query(
    `SELECT TOP (@limit) id, order_id, tipo, valor, saldo_apos, descricao, expires_at, created_at
       FROM dbo.cashback_transactions
      WHERE user_id = @user_id
      ORDER BY created_at DESC`,
    (request) =>
      request
        .input("user_id", sqlTypes.BigInt, userId)
        .input("limit", sqlTypes.Int, limit)
  );
}

// Idempotently credit a user for an approved order. No-op if a credit was already issued for this order.
export async function ensureOrderCashbackCredit(input: {
  userId: number;
  orderId: number;
  paidAmount: number;
  productCashbackPercent: number | null;
  productName: string;
}) {
  return withTransaction(async (tx) => {
    const existing = await tx.query<{ id: number }>(
      `SELECT TOP 1 id FROM dbo.cashback_transactions WHERE order_id = @order_id AND tipo = 'credito'`,
      (request) => request.input("order_id", sqlTypes.BigInt, input.orderId)
    );
    if (existing[0]) return null;

    const percent = await effectiveCashbackPercent({
      userId: input.userId,
      productCashbackPercent: input.productCashbackPercent
    });
    const valor = Number(((input.paidAmount * percent) / 100).toFixed(2));
    if (valor <= 0) return null;

    const saldo = await creditCashback(tx, {
      userId: input.userId,
      orderId: input.orderId,
      valor,
      descricao: `Cashback de ${input.productName} (${percent}%).`
    });

    await tx.execute(
      `UPDATE dbo.product_orders
          SET cashback_creditado = @valor,
              updated_at = SYSUTCDATETIME()
        WHERE id = @id`,
      (request) =>
        request
          .input("id", sqlTypes.BigInt, input.orderId)
          .input("valor", sqlTypes.Decimal(12, 2), valor)
    );

    return { valor, percent, saldo };
  });
}
