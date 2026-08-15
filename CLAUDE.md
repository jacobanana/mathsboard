# Maths Board — working notes for Claude

`DEVELOPMENT.md` is the architecture reference (document vs ephemeral state, the
collaboration seam, persistence, the tool registry, adding a tool) and
`CONTRIBUTING.md` has the house conventions — read those before structural work.
This file is the map: what the project *is*, where a task lands, and how work
gets checked.

# TWO APPS, ONE BUILD

This repo ships **two whiteboards**, not one app with a mode switch:

| | **Maths Board** | **Language Board** |
| --- | --- | --- |
| for | teaching written maths methods — column arithmetic, fractions, place value, times tables | teaching a foreign language — vocabulary, phrases, conjugation, translation games |
| production | `mathsboard.mixedmode.ch` | `langsboard.mixedmode.ch` |
| elsewhere | `/` | `/language/` |
| page | `index.html` | `language/index.html` |
| tools | 27 maths widgets | 10 language widgets |
| paper | squared | lined |
| dock | pan, select, pen, eraser, text, **math** | pan, select, pen, eraser, text |

Both pages load the **same** `src/main.tsx`, share one backend, one sync server
and one storage bucket. They are different *products* assembled from one
codebase — a language teacher never sees a long-division scaffold, and a maths
teacher never sees a gender-sort game.

**`src/subject.ts` resolves which one this page is**, once, at module load:

- **Production** — each board has its own domain, and the leftmost DNS label
  decides. Matching is by *prefix* (`maths…` / `lang…`), so a subdomain rename
  inside a family needs no code change.
- **Everywhere else** (dev, GitHub Pages, e2e) — both share an origin and the
  `/language/` path segment decides.

The same module owns the inverse: `pathForSubject` / `hostForSubject` /
`crossAppRedirect`. A shared board carries its subject in its synced meta, so a
board opened in the wrong app hands off to the right one — swapping domain on
production, toggling the path segment anywhere else. That is why a join code
typed into the maths board can still open a language board.

## What differs, and where it is declared

**`src/boardProfile.ts` is the whole difference table** — app name, the Insert
button's noun, the paper a new board starts on, and the dock's tool list (which
also gates their keyboard shortcuts, since `ui/shortcuts.ts` reads it). A third
board type would be a `Subject` in `subject.ts` plus one `PROFILES` entry.

**`src/tools/index.ts` assembles the registry per subject**: `CORE_TOOLS`
(text, shapes, and Picture on collab builds) plus `MATHS_TOOLS` **or**
`LANG_TOOLS`. A build only ever registers one subject's widgets, so the Insert
gallery is right by construction and the two subjects can never collide on a
tool type.

Beyond those two tables, **only these modules branch on the subject at all** —
if a change needs a third, it probably belongs in the profile instead:

| module | what it branches on |
| --- | --- |
| `App.tsx` | board-title target (boards manager vs welcome), the content notice |
| `ui/modals/defs.tsx` | which welcome and new-board flow; Content entry points |
| `ui/Toolbar.tsx`, `ui/OverflowMenu.tsx` | title tooltip; the Content / Voices menu items |
| `ui/BoardsManager.tsx` | the "teaches 🇬🇧→🇫🇷 · Base + Kitchen" line on each card |
| `board/store.ts` | applying a board's content choice on load/join |
| `board/persistence/LocalBoardRepository.ts` | **boards are subject-scoped**: each app lists only its own. Documents saved before the field existed read as maths |
| `pwa.ts` | the service-worker URL from the page's depth |

# NAVIGATION — where a task lands

## The shared board (both apps)

| a task about… | goes to |
| --- | --- |
| the document model, what syncs/persists/undoes | `board/types.ts`, `board/store.ts` (the two halves are one store, deliberately separated) |
| placing or editing an object, the clipboard | `board/commands.ts` — every placement path goes through it — and `board/sizing.ts`, the one authority on an object's box |
| selection and the press rule, resize handles | `board/selection.ts`, `board/resize.ts` |
| z-order and grouping | `board/commands.ts` (`arrangeSelection`), surfaced by `ui/FloatButtons.tsx` |
| colours, sizes, alignment from the pill *or* the keyboard | `board/styling.ts` — one service behind both surfaces |
| loading an old board | `board/migrations.ts` — a pure transform appended to one registry, and nothing else changes |
| storage | `board/persistence/` — everything hides behind `BoardRepository` |
| pointer behaviour of a dock tool | `canvas/interactions/` — one controller per tool, dispatched by `BoardCanvas` |
| what gets painted | `canvas/scene.ts` (the document) — interaction previews come from the controller's `drawOverlay`, never from here |
| pan / zoom / pinch | `canvas/viewport.ts` |
| in-place editing | `canvas/textEditor.ts`, `canvas/mathEditor.ts`, registered via `canvas/editors.ts` |
| overlays on top of the canvas | `canvas/WidgetLayer`, `InputOverlayLayer` (type-in answers), `AnswerButtonLayer` (reveal), `ui/PresenceLayer`, `ui/TimerDoneLayer` |
| sharing, join codes, presence, the Y.Doc | `collab/session.ts` (the one write API), `collab/docModel.ts` (how a board maps onto a Y.Doc, and how it merges), `collab/collabStore.ts` (ephemeral session state) |
| a dialog or flow | `ui/modals/defs.tsx` — one entry per modal, routed by `kind` |
| the dock, the options pill, a tool's chrome | `ui/toolSpecs.tsx` — one spec drives the button, the shortcut and the pill |
| a keyboard shortcut | `ui/shortcuts.ts` — the catalog drives its own handlers *and* the help sheet |

