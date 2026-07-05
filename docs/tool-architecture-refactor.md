# Tools, select & edit: duplication audit and unification plan

> **Why this doc exists.** The T1–T6 refactor (docs/canvas-app-architecture.md)
> gave interaction tools a controller registry and killed the god-modules. But
> it stopped one layer short: the **UI surfaces** (dock, options pill,
> shortcuts) and the **cross-cutting behaviours** (create, edit-in-own-tool,
> live restyling, selection chrome) are still hand-listed per tool. Adding a
> tool today edits 6–9 files, and the per-tool copies have already drifted into
> real behaviour differences. This doc (1) inventories the cost of adding a
> tool, (2) lists the duplicated code, (3) lists where tools behave
> differently *by accident*, and (4) proposes the registries/services that make
> "all tools behave the same unless explicitly specified" structural.

---

## 1. What it costs to add a tool today

### 1.1 A new interaction tool (a dock mode, e.g. a stamp/measure tool)

| # | File | Edit |
|---|------|------|
| 1 | `board/types.ts` | extend the `ToolName` union (1 line — fine) |
| 2 | `canvas/interactions/<tool>.ts` | the controller (wanted — this is the feature) |
| 3 | `canvas/interactions/index.ts` | `registerInteraction(...)` (assembly — fine) |
| 4 | `ui/Toolbar.tsx` | a hand-written dock `<button>` block |
| 5 | `ui/icons.tsx` | the icon (fine) |
| 6 | `ui/shortcuts.ts` | a `tool-<name>` catalog entry |
| 7 | `ui/OptionsStrip.tsx` | the early-return tool list, the range/value ternary, an options branch |
| 8 | `board/store.ts` | any option state (`<tool>Size` + setter) |
| 9 | `ui/constants.ts` | its size range |

Rows 4, 6, 7, 8, 9 are the problem: five files that each hold a **parallel
hand-maintained list of tools**, none of which the compiler cross-checks
against the others.

### 1.2 A new draw mode (a shape kind)

`store.ts` (`DrawMode` + `DRAW_MODE_ORDER`), `OptionsStrip.tsx` (`DRAW_MODES`
table + per-mode control gating), `shortcuts.ts` (`mode-<x>` entry),
`icons.tsx`, plus the geometry in `tools/shape/`. **Three parallel mode lists**
(store order, pill table, shortcut entries) that must stay in sync by hand.

### 1.3 A new placeable widget (gallery tool)

`tools/<name>/index.ts` + `Dialog.tsx` + one line in `tools/index.ts`. **This
axis is already right** — three files, all owned by the tool, and the
capability pattern (`vertices`, `rotate`, `inputs`, `answer`) means the select
controller / overlay layers pick new powers up with zero edits. The plan below
extends this pattern to the surfaces that don't have it yet.

### 1.4 A new *content type with its own editor* (what "math" cost)

The worst case — a text/maths-like type touches **both** axes plus:
`select.ts` (`editObjectAt`'s type switch), `BoardCanvas.tsx` (a second
in-place editor wired into `InputCtx`, the pointerdown/wheel commit guards and
the JSX), `store.ts` (an `active<Type>ObjectId` selector), `OptionsStrip.tsx`
(a per-type subscription + pick functions), `shortcuts.ts` (the same logic
again). ~10 files.

---

## 2. Duplication inventory

**D1 — the live-restyle pipeline exists three times per property.** Every
styleable property (colour, fill, size, align) has (a) a store default setter,
(b) an OptionsStrip `pick*` that also patches the active edit target, and
(c) a shortcut twin that re-implements the same patch:

- text re-measure: `OptionsStrip.pickTextSize` (OptionsStrip.tsx:358) ≡
  `adjustSize` text branch (shortcuts.ts:199) — `textSizeOf` + `updateObject{size,w,h}` verbatim.
- maths box re-derive: `OptionsStrip.pickMathSize` (OptionsStrip.tsx:379) ≡
  `adjustSize` math branch (shortcuts.ts:210) — `sizedBox("mathtext", paramsOf(obj), px/MATH_BASE_PX)` verbatim.
