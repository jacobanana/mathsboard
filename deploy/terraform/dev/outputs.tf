output "floating_ip" {
  description = "Public IP of the dev box. Point dev.board.<domain> here AND set it as the DEV_DEPLOY_HOST GitHub secret."
  value       = module.mathboard.floating_ip
}

output "ssh_command" {
  description = "Convenience: SSH into the dev box."
  value       = module.mathboard.ssh_command
}

output "s3_access_key" {
  description = "Generated S3 access key for the dev bucket (also written into the dev box .env)."
  value       = module.mathboard.s3_access_key
  sensitive   = true
}

output "s3_secret_key" {
  description = "Generated S3 secret key for the dev bucket (also written into the dev box .env)."
  value       = module.mathboard.s3_secret_key
  sensitive   = true
}
