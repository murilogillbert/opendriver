import { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";

import { writeAuditLog } from "./audit.js";
import { requireAdmin, requireUser } from "./auth.js";
import { execute, query, sqlTypes } from "./db.js";

const partnerLocationSchema = z.object({
  partner_id: z.coerce.number().int().positive(),
  nome: z.string().trim().min(2).max(140),
  endereco: z.string().trim().max(240).optional().nullable(),
  latitude: z.coerce.number().gte(-90).lte(90),
  longitude: z.coerce.number().gte(-180).lte(180),
  raio_metros: z.coerce.number().int().min(20).max(5000).default(120),
  status: z.enum(["ativo", "pausado", "inativo"]).default("ativo")
});

const consentSchema = z.object({
  granted: z.boolean(),
  consent_version: z.string().trim().min(1).max(20).default("v1")
});

const geofenceEventSchema = z.object({
  event_type: z.enum(["enter", "dwell", "exit"]),
  latitude: z.coerce.number().gte(-90).lte(90),
  longitude: z.coerce.number().gte(-180).lte(180),
  accuracy_m: z.coerce.number().nonnegative().optional(),
  occurred_at: z.coerce.string().optional(),
  source: z.string().trim().max(30).default("app")
});

const userAgent = (request: FastifyRequest) => {
  const ua = request.headers["user-agent"];
  return typeof ua === "string" ? ua.slice(0, 240) : null;
};

const clientIp = (request: FastifyRequest) => {
  const forwarded = request.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0]?.trim() ?? null;
  }
  return request.ip ?? null;
};

// Haversine in meters - compact and good enough for 1-5km bands.
function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

async function activeConsentFor(userId: number) {
  const rows = await query<{ id: number; granted: boolean }>(
    `SELECT TOP 1 id, granted
       FROM dbo.location_consents
      WHERE user_id = @user_id AND revoked_at IS NULL
      ORDER BY granted_at DESC`,
    (req) => req.input("user_id", sqlTypes.BigInt, userId)
  );
  return rows[0] && rows[0].granted ? rows[0] : null;
}

