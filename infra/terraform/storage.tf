# Storage privado do OpenDriver (documentos de motoristas, gravações de áudio).
# A API cifra tudo (AES-256-GCM) antes de enviar; o bucket nunca é público.
# A API fixa a região do cliente S3 em us-east-1, então o bucket vive lá,
# independente de var.aws_region.
provider "aws" {
  alias  = "storage"
  region = "us-east-1"

  default_tags {
    tags = {
      Project   = "opendriver"
      ManagedBy = "terraform"
    }
  }
}

data "aws_caller_identity" "current" {}

locals {
  bucket_name = var.storage_bucket_name != "" ? var.storage_bucket_name : "${var.name}-private-${data.aws_caller_identity.current.account_id}"
}

resource "aws_s3_bucket" "private" {
  count    = var.create_storage_bucket ? 1 : 0
  provider = aws.storage
  bucket   = local.bucket_name
}

resource "aws_s3_bucket_public_access_block" "private" {
  count                   = var.create_storage_bucket ? 1 : 0
  provider                = aws.storage
  bucket                  = aws_s3_bucket.private[0].id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "private" {
  count    = var.create_storage_bucket ? 1 : 0
  provider = aws.storage
  bucket   = aws_s3_bucket.private[0].id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "private" {
  count    = var.create_storage_bucket ? 1 : 0
  provider = aws.storage
  bucket   = aws_s3_bucket.private[0].id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "private" {
  count    = var.create_storage_bucket ? 1 : 0
  provider = aws.storage
  bucket   = aws_s3_bucket.private[0].id
  rule {
    id     = "abort-incomplete-uploads"
    status = "Enabled"
    filter {}
    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

# Recusa qualquer acesso sem TLS.
data "aws_iam_policy_document" "bucket_tls" {
  count = var.create_storage_bucket ? 1 : 0
  statement {
    sid     = "DenyInsecureTransport"
    effect  = "Deny"
    actions = ["s3:*"]
    resources = [
      aws_s3_bucket.private[0].arn,
      "${aws_s3_bucket.private[0].arn}/*",
    ]
    principals {
      type        = "*"
      identifiers = ["*"]
    }
    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "private" {
  count      = var.create_storage_bucket ? 1 : 0
  provider   = aws.storage
  bucket     = aws_s3_bucket.private[0].id
  policy     = data.aws_iam_policy_document.bucket_tls[0].json
  depends_on = [aws_s3_bucket_public_access_block.private]
}

# Usuário só deste bucket. A API exige chave de acesso (MINIO_ACCESS_KEY/SECRET),
# então a chave é criada FORA do Terraform (não entra no estado nem no git):
#   aws iam create-access-key --user-name <iam_storage_user>
resource "aws_iam_user" "storage" {
  count = var.create_storage_bucket ? 1 : 0
  name  = "${var.name}-storage"
}

data "aws_iam_policy_document" "storage_user" {
  count = var.create_storage_bucket ? 1 : 0
  statement {
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = ["${aws_s3_bucket.private[0].arn}/*"]
  }
  statement {
    actions   = ["s3:ListBucket"] # sem isso, objeto ausente vira 403 em vez de 404
    resources = [aws_s3_bucket.private[0].arn]
  }
}

resource "aws_iam_user_policy" "storage" {
  count  = var.create_storage_bucket ? 1 : 0
  name   = "bucket-privado"
  user   = aws_iam_user.storage[0].name
  policy = data.aws_iam_policy_document.storage_user[0].json
}
