# Development & self-hosting

The developer/operator guide for Maths Board — how to run it locally, how it's
built, how it's tested, and how to self-host it. For **what the product is and
who it's for**, see the [README](README.md).

Maths Board is a Vite + React + TypeScript app. The live document is a
[Yjs](https://yjs.dev) `Y.Doc`; real-time sync runs against a self-hosted
[Y-Sweet](https://github.com/jamsocket/y-sweet) server. The app is fully usable
solo with no backend at all.

## Run

```bash
npm install
npm run dev        # start Vite dev server
npm run typecheck  # tsc -b --noEmit
npm test           # unit tests (Vitest, headless — see Unit tests below)
npm run build      # typecheck + production build
npm run preview    # preview the production build
```

A `Makefile` wraps these and the Docker/Playwright commands below as short
targets — run `make help` for the full list (`make install`, `make dev`,
`make up`, `make e2e`, `make deploy`, ...). Every target is just a shortcut for
the raw command shown in each section, so `make` is optional.

Path alias: `@/` -> `src/`.

The app is fully usable solo with no backend (boards live in localStorage).
Sharing a board (the **Share** button in the top bar) needs the backend running — for
local development, start the
local stack (`docker compose -f docker-compose.yml -f docker-compose.local.yml
up --build`); the Vite dev server proxies `/api` and `/ys` to it.

## Architecture

### Document vs ephemeral state

State splits in two (see `src/board/store.ts`):

- **Document state** — `board: BoardDocument` (`objects`, `strokes`,
  `background`, name, timestamps). The live document is a **Yjs `Y.Doc`** owned
  by `src/collab/session.ts`; the store holds a plain read-only mirror of it,
  which is what the canvas renders. Every object and stroke carries a stable
  string `id` (`src/board/types.ts`, `id()`).
- **Ephemeral state** — camera, current tool, colour, pen/text size, selection,
  and the in-progress text `editingId`. Local-only; never persisted into the
  document, never synced (selection included: what you select is your own
  business). Presence (cursors, names) travels over the Yjs *awareness*
  protocol only — it is never written into the document.

**Rule:** never mutate the document outside a store action. All document changes
go through named actions (`addObject`, `updateObject`, `moveObject`,
`removeObject`, `addStroke`, `setBackground`) — each one is a single Yjs
transaction, which applies locally (synchronously) and syncs to collaborators
when a shared session is connected. History (`pushHistory` / `undo` / `redo`)
is a `Y.UndoManager` scoped to **this user's transactions only** — undo never
reverts a collaborator's edit; `canUndo` / `canRedo` are exposed as booleans.

### Collaboration

`src/collab/` owns everything CRDT/network:

- `docModel.ts` — how the board maps onto the Y.Doc (two top-level `Y.Map`s
  keyed by shape id, each shape a **nested `Y.Map`** so concurrent edits to
  different fields of the same shape merge per-field; z-order via an `order`
  key; the merge-semantics commentary lives here).
- `session.ts` — the session singleton: solo (local doc, same code path) or
  shared (doc connected through `createYjsProvider(doc, boardId, "/api/token")`
  to the self-hosted Y-Sweet server, with IndexedDB offline caching).
- Board id in the URL: `?board=<id>`. **Share** mints a short 8-hex-char code
  (`4f2a9c1b`) that doubles as the board id, seeds the shared doc with the
  current content and shows both the code and the link. Others join by opening
  the link (prompts for a display name), or by typing the code — in any
  case/dash format — into the **welcome screen** that fronts every plain page
  load, or **Join a board** in the toolbar's burger menu mid-session (hidden
  while already shared). Leaving keeps what's on screen as the local draft.
- The welcome screen (`src/ui/WelcomeModal.tsx`) is a launcher, not a gate:
  the working draft loads behind it, so **Continue** (or Escape / clicking the
  backdrop) resumes it instantly; it also offers New board, the saved-boards
  manager and the join form (`src/ui/JoinForm.tsx`, shared with the Join
  dialog). Share links bypass it.
- Widget state is document state: the worksheet's typed answers and marks live
  on the object as per-question fields (`ans:<qid>` / `mark:<qid>`) written
  under `INPUT_ORIGIN`, so they sync live and persist but never enter anyone's
  undo history.

The backend is three pieces: `server/` (token endpoint — keeps the Y-Sweet
connection string server-side and mints per-board client tokens — plus image
upload/serving against S3), the official Y-Sweet container, and Caddy routing
one domain (`deploy/Caddyfile`). See **Deploy** below.

### Persistence seam

Storage hides behind the `BoardRepository` interface
(`src/board/persistence/BoardRepository.ts`). The default implementation is
`LocalBoardRepository` (localStorage, key prefix `mathsboard:`), exported as the
singleton `localRepository`. In solo mode the store autosaves the working draft
via a debounced `localRepository.saveDraft`; shared boards are persisted by
Y-Sweet (S3) instead, and the private local draft is left untouched.

### Tool registry

Every widget is a `Tool` registered in `src/tools/registry.ts`:

- `CanvasTool` — drawn onto the board canvas via `draw(kit, obj)`, where
  `kit: DrawKit = { ctx, theme, font }` and the camera transform is already
  applied. Has `defaults()`, `size(p)`, and an optional settings `Dialog`.
- `WidgetTool` — an interactive React overlay (`Component`) that reads/updates
  via the store directly. Has `defaultSize` and optional `Dialog`.

Tools are categorised (`ToolCategory`) for the Insert gallery; `CATEGORY_ORDER`
and `CATEGORY_LABELS` match the prototype headings. The registry throws on
duplicate `type`. Look up with `getTool`, list with `listTools` /
`listByCategory`.

### Theme

`src/styles/theme.ts` is the single source of truth for colour tokens and the
font stack; `src/styles/index.css` `:root` mirrors the same hex values. Draw code
reads colours from `kit.theme`; literal hex inside draw functions stays literal.

### Adding a new tool

1. Create `src/tools/<name>/index.ts`. Declare a params type `P`, then export
   `defineCanvasTool<P>({...})` or `defineWidgetTool<P>({...})` with `type`,
   `name`, `blurb`, `category`, `defaults`, `size`/`defaultSize`, and
   `draw`/`Component`.
2. If it needs settings, add `src/tools/<name>/Dialog.tsx` (a
   `React.FC<ToolDialogProps<P>>`) and reference it as `Dialog`. Copy
   `src/tools/numberline` as the template (canvas + dialog) or `src/tools/text`
   (canvas, no dialog).
3. The Assembly phase registers it in `src/tools/index.ts` (do not register
   globally from inside a tool module).

Dialog conventions: render only the card body (`<h2>`, `.hint`, `.field` rows,
`.err`, `.card-actions`); decide CREATE vs EDIT from whether `initial` is
present (`Add to board`/`Back` vs `Save`/`Cancel`); validate on submit, set the
`.err` text on failure, and call `onSubmit(params)` with the stored param shape.

## Unit tests

The behavioural suite in `src/**/*.test.ts` runs headlessly with
[Vitest](https://vitest.dev) + jsdom — no Docker, no browser — in seconds:

```bash
npm test              # run once           (make test)
npm run test:watch    # re-run on change   (make test-watch)
```

The tests drive the same seams the real UI drives (store actions, interaction
controllers, the shortcut dispatcher) and assert only on observable outcomes:
the document mirror, the selection, localStorage, the undo flags. Solo mode
runs on a real local `Y.Doc`, so undo/redo semantics are exercised against the
real `Y.UndoManager` — no mocks. Covered: document edits + undo step
boundaries, the geometric eraser, the draft/library persistence lifecycle,
placement + clipboard commands, select-tool interactions (click/lasso/resize),
keyboard-shortcut dispatch, viewport maths, worksheet generation/marking, and
a registry sweep every tool must pass (`src/tools/registry.test.ts` — a new
tool gets its baseline checks for free). Shared fixtures live in
`src/testing/fixtures.ts`; the lone environment shim (a canvas text-measure
stub) in `src/testing/vitestSetup.ts`. Rendering and collaboration are
deliberately out of scope here — they belong to the Playwright suite below.

In CI the suite is the fast gate in front of everything else
(`.github/workflows/unit-run.yml`, reusable): pull requests run unit → e2e
(`e2e.yml`), and a push to `main` runs it at the head of both deploy
pipelines — `publish.yml` (unit → e2e → image build → VPS deploy) and
`deploy.yml` (unit → GitHub Pages build → deploy). A red unit suite therefore
blocks every deployment and skips the 30-minute e2e run entirely.

## Test the whole stack locally

Before deploying anywhere, run the complete production topology on your own
machine — same containers, same routing, with MinIO standing in for S3 and
throwaway dev credentials baked in:

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up --build
# or: make up   (make down to stop, make reset to also wipe MinIO data)
```

Open <http://localhost:8080> in two browser windows, share from one (the
**Share** button in the top bar), paste the link into the other, and draw — strokes, widgets,
pictures and
cursors sync live. Documents and uploaded images land in MinIO (console at
<http://localhost:9001>, login `dev-minio` / `dev-minio-secret`). No `.env`,
domain or S3 account required.

### Automated end-to-end tests

The Playwright suite in `e2e/` runs that same two-browser collaboration
session automatically against the compose stack above: share/join/leave,
join-by-code, live stroke sync both ways, concurrent-edit merging, presence
(cursors, who's-here), per-user undo isolation, and shared quiz widgets (any
collaborator selects/edits/deletes them; typed answers and marks sync).

```bash
npx playwright install chromium   # once      (make e2e-install)
npm run test:e2e                  # boots the compose stack itself if not running (make e2e)
```

If you already have the stack up, the tests reuse it — but remember the web
image bakes the frontend in, so rebuild (`up --build`) after changing `src/`.
Board content lives on `<canvas>`, so the tests assert document state through
the read-only `window.__mathsboard` hook (`src/testing/e2eHooks.ts`) while
driving all input through the real UI. CI runs the suite on every pull
request, gated behind the unit tests (`.github/workflows/e2e.yml`).

## Deploy (single VPS, one domain)

Everything runs same-origin behind Caddy: `/api/*` → the token/upload service,
`/ys/*` → the Y-Sweet websocket, everything else → the static frontend. So
there is no CORS anywhere and `wss://` rides the one TLS certificate. (The
optional Umami analytics dashboard runs on its own subdomain — see **Analytics**
below.) TLS is
automatic — Caddy provisions a Let's Encrypt certificate on the first HTTPS
request and renews it thereafter (certs live in the `caddy_data` volume; keep
it).

**Images build in CI; the server only pulls.**
`.github/workflows/publish.yml` builds the `web` and `api` images on every push
to `main`, pushes them to GHCR (`ghcr.io/jacobanana/mathboard-{web,api}`), then
SSHes to the VPS to `git pull && docker compose pull && up`. The box never
builds: `docker-compose.yml` references the published images, and
`docker-compose.local.yml` adds `build:` back only for local development and
e2e. So a push to `main` is the whole deploy loop.

### Where configuration lives

Config sits in **three separate places** — nothing is duplicated, and (a common
gotcha) **the VPS `.env` is _not_ built by GitHub Actions**:

1. **The VPS `.env`** — server-side runtime config. **Generated by Terraform
   cloud-init on first boot** (or hand-written from `.env.example` for a manual
   deploy); it lives only on the box, never in GitHub. Holds `SITE_ADDRESS`,
   `ANALYTICS_ADDRESS`, the Y-Sweet keypair, the `S3_*`/`AWS_*` bucket creds,
   and — with analytics on — `COMPOSE_PROFILES`, `POSTGRES_PASSWORD`,
   `UMAMI_APP_SECRET`, `BACKUP_KEEP_DAYS`.

2. **GitHub Actions _secrets_** — deploy plumbing (the SSH rollover in
   `publish.yml`). Set once; full walkthrough in the
   [Terraform README](deploy/terraform/README.md) step 7.

   | Secret | Value |
   |---|---|
   | `DEPLOY_HOST` | the floating IP (or `board.<domain>`) |
   | `DEPLOY_USER` | `ubuntu` |
   | `DEPLOY_SSH_KEY` | the **private** deploy key |

3. **GitHub Actions _variables_** — build-time values baked into the frontend
   bundle. Public, not secret (they end up in client JS anyway), and optional —
   unset means analytics is simply off.

   | Variable | Used by | Value |
   |---|---|---|
   | `UMAMI_SRC` | both builds | `https://<ANALYTICS_ADDRESS>/script.js` |
   | `UMAMI_WEBSITE_ID` | self-hosted `web` image (`publish.yml`) | website id of the collab site |
   | `UMAMI_PAGES_WEBSITE_ID` | Pages build (`deploy.yml`) | website id of the Pages site |

   Set them in Settings → Secrets and variables → Actions → Variables, or:
   ```bash
   gh variable set UMAMI_SRC --body "https://analytics.example.com/script.js"
   gh variable set UMAMI_WEBSITE_ID --body "<website-id>"
   ```
   Variables aren't file changes, so they **don't trigger a build** — after
   setting them, force a rebuild with `gh workflow run publish.yml` (and
   `gh workflow run deploy.yml` for the Pages build).

Put together: **Actions builds the images (reading the _variables_) and SSHes to
deploy them (using the _secrets_); the running container reads the VPS `.env`.**
The `.env` and the GitHub config never overlap.

### Infomaniak Public Cloud, with Terraform (recommended)

`deploy/terraform/` provisions everything on Infomaniak's OpenStack — one small
instance running the compose stack, an S3-compatible bucket, and a floating IP,
for roughly €3–4/month. Full walkthrough:
[`deploy/terraform/README.md`](deploy/terraform/README.md). In short:

1. Drop your `clouds.yaml` in `~/.config/openstack/`, then
   `cp deploy/terraform/terraform.tfvars.example terraform.tfvars` and fill in
   `site_address`, `ssh_public_key`, and the Y-Sweet keypair
   (`docker run --rm ghcr.io/jamsocket/y-sweet:latest y-sweet gen-auth --json`).
   Terraform generates the S3 credentials for you.
2. `terraform apply` — run it **locally**; provisioning is a one-off, so only
   the build/deploy pipeline belongs in Actions, not the cloud credential or
   the (plaintext-secret) state. Then `terraform output floating_ip`.
3. Add an **A record** for your domain → that IP in the Infomaniak Manager.
4. Set three GitHub secrets — `DEPLOY_HOST` (the IP), `DEPLOY_USER` (`ubuntu`),
   `DEPLOY_SSH_KEY` (the private key) — and flip the two GHCR packages public.

From then on, `git push` to `main` builds, ships and restarts automatically.

#### Dev / staging box for pull requests

An optional **second** always-on box lets you try a PR on a real server before
merging. Provision it from `deploy/terraform/dev/` (same module, its own bucket,
analytics off) and set the `DEV_DEPLOY_*` secrets — full steps in the
[Terraform README](deploy/terraform/README.md#dev--staging-environment). Once
it's up, opening a PR triggers `deploy-dev.yml`: it builds throwaway
`ghcr.io/…-{web,api}:pr-<n>` images (never `latest`, and **no** GitHub Release)
and rolls the dev box onto them. Closing the PR runs `cleanup-dev.yml`, which
deletes those `pr-<n>` tags and returns the box to `latest` — so development
builds never linger in your image registry or release history.

### Manual, on any VPS

Any box with Docker and the compose plugin works, without Terraform:

1. **DNS** — point an A record (e.g. `board.example.com`) at the VPS.
2. **Firewall** — open **80** and **443** (also 443/UDP for HTTP/3).
3. `git clone` this repo onto the box.
4. `cp .env.example .env` and fill it in:
   - `SITE_ADDRESS` — your domain.
   - The Y-Sweet keypair (as above): `private_key` → `Y_SWEET_AUTH`,
     `server_token` → `YSWEET_CONNECTION_STRING`. The connection string is the
     sync server's root credential; it stays between containers and never
     reaches a browser (browsers get short-scoped per-board tokens from
     `POST /api/token`).
   - An S3-compatible bucket + credentials (any provider). Y-Sweet documents
     persist under `s3://<bucket>/ysweet`, uploaded images under
     `s3://<bucket>/assets`.
5. `docker compose up -d` — pulls the published images and starts the stack
   (or `make deploy`).

Upgrades: automatic via the push-to-`main` pipeline above, or by hand with
`git pull && docker compose pull && docker compose up -d`. Board documents and
images all live in the bucket; the containers are stateless apart from Caddy's
certificates.

### Analytics (optional, self-hosted Umami)

Privacy-first, cookieless usage analytics that stay on your own box — no
third-party service in the data path, no consent banner. Three extra containers
(`postgres`, `umami`, `pg_backup`) sit behind a Docker Compose **`analytics`
profile**, so they are **off unless you opt in**, and the local test overlay
never starts them. Umami runs on **its own subdomain** (the prebuilt image
doesn't support a runtime subpath, so it can't live under `/umami`).

**1. DNS** — add an A record for the analytics subdomain (e.g.
`analytics.board.example.com`) pointing at the same VPS IP.

**2. Turn the stack on** — add to `.env` (all are in `.env.example`):

- `COMPOSE_PROFILES=analytics` — activates the three services.
- `ANALYTICS_ADDRESS` — the subdomain from step 1 (Caddy auto-provisions its cert).
- `POSTGRES_PASSWORD` — password for the Umami database.
- `UMAMI_APP_SECRET` — session-signing secret (`openssl rand -hex 32`).
- `BACKUP_KEEP_DAYS` — nightly-dump retention in days (default `14`).

Then `docker compose pull && docker compose up -d`. Umami is served at
`https://<ANALYTICS_ADDRESS>`. Log in with `admin` / `umami`, **change that
password immediately**, then add a website (one per build you want to track —
the collab domain and/or the static Pages URL) and copy its **website id**.

**3. Wire the frontend** — the dashboard stays empty until the app loads the
tracker. `src/analytics.ts` injects it only when both build-time vars are set
(unset in dev/CI = no-op), and exposes `track(event, data)` for custom
feature-usage events. The tracker URL + website id come from GitHub Actions
**variables** (`UMAMI_SRC`, `UMAMI_WEBSITE_ID`, `UMAMI_PAGES_WEBSITE_ID`) — see
[Where configuration lives](#where-configuration-lives) for the full table and
the `gh variable set` commands.

Because the ids don't exist until Umami is first deployed, the order is: deploy
→ register the website(s) → set the variables → re-run the build
(*workflow_dispatch* on `publish.yml` / `deploy.yml`).

**4. Backups** — `pg_backup` runs `pg_dump` of the Umami database `@daily` to
`s3://<bucket>/backups/`, pruning dumps older than `BACKUP_KEEP_DAYS`. Restore
the latest dump onto a fresh Postgres:

```bash
# fetch the newest object under the bucket's backups/ prefix, then:
gunzip -c <dump>.sql.gz | docker compose exec -T postgres psql -U postgres
```

Verify the first nightly dump actually lands in the bucket — if the S3 client
trips on the endpoint's addressing style, that's the one knob to adjust. Do a
dry-run restore once so you know it works.

## Deep dives

- [`docs/canvas-app-architecture.md`](docs/canvas-app-architecture.md) — the
  canvas rendering / interaction architecture in depth.
- [`docs/feature-roadmap.md`](docs/feature-roadmap.md) — where the product is
  headed and why (whiteboard parity vs the maths moat).
