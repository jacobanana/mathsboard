output "floating_ip" {
  description = "Public IP. Point your board.<domain> A record here AND set it as the DEPLOY_HOST GitHub secret."
  value       = openstack_networking_floatingip_v2.fip.address
}

output "ssh_command" {
  description = "Convenience: SSH into the box."
  value       = "ssh ${var.deploy_user}@${openstack_networking_floatingip_v2.fip.address}"
}

output "s3_access_key" {
  description = "Generated S3 access key (also written into the VPS .env)."
  value       = openstack_identity_ec2_credential_v3.s3.access
  sensitive   = true
}

output "s3_secret_key" {
  description = "Generated S3 secret key (also written into the VPS .env)."
  value       = openstack_identity_ec2_credential_v3.s3.secret
  sensitive   = true
}
