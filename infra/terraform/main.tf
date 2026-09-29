data "aws_vpc" "selected" {
  id      = var.vpc_id != "" ? var.vpc_id : null
  default = var.vpc_id == "" ? true : null
}

data "aws_subnets" "selected" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.selected.id]
  }
}

locals {
  subnet_id = var.subnet_id != "" ? var.subnet_id : sort(data.aws_subnets.selected.ids)[0]
}

# Ubuntu 24.04 LTS mais recente (parâmetro público mantido pela Canonical).
data "aws_ssm_parameter" "ubuntu" {
  name = "/aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id"
}

# ---------------------------------------------------------------- registry
# A imagem é construída no seu PC (infra/deploy.sh) e enviada para cá; o
# servidor só puxa. Nenhuma credencial do GitHub fica na máquina.
resource "aws_ecr_repository" "api" {
  name                 = var.name
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_lifecycle_policy" "api" {
  repository = aws_ecr_repository.api.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Manter as 15 imagens mais recentes"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 15
      }
      action = { type = "expire" }
    }]
  })
}

# --------------------------------------------------------------------- IAM
data "aws_iam_policy_document" "assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "instance" {
  name               = "${var.name}-instance"
  assume_role_policy = data.aws_iam_policy_document.assume.json
}

# Somente leitura no ECR (puxar a imagem). Sem acesso a mais nada da conta.
resource "aws_iam_role_policy_attachment" "ecr_read" {
  role       = aws_iam_role.instance.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
}

resource "aws_iam_instance_profile" "instance" {
  name = "${var.name}-instance"
  role = aws_iam_role.instance.name
}

# ---------------------------------------------------------------- network
resource "aws_security_group" "api" {
  name        = "${var.name}-sg"
  description = "OpenDriver API: HTTP/HTTPS publico, SSH restrito"
  vpc_id      = data.aws_vpc.selected.id

  ingress {
    description = "SSH (somente CIDRs autorizados)"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = var.ssh_allowed_cidrs
  }

  ingress {
    description = "HTTP (desafio ACME + redirect)"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS + WebSocket (Socket.IO)"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTP/3"
    from_port   = 443
    to_port     = 443
    protocol    = "udp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "Saida livre (Asaas, Expo Push, OSRM, banco, ECR)"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_key_pair" "admin" {
  key_name   = "${var.name}-admin"
  public_key = var.ssh_public_key
}

# --------------------------------------------------------------- instance
resource "aws_instance" "api" {
  ami                    = data.aws_ssm_parameter.ubuntu.value
  instance_type          = var.instance_type
  subnet_id              = local.subnet_id
  vpc_security_group_ids = [aws_security_group.api.id]
  key_name               = aws_key_pair.admin.key_name
  iam_instance_profile   = aws_iam_instance_profile.instance.name

  # IMDSv2 obrigatório (bloqueia SSRF contra o serviço de metadados).
  metadata_options {
    http_endpoint = "enabled"
    http_tokens   = "required"
  }

  root_block_device {
    volume_type           = "gp3"
    volume_size           = var.root_volume_gb
    encrypted             = true
    delete_on_termination = true
  }

  user_data = templatefile("${path.module}/user_data.sh.tpl", {
    domain     = var.domain
    acme_email = var.acme_email
    image      = "${aws_ecr_repository.api.repository_url}:latest"
    extra_keys = var.extra_ssh_public_keys
  })

  lifecycle {
    # Não recriar/parar a máquina quando a Canonical publicar AMI nova ou o
    # template mudar: o user_data só roda no primeiro boot (cloud-init).
    ignore_changes = [ami, user_data]
  }

  tags = { Name = var.name }
}

# IP fixo: o registro DNS não muda se a instância for parada/religada.
resource "aws_eip" "api" {
  domain   = "vpc"
  instance = aws_instance.api.id
  tags     = { Name = var.name }
}
