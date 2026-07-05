variable "os_cloud" {
  description = "clouds.yaml entry to authenticate with. Leave empty to use OS_* env vars from a sourced OpenStack RC file instead."
  type        = string
  default     = ""
}

variable "name" {
  description = "Base name for all dev resources. Kept distinct from production ('mathboard') so nothing collides in the same OpenStack project."
  type        = string
  default     = "mathboard-dev"
}

variable "flavor_name" {
  description = "Instance flavor for the dev box. Defaults to the same small flavor as production; drop to something cheaper if your region offers it."
  type        = string
  default     = "a1-ram2-disk20-perf1"
}

variable "ssh_public_key" {
  description = "Public SSH key to install on the dev box. The matching PRIVATE key is the DEV_DEPLOY_SSH_KEY GitHub secret. Can be the same key you use for prod, or a dedicated one."
  type        = string
}

variable "ssh_cidr" {
  description = "Who may reach SSH (22) on the dev box. GitHub's runners use dynamic IPs, so 0.0.0.0/0 is the simple default for CI deploys."
  type        = string
  default     = "0.0.0.0/0"
}

variable "site_address" {
  description = "Public FQDN for the dev box, e.g. dev.board.example.com. Add its own A record -> the dev floating IP; Caddy provisions TLS automatically."
  type        = string
}

variable "s3_bucket" {
  description = "Bucket (Swift container) for the dev box's Y-Sweet docs + uploads. MUST differ from the production bucket so dev never touches real data."
  type        = string
  default     = "mathboard-dev"
}

variable "y_sweet_auth" {
  description = "private_key from `y-sweet gen-auth --json`. Generate a SEPARATE keypair for dev so dev tokens can't be replayed against production."
  type        = string
  sensitive   = true
}

variable "y_sweet_server_token" {
  description = "server_token from the same `y-sweet gen-auth --json` used for y_sweet_auth."
  type        = string
  sensitive   = true
}
