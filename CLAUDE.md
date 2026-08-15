# Maths Board — working notes for Claude

An infinite-canvas maths whiteboard: written-method scaffolds, a toolbox of
maths widgets, and real-time collaboration. Two boards ship off **one build** —
the maths board at `/` and the language board at `/language/` — assembled from
the page path by `src/subject.ts`.

`DEVELOPMENT.md` is the architecture reference (document vs ephemeral state, the
collaboration seam, persistence, the tool registry, adding a tool). Read it
before structural work. `CONTRIBUTING.md` has the house conventions. This file
is about how work gets done and checked.

# WORKFLOW

## Before any check, wait for the environment

A container is cloned fresh for every web and mobile session: no
`node_modules`, no `server/node_modules`, no browser. The SessionStart hook
starts preparing it in the background; this is how you wait for it.

```bash
bash scripts/await_ready.sh     # instant when prepared, blocks when not
```

Do not diagnose a failing test or a missing module before it has returned — the
answer is almost always that the install had not finished.

## The commit gate

```bash
bash scripts/checks.sh          # typecheck + the unit suite. Silence is the pass
```

Same thing `.claude/hooks/commit-checks.sh` runs before it will let a `git
commit` through, and the same pair CI gates every heavier pipeline on
(`unit-run.yml`). Both legs are seconds. Run the script rather than guessing
what it wants; `typecheck` / `unit` narrow it to one leg.

## The pre-PR gate

**`scripts/checks.sh` does not run Playwright, and never will.** It is the
*commit* gate, and a suite that boots a sync backend has no business sitting
between a change and a commit. So it stays green while the app is broken in the
browser — which is exactly the shape of the mistake: a clean `checks.sh` reads
as "the branch is fine" and a pull request goes up failing CI.

**Run the browser suite before opening or updating a pull request**, every time,
whatever the change looked like:

```bash
bash scripts/checks.sh && bash scripts/e2e.sh    # the actual pre-PR gate
```

`scripts/e2e.sh` brings a stack up itself and runs `e2e/` against it. A
change that "only touched styling" is not an exemption: the suite drives the
real toolbar, the real dock and the real canvas, and CSS is how the dock stops
being clickable.

## Two ways to run the app

`scripts/start_app.sh` is the one entry point, and it has two modes because the
documented topology needs a daemon a cloud container does not have.

| | local stack (default) | `--stack` |
| --- | --- | --- |
| what runs | `y-sweet`, `server/index.js`, Vite — plain processes | the full compose topology: Caddy + API + Y-Sweet + MinIO |
| needs Docker | no | yes |
| URL | `:5173` | `:8080` |
| hot reload | yes | no (the web image bakes the frontend in) |
| sharing, presence, join codes, sync | yes | yes |
| image upload (`/api/upload`) | **no** — MinIO is the S3 stand-in and MinIO is a container | yes |

The local stack is what a web or mobile session gets, and it runs all of `e2e/`
except `e2e/image.spec.ts`; `scripts/e2e.sh` skips that one there and says so.
CI runs the whole suite on the compose stack, so nothing goes uncovered — but
an upload bug cannot be reproduced without `--stack` and a daemon. Say so
rather than guessing.

## Done means seen, not green

Tests and typecheck passing is the floor, not the finish. The board renders to a
`<canvas>`: spacing, alignment, overflow and hit targets are exactly the things
that typecheck clean and still look wrong. Any change with a visual or
interactive surface gets exercised in the running app before it is called done.

```bash
bash scripts/start_app.sh
node .claude/skills/app-screenshots/scripts/screenshot.mjs \
  --insert worksheet --width phone --width desktop
```

Working anywhere a human is not in front of the terminal — web, mobile, a PR
thread — that evidence is **shown, not described**: attach the PNGs. Screenshot
before as well as after when the point of the change is how it looks, and cover
every breakpoint and every board it crosses. The toolbar and dock re-flow for
narrow screens, and shared UI belongs to *both* the maths and the language
board. The **`app-screenshots` skill** has the whole of it — including why a
screenshot taken without seeding the canvas is a photograph of blank paper.

## Merging main into a branch

```bash
git fetch origin main && git merge origin/main
npm install                      # main may have moved the lock file
bash scripts/checks.sh
```

`package-lock.json` is regenerated, never hand-merged — a hand-merged lock file
installs a tree neither branch has tested.

## After the pull request is open

Opening it is the middle of the job. Subscribe to it, fix what CI reports,
resolve conflicts by merging `main` in, and keep going until it is green — the
**`pr-watch` skill** has the whole loop, including what counts as a real
diagnosis and why no test is ever made to pass by weakening it.

A pull request **closes its issues by name, one keyword each**, on its own line:

```
Closes #17
Closes #23
```

`Closes #17, #23` links the first and silently drops the rest, and a bare `#17`
links without ever closing — both leave issues open behind a merged PR. An issue
the branch only advances is referenced without a keyword (`Part of #31`).

# SKILLS

Load the skill before the work, not after the review.

- **`app-screenshots`** — bringing the board up and photographing it. Every
  visual change, and anything that has to be shown rather than described.
- **`pr-watch`** — after a pull request is open: CI failures, merge conflicts,
  and what to reply in the thread.

# CONVENTIONS THAT BITE

- **Each constant has exactly one home.** Colour tokens and the font stack live
  in `src/styles/theme.ts` (mirrored in `:root` in `src/styles/index.css`); the
  shortcut catalog in `src/ui/shortcuts.ts` drives its own handlers *and* the
  help modal. Don't hardcode what a table already owns.
- **A new tool is a folder plus one registration line** —
  `src/tools/<name>/index.ts` exporting `defineCanvasTool`/`defineWidgetTool`,
  registered in `src/tools/index.ts` and nowhere else. `registry.test.ts` sweeps
  every registered tool for the baseline. Copy `src/tools/numberline` (canvas +
  dialog) or `src/tools/text` (canvas only).
- **Document state vs ephemeral state is a real seam.** What belongs in the Y.Doc
  (and therefore syncs, persists and undoes) versus what is local-only is
  decided in `DEVELOPMENT.md → Document vs ephemeral state`. Putting a cursor,
  a hover or a run-timer in the document is the mistake that suite exists to
  catch.
- **`COLLAB_ENABLED` gates everything with a server behind it** — sharing,
  presence, join codes, image upload. It is off for the static GitHub Pages
  build, which must stay a fully working single-user whiteboard. A new
  server-backed feature is gated the same way.
- **The e2e hook is read-only.** `src/testing/e2eHooks.ts` exposes snapshots for
  Playwright to poll; tests drive the app through pointer and keyboard, never
  through the hook. Keep its shape and `e2e/helpers.ts`'s mirror in sync.
- **Unit tests are behavioural.** `src/**/*.test.ts` runs headless under Vitest +
  jsdom and asserts on store/interaction/shortcut outcomes. Rendering is not
  under test there — pixels belong to `e2e/`.