- colour: `pickColour` (OptionsStrip.tsx:345) ≡ `cycleColor` (shortcuts.ts:119) — and they have **already drifted** (see V3).

**D2 — the object-creation ritual exists four times.** `addObject` + `select`
+ tool switch + analytics, each slightly different:

| Path | selects | tool after | `tool_action created` | `trackBoardActivated` |
|------|---------|-----------|----------------------|----------------------|
| `commands.placeObject` (commands.ts:46) | ✓ | **select** | ✓ | ✓ |
| `draw.commitShape` (draw.ts:141) | ✓ | **keeps pen** | ✓ | ✓ |
| `text.createAndEdit` (text.ts:50) | ✓ | keeps text | **✗ never** | **✗ never** |
| `math` create (math.ts:59) | ✓ | keeps math | deferred to editor commit (mathEditor.ts:377) | deferred |

**D3 — the deferred-tap gesture is written twice.** `text.ts` `Pending` and
`math.ts` `PendingMath` are the same controller (math.ts's own header says
"the exact shape of the text controller"); only the hit type and the created
object differ.

**D4 — the in-place editor lifecycle is written twice, and the host hardcodes
exactly two.** `textEditor.ts` and `mathEditor.ts` share the whole shape
(open → `setEditingId` + hide from scene + position overlay; commit → resolve
value, empty → `removeObject`, else `sizedBox` at the preserved scale →
`updateObject`). BoardCanvas commits **both by name** in the pointerdown guard
(BoardCanvas.tsx:202-204) and the wheel guard (:280-281), and `InputCtx`
exposes them as two named fields (`editor`, `mathEditor` —
interactions/types.ts:57-60). A third editor type means touching the contract,
the host JSX and every guard.

**D5 — `snapping()` is copy-pasted** between select.ts:162 and draw.ts:115.

**D6 — WidgetLayer re-implements the select press** (WidgetLayer.tsx:53-67):
its own shift-toggle, its own `select(o.id)` — **without** group expansion,
without the click-collapse rule, without move-by-drag. The real algebra lives
in select.ts:519-559.

**D7 — four per-type "active edit target" selectors** (`activeTextObjectId`,
`activeMathObjectId`, `activeShapeObjectId`, `activeStrokeId` —
store.ts:407-459), each subscribed and resolved separately in OptionsStrip
(:298-321), and re-queried in shortcuts. They all answer one question: *"what
single object/stroke is the pill editing right now?"*

**D8 — selection outlines are opt-in per controller.** Four controllers
remember to call `drawSelectionOutlines` (select, draw, text, math); eraser
and pan don't — which is a behaviour hole, not a rendering nicety (see V5).

---

## 3. Behaviour deviations between tools (accidental, not chosen)

These are cases the "all tools behave the same" rule is already broken by the
duplication above. Each is fixable today, independently of any refactor —
but the refactor is what stops the list regrowing.

- **V1 — `+`/`-` is wrong in the pen's sub-modes.** `adjustSize` keys on
  `tool === "pen"` only (shortcuts.ts:182): in **highlighter** mode it nudges
  `penSize` while the pill shows/edits `highlighterSize`; in **shape** modes it
  nudges `penSize` with the pen's 1–24 range while the pill clamps to
  `SHAPE_WIDTH_RANGE` (1–12).
- **V2 — `+`/`-` doesn't restyle the edit target for shapes/strokes.** The
  pill's `pickPenSize` patches the active shape's `strokeWidth` / the active
  stroke's `size` (OptionsStrip.tsx:393); `adjustSize` only re-measures
  text/maths. Same edit session, slider works, keyboard silently doesn't.
- **V3 — `C` (cycle colour) skips strokes.** `pickColour` patches the active
  stroke (OptionsStrip.tsx:350); `cycleColor` patches text/maths/shape but not
  the stroke (shortcuts.ts:130-134). Double-click a pencil line: the swatch
  recolours it, `C` doesn't.
- **V4 — the maths size slider ignores its edit target.** Text binds
  `activeText?.size ?? textSize` (OptionsStrip.tsx:458); maths binds the bare
  default `mathSize` (:463), so editing a resized maths object shows a stale
  slider value.