export async function registerGeoRoutes(app: FastifyInstance) {
  app.post("/api/admin/partner-locations", async (request, reply) => {
    const admin = await requireAdmin(request);
    const body = partnerLocationSchema.parse(request.body);
    const result = await execute<{ id: number }>(
      `INSERT INTO dbo.partner_locations (partner_id, nome, endereco, latitude, longitude, raio_metros, status)
       OUTPUT INSERTED.id
       VALUES (@partner_id, @nome, @endereco, @latitude, @longitude, @raio_metros, @status)`,
      (req) =>
        req
          .input("partner_id", sqlTypes.BigInt, body.partner_id)
          .input("nome", sqlTypes.NVarChar(140), body.nome)
          .input("endereco", sqlTypes.NVarChar(240), body.endereco ?? null)
          .input("latitude", sqlTypes.Decimal(10, 7), body.latitude)
          .input("longitude", sqlTypes.Decimal(10, 7), body.longitude)
          .input("raio_metros", sqlTypes.Int, body.raio_metros)
          .input("status", sqlTypes.VarChar(20), body.status)
    );

    await writeAuditLog({
      actorId: admin.id,
      action: "partner_location.created",
      entityType: "partner_location",
      entityId: result.recordset[0].id,
      payload: body,
      ipAddress: clientIp(request)
    });

    return reply.code(201).send({ data: result.recordset[0] });
  });

  app.get("/api/admin/partner-locations", async (request) => {
    await requireAdmin(request);
    const data = await query(
      `SELECT pl.*, p.nome_fantasia AS partner_nome
         FROM dbo.partner_locations pl
         JOIN dbo.partners p ON p.id = pl.partner_id
        ORDER BY pl.created_at DESC`
    );
    return { data };
  });

  app.post("/api/me/location-consent", async (request, reply) => {
    const user = await requireUser(request);
    const body = consentSchema.parse(request.body);

    if (!body.granted) {
      await execute(
        `UPDATE dbo.location_consents
            SET revoked_at = SYSUTCDATETIME()
          WHERE user_id = @user_id AND revoked_at IS NULL`,
        (req) => req.input("user_id", sqlTypes.BigInt, user.id)
      );
    }

    const result = await execute<{ id: number }>(
      `INSERT INTO dbo.location_consents (user_id, consent_version, granted, ip_address, user_agent)
       OUTPUT INSERTED.id
       VALUES (@user_id, @version, @granted, @ip, @ua)`,
      (req) =>
        req
          .input("user_id", sqlTypes.BigInt, user.id)
          .input("version", sqlTypes.VarChar(20), body.consent_version)
          .input("granted", sqlTypes.Bit, body.granted ? 1 : 0)
          .input("ip", sqlTypes.VarChar(64), clientIp(request))
          .input("ua", sqlTypes.NVarChar(240), userAgent(request))
    );

    await writeAuditLog({
      actorId: user.id,
      action: "location.consent_recorded",
      entityType: "location_consent",
      entityId: result.recordset[0].id,
      payload: { granted: body.granted, version: body.consent_version },
      ipAddress: clientIp(request)
    });

    return reply.code(201).send({ data: { id: result.recordset[0].id, granted: body.granted } });
  });

  app.post("/api/me/geofence/event", async (request, reply) => {
    const user = await requireUser(request);
    const consent = await activeConsentFor(user.id);
    if (!consent) {
      return reply.code(403).send({ error: "location_consent_required" });
    }

    const body = geofenceEventSchema.parse(request.body);

    // Find the closest active partner location within 5km. Filtering globally would be
    // expensive on a large table; the bounding box keeps the candidate set small.
    const latDelta = 5000 / 111320;
    const lonDelta = 5000 / (111320 * Math.cos((body.latitude * Math.PI) / 180));
    const candidates = await query<{
      id: number;
      partner_id: number;
      latitude: number;
      longitude: number;
      raio_metros: number;
    }>(
      `SELECT id, partner_id, latitude, longitude, raio_metros
         FROM dbo.partner_locations
        WHERE status = 'ativo'
          AND latitude BETWEEN @lat_min AND @lat_max
          AND longitude BETWEEN @lon_min AND @lon_max`,
      (req) =>
        req
          .input("lat_min", sqlTypes.Decimal(10, 7), body.latitude - latDelta)
          .input("lat_max", sqlTypes.Decimal(10, 7), body.latitude + latDelta)
          .input("lon_min", sqlTypes.Decimal(10, 7), body.longitude - lonDelta)
          .input("lon_max", sqlTypes.Decimal(10, 7), body.longitude + lonDelta)
    );

    let bestMatch: { id: number; partner_id: number; distance: number; raio: number } | null = null;
    for (const candidate of candidates) {
      const distance = distanceMeters(
        body.latitude,
        body.longitude,
        Number(candidate.latitude),
        Number(candidate.longitude)
      );
      if (!bestMatch || distance < bestMatch.distance) {
        bestMatch = {
          id: candidate.id,
          partner_id: candidate.partner_id,
          distance,
          raio: candidate.raio_metros
        };
      }
    }

    const occurredAt = body.occurred_at ? new Date(body.occurred_at) : new Date();
    const insert = await execute<{ id: number }>(
      `INSERT INTO dbo.geofence_events (
          user_id, partner_location_id, partner_id, event_type, latitude, longitude,
          accuracy_m, distance_m, source, occurred_at
        )
        OUTPUT INSERTED.id
        VALUES (
          @user_id, @partner_location_id, @partner_id, @event_type, @latitude, @longitude,
          @accuracy_m, @distance_m, @source, @occurred_at
        )`,
      (req) =>
        req
          .input("user_id", sqlTypes.BigInt, user.id)
          .input("partner_location_id", sqlTypes.BigInt, bestMatch?.id ?? null)
          .input("partner_id", sqlTypes.BigInt, bestMatch?.partner_id ?? null)
          .input("event_type", sqlTypes.VarChar(20), body.event_type)
          .input("latitude", sqlTypes.Decimal(10, 7), body.latitude)
          .input("longitude", sqlTypes.Decimal(10, 7), body.longitude)
          .input("accuracy_m", sqlTypes.Decimal(8, 2), body.accuracy_m ?? null)
          .input("distance_m", sqlTypes.Decimal(10, 2), bestMatch?.distance ?? null)
          .input("source", sqlTypes.VarChar(30), body.source)
          .input("occurred_at", sqlTypes.DateTime2, occurredAt)
    );
    const eventId = insert.recordset[0].id;

    let alertId: number | null = null;
    const insidePerimeter = bestMatch !== null && bestMatch.distance <= bestMatch.raio;
    if (bestMatch && insidePerimeter && body.event_type !== "exit") {
      const matchedPartnerId = bestMatch.partner_id;
      const activeBenefit = await query<{ id: number }>(
        `SELECT TOP 1 a.id
           FROM dbo.benefit_activations a
           JOIN dbo.products p ON p.id = a.product_id
          WHERE a.user_id = @user_id
            AND a.status = 'ativo'
            AND (p.partner_id = @partner_id OR p.partner_id IS NULL)`,
        (req) =>
          req
            .input("user_id", sqlTypes.BigInt, user.id)
            .input("partner_id", sqlTypes.BigInt, matchedPartnerId)
      );

      if (activeBenefit[0]) {
        const alertInsert = await execute<{ id: number }>(
          `INSERT INTO dbo.benefit_match_alerts (
              user_id, partner_id, activation_id, geofence_event_id, status
            )
            OUTPUT INSERTED.id
            VALUES (@user_id, @partner_id, @activation_id, @geofence_event_id, 'pendente')`,
          (req) =>
            req
              .input("user_id", sqlTypes.BigInt, user.id)
              .input("partner_id", sqlTypes.BigInt, matchedPartnerId)
              .input("activation_id", sqlTypes.BigInt, activeBenefit[0].id)
              .input("geofence_event_id", sqlTypes.BigInt, eventId)
        );
        alertId = alertInsert.recordset[0].id;
      }
    }

    return reply.code(201).send({
      data: {
        event_id: eventId,
        partner_id: bestMatch?.partner_id ?? null,
        distance_m: bestMatch?.distance ?? null,
        inside_perimeter: insidePerimeter,
        alert_id: alertId
      }
    });
  });

  app.get("/api/admin/benefit-alerts", async (request) => {
    await requireAdmin(request);
    const data = await query(
      `SELECT al.*, u.nome AS user_nome, p.nome_fantasia AS partner_nome,
              ba.voucher_code, ba.redemption_token
         FROM dbo.benefit_match_alerts al
         JOIN dbo.users u ON u.id = al.user_id
         JOIN dbo.partners p ON p.id = al.partner_id
         LEFT JOIN dbo.benefit_activations ba ON ba.id = al.activation_id
        ORDER BY al.triggered_at DESC`
    );
    return { data };
  });

  app.patch("/api/admin/benefit-alerts/:id", async (request) => {
    const admin = await requireAdmin(request);
    const params = request.params as { id: string };
    const body = z
      .object({
        status: z.enum(["pendente", "notificado", "confirmado", "descartado"]),
        notes: z.string().trim().max(500).optional()
      })
      .parse(request.body);

    await execute(
      `UPDATE dbo.benefit_match_alerts
          SET status = @status,
              notes = COALESCE(@notes, notes),
              confirmed_at = CASE WHEN @status = 'confirmado' THEN SYSUTCDATETIME() ELSE confirmed_at END,
              dismissed_at = CASE WHEN @status = 'descartado' THEN SYSUTCDATETIME() ELSE dismissed_at END
        WHERE id = @id`,
      (req) =>
        req
          .input("id", sqlTypes.BigInt, Number(params.id))
          .input("status", sqlTypes.VarChar(20), body.status)
          .input("notes", sqlTypes.NVarChar(500), body.notes ?? null)
    );

    await writeAuditLog({
      actorId: admin.id,
      action: "benefit_alert.status_updated",
      entityType: "benefit_match_alert",
      entityId: Number(params.id),
      payload: body,
      ipAddress: clientIp(request)
    });

    return { data: { id: Number(params.id), status: body.status } };
  });
}
