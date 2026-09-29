# Alerta de custo (AWS Budgets). Só AVISA por e-mail — não bloqueia nem desliga
# nada. Escopo: a conta inteira (o crédito/orçamento é da conta, não do projeto).
resource "aws_budgets_budget" "total" {
  name         = "${var.name}-orcamento"
  budget_type  = "COST"
  limit_amount = tostring(var.budget_limit_usd)
  limit_unit   = "USD"
  time_unit    = var.budget_time_unit

  # Consumo bruto: sem abater créditos/reembolsos, para o alerta refletir o
  # quanto do seu orçamento já foi gasto e não o valor líquido cobrado.
  cost_types {
    include_credit = false
    include_refund = false
  }

  # Padrão: metade do orçamento (o pedido).
  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = var.budget_alert_percent
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = var.alert_emails
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = var.alert_emails
  }

  # Previsão da AWS de que vai estourar o orçamento (precisa de alguns dias de histórico).
  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = var.alert_emails
  }
}
