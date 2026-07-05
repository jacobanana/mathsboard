variable "name" {
  description = "Base name for all resources (network, sg, instance, key...). Must differ between environments so prod and dev never collide."
  type        = string
  default     = "mathboard"
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
  description = "Public SSH key to install on the instance. The matching PRIVATE key is the deploy SSH GitHub secret."
  type        = string
}

variable "deploy_user" {
  description = "Login user cloud-init grants Docker access to; also the deploy-user GitHub secret."
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
  description = "Public FQDN, e.g. board.example.com. Drives Caddy's automatic TLS."
  type        = string
}

variable "enable_analytics" {
  description = "Whether this environment runs the self-hosted Umami analytics stack (postgres + umami + nightly S3 backup, behind the compose `analytics` profile). Production enables it; the dev/staging box leaves it off to stay small and to avoid a second DNS record + TLS cert."
  type        = bool
  default     = true
}

variable "analytics_address" {
  description = "Public FQDN for the self-hosted Umami dashboard, e.g. analytics.board.example.com. Needs its own DNS A record -> the same VPS. Only used when enable_analytics is true; leave empty otherwise."
  type        = string
  default     = ""
}

variable "repo_url" {
  description = "Public git URL cloud-init clones on the instance."
  type        = string
  default     = "https://github.com/jacobanana/mathboard.git"
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
  description = "Bucket (Swift container) name for Y-Sweet docs + uploads. Use a distinct name per environment so dev never touches production data."
  type        = string
  default     = "mathboard"
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
  description = "Retention (days) for the nightly Umami DB dumps under the bucket's backups/ prefix; older dumps are pruned by the pg_backup container. Only relevant when enable_analytics is true."
  type        = number
  default     = 14
}
