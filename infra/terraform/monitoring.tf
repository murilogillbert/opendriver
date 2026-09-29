# Alarmes de saúde da instância. Avisam por e-mail (SNS) e, se a máquina física
# falhar, o EC2 tenta recuperar a instância sozinho (mesmo IP e disco).
resource "aws_sns_topic" "alerts" {
  name = "${var.name}-alertas"
}

resource "aws_sns_topic_subscription" "email" {
  for_each  = toset(var.alert_emails)
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = each.value
}

resource "aws_cloudwatch_metric_alarm" "system_check" {
  alarm_name          = "${var.name}-falha-de-hardware"
  alarm_description   = "Falha no sistema/host da instância: recuperação automática."
  namespace           = "AWS/EC2"
  metric_name         = "StatusCheckFailed_System"
  dimensions          = { InstanceId = aws_instance.api.id }
  statistic           = "Maximum"
  period              = 60
  evaluation_periods  = 2
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = ["arn:aws:automate:${var.aws_region}:ec2:recover", aws_sns_topic.alerts.arn]
}

resource "aws_cloudwatch_metric_alarm" "instance_check" {
  alarm_name          = "${var.name}-instancia-sem-resposta"
  alarm_description   = "A instância não responde (SO travado, memória esgotada). Reinicie: aws ec2 reboot-instances."
  namespace           = "AWS/EC2"
  metric_name         = "StatusCheckFailed_Instance"
  dimensions          = { InstanceId = aws_instance.api.id }
  statistic           = "Maximum"
  period              = 60
  evaluation_periods  = 5
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
}

# CPU alta por meia hora: em instância t3 gasta créditos e pode gerar cobrança extra.
resource "aws_cloudwatch_metric_alarm" "cpu_high" {
  alarm_name          = "${var.name}-cpu-alta"
  alarm_description   = "CPU acima de 80% por 30 min (importação do Nominatim também causa; se persistir depois, considere subir o tipo da instância)."
  namespace           = "AWS/EC2"
  metric_name         = "CPUUtilization"
  dimensions          = { InstanceId = aws_instance.api.id }
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 6
  threshold           = 80
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
}
