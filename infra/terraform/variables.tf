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
  description = "Tipo da instância. API + Nominatim + OSRM (Centro-Oeste) na mesma máquina pedem 8 GB de RAM (t3.large). Depois da importação, dá para testar t3.medium (4 GB) se `free -m` mostrar folga."
  type        = string
  default     = "t3.large"
}

variable "root_volume_gb" {
  description = "Tamanho do disco (gp3, criptografado). Sistema + imagens + banco do Nominatim + dados do OSRM (Centro-Oeste): ~50 GB, com folga para a importação."
  type        = number
  default     = 80
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

variable "alert_emails" {
  description = "E-mails que recebem os alertas de custo (AWS Budgets)."
  type        = list(string)

  validation {
    condition     = length(var.alert_emails) > 0
    error_message = "Informe ao menos um e-mail para os alertas de custo."
  }
}

variable "budget_limit_usd" {
  description = "Orçamento total em dólares (o seu teto de US$ 100)."
  type        = number
  default     = 100
}

variable "budget_alert_percent" {
  description = "Percentual do orçamento em que o primeiro alerta dispara (50 = metade = US$ 50)."
  type        = number
  default     = 50
}

variable "budget_time_unit" {
  description = "Janela do orçamento: MONTHLY, QUARTERLY ou ANNUALLY (ano-calendário). ANNUALLY trata os US$ 100 como total do ano; MONTHLY zera todo mês."
  type        = string
  default     = "ANNUALLY"

  validation {
    condition     = contains(["MONTHLY", "QUARTERLY", "ANNUALLY"], var.budget_time_unit)
    error_message = "Use MONTHLY, QUARTERLY ou ANNUALLY."
  }
}
