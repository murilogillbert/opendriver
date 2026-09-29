variable "aws_region" {
  description = "Região AWS. sa-east-1 (São Paulo) dá a menor latência para o Brasil."
  type        = string
  default     = "sa-east-1"
}

variable "name" {
  description = "Prefixo dos recursos."
  type        = string
  default     = "opendriver-api"
}

variable "instance_type" {
  description = "Tipo da instância. t3.small atende uma réplica da API (os jobs internos exigem uma só)."
  type        = string
  default     = "t3.small"
}

variable "root_volume_gb" {
  description = "Tamanho do disco (gp3, criptografado)."
  type        = number
  default     = 30
}

variable "domain" {
  description = "Domínio público da API. Aponte um registro A para o output public_ip (na Cloudflare, sem proxy/nuvem cinza até o certificado ser emitido)."
  type        = string
  default     = "api-app.opendriver.com.br"
}

variable "acme_email" {
  description = "E-mail usado pelo Let's Encrypt (avisos de expiração)."
  type        = string
}

variable "ssh_public_key" {
  description = "Chave pública SSH principal (conteúdo de ~/.ssh/id_ed25519.pub). Vira o key pair da instância."
  type        = string
}

variable "extra_ssh_public_keys" {
  description = "Chaves públicas adicionais autorizadas no usuário ubuntu (ex.: chave dedicada para agentes de IA). Aplicadas só no primeiro boot; depois, edite ~/.ssh/authorized_keys na instância."
  type        = list(string)
  default     = []
}

variable "ssh_allowed_cidrs" {
  description = "CIDRs autorizados a acessar a porta 22, ex.: [\"203.0.113.10/32\"]. Obrigatório de propósito: não existe padrão aberto para a internet."
  type        = list(string)

  validation {
    condition     = length(var.ssh_allowed_cidrs) > 0 && !contains(var.ssh_allowed_cidrs, "0.0.0.0/0")
    error_message = "Informe ao menos um CIDR e não use 0.0.0.0/0 (SSH aberto para o mundo)."
  }
}

variable "vpc_id" {
  description = "VPC onde criar a instância. Vazio = VPC padrão da conta/região."
  type        = string
  default     = ""
}

variable "subnet_id" {
  description = "Subnet pública. Vazio = primeira subnet da VPC."
  type        = string
  default     = ""
}
