variable "os_cloud" {
  description = "clouds.yaml entry to authenticate with. Leave empty to use OS_* env vars from a sourced OpenStack RC file instead."
  type        = string
  default     = ""
}

variable "name" {
  description = "Base name for all resources (network, sg, instance, key...)."
  type        = string
  default     = "mathsboard"
}

# ---- Instance --------------------------------------------------------------

variable "image_name" {
  description = "Base OS image. Confirm the exact string in Horizon > Images."
  type        = string
  default     = "Ubuntu 24.04 LTS"
}

variable "flavor_name" {
  description = "Instance flavor. Confirm it is offered in your region."
  type        = string
  default     = "a1-ram2-disk20-perf1"
}

variable "ssh_public_key" {
  description = "Public SSH key to install on the instance. The matching PRIVATE key is the DEPLOY_SSH_KEY GitHub secret."
  type        = string
}

variable "deploy_user" {
  description = "Login user cloud-init grants Docker access to; also the DEPLOY_USER GitHub secret."
  type        = string
  default     = "ubuntu"
}

# ---- Networking ------------------------------------------------------------

variable "external_network_name" {
  description = "Infomaniak public network used for floating IPs."
  type        = string
  default     = "ext-floating1"
}

variable "subnet_cidr" {
  description = "Private subnet for the instance."
  type        = string
  default     = "192.168.42.0/24"
}

variable "dns_nameservers" {
  description = "Resolvers for the subnet."
  type        = list(string)
  default     = ["1.1.1.1", "1.0.0.1"]
}

variable "ssh_cidr" {
  description = "Who may reach SSH (22). Tighten to your IP/32 once deploys work; GitHub's runners use dynamic IPs so 0.0.0.0/0 is the simple default."
  type        = string
  default     = "0.0.0.0/0"
}

# ---- App config (rendered into the VPS .env) -------------------------------

variable "site_address" {
  description = "Public FQDN for the Maths board, e.g. mathsboard.example.com. Drives Caddy's automatic TLS."
  type        = string
}

variable "language_site_address" {
  description = "Public FQDN for the Language board, e.g. langsboard.example.com. Needs its own DNS A record -> the same VPS; Caddy provisions its TLS cert automatically."
  type        = string
}

variable "analytics_address" {
  description = "Public FQDN for the self-hosted Umami dashboard, e.g. analytics.board.example.com. Needs its own DNS A record -> the same VPS; Caddy provisions its TLS cert automatically."
  type        = string
}

variable "repo_url" {
  description = "Public git URL cloud-init clones on the instance."
  type        = string
  default     = "https://github.com/jacobanana/mathsboard.git"
}

variable "y_sweet_auth" {
  description = "private_key from `y-sweet gen-auth --json`."
  type        = string
  sensitive   = true
}

variable "y_sweet_server_token" {
  description = "server_token from the same `y-sweet gen-auth --json`."
  type        = string
  sensitive   = true
}

# ---- S3-compatible object storage ------------------------------------------

variable "s3_bucket" {
  description = "Bucket (Swift container) name for Y-Sweet docs + uploads."
  type        = string
  default     = "mathsboard"
}

variable "s3_endpoint" {
  description = "Infomaniak S3 endpoint - MUST match your project's region (clouds.yaml region_name): dc3-a -> https://s3.pub1.infomaniak.cloud, dc4-a -> https://s3.pub2.infomaniak.cloud."
  type        = string
  default     = "https://s3.pub1.infomaniak.cloud"
}

variable "aws_region" {
  description = "Region label for the S3 SigV4 signature. us-east-1 works (Infomaniak treats it as a cosmetic compatibility value); dc3-a / dc4-a are also accepted."
  type        = string
  default     = "us-east-1"
}

# ---- Analytics -------------------------------------------------------------

variable "backup_keep_days" {
  description = "Retention (days) for the nightly Umami DB dumps under the bucket's backups/ prefix; older dumps are pruned by the pg_backup container."
  type        = number
  default     = 14
}
