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

output "next_steps" {
  value = <<-EOT
    1. DNS: registro A ${var.domain} -> ${aws_eip.api.public_ip}
    2. ssh ubuntu@${aws_eip.api.public_ip}  e preencha /opt/opendriver/.env (modelo em backend/.env.example)
    3. Na raiz do repositório: ./infra/deploy.sh push   (build + envio da imagem)
    4. Backup do banco + snapshot do schema public, depois: ./infra/deploy.sh migrate
    5. ./infra/deploy.sh up
  EOT
}
