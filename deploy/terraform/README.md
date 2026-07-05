# Deploy mathboard to Infomaniak Public Cloud

Provisions a single small instance that runs the whole collab stack (Caddy +
token API + Y-Sweet) plus an S3-compatible bucket, on Infomaniak's OpenStack
Public Cloud. Images are built in GitHub Actions and pushed to GHCR; the box
only pulls. Total cost is roughly **€3-4/month**, and new accounts get ~€300
of free credit.

```
push to main ─▶ GitHub Actions ─▶ build web+api ─▶ GHCR (public, `latest`)
                                                      │
   VPS: git pull && docker compose pull && up  ◀──────┘   (auto, via SSH)
```

## Layout

The stack definition lives in a reusable module, instantiated once per
environment:

```
deploy/terraform/
├── main.tf, variables.tf, outputs.tf   # PRODUCTION root  (board.<domain>)
├── modules/mathboard/                  # the shared stack (network, box, bucket…)
└── dev/                                # DEV / STAGING root (dev.board.<domain>)
    ├── main.tf, variables.tf, outputs.tf
    └── terraform.tfvars.example
```

Production and dev keep **separate state** — run `terraform` from the
production directory (`deploy/terraform/`) for the public box, and from
`deploy/terraform/dev/` for the dev box. The dev environment is documented in
its [own section](#dev--staging-environment) below.

> **Upgrading an existing deployment?** The production resources moved into
> `modules/mathboard` but carry `moved {}` blocks, so your next
> `terraform apply` in `deploy/terraform/` reports only address changes — **no
> resource is recreated**, and the floating IP, bucket, and generated passwords
> are preserved. Run `terraform init` first (to install the module), then
> `terraform plan` and confirm it shows moves, not replacements.

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
# edit: os_cloud, site_address, analytics_address, ssh_public_key,
#       y_sweet_auth, y_sweet_server_token
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
In the Infomaniak Manager, add an **A record**: `board` → the `floating_ip`,
plus a second one for the analytics subdomain (`analytics` → the same
`floating_ip`, matching `analytics_address`). Floating IPs are stable, so this
is a one-time step. Caddy issues each TLS certificate automatically on the first
HTTPS request once DNS resolves — nothing to provision by hand.

### 7. GitHub secrets
The deploy job SSHes into the box, so it needs three secrets. Run these from
this `deploy/terraform/` directory (where you just applied — `gh` still finds
the repo from the git remote, or add `-R jacobanana/mathboard`):

```powershell
gh secret set DEPLOY_USER --body "ubuntu"
gh secret set DEPLOY_HOST --body (terraform output -raw floating_ip)
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

### 8. Analytics dashboard (optional)
The stack runs self-hosted Umami on `analytics_address` out of the box. Once its
DNS resolves, open the dashboard, register your site(s), and set the `UMAMI_*`
GitHub **variables** so the frontend loads the tracker — full steps in the main
README's [Analytics](../../README.md#analytics-optional-self-hosted-umami) and
[Where configuration lives](../../README.md#where-configuration-lives) sections.

## Day-to-day

Push to `main` → images rebuild → the VPS pulls and restarts automatically.
Manual rollover if ever needed:
```sh
ssh -i ~/.ssh/mathboard_deploy ubuntu@<floating_ip>
cd /opt/mathboard && git pull && docker compose pull && docker compose up -d
```

## Dev / staging environment

A second, always-on box that **open pull requests deploy onto**, so you can try a
change on a real server before it reaches `main` — without polluting your
releases or your production image tags.

```
PR opened/updated ─▶ Actions ─▶ build web+api ─▶ GHCR tag `pr-<n>` (throwaway)
                                                    │
      dev box: git checkout <pr sha> && compose pull && up  ◀──┘  (auto, via SSH)

PR closed ────────▶ Actions ─▶ delete the `pr-<n>` tags + reset dev box to latest
```

Why it stays clean:

- PR images are tagged **`pr-<number>` only** — never `latest`, so the
  production pointer is untouched — and **no GitHub Release is cut** for a PR.
- Those `pr-<number>` tags are **deleted when the PR closes**
  (`.github/workflows/cleanup-dev.yml`), so dev builds never accumulate in GHCR.
- The dev box uses its **own bucket** (`mathboard-dev`) and **no analytics**
  stack, so it can never touch production data or the Umami database.

It's a single shared box (a staging server), not one environment per PR — the
most recently deployed PR is what's live on `dev.board.<domain>`.

### Provision it

```sh
cd deploy/terraform/dev
cp terraform.tfvars.example terraform.tfvars
# edit: os_cloud, site_address (dev.board.<domain>), ssh_public_key,
#       y_sweet_auth, y_sweet_server_token   (generate a SEPARATE y-sweet keypair)
terraform init
terraform apply
terraform output floating_ip     # -> dev A record + DEV_DEPLOY_HOST secret
```

Add an **A record** `dev.board` → the dev `floating_ip` (no analytics subdomain
needed). Then set the dev deploy secrets (mirrors of the production three):

| Secret | Value |
|---|---|
| `DEV_DEPLOY_HOST` | the dev `floating_ip` output (or `dev.board.<domain>`) |
| `DEV_DEPLOY_USER` | `ubuntu` |
| `DEV_DEPLOY_SSH_KEY` | the **private** key matching `ssh_public_key` above |

```powershell
gh secret set DEV_DEPLOY_USER --body "ubuntu"
gh secret set DEV_DEPLOY_HOST --body (terraform output -raw floating_ip)
gh secret set DEV_DEPLOY_SSH_KEY < ~/.ssh/mathboard_deploy
```

Set both `mathboard-web` and `mathboard-api` GHCR packages to **public** (same
one-time step as production) so the dev box can pull without logging in. Open a
PR and the `Deploy PR to dev` workflow builds, pushes `pr-<n>`, and rolls the
dev box; the `pr-<n>` tags disappear again when you close or merge it.

> The cleanup job deletes package versions via the API using the built-in
> `GITHUB_TOKEN` (`packages: write`). If your GHCR packages aren't linked to
> this repo and the delete is rejected, create a PAT with `delete:packages` and
> reference it in `cleanup-dev.yml` instead of `secrets.GITHUB_TOKEN`.

## Tear down
```sh
terraform destroy
```
Stops all billing (the bucket's contents are deleted with it — back up first if
you care about the boards). Tear the dev box down the same way from
`deploy/terraform/dev/`.

## Notes
- Terraform **state holds secrets in plaintext**. Local state is fine for
  personal use; don't push this directory to a public backend.
- Restrict `ssh_cidr` to your IP once deploys work — GitHub's runners reach the
  box over SSH with a key, so 22 only needs to be open to you and to Actions.
- First boot takes a couple of minutes (Docker install + image pull) before the
  site answers.