- **V5 — the selection outlives its chrome under eraser/pan.** Outlines draw
  only for select/draw/text/math; FloatButtons render only for
  `tool === "select"` (FloatButtons.tsx:63). But Delete/Backspace and
  arrow-nudge fire on `hasSelection` in **any** tool (shortcuts.ts:308, :437)
  — so with the eraser active you can delete a selection you cannot see.
- **V6 — analytics differ per tool** (see D2's table): free text never fires
  `created` (nor activates the board); text edits never fire `edited` while
  maths and dialog edits do. The policy lives nowhere, so each path invented
  its own.
- **V7 — widgets are second-class in selection.** Press-select ignores groups
  (D6), there's no drag-move through the select tool (each widget rolls its
  own header drag), and none of that is *declared* — it's an implicit property
  of a parallel code path.
- **V8 — pan sets the cursor imperatively** (`canvas.style.cursor` in
  pan.ts:26,41) instead of the host cursor contract every other tool uses.
- **V9 — the redraw subscription is a hand-list too**: BoardCanvas
  (:355-364) redraws on `penSize`/`eraserSize` but not `highlighterSize`, so
  the highlighter's brush-ring preview lags a size change.
- **V10 — two different sub-mode mechanisms.** The pen's `drawMode` works by
  delegation (`freehandBrush(...)`), the select tool's `laserMode` by an
  `if (st.laserMode) return laser*` guard at the top of every handler. Both
  are fine alone; as a pair they mean "a tool with modes" has no pattern to
  copy.

---

## 4. The plan

Guiding rule (same as T1): the host and the UI surfaces keep only **shared**
infrastructure and *map over registries*; anything per-tool lives in the
tool's own file as data or a capability. Where a tool must deviate, it
declares the deviation — the default is shared behaviour.

### R1 — one creation service (kills D2, V6)

Extend `board/commands.ts` with the one ritual all four paths share:

```ts
// board/commands.ts
export function createObject(
  obj: AnyBoardObject,
  opts: { keepTool?: boolean; deferTracking?: boolean } = {},
): void {
  const st = useBoardStore.getState();
  st.addObject(obj);
  st.select(obj.id);
  if (!opts.keepTool) st.setTool("select");
  if (!opts.deferTracking) {
    track("tool_action", { tool: obj.type, action: "created" });
    trackBoardActivated(st.board.id);
  }
}
// the deferred half, for editor-commit flows (maths today, text after R6):
export function trackCreatedOrEdited(type: string, isNew: boolean): void { ... }
```

`placeObject`, `commitShape`, `createAndEdit` and the maths create all route
through it. "Creation keeps the creating tool" becomes an explicit opt
(`keepTool: true`), not four divergent copies. Text finally gets tracked, per
the same policy as maths (fire on first commit, so abandoned empties stay
invisible).

### R2 — a styling service + style channels on the tool contract (kills D1, D7; fixes V1–V4 structurally)

The insight: the pill and the shortcuts both do *"set the drawing default AND
patch the current edit target, using this type's resize rule"*. Make that one
service, and make the per-type resize rule a **tool capability**:

```ts
// tools/registry.ts — new optional capability on CanvasTool
export interface StyleChannel<P, V> {
  get(obj: BoardObjectBase & P): V;
  /** Patch that applies the value — including any box re-measure. */
  patch(obj: BoardObjectBase & P, v: V): Record<string, unknown>;
}
export interface CanvasTool<P> extends ToolMeta {
  ...
  styling?: {
    color?: StyleChannel<P, string>;   // text.color / shape.stroke / mathtext.color
    fill?: StyleChannel<P, string>;
    size?: StyleChannel<P, number>;    // text: re-measure; math: scale-map; shape: strokeWidth
    align?: StyleChannel<P, TextAlign>;
  };
}
```

