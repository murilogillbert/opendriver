# Infra AWS (Terraform)

Sobe **uma instância EC2** (Ubuntu 24.04) com a API, **Nominatim e OSRM (extrato Centro-Oeste)**, tudo na mesma máquina, com Docker + Caddy (HTTPS automático,
WebSocket do Socket.IO incluso), IP fixo (Elastic IP), repositório **ECR** para a
imagem da API e uma role IAM só-leitura do ECR. A imagem é construída no seu PC
e enviada ao ECR: nenhuma credencial do GitHub nem segredo vai para o servidor
ou para o Terraform/git.

```
PC ── docker push ──▶ ECR ◀── docker pull ── EC2 (caddy :443 ─▶ api :5100 ─▶ nominatim :8080 / osrm :5000)
                                                              └──▶ Postgres do hub (DATABASE_URL)
```

## Pré-requisitos (no seu PC)
`terraform` ≥ 1.6, `aws` CLI configurado (`aws configure` / SSO) com permissão
para EC2, ECR e IAM, `docker`, `ssh`, `git`. No Windows, use WSL ou Git Bash.

## 1. Criar a infra
```bash
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars   # edite: e-mail, chave SSH, seu IP
terraform init
terraform plan
terraform apply
```
- `ssh_allowed_cidrs` é obrigatório e **não aceita `0.0.0.0/0`**: só esses IPs
  chegam à porta 22. Para dar acesso a um agente de IA, use uma chave SSH
  dedicada (`extra_ssh_public_keys`, só vale no primeiro boot) e inclua o IP de
  onde ele conecta. Para revogar, remova a chave de `~/.ssh/authorized_keys`
  na instância.
- O estado (`terraform.tfstate`) fica local e **é ignorado pelo git**. Guarde-o
  (ou configure um backend S3 antes do primeiro `apply`) — sem ele o Terraform
  perde o controle dos recursos.

## 2. DNS
Crie o registro `A` do domínio (padrão `api-app.opendriver.com.br`) apontando
para o output `public_ip`. Na Cloudflare, deixe **sem proxy** (nuvem cinza) até
o certificado ser emitido; depois pode ativar o proxy em modo *Full (strict)*.

## 3. Segredos da API
```bash
ssh ubuntu@<public_ip>
nano /opt/opendriver/.env      # modelo: backend/.env.example
```
Obrigatórias em produção: `NODE_ENV=production`, `DATABASE_URL` (com
`?schema=opendriver`), `JWT_SECRET` **igual ao do hub**, `DATA_ENCRYPTION_KEY`
(`openssl rand -base64 32`, guarde fora do servidor), `PUBLIC_BASE_URL` https e
`PAYMENT_PROVIDER=asaas`.

O Postgres precisa ser o **mesmo do hub** (schema `public` = hub, `opendriver` =
esta API) e estar alcançável a partir da instância; libere o IP público
(output) no firewall/`pg_hba` desse banco e prefira TLS na conexão.

## 3.1 Mapas próprios (Nominatim + OSRM, Centro-Oeste)
No `.env` da API, aponte para os serviços internos (sem porta pública):
```
NOMINATIM_URL=http://nominatim:8080
OSRM_URL=http://osrm:5000
```
Depois, uma vez:
```bash
./infra/deploy.sh geo-setup   # swap de 4 GB, baixa o extrato e prepara o OSRM (minutos)
./infra/deploy.sh up          # o Nominatim importa no primeiro start: ~1–3 h
ssh ubuntu@<ip> 'cd /opt/opendriver && docker compose -f docker-compose.yml -f docker-compose.geo.yml logs -f nominatim'
```
Até a importação terminar, a busca de endereços responde "indisponível" e o
preço usa a estimativa em linha reta; faça isso antes de abrir para usuários.
Os dados ficam congelados (`FREEZE=true`); para atualizar o mapa, reimporte.
Para outra região, troque a URL do extrato em `infra/geo/` (Geofabrik).
> Os scripts de `infra/geo/` não foram testados contra a importação real
> (o ambiente onde foram escritos não tinha AWS nem rede para os extratos).
> Rode primeiro com o servidor sem tráfego e confira `free -m` / `df -h`.

## 4. Deploy
Da raiz do repositório:
```bash
./infra/deploy.sh push      # build linux/amd64 + envio ao ECR
# ANTES de migrar: backup do banco + pg_dump --schema-only do schema public
./infra/deploy.sh migrate   # bootstrap + prisma migrate deploy (só schema opendriver)
# DEPOIS: novo pg_dump --schema-only do public e diff — se algo mudou, pare.
./infra/deploy.sh up        # sobe/atualiza a API
./infra/deploy.sh status
```
Nunca rode `prisma migrate dev` nem `db push` contra o banco compartilhado.
As atualizações seguintes: `push` → (`migrate`, se houver migration nova) → `up`.

## Alerta de custo
`budgets.tf` cria um AWS Budget de **US$ 100** (`budget_limit_usd`) na conta toda,
com e-mail para `alert_emails` quando o **gasto real** passar de **50%** (US$ 50),
de 80%, e quando a **previsão** da AWS indicar estouro de 100%.
- Só avisa: **não desliga nada**. Ao receber o alerta, olhe o Cost Explorer.
- Conta o consumo bruto (`include_credit = false`), sem abater créditos.
- `budget_time_unit = "ANNUALLY"` (padrão) trata os US$ 100 como total do ano;
  use `"MONTHLY"` se o teto for por mês.
- Os dados de custo atrasam de 8 a 24 h. Os dois primeiros budgets da conta são
  gratuitos. Cada destinatário recebe um e-mail de confirmação da AWS na
  primeira vez.
- Permissão IAM necessária para quem roda o `apply`: `budgets:*`.

## Custos e limites
`t3.large` + 80 GB gp3 + Elastic IP + ECR: **estimativa de ~US$ 100/mês em `sa-east-1`** e ~US$ 65–70 em `us-east-1` (confirme na calculadora da AWS). Com um orçamento total de US$ 100, o alerta de 50% pode disparar em poucas semanas. Para reduzir: `aws_region = "us-east-1"` (mais latência para o Brasil) ou, depois da importação, testar `instance_type = "t3.medium"` (~metade do preço).
Rode **uma** réplica (os jobs internos e o Socket.IO não escalam horizontalmente
sem Redis/worker — ver `backend/README.md`).

## Destruir
`terraform destroy` remove instância, IP, ECR e IAM (imagens incluídas). Não toca
no banco, que é externo.
