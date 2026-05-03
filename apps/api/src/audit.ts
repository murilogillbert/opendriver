import { execute, sqlTypes } from "./db.js";

export type AuditEntry = {
  actorId?: number | null;
  action: string;
  entityType?: string | null;
  entityId?: number | string | null;
  payload?: unknown;
  ipAddress?: string | null;
};

export async function writeAuditLog(entry: AuditEntry) {
  try {
    await execute(
      `INSERT INTO dbo.audit_logs (actor_id, action, entity_type, entity_id, payload, ip_address)
       VALUES (@actor_id, @action, @entity_type, @entity_id, @payload, @ip_address)`,
      (request) =>
        request
          .input("actor_id", sqlTypes.BigInt, entry.actorId ?? null)
          .input("action", sqlTypes.VarChar(80), entry.action)
          .input("entity_type", sqlTypes.VarChar(60), entry.entityType ?? null)
          .input("entity_id", sqlTypes.NVarChar(80), entry.entityId != null ? String(entry.entityId) : null)
          .input(
            "payload",
            sqlTypes.NVarChar(sqlTypes.MAX),
            entry.payload === undefined ? null : JSON.stringify(entry.payload)
          )
          .input("ip_address", sqlTypes.VarChar(64), entry.ipAddress ?? null)
    );
  } catch (error) {
    // Auditing must never break the business operation. We swallow errors and rely
    // on a future log shipper to surface failures in the audit_logs table itself.
    console.error("audit_log_write_failed", error);
  }
}
