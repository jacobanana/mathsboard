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
`make up`, `make e2e`, `make app`, ...). Every target is just a shortcut for
the raw command shown in each section, so `make` is optional.

Path alias: `@/` -> `src/`.

The app is fully usable solo with no backend (boards live in localStorage).
Sharing a board (the **Share** button in the top bar) needs the backend running.
There are two ways to get one:

```bash
bash scripts/start_app.sh          # no Docker: y-sweet + the token API + Vite, on :5173
bash scripts/start_app.sh --stack  # the full compose topology, on :8080
```

The first runs the sync server (the npm build of the same y-sweet the container
runs) and `server/index.js` as plain processes and points the Vite dev server's
`/api` and `/ys` proxies at them — real sharing, presence and sync, with hot
reload and no Docker daemon. The one thing it cannot do is image upload, which
needs the S3 stand-in from the compose stack. `bash scripts/stop_app.sh` stops
either.

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
  protocol only — it is never written into the document. The board opens on the
  **Move (pan)** tool: the first gesture is to look around, and a navigating
  default can never leave a stray mark.
  The one piece of ephemeral state that outlives the session is the **camera**:
  it is remembered *per board on this device* (`saveView` / `loadView`, keyed by
  the board's library id, else its document id — a shared board's id is its join
  code). Reopening a board restores its zoom and position; it stays out of the
  document, so collaborators on one shared board each keep their own view.

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
upload/serving against S3), the official Y-Sweet container, and Caddy serving
both board domains and proxying the shared backend (`deploy/Caddyfile`). See
**Deploy** below.

### Two boards, two domains

Both boards are ONE build. Which flavour a page is resolves once at module load
in `src/subject.ts`, and there are two URL layouts:

- **Multi-domain (production)** — each board on its own domain
  (`mathsboard.mixedmode.ch` / `langsboard.mixedmode.ch`). The leftmost DNS
  label is authoritative, matched by **prefix** (`maths…` / `lang…`) so an
  in-family subdomain rename needs no code change; only the canonical peer label
  used to build a cross-app redirect is exact (`HOST_CONFIG` in `src/subject.ts`).
  Caddy serves the language board's page — built under
  `/language/` — at the language domain's root; its relative asset URLs (baked at
  `/language/` depth) resolve to the shared `/assets` and `/icons` because
  browsers clamp `..` at `/`. Only the manifest is rewritten to the language copy.
- **Single-origin (local dev, GitHub Pages, e2e)** — both boards share one origin
  and the `/language/` path segment selects (the dev server serves
  `language/index.html` there; the maths block in `deploy/Caddyfile` also answers
  `/language/` off the same build).

`crossAppRedirect` (`src/subject.ts`) is the inverse used for cross-app hand-off:
a shared board that belongs to the other flavour bounces to the other **domain**
(production) or the other **path** (single-origin), carrying its `?board=<code>`.

> **Decision — one image, subject resolved at runtime.** Both boards ship from a
> single build/image and the flavour is detected from the URL at load, rather
> than baking the subject in per-image at build time. This keeps the deploy to
> one image and one Pages build, at the cost of a small host/path detection
> function and the Caddy `..`-clamp that serves the `/language/` page at a domain
> root. Worth revisiting at **3+ subjects**: at that point prefer a build-time
> `VITE_SUBJECT` per image (making `SUBJECT` a constant and deleting the
> detection/hand-off duality) over an ever-growing detection function and a
> fatter shared bundle. At two boards it isn't worth the extra images.

### Persistence seam

Storage hides behind the `BoardRepository` interface
(`src/board/persistence/BoardRepository.ts`). The default implementation is
`LocalBoardRepository` (localStorage, key prefix `mathsboard:`), exported as the
singleton `localRepository`. In solo mode the store autosaves the working draft
via a debounced `localRepository.saveDraft`; shared boards are persisted by
Y-Sweet (S3) instead, and the private local draft is left untouched. On the same
debounce, and on `pagehide`, the store writes the board's **view** (camera) to
the `mathsboard:views` map — local to the device for solo AND shared boards, so
reopening one lands where it was left.

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

### Installable apps (PWA)

