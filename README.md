# Maths Board

An infinite-canvas maths whiteboard for the classroom: freehand pen/eraser,
free text, uploaded pictures, and a growing toolbox of maths widgets (number
lines, times tables, long division, fractions, clocks, ...) — with real-time
collaboration: share a link and everyone edits the same board live, with
each other's cursors visible. A Vite + React + TypeScript app backed by
[Yjs](https://yjs.dev) + a self-hosted
[Y-Sweet](https://github.com/jamsocket/y-sweet) server.

## Run

```bash
npm install
npm run dev        # start Vite dev server
npm run typecheck  # tsc -b --noEmit
npm run build      # typecheck + production build
npm run preview    # preview the production build
```

A `Makefile` wraps these and the Docker/Playwright commands below as short
targets — run `make help` for the full list (`make install`, `make dev`,
`make up`, `make e2e`, `make deploy`, ...). Every target is just a shortcut for
the raw command shown in each section, so `make` is optional.

Path alias: `@/` -> `src/`.

The app is fully usable solo with no backend (boards live in localStorage).
Pressing **Share** needs the backend running — for local development, start the
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
  document, never synced. Presence (cursors, names, selections) travels over
  the Yjs *awareness* protocol only — it is never written into the document.

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
  the link (prompts for a display name) or by typing the code — in any
  case/dash format — into **Share → Join a board someone shared**. Leaving
  keeps what's on screen as the local draft.
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

## Test the whole stack locally

Before deploying anywhere, run the complete production topology on your own
machine — same containers, same routing, with MinIO standing in for S3 and
throwaway dev credentials baked in:

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up --build
# or: make up   (make down to stop, make reset to also wipe MinIO data)
```

Open <http://localhost:8080> in two browser windows, click **Share** in one,
paste the link into the other, and draw — strokes, widgets, pictures and
cursors sync live. Documents and uploaded images land in MinIO (console at
<http://localhost:9001>, login `dev-minio` / `dev-minio-secret`). No `.env`,
domain or S3 account required.

### Automated end-to-end tests

The Playwright suite in `e2e/` runs that same two-browser collaboration
session automatically against the compose stack above: share/join/leave,
join-by-code, live stroke sync both ways, concurrent-edit merging, presence
(cursors, selections, who's-here), per-user undo isolation, and shared quiz
widgets (any collaborator selects/edits/deletes them; typed answers and marks
sync).

```bash
npx playwright install chromium   # once      (make e2e-install)
npm run test:e2e                  # boots the compose stack itself if not running (make e2e)
```

If you already have the stack up, the tests reuse it — but remember the web
image bakes the frontend in, so rebuild (`up --build`) after changing `src/`.
Board content lives on `<canvas>`, so the tests assert document state through
the read-only `window.__mathsboard` hook (`src/testing/e2eHooks.ts`) while
driving all input through the real UI. CI runs the suite on every pull
request (`.github/workflows/e2e.yml`).

## Deploy (single VPS, one domain)

Everything runs same-origin behind Caddy: `/api/*` → the token/upload service,
`/ys/*` → the Y-Sweet websocket, everything else → the static frontend. So
there is no CORS anywhere and `wss://` rides the one TLS certificate.

1. **DNS** — point an A record for your domain (e.g. `board.example.com`) at
   the VPS.
2. **Firewall** — open ports **80** and **443** (443 also UDP if you want
   HTTP/3).
3. **Get the code** — `git clone` this repo onto the VPS (Docker and the
   compose plugin installed).
4. **Configure** — `cp .env.example .env`, then fill it in:
   - `SITE_ADDRESS` — your domain.
   - Generate the Y-Sweet keypair **once**:
     `docker run --rm ghcr.io/jamsocket/y-sweet:latest gen-auth --json`
     → `private_key` becomes `Y_SWEET_AUTH`, `server_token` goes into
     `YSWEET_CONNECTION_STRING`. The connection string is the sync server's
     root credential; it stays between containers and never reaches a browser
     (browsers get short-scoped per-board tokens from `POST /api/token`).
   - An S3-compatible bucket + credentials (any provider). Y-Sweet documents
     persist under `s3://<bucket>/ysweet`, uploaded images under
     `s3://<bucket>/assets`.
5. **Run** — `docker compose up -d --build` (or `make deploy`).
6. **First visit** — the first HTTPS request provisions the TLS certificate
   via Let's Encrypt (a few seconds); after that it renews automatically.
   Certificates live in the `caddy_data` volume — keep it.

Upgrades: `git pull && docker compose up -d --build`. The board documents and
images are all in the bucket; the containers are stateless apart from Caddy's
certificates.
