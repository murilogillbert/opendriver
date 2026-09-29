output "public_ip" {
  description = "Crie um registro DNS A do domínio apontando para este IP."
  value       = aws_eip.api.public_ip
}

output "aws_region" {
  value = var.aws_region
}

output "domain" {
  value = var.domain
}

output "ecr_repository_url" {
  value = aws_ecr_repository.api.repository_url
}

output "ssh_command" {
  value = "ssh ubuntu@${aws_eip.api.public_ip}"
}

output "tiles_domain" {
  value = var.tiles_domain
}

output "acme_email" {
  value = var.acme_email
}

output "storage_bucket" {
  description = "Valor de MINIO_PRIVATE_BUCKET."
  value       = var.create_storage_bucket ? aws_s3_bucket.private[0].bucket : null
}

output "storage_endpoint" {
  description = "Valor de MINIO_ENDPOINT (S3 na região fixa da API)."
  value       = var.create_storage_bucket ? "https://s3.us-east-1.amazonaws.com" : null
}

output "storage_iam_user" {
  description = "Crie a chave: aws iam create-access-key --user-name <este usuário>"
  value       = var.create_storage_bucket ? aws_iam_user.storage[0].name : null
}

output "next_steps" {
  value = <<-EOT
    1. DNS (dois registros A -> ${aws_eip.api.public_ip}): ${var.domain} e ${var.tiles_domain}
    2. Confirme os e-mails de alerta (SNS e Budgets) que a AWS enviou
    3. Chave do storage: aws iam create-access-key --user-name ${var.create_storage_bucket ? aws_iam_user.storage[0].name : "(bucket desativado)"}
    4. ssh ubuntu@${aws_eip.api.public_ip}  e preencha /opt/opendriver/.env (backend/.env.example; ver infra/README.md)
    5. ./infra/deploy.sh push       (build + envio da imagem)
    6. ./infra/deploy.sh geo-setup  (OSRM, tiles e Caddy do Centro-Oeste)
    7. Backup do banco + snapshot do schema public, depois: ./infra/deploy.sh migrate
    8. ./infra/deploy.sh up         (o Nominatim importa no primeiro start: 1-3 h)
    9. App (EAS): EXPO_PUBLIC_MAP_STYLE_URL=https://${var.tiles_domain}/style.json
  EOT
}
