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

# ---------------------------------------------------------------------------
# Networking
# A private network + subnet, joined to Infomaniak's public network
# (ext-floating1) through a router, so the instance can hold a floating IP.
# ---------------------------------------------------------------------------
data "openstack_networking_network_v2" "ext" {
  name = var.external_network_name
}

resource "openstack_networking_network_v2" "net" {
  name           = "${var.name}-net"
  admin_state_up = true
}

resource "openstack_networking_subnet_v2" "subnet" {
  name            = "${var.name}-subnet"
  network_id      = openstack_networking_network_v2.net.id
  cidr            = var.subnet_cidr
  ip_version      = 4
  dns_nameservers = var.dns_nameservers
}

resource "openstack_networking_router_v2" "router" {
  name                = "${var.name}-router"
  admin_state_up      = true
  external_network_id = data.openstack_networking_network_v2.ext.id
}

resource "openstack_networking_router_interface_v2" "iface" {
  router_id = openstack_networking_router_v2.router.id
  subnet_id = openstack_networking_subnet_v2.subnet.id
}

# ---------------------------------------------------------------------------
# Firewall
# SSH (deploy), HTTP + HTTPS (site + ACME cert challenge), and 443/udp (HTTP/3).
# 80 must stay open: Caddy needs it for the Let's Encrypt challenge.
# ---------------------------------------------------------------------------
resource "openstack_networking_secgroup_v2" "sg" {
  name        = "${var.name}-sg"
  description = "mathsboard: ssh + web"
}

resource "openstack_networking_secgroup_rule_v2" "ssh" {
  direction         = "ingress"
  ethertype         = "IPv4"
  protocol          = "tcp"
  port_range_min    = 22
  port_range_max    = 22
  remote_ip_prefix  = var.ssh_cidr
  security_group_id = openstack_networking_secgroup_v2.sg.id
}

resource "openstack_networking_secgroup_rule_v2" "http" {
  direction         = "ingress"
  ethertype         = "IPv4"
  protocol          = "tcp"
  port_range_min    = 80
  port_range_max    = 80
  remote_ip_prefix  = "0.0.0.0/0"
  security_group_id = openstack_networking_secgroup_v2.sg.id
}

resource "openstack_networking_secgroup_rule_v2" "https" {
  direction         = "ingress"
  ethertype         = "IPv4"
  protocol          = "tcp"
  port_range_min    = 443
  port_range_max    = 443
  remote_ip_prefix  = "0.0.0.0/0"
  security_group_id = openstack_networking_secgroup_v2.sg.id
}

resource "openstack_networking_secgroup_rule_v2" "https_h3" {
  direction         = "ingress"
  ethertype         = "IPv4"
  protocol          = "udp"
  port_range_min    = 443
  port_range_max    = 443
  remote_ip_prefix  = "0.0.0.0/0"
  security_group_id = openstack_networking_secgroup_v2.sg.id
}

# ---------------------------------------------------------------------------
# Object storage
# One bucket holds Y-Sweet documents (/ysweet) and uploaded images (/assets).
# The EC2 credential is the S3 access-key/secret the api + ysweet containers
# authenticate with - Terraform generates it, so you never copy keys by hand.
# ---------------------------------------------------------------------------
resource "openstack_objectstorage_container_v1" "bucket" {
  name = var.s3_bucket
  # Purge objects on destroy/replace so a non-empty bucket doesn't 409 the
  # delete. Contents (board docs, uploads, Umami backups/) go with it - the
  # README's "back up first" warning applies.
  force_destroy = true
}

resource "openstack_identity_ec2_credential_v3" "s3" {}

# ---------------------------------------------------------------------------
# Analytics secrets
# Generated here so a fresh apply comes up analytics-ready (self-hosted Umami +
# Postgres + nightly S3 backup, behind the compose `analytics` profile).
# special=false keeps the Postgres password URL-safe for Umami's DATABASE_URL.
# Both land in the instance .env via cloud-init and in Terraform state (already
# sensitive - keep the state private, as the README notes).
# ---------------------------------------------------------------------------
resource "random_password" "postgres" {
  length  = 32
  special = false
}

resource "random_password" "umami_secret" {
  length  = 48
  special = false
}

# ---------------------------------------------------------------------------
# Instance
# cloud-init installs Docker, clones the public repo, writes .env, and runs
# `docker compose up -d`. The box only ever pulls images from GHCR.
# ---------------------------------------------------------------------------
resource "openstack_compute_keypair_v2" "key" {
  name       = "${var.name}-key"
  public_key = var.ssh_public_key
}

locals {
  cloud_init = templatefile("${path.module}/cloud-init.yaml.tftpl", {
    repo_url              = var.repo_url
    deploy_user           = var.deploy_user
    site_address          = var.site_address
    language_site_address = var.language_site_address
    analytics_address     = var.analytics_address
    y_sweet_auth          = var.y_sweet_auth
    y_sweet_server_token  = var.y_sweet_server_token
    s3_bucket             = var.s3_bucket
    s3_endpoint           = var.s3_endpoint
    aws_region            = var.aws_region
    aws_access_key_id     = openstack_identity_ec2_credential_v3.s3.access
    aws_secret_access_key = openstack_identity_ec2_credential_v3.s3.secret
    postgres_password     = random_password.postgres.result
    umami_app_secret      = random_password.umami_secret.result
    backup_keep_days      = var.backup_keep_days
  })
}

# An explicit port carries the security group (the Neutron way) and gives the
# floating IP something to bind to, replacing the deprecated Nova association.
resource "openstack_networking_port_v2" "port" {
  name               = "${var.name}-port"
  network_id         = openstack_networking_network_v2.net.id
  admin_state_up     = true
  security_group_ids = [openstack_networking_secgroup_v2.sg.id]

  fixed_ip {
    subnet_id = openstack_networking_subnet_v2.subnet.id
  }
}

resource "openstack_compute_instance_v2" "vm" {
  name        = var.name
  image_name  = var.image_name
  flavor_name = var.flavor_name
  key_pair    = openstack_compute_keypair_v2.key.name
  user_data   = local.cloud_init

  network {
    port = openstack_networking_port_v2.port.id
  }

  # The instance needs the subnet wired to the router before it can reach the
  # internet to install Docker and clone the repo.
  depends_on = [openstack_networking_router_interface_v2.iface]
}

resource "openstack_networking_floatingip_v2" "fip" {
  pool        = var.external_network_name
  description = var.name
}

resource "openstack_networking_floatingip_associate_v2" "fip_assoc" {
  floating_ip = openstack_networking_floatingip_v2.fip.address
  port_id     = openstack_networking_port_v2.port.id
}
