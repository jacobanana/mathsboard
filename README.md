# Maths Board

An infinite-canvas maths whiteboard for the classroom: freehand pen/eraser,
free text, and a growing toolbox of maths widgets (number lines, times tables,
long division, fractions, clocks, ...). A Vite + React + TypeScript port of a
single-file HTML prototype.

## Run

```bash
npm install
npm run dev        # start Vite dev server
npm run typecheck  # tsc -b --noEmit
npm run build      # typecheck + production build
npm run preview    # preview the production build
```

Path alias: `@/` -> `src/`.

## Architecture

### Document vs ephemeral state

State splits in two (see `src/board/store.ts`):

- **Document state** — `board: BoardDocument` (`objects`, `strokes`,
  `background`, name, timestamps). This is the unit that will sync to a backend
  and to collaborators later. Every object and stroke carries a stable string
  `id` (`src/board/types.ts`, `id()`).
- **Ephemeral state** — camera, current tool, colour, pen/text size, selection,
  and the in-progress text `editingId`. Local-only; never persisted into the
  document, never synced.

**Rule:** never mutate the document outside a store action. All document changes
go through named actions (`addObject`, `updateObject`, `moveObject`,
`removeObject`, `addStroke`, `setBackground`) — these are the future sync seam.
History (`pushHistory` / `undo` / `redo`) snapshots `{objects, strokes}` as JSON,
capped at 60 entries; `canUndo` / `canRedo` are exposed as booleans.

### Persistence seam

Storage hides behind the `BoardRepository` interface
(`src/board/persistence/BoardRepository.ts`). The default implementation is
`LocalBoardRepository` (localStorage, key prefix `mathsboard:`), exported as the
singleton `localRepository`. The store autosaves the document via a debounced
call to `localRepository.save` — **that debounce is exactly where backend sync
will hook in.** To add a backend, implement `BoardRepository` against your API;
nothing else changes.

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
# mathboard