The two boards ship as **two separate installable PWAs** off the one build. Each
page links its own web manifest (`public/manifest.webmanifest` and
`public/language/manifest.webmanifest`) with its own name, scope, theme colour
and icons, so Android/iOS install them as distinct home-screen apps. iOS ignores
the manifest for install, so `index.html` / `language/index.html` also carry the
`apple-touch-icon` and `apple-mobile-web-app-*` tags.

All manifest and icon paths are **relative**, matching Vite's `base: "./"`, so
the same page works wherever it is mounted: the site root, the repo subpath
(GitHub Pages), or the language board's own domain root (where the `../` icon
paths clamp back to `/icons`). On production the two boards are separate origins,
so each installs and caches independently; on the single-origin layouts they
share one origin. The service worker (`public/sw.js`) is registered from
`src/pwa.ts` at the deployment root — root scope, covering the board — giving
offline load (network-first for pages, stale-while-revalidate for assets;
`/api/` and `/ys/` are never intercepted). It registers in production builds only.

The home-screen icons are generated by `node scripts/make-pwa-icons.mjs`, which
renders vector SVG art to PNG via the Playwright Chromium (there is no other
rasteriser in the toolchain). Re-run it only when the icon art changes and commit
the resulting `public/icons/*` files.

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
[Vitest](https://vitest.dev) + jsdom — no Docker, no browser:

```bash
npm test              # run once           (make test)
npm run test:watch    # re-run on change   (make test-watch)
bash scripts/checks.sh   # typecheck + unit tests together — the commit gate
```

The tests drive the same seams the real UI drives (store actions, interaction
controllers, the shortcut dispatcher) and assert only on observable outcomes:
the document mirror, the selection, localStorage, the undo flags. Solo mode
runs on a real local `Y.Doc`, so undo/redo semantics are exercised against the
real `Y.UndoManager` — no mocks. A registry sweep
(`src/tools/registry.test.ts`) runs baseline checks over every registered
tool, so a new tool gets them for free. Shared fixtures live in
`src/testing/fixtures.ts`; the lone environment shim (a canvas text-measure
stub) in `src/testing/vitestSetup.ts`. Rendering and collaboration are
deliberately out of scope here — they belong to the Playwright suite below.

In CI the suite is the fast gate in front of everything else
(`.github/workflows/unit-run.yml`, reusable): pull requests run unit → e2e
(`e2e.yml`), and a push to `main` runs it at the head of both deploy
pipelines — `publish.yml` (unit → e2e → image build → VPS deploy) and
`deploy.yml` (unit → GitHub Pages build → deploy). A red unit suite therefore
blocks every deployment and skips the far longer e2e run entirely.

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
bash scripts/e2e.sh               # brings a stack up itself and runs the suite
bash scripts/e2e.sh --stack       # ... on the compose topology specifically
bash scripts/e2e.sh e2e/sync.spec.ts --headed    # any playwright args pass through

npx playwright install chromium   # once      (make e2e-install)
npm run test:e2e                  # raw playwright: boots the compose stack itself (make e2e)
```

`scripts/e2e.sh` is the one to reach for: it waits for dependencies, starts the
local stack when there is no Docker daemon, and finds a usable Chromium when the
pinned build is not installed. On the local stack it skips the specs that need
the S3 stand-in for image upload, and prints which; CI runs the whole suite on
the compose topology.

If you already have the stack up, the tests reuse it — but remember the web
image bakes the frontend in, so rebuild (`up --build`) after changing `src/`.
Board content lives on `<canvas>`, so the tests assert document state through
the read-only `window.__mathsboard` hook (`src/testing/e2eHooks.ts`) while
driving all input through the real UI. CI runs the suite on every pull
request, gated behind the unit tests (`.github/workflows/e2e.yml`).

## Deploy

**The server is described in another repo.** The box that serves the boards
also serves the other small apps on the same account, so its infrastructure —
the VM, the proxy, the certificates, the database, the analytics, the DNS —
lives in [`jacobanana/mixedmode-deploy`](https://github.com/jacobanana/mixedmode-deploy).
This repo builds images and says when a new one exists. It holds no SSH key and
knows no hostname.

What is over there, and why it left:

| | |
| --- | --- |
| `stacks/edge` | Caddy: TLS, routing, 80/443 for **every** app. Two apps cannot each bring their own proxy and both bind those ports |
| `stacks/umami` | Analytics, on its own domain and its own deploy. As a sidecar here it restarted whenever this app shipped, and no other site could use it |
| `stacks/data` | The shared Postgres, which is Umami's now rather than this app's |
| `stacks/mathsboard` | The three containers that are actually this app: `web`, `api`, `ysweet` |
| `terraform/` | The VM, the bucket, the firewall, the A records, and every generated secret |

### The pipeline

`.github/workflows/publish.yml` runs on every push to `main`:

1. **Unit** → **e2e**. A red suite stops everything below it.
2. **Build** only the images whose paths changed, tagged `latest` and
   `sha-<commit>`, pushed to GHCR (`ghcr.io/jacobanana/mathsboard-{web,api}`).
3. **Dispatch** `deploy.yml` in the deploy repo with `stack=mathsboard` and the
   image references just published.

The deploy repo records those references in `versions/mathsboard.env`, commits
that, and rolls the stack over. So the deployed version is a commit there and a
rollback is `git revert` in that repo — not a re-run here. It merges rather than
overwrites, which is what lets step 2 skip an unchanged image without the other
one losing its pin.

One secret, in Settings → Secrets and variables → Actions:

| Secret | Value |
|---|---|
| `DEPLOY_DISPATCH_TOKEN` | fine-grained PAT, **Actions: read and write**, scoped to `mixedmode-deploy` alone |

`Actions: write` rather than the `Contents: write` a `repository_dispatch`
would need — this token may start a deploy and may not push to the repo that
describes every app on the box.

### Build-time variables

Public values baked into the frontend bundle. Optional — unset means analytics
is simply off.

| Variable | Used by | Value |
|---|---|---|
| `UMAMI_SRC` | both builds | `https://<analytics domain>/script.js` |
| `UMAMI_WEBSITE_ID` | the self-hosted `web` image (`publish.yml`) | website id of the collab site |
| `UMAMI_PAGES_WEBSITE_ID` | the Pages build (`deploy.yml`) | website id of the Pages site |

```bash
gh variable set UMAMI_SRC --body "https://analytics.example.com/script.js"
gh variable set UMAMI_WEBSITE_ID --body "<website-id>"
```

Variables aren't file changes, so they **don't trigger a build** — after setting
them, force one with `gh workflow run publish.yml` (and `gh workflow run
deploy.yml` for the Pages build).

Analytics is self-hosted Umami: privacy-first, cookieless, no third-party in the
data path and no consent banner. `src/analytics.ts` injects the tracker only
when both variables are set (unset in dev and CI = no-op) and exposes
`track(event, data)` for feature-usage events. Registering a site is a dashboard
action in Umami; running it is the deploy repo's business.

### The two shapes, and the one that bites

Production and the local stack differ in exactly one way, and it is the thing to
know before editing a Caddyfile here:

| | local / e2e | production |
| --- | --- | --- |
| config | `deploy/Caddyfile`, bind-mounted over the image's | `deploy/web.Caddyfile`, baked into the image |
| Caddy does | everything: static, `/api`, `/ys`, on `:8080` | serves files, nothing else |
| the language board | a path, `:8080/language/` | its own domain |
| TLS, routing | none | the edge stack, in the other repo |

Both boards' domains proxy to the same `web` container; which one a request is
for arrives as an `X-Board` header the edge proxy sets, so the image stays
domain-agnostic and the hostnames are declared once, in the deploy repo. The
rewriting that makes `/language/` look like a domain root is in
`deploy/web.Caddyfile`, because it needs `try_files` and only that container has
the files.

The Playwright suite loads `/` and has never covered the language domain, so
that rewriting is checked by eye. That is not new, but it is now written down.

## Deep dives

- [`docs/canvas-app-architecture.md`](docs/canvas-app-architecture.md) — the
  canvas rendering / interaction architecture in depth.
- [`docs/feature-roadmap.md`](docs/feature-roadmap.md) — where the product is
  headed and why (whiteboard parity vs the maths moat).
