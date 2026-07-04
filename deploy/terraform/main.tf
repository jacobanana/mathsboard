terraform {
  required_version = ">= 1.3.0"
  required_providers {
    openstack = {
      source  = "terraform-provider-openstack/openstack"
      version = "~> 2.1"
    }
  }
}

# Credentials come from ~/.config/openstack/clouds.yaml (download it from the
# Infomaniak Manager or the OpenStack dashboard). `os_cloud` names the entry.
provider "openstack" {
  cloud = var.os_cloud
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
  description = "mathboard: ssh + web"
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
}

resource "openstack_identity_ec2_credential_v3" "s3" {}

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
    y_sweet_auth          = var.y_sweet_auth
    y_sweet_server_token  = var.y_sweet_server_token
    s3_bucket             = var.s3_bucket
    s3_endpoint           = var.s3_endpoint
    aws_region            = var.aws_region
    aws_access_key_id     = openstack_identity_ec2_credential_v3.s3.access
    aws_secret_access_key = openstack_identity_ec2_credential_v3.s3.secret
  })
}

resource "openstack_compute_instance_v2" "vm" {
  name            = var.name
  image_name      = var.image_name
  flavor_name     = var.flavor_name
  key_pair        = openstack_compute_keypair_v2.key.name
  security_groups = [openstack_networking_secgroup_v2.sg.name]
  user_data       = local.cloud_init

  network {
    uuid = openstack_networking_network_v2.net.id
  }

  # The instance needs the subnet wired to the router before it can reach the
  # internet to install Docker and clone the repo.
  depends_on = [openstack_networking_router_interface_v2.iface]
}

resource "openstack_networking_floatingip_v2" "fip" {
  pool        = var.external_network_name
  description = var.name
}

resource "openstack_compute_floatingip_associate_v2" "fip_assoc" {
  floating_ip = openstack_networking_floatingip_v2.fip.address
  instance_id = openstack_compute_instance_v2.vm.id
}
