# Deploy mathboard to Infomaniak Public Cloud

Provisions a single small instance that runs the whole collab stack (Caddy +
token API + Y-Sweet) plus an S3-compatible bucket, on Infomaniak's OpenStack
Public Cloud. Images are built in GitHub Actions and pushed to GHCR; the box
only pulls. Total cost is roughly **€3-4/month**, and new accounts get ~€300
of free credit.

```
push to main ─▶ GitHub Actions ─▶ build web+api ─▶ GHCR (public)
                                                      │
   VPS: git pull && docker compose pull && up  ◀──────┘   (auto, via SSH)
```

## What gets created

| Resource | Purpose |
|---|---|
| network + subnet + router | private net wired to `ext-floating1` |
| security group | opens 22, 80, 443/tcp, 443/udp |
| `a1-ram2-disk20-perf1` instance | runs `docker compose` (cloud-init bootstraps it) |
| floating IP | your A record points here |
| object storage bucket | Y-Sweet docs (`/ysweet`) + uploads (`/assets`) |
| EC2 credential | the S3 access key/secret, generated for you |

## One-time setup

### 1. Credentials & tools
- Install [Terraform](https://developer.hashicorp.com/terraform/install) (or OpenTofu) and the OpenStack CLI.
- Download `clouds.yaml` from the Infomaniak Manager (or Horizon) into
  `~/.config/openstack/clouds.yaml`. Note the cloud name (the key under `clouds:`).

### 2. Generate the Y-Sweet keypair (once)
```sh
docker run --rm ghcr.io/jamsocket/y-sweet:latest y-sweet gen-auth --json
```
Keep `private_key` and `server_token` for the next step.

### 3. Generate a deploy SSH key
A dedicated key (not your personal one), so the CI secret is scoped to this
pipeline and easy to revoke. Use an empty passphrase so CI can use it
unattended:
```powershell
ssh-keygen -t ed25519 -f "$env:USERPROFILE\.ssh\mathboard_deploy" -C "mathboard-deploy"
# press Enter twice at the passphrase prompts
```
Its **public** half (`mathboard_deploy.pub`) goes into `ssh_public_key` below;
the **private** half becomes the `DEPLOY_SSH_KEY` secret in step 7.

### 4. Fill in variables
```sh
cp terraform.tfvars.example terraform.tfvars
# edit: os_cloud, site_address, ssh_public_key, y_sweet_auth, y_sweet_server_token
```
Confirm `image_name`, `flavor_name`, `external_network_name`, and `s3_endpoint`
match your region (see the commented block in the example) before applying.

### 5. Apply
```sh
terraform init
terraform apply
```
Grab the outputs:
```sh
terraform output floating_ip     # -> A record + DEPLOY_HOST secret
```

### 6. DNS
In the Infomaniak Manager, add an **A record**: `board` → the `floating_ip`.
Floating IPs are stable, so this is a one-time step. Caddy issues the TLS
certificate automatically on the first HTTPS request once DNS resolves — there
is nothing to provision by hand.

### 7. GitHub secrets
The deploy job SSHes into the box, so it needs three secrets. Set them with the
`gh` CLI from inside the repo (it auto-detects the repo from the git remote — or
add `-R jacobanana/mathboard`):

```powershell
gh secret set DEPLOY_USER --body "ubuntu"
gh secret set DEPLOY_HOST --body (terraform -chdir=deploy/terraform output -raw floating_ip)
Get-Content ~/.ssh/mathboard_deploy -Raw | gh secret set DEPLOY_SSH_KEY
```

| Secret | Value |
|---|---|
| `DEPLOY_HOST` | the `floating_ip` output (or `board.<domain>`) |
| `DEPLOY_USER` | `ubuntu` |
| `DEPLOY_SSH_KEY` | the **private** deploy key (`mathboard_deploy`) |

The SSH key is multiline, so **pipe it from the file** rather than using
`--body` (that mangles newlines and leaks the key into shell history). On
bash/Git Bash the equivalent is
`gh secret set DEPLOY_SSH_KEY < ~/.ssh/mathboard_deploy`. Check with
`gh secret list`.

Pushing to GHCR needs no secret (it uses the built-in `GITHUB_TOKEN`). After the
first push to `main`, the GitHub packages for `-web` and `-api` may be private
by default — set both to **public** in the package settings so the box can pull
without logging in.

## Day-to-day

Push to `main` → images rebuild → the VPS pulls and restarts automatically.
Manual rollover if ever needed:
```sh
ssh -i ~/.ssh/mathboard_deploy ubuntu@<floating_ip>
cd /opt/mathboard && git pull && docker compose pull && docker compose up -d
```

## Tear down
```sh
terraform destroy
```
Stops all billing (the bucket's contents are deleted with it — back up first if
you care about the boards).

## Notes
- Terraform **state holds secrets in plaintext**. Local state is fine for
  personal use; don't push this directory to a public backend.
- Restrict `ssh_cidr` to your IP once deploys work — GitHub's runners reach the
  box over SSH with a key, so 22 only needs to be open to you and to Actions.
- First boot takes a couple of minutes (Docker install + image pull) before the
  site answers.