```ts
// board/styling.ts — the ONE pipeline
/** The single object or stroke the pill/shortcuts are editing (replaces the
 *  four active*Id selectors). */
export function activeEditTarget(st): { kind: "object" | "stroke"; id: string; type: string } | null;
/** Set the store default for `channel` AND patch the live target through its
 *  tool's StyleChannel (strokes via a small built-in binding). */
export function applyStyle(channel: "color" | "fill" | "size" | "align", value): void;
/** Target's own value if a target is live, else the default — what a control displays. */
export function styleValue(channel): V;
```

- OptionsStrip's seven `pick*` functions become `applyStyle(...)` one-liners;
  its four subscriptions become one.
- `cycleColor` / `cycleFillColor` / `adjustSize` call the same service — V1,
  V2, V3, V4 cannot recur because there is no second copy to drift.
- The text re-measure and maths scale-map move into `tools/text` /
  `tools/mathtext` where they belong (today they live in the *UI* files).

**Size defaults become a table, not fields.** Replace the five
`penSize/highlighterSize/textSize/mathSize/eraserSize` fields + setters with
one `sizes: Record<SizeChannelId, number>` plus a single
`setSize(channel, px)`, and colocate range + default in `ui/constants.ts`
(they're already half there). Which channel is live for the current
tool/drawMode is declared by the tool (R5), so `adjustSize` stops being a
ternary over tool names.

### R3 — `editWith` as a tool capability (kills the type switch in `editObjectAt`)

"Editing an object means editing it with its own tool" is the product rule
(it's even the OptionsStrip header comment) — but the mapping is a hardcoded
switch in select.ts:326-340. Declare it on the tool instead:

```ts
// tools/registry.ts
export interface CanvasTool<P> {
  ...
  /** How a double-click edits this type. Default: the settings Dialog. */
  editWith?: (obj: BoardObjectBase & P) => {
    tool: ToolName;
    drawMode?: DrawMode;      // shape → its kind
    inPlace?: boolean;        // text/mathtext → open the registered editor
    editSession?: boolean;    // sets drawEditMode ("double-click to exit")
  };
}
```

`editObjectAt` becomes: hit-test → `getTool(hit.type).editWith?.(hit)` →
apply, else `c.editObject(hit)` (the dialog). Strokes keep a tiny built-in
rule owned by the pen tool. A new in-place-editable type is declared in its
own file, and select.ts never changes again for it.

### R4 — an in-place editor registry (kills D4's host coupling; then D3)

The host still owns the DOM (it must), but stops naming the editors:

```ts
// canvas/editors.ts
registerInPlaceEditor("text", textEditorHandle);
registerInPlaceEditor("mathtext", mathEditorHandle);
export function commitAllEditors(): void;         // the pointerdown/wheel guards
export function openEditorFor(obj, isNew): void;  // resolves by obj.type
```

`InputCtx` drops `editor`/`mathEditor` for `editors: { open(obj, isNew); commitAll(); anyOpen(): boolean }`.
With R3 + R4 in place, `text.ts` and `math.ts` collapse into one factory —
`makeTapEditController({ type, cursor, makeObject(st, at), dragCreates? })` —
and the deferred-tap gesture exists once.

Unifying `textEditor.ts`/`mathEditor.ts` *internals* further is *not* worth
it: their commit pipelines genuinely differ (sync re-measure vs async KaTeX).
The registry only unifies how the host and controllers reach them.

### R5 — registry-driven dock, shortcuts and options pill (kills D9/1.1 rows 4–9; the arch doc's open §6)

Give each interaction tool a UI spec next to its controller, and make the
three surfaces map over the registry:

```ts
// canvas/interactions/types.ts
export interface ToolUiSpec {
  tool: ToolName;
  icon: () => JSX.Element;
  label: string;                    // aria-label; tooltip = label + keyHint(id)
  dockOrder: number;
  collabOnly?: boolean;             // the image button's gating, declared
  shortcut?: { keys: string[][] };  // feeds the SHORTCUTS catalog
  sizeChannel?: (st) => SizeChannelId | null;  // what +/- and the slider bind to
  /** The options pill body. Composed from shared controls (SizeSlider,
   *  SwatchPicker, SnapToggle, ...), NOT a config DSL — the pen's two-line
   *  layout and the laser rows stay ordinary JSX inside the tool's component. */
  Options?: React.FC;
}
```

- **Toolbar** maps `listToolUi()` in `dockOrder` — the dock stops being six
  hand-written blocks. Insert/Picture stay hand-placed (they're actions, not
  modes).
- **shortcuts.ts** generates the `tool-*` entries from the registry (the
  catalog stays the single source of truth for *dispatch order and help*;
  tools contribute *entries*, they don't bypass it). Same for `mode-*`
  entries derived from one draw-mode table that also feeds `DRAW_MODE_ORDER`
  and the pill's mode row — three lists become one.
- **OptionsStrip** becomes a host: render the active tool's `Options` (or
  nothing). The shared controls internally use R2's
  `styleValue`/`applyStyle`, so a tool's options panel is ~15 lines of
  composition.
- **Redraw subscription** (V9): controllers already know what they preview;
  add an optional `redrawOn?: (keyof BoardState)[]` to the spec (or simply
  have `sizeChannel` imply it) so the host's hand-list goes away.

### R6 — behaviour parity, decided once (fixes V5, V7, V8; policy for the rest)

- **Selection chrome follows the selection, not the tool.** Move
  `drawSelectionOutlines` host-side (after the scene, before the controller
  overlay), always on when a selection exists; a controller opts *out*
  (laser mode) via a flag rather than four controllers opting in. Show
  FloatButtons whenever a selection exists too — Delete already works
  everywhere, so the affordances should too. (Alternative: clear the
  selection on entering eraser/pan. Either is defensible; pick one and
  encode it host-side. Recommended: chrome-follows-selection — it matches
  the "same unless specified" rule and drops D8.)
- **Widget selection parity**: extract the press algebra from select.ts into
  `board/selection.ts` (`pressSelection(board, sel, kind, id, shift)` returning
  the new selection + collapse intent) and use it from both the select
  controller and WidgetLayer — groups and shift semantics stop diverging.
- **Cursor**: add `dragCursor?: string` to the controller contract so pan
  declares grab/grabbing like everything else declares `cursor`.

### Explicitly NOT proposed

- **Do not merge the two registries.** Interaction tools (how pointers
  behave) and content types (what's on the board) are genuinely different
  axes — `pen` is one tool that produces two content types (stroke, shape),
  `select` produces none. R3's `editWith` is the *bridge* between them, which
  is all the coupling they need.
- **Do not widen `ToolName` to `string`.** The union is one line per tool and
  buys exhaustiveness everywhere; the goal is removing *behavioural* edits,
  not that line.
- **No options-pill config DSL.** Declarative micro-languages for UI always
  grow escape hatches; shared controls + plain JSX per tool is the right
  altitude (the pen's stacked layout proves the need).

---

## 5. Sequencing

Each step ships alone and is verifiable against the existing test suites
(draw.test, select.test, shortcuts.test cover most touched behaviour).

1. **Parity fixes + shared press algebra** (V1–V4 via targeted edits, V9,
   WidgetLayer groups). Small, user-visible, and locks in the intended
   behaviour before the plumbing moves. Add the missing text `created`
   tracking (V6) with the R1 policy in mind.
2. **R1 creation service** — mechanical; the four call sites become one.
3. **R2 styling service + style channels + size table** — the biggest
   deletion (OptionsStrip ~683 → ~400 lines, shortcuts loses its duplicated
   branches; the V1–V4 class becomes unrepresentable).
4. **R3 `editWith` + R4 editor registry** — `editObjectAt` stops naming
   types; text/math controllers merge into the tap-edit factory.
5. **R5 registry-driven dock/shortcuts/pill + R6 host-side selection
   chrome** — closes the arch doc's §6; the 1.1 table collapses to:
   controller file (with its UI spec + Options) + `registerInteraction` +
   the `ToolName` line.

After step 5, "add an interaction tool" = **one new file + one register call
+ one union line**, and every cross-cutting behaviour (create ritual, edit
routing, live restyle, selection chrome, shortcuts, analytics) is inherited —
deviating requires writing the deviation down in the tool's own file.