## The language board only

`src/lang/` is the language app's own subsystem. It is *reached* from a handful
of shared modules — `board/store.ts`, `ui/modals/defs.tsx`, `ui/BoardsManager.tsx`
and `App.tsx` import from it, guarded by the subject at runtime rather than at
the import — so a change in here can still break the maths build's typecheck.
Everything else in it is language-only.

| a task about… | goes to |
| --- | --- |
| **what a board teaches** — languages + chosen packs | `lang/content/boardContent.ts` (read / resolve / apply / embed) and `board/types.ts → contentSetup` |
| the content catalogue every widget reads | `lang/content/registry.ts` — merges the built-in `base.json` with imported packs; the built-in one is loaded through the *same* path, never special-cased |
| the pack file format | `lang/content/schema.ts` — types, the published JSON Schema **and** `validatePack`, in lock-step by construction |
| the LLM pack-authoring prompt | `lang/content/prompt.ts` — *generated from the schema*, so it cannot drift |
| a board carrying its content to a collaborator | `lang/content/embed.ts` — embeds the minimum a widget actually leans on |
| resolving words for a `{ known, learning }` pair | `lang/pairs.ts` — no widget ever hardcodes English↔French |
| picking packs and direction for a new board | `lang/packDirectory.ts` (logic) + `lang/PackDirectionPicker.tsx` (view) |
| text-to-speech and voice choice | `lang/speech.ts`, `lang/voiceStore.ts` — Web Speech API, no backend |
| drag-or-tap token games | `lang/usePickPlace.ts` — one interaction behind gender sort, conjugation and the rest |

Two rules the subsystem rests on. **Widgets store references, not words** — a
theme id, a level, the two language codes — and resolve live, which is why a
board must embed the packs it leans on. And **a widget bakes its `{ known,
learning }` pair into its own params at creation**, so a placed activity is
stable even if the learner later switches languages.

## Adding a tool

A folder plus one registration line: `src/tools/<name>/index.ts` exporting
`defineCanvasTool` / `defineWidgetTool`, added to the right array in
`src/tools/index.ts` and nowhere else. Copy `src/tools/numberline` (canvas +
dialog) or `src/tools/text` (canvas only); for the language board copy
`src/tools/langmatch`. `tools/registry.ts` is the contract — including the
opt-in capabilities (`inputs`, `vertices`, `styling`, `editWith`, `answer`,
`available`) that let a tool get type-in boxes, draggable vertices or a reveal
toggle with no host edits. `registry.test.ts` sweeps every registered tool.

# TESTING THE TWO APPS

Unit tests (`src/**/*.test.ts`, ~50 files) cover both subjects: `subject.test.ts`
pins the resolution and hand-off rules, and the language subsystem has its own
suites for pairs, packs, board content, conjugation and each game's logic.

**The Playwright suite does not cover the language board at all** — every spec
loads `/`. So a change to shared UI is only proven on the maths side by `e2e/`,
and a language-board change is proven by unit tests plus what you can see. That
is the gap screenshots exist to fill: shoot `--path /language/` too.

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
- **A new tool is a folder plus one registration line** — see *Adding a tool*
  above. A tool never registers itself; `src/tools/index.ts` owns that.
- **Nothing new branches on the subject.** What differs between the two boards
  belongs in `src/boardProfile.ts` or in which array of `src/tools/index.ts` a
  tool sits — not in a fresh `if (IS_LANGUAGE)` in a component. The handful of
  modules that legitimately do branch are listed above; adding to that list is a
  decision, not a detail.
- **Shared UI belongs to both boards.** A change to the toolbar, dock, modals,
  canvas or shortcuts ships to the maths board *and* the language board. `e2e/`
  only exercises the maths one, so the language side is checked by eye —
  screenshot `--path /language/` as well.
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
