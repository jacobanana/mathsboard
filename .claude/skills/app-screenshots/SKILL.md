---
name: app-screenshots
description: Run the board locally and photograph it with Playwright. Use whenever a change has to be shown rather than described, or when asked to start, run or screenshot the app — brings up a stack with no Docker required, seeds the canvas with real content, and captures any screen at phone, tablet and desktop widths, solo or with live collaborators.
---

# Showing the board

A layout claim nobody can see is not evidence. The board draws to a `<canvas>`,
so it is also the part of this app that typechecks clean and still looks wrong —
every visual change gets screenshotted at the widths it crosses, before and
after when the point of the change is how it looks.

Two scripts do the work. Paths below are relative to the repo root.

## 1. Bring the app up

```bash
bash scripts/start_app.sh
```

Idempotent and safe to run before every screenshot session — it reuses whatever
is already answering. It installs what is missing, starts the sync server, the
token API and Vite, and prints the base URL (also written to `.dev/base_url`,
which the screenshot script reads).

| flag | what it does |
| --- | --- |
| *(none)* | the **local stack**: `y-sweet`, `server/index.js` and Vite as plain processes on `:5173`. No Docker, hot reload, real sharing between real clients |
| `--stack` | the **compose topology** on `:8080` — Caddy + API + Y-Sweet + MinIO, production build. The only mode where image upload works, and the one CI tests |
| `--fresh` | wipe the sync server's document store (or the compose volumes) first |
| `--prepare-only` | install dependencies and stop — what the SessionStart hook runs |

Logs live in `.dev/vite.log`, `.dev/api.log`, `.dev/ysweet.log` and
`.dev/setup.log`. Stop it with `bash scripts/stop_app.sh`.

**The local stack has no S3 behind `/api/upload`**, because the thing standing
in for S3 is MinIO and MinIO is a container. Inserting a picture answers 502
there; use `--stack` when the picture is the point.

## 2. Photograph the board

```bash
node .claude/skills/app-screenshots/scripts/screenshot.mjs \
  --insert worksheet --width phone --width desktop
```

It dismisses the welcome modal, puts the board into the state you asked for,
and writes one PNG per path × width into `.dev/screenshots/`, printing each
filename. Read the files back to check the result, and send them to the user
with `SendUserFile`.

| option | |
| --- | --- |
| `--path` | app path; repeat for several. The **language board** is a second page of the same build, at `/language/` |
| `--width` | `phone` (390), `tablet` (768), `desktop` (1440) or a number; repeat |
| `--insert` | place a tool from the Insert gallery by registry type and accept its dialog; repeat. Maths: `worksheet`, `timer`, `dice`, `numberline`, `flashcards`, `longmult`, `placevalue`, … Language: `langvocab`, `langflashcards`, `langphrases`, `langtable`, `langconjugate`, `langmatch`, `langsentence`, `langgaps`, `langgender`, `langprep` |
| `--draw` | `x1,y1,x2,y2` — drag a pen stroke across the stage; repeat |
| `--tool` | select a dock tool first (`draw`, `text`, `erase`, `select`… — the button id without `Btn`) |
| `--key` | press a shortcut (`Control+d`, `?`, `Escape`); repeat. Half this app's surface is keyboard |
| `--click` | click a selector before shooting; repeat. What the shot is *of* may be behind the burger (`#menuBtn`) — a closed menu photographs as a button |
| `--fill` | `selector=value` to type before shooting; repeat |
| `--peers` | share the board and bring *n* more clients in, so presence, peer cursors and the "*n* here" chip are real |
| `--shoot-peers` | also capture each guest's own view — the two sides of a sync change in one run |
| `--welcome` | keep the welcome modal (it is dismissed by default) |
| `--wait` | CSS selector to wait for before shooting |
| `--delay` | extra settle time in ms (default 400) |
| `--full-page` | the whole scrollable page instead of the viewport |
| `--name` | filename prefix, instead of one derived from the path |
| `--out` | output directory (default `.dev/screenshots`) |

## An empty board photographs as an empty board

This is the mistake to avoid here. The canvas starts blank, so a screenshot of
"the new widget spacing" taken without `--insert` is a screenshot of paper.
Seed the board with the thing the change is about:

The two boards take DIFFERENT widget types, so one `--insert` cannot serve
both — shoot them in separate runs when the content matters, and in one run
when the point is the shared chrome around it.

```bash
# shared chrome on both boards, at both widths
node .claude/skills/app-screenshots/scripts/screenshot.mjs \
  --draw 300,240,700,420 \
  --path / --path /language/ --width phone --width desktop

# each board with its own content
node .claude/skills/app-screenshots/scripts/screenshot.mjs --insert worksheet
node .claude/skills/app-screenshots/scripts/screenshot.mjs \
  --path /language/ --insert langvocab --name langboard

# a dialog: open it with --click, and name the shot for what it shows
node .claude/skills/app-screenshots/scripts/screenshot.mjs \
  --click '#menuBtn' --click '#shortcutsBtn' --name shortcuts-help

# collaboration as it actually looks: two people, cursors on the stage
node .claude/skills/app-screenshots/scripts/screenshot.mjs \
  --peers 1 --shoot-peers --name presence --width desktop
```

## Which widths, which board

- The toolbar, dock and options pill re-flow for narrow screens, so **anything
  touching them needs `--width phone` *and* `--width desktop`**. Tablet only
  when the change is about the middle.
- There are **two boards off one build**: the maths board at `/` and the
  language board at `/language/`. They differ by more than their widgets — the
  language board starts on lined paper, drops the maths-notation dock tool, and
  fronts the page with its own launcher. A change to shared UI — toolbar, dock,
  modals, welcome — is shown on **both**; a change inside one subject's tools is
  shown on that one.
- **`e2e/` never loads `/language/`.** Every Playwright spec runs against the
  maths board, so a screenshot is the only check the language side gets on a
  shared-UI change. Take it.
- A collaboration change is shown *shared* (`--peers 1`), not solo. The share
  chip, the presence cursors and the join code only exist there.

## When something goes wrong

- **The shot is of the welcome screen** — the script dismisses it (Continue when
  there is a draft to resume, Escape otherwise, since the language board only
  shows Continue when there IS one). If it is still there, the board store never
  left its "pending" placeholder — the app did not boot. Check `.dev/vite.log`.
- **Sharing hangs or the share dialog never shows a link** — the token API or
  the sync server is down. Check `.dev/api.log` and `.dev/ysweet.log`, then
  re-run `start_app.sh`.
- **Inserting a picture fails with 502** — expected on the local stack; use
  `--stack`.
- **Playwright cannot find a browser** — the script falls back to any chromium
  on the box (`PLAYWRIGHT_BROWSERS_PATH`, `/usr/bin/chromium`) because a
  sandboxed container often cannot download the pinned build. Name one
  explicitly with `PLAYWRIGHT_CHROMIUM_EXECUTABLE` if the fallback picks wrong.
- Hot reload is on in the local stack, so an edit shows up on the next
  screenshot without a restart. The compose stack bakes the frontend into its
  image — re-run `start_app.sh --stack` after changing `src/`.
