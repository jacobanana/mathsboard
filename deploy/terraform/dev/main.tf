# Dev / staging environment
# --------------------------
# A second, always-on VPS that open pull requests deploy onto (see
# .github/workflows/deploy-dev.yml). It reuses the SAME ./modules/mathboard
# stack as production, so the two never drift, but with a different `name` (so
# every resource is namespaced separately), a separate S3 bucket (dev never
# touches production documents), and analytics turned OFF (the box stays small -
# no Umami/Postgres, no second DNS record or TLS cert).
#
# State is kept SEPARATE from production: run terraform from THIS directory, so
# `terraform.tfstate` here manages only the dev box.
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

provider "openstack" {
  cloud = var.os_cloud != "" ? var.os_cloud : null
}

module "mathboard" {
  source = "../modules/mathboard"

  name           = var.name
  flavor_name    = var.flavor_name
  ssh_public_key = var.ssh_public_key
  ssh_cidr       = var.ssh_cidr
  site_address   = var.site_address
  s3_bucket      = var.s3_bucket

  y_sweet_auth         = var.y_sweet_auth
  y_sweet_server_token = var.y_sweet_server_token

  # The whole point of the dev box: no analytics stack, no extra DNS/TLS.
  enable_analytics = false

  # image_name, external_network_name, subnet_cidr, dns_nameservers,
  # s3_endpoint, aws_region and deploy_user all inherit the module defaults,
  # which already match the production box. Override in terraform.tfvars if your
  # region needs it (e.g. a different s3_endpoint).
}
