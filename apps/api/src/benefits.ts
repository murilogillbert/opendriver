import { randomBytes } from "crypto";

import { execute, query, sqlTypes } from "./db.js";

export type ActivationProductInput = {
  id: number;
  offer_type?: string | null;
  delivery_method?: string | null;
  limite_resgates?: number | null;
};

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateRedemptionToken() {
  const bytes = randomBytes(12);
  let token = "";
  for (let i = 0; i < 12; i += 1) {
    token += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return token;
}

const presencialOfferTypes = new Set(["servico", "voucher", "beneficio_recorrente", "combo"]);

export function shouldCreateActivationFor(product: ActivationProductInput) {
  if (product.delivery_method === "presencial") return true;
  if (product.offer_type && presencialOfferTypes.has(product.offer_type)) return true;
  return false;
}

// Single redemption is the default for every offer type except recurring benefits.
// A recurring benefit (clube farmacia, assinaturas, planos mensais...) can be redeemed
// multiple times; the per-product limite_resgates caps the total. Everything else
// (servico, voucher, combo, produto_fisico, produto_digital) is one-shot — once the
// partner validates, the activation is exhausted.
export function effectiveRedemptionLimit(product: ActivationProductInput): number | null {
  if (product.offer_type === "beneficio_recorrente") {
    return product.limite_resgates ?? null;
  }
  return 1;
}

export async function createBenefitActivation(input: {
  userId: number;
  product: ActivationProductInput;
  orderId: number;
  voucherCode: string | null;
}) {
  const token = generateRedemptionToken();
  const result = await execute<{ id: number; redemption_token: string }>(
    `INSERT INTO dbo.benefit_activations (
        user_id, product_id, order_id, voucher_code, redemption_token, redemption_limit
      )
      OUTPUT INSERTED.id, INSERTED.redemption_token
      VALUES (
        @user_id, @product_id, @order_id, @voucher_code, @redemption_token, @redemption_limit
      )`,
    (request) =>
      request
        .input("user_id", sqlTypes.BigInt, input.userId)
        .input("product_id", sqlTypes.BigInt, input.product.id)
        .input("order_id", sqlTypes.BigInt, input.orderId)
        .input("voucher_code", sqlTypes.VarChar(40), input.voucherCode)
        .input("redemption_token", sqlTypes.Char(12), token)
        .input("redemption_limit", sqlTypes.Int, effectiveRedemptionLimit(input.product))
  );

  return result.recordset[0];
}

export async function ensureActivationForOrder(orderId: number) {
  const existing = await query<{ id: number }>(
    "SELECT id FROM dbo.benefit_activations WHERE order_id = @order_id",
    (request) => request.input("order_id", sqlTypes.BigInt, orderId)
  );

  if (existing[0]) {
    return existing[0];
  }

  const orders = await query<{
    id: number;
    user_id: number;
    product_id: number;
    voucher_code: string | null;
    offer_type: string | null;
    delivery_method: string | null;
    limite_resgates: number | null;
  }>(
    `SELECT o.id, o.user_id, o.product_id, o.voucher_code,
            p.offer_type, p.delivery_method, p.limite_resgates
       FROM dbo.product_orders o
       JOIN dbo.products p ON p.id = o.product_id
      WHERE o.id = @id`,
    (request) => request.input("id", sqlTypes.BigInt, orderId)
  );

  const order = orders[0];
  if (!order) return null;
  if (!shouldCreateActivationFor(order)) return null;

  return createBenefitActivation({
    userId: order.user_id,
    orderId: order.id,
    voucherCode: order.voucher_code,
    product: {
      id: order.product_id,
      offer_type: order.offer_type,
      delivery_method: order.delivery_method,
      limite_resgates: order.limite_resgates
    }
  });
}
