output "floating_ip" {
  description = "Public IP. Point your board.<domain> A record here AND set it as the DEPLOY_HOST GitHub secret."
  value       = module.mathboard.floating_ip
}

output "ssh_command" {
  description = "Convenience: SSH into the box."
  value       = module.mathboard.ssh_command
}

output "s3_access_key" {
  description = "Generated S3 access key (also written into the VPS .env)."
  value       = module.mathboard.s3_access_key
  sensitive   = true
}

output "s3_secret_key" {
  description = "Generated S3 secret key (also written into the VPS .env)."
  value       = module.mathboard.s3_secret_key
  sensitive   = true
}
