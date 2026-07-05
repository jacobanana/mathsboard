# Production environment
# ----------------------
# The public board.<domain> box. This root wires up the provider and hands all
# configuration to the shared ./modules/mathboard stack. The dev/staging box
# lives in ./dev and reuses the SAME module with a different name + analytics
# disabled, so the two environments can never drift out of sync.
terraform {
  required_version = ">= 1.3.0"
  required_providers {
    openstack = {
      source  = "terraform-provider-openstack/openstack"
      version = "~> 2.1"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}

# Auth: with os_cloud set, credentials come from ~/.config/openstack/clouds.yaml
# (download it from the Infomaniak Manager / OpenStack dashboard). Leave os_cloud
# empty to fall back to OS_* environment variables from a sourced RC file.
provider "openstack" {
  cloud = var.os_cloud != "" ? var.os_cloud : null
}

module "mathboard" {
  source = "./modules/mathboard"

  name                  = var.name
  image_name            = var.image_name
  flavor_name           = var.flavor_name
  ssh_public_key        = var.ssh_public_key
  deploy_user           = var.deploy_user
  external_network_name = var.external_network_name
  subnet_cidr           = var.subnet_cidr
  dns_nameservers       = var.dns_nameservers
  ssh_cidr              = var.ssh_cidr
  site_address          = var.site_address
  repo_url              = var.repo_url
  y_sweet_auth          = var.y_sweet_auth
  y_sweet_server_token  = var.y_sweet_server_token
  s3_bucket             = var.s3_bucket
  s3_endpoint           = var.s3_endpoint
  aws_region            = var.aws_region

  # Production runs the full self-hosted Umami analytics stack.
  enable_analytics  = true
  analytics_address = var.analytics_address
  backup_keep_days  = var.backup_keep_days
}

# ---------------------------------------------------------------------------
# State migration
# These resources previously lived in this root module directly; they now live
# in module.mathboard. The `moved` blocks tell Terraform it's the SAME object,
# so the next `terraform apply` reports only address changes - zero recreation,
# and the existing floating IP, bucket, and generated passwords are preserved.
# Safe to delete after the first apply that adopts them.
# ---------------------------------------------------------------------------
moved {
  from = openstack_networking_network_v2.net
  to   = module.mathboard.openstack_networking_network_v2.net
}
moved {
  from = openstack_networking_subnet_v2.subnet
  to   = module.mathboard.openstack_networking_subnet_v2.subnet
}
moved {
  from = openstack_networking_router_v2.router
  to   = module.mathboard.openstack_networking_router_v2.router
}
moved {
  from = openstack_networking_router_interface_v2.iface
  to   = module.mathboard.openstack_networking_router_interface_v2.iface
}
moved {
  from = openstack_networking_secgroup_v2.sg
  to   = module.mathboard.openstack_networking_secgroup_v2.sg
}
moved {
  from = openstack_networking_secgroup_rule_v2.ssh
  to   = module.mathboard.openstack_networking_secgroup_rule_v2.ssh
}
moved {
  from = openstack_networking_secgroup_rule_v2.http
  to   = module.mathboard.openstack_networking_secgroup_rule_v2.http
}
moved {
  from = openstack_networking_secgroup_rule_v2.https
  to   = module.mathboard.openstack_networking_secgroup_rule_v2.https
}
moved {
  from = openstack_networking_secgroup_rule_v2.https_h3
  to   = module.mathboard.openstack_networking_secgroup_rule_v2.https_h3
}
moved {
  from = openstack_objectstorage_container_v1.bucket
  to   = module.mathboard.openstack_objectstorage_container_v1.bucket
}
moved {
  from = openstack_identity_ec2_credential_v3.s3
  to   = module.mathboard.openstack_identity_ec2_credential_v3.s3
}
moved {
  from = random_password.postgres
  to   = module.mathboard.random_password.postgres
}
moved {
  from = random_password.umami_secret
  to   = module.mathboard.random_password.umami_secret
}
moved {
  from = openstack_compute_keypair_v2.key
  to   = module.mathboard.openstack_compute_keypair_v2.key
}
moved {
  from = openstack_networking_port_v2.port
  to   = module.mathboard.openstack_networking_port_v2.port
}
moved {
  from = openstack_compute_instance_v2.vm
  to   = module.mathboard.openstack_compute_instance_v2.vm
}
moved {
  from = openstack_networking_floatingip_v2.fip
  to   = module.mathboard.openstack_networking_floatingip_v2.fip
}
moved {
  from = openstack_networking_floatingip_associate_v2.fip_assoc
  to   = module.mathboard.openstack_networking_floatingip_associate_v2.fip_assoc
}
