# DesignReady.AI — Development Guide

> For architecture, features, and usage docs see [README.md](README.md).
> This file is for working on the codebase.

## Commands
```
npm run dev         # Watch mode (UI + plugin rebuild on save)
npm run build       # Production build → dist/
npm test            # Vitest (85 tests)
npm run lint        # ESLint 9
npm run format      # Prettier
```
Reload plugin in Figma after every `build` — both `code.js` and `index.html` are loaded fresh on plugin restart.

## Hard Rules

### Figma Plugin Sandbox
- Plugin code (`plugin/`) has NO DOM, NO `window`, NO `fetch`. Only Figma API.
- UI code (`ui/`) has NO `figma.*` access. Only `parent.postMessage`.
- Never mix these boundaries. All communication goes through typed `PluginMessage` in `shared/types.ts`.
- `figma.clientStorage` is async with ~1MB limit — the only persistence layer.
- Nodes can be `null` at any time. Always check before accessing.

### Figma API Performance
- **Never** call Figma API in loops. Batch everything. `getLocalVariablesAsync()` once, then iterate.
- **Never** use `findAll()`. Use `findAllWithCriteria({ types: [...] })` — Figma-native, 10x faster.
- `findAllWithCriteria` is synchronous and blocks the thread. **Always use `currentPage` not `root`** — `root` scans every page in the document and can freeze for 30s+ on large files.
- Team Library API (`getAvailableLibraryVariableCollectionsAsync`) hangs indefinitely on some plans/files. Skip during discovery, or hard-timeout. Never block UI waiting for it.
- Token fuzzy-matching: always pre-build a color index (parse RGB once), never `parseHex()` inside comparison loops. See `scoring-tokens.ts → buildProfileColorIndex()`.

### Serializer (`plugin/serializer.ts`)
- Always use `isMixed()` check before reading properties that can be mixed (fontSize, strokeWeight, etc.).
- When adding a new field: add to `SerializedNode` in `shared/types.ts` first, then serialize in `serializer.ts`, then render in `prompt-compact.ts`.
- Max recursion depth is 15 (`MAX_DEPTH`). Don't increase without performance testing.

### Scoring Modules (`ui/lib/scoring-*.ts`)
- Each module is a pure function: `(node: SerializedNode, profile?) → { score, issues }`.
- No side effects, no Figma API, no DOM. Must be independently testable.
- Weights live in `shared/types.ts → SCORE_WEIGHTS`. Don't hardcode weights in modules.
- When adding a scoring module: add the dimension to `ScoringDimension` type, add weight, call from `scanner.ts`.

### Prompt Generation (`ui/lib/prompt-compact.ts`)
- Single format — no alternatives. All data in compact tree notation.
- All text content must go through `sanitize.ts` before embedding (layer names are user input → injection risk).
- Skill Sync block only renders when `options.profile` is active.
- State hints: variant property names containing hover/focus/active/disabled/pressed are flagged as CSS pseudo-classes.

### Atomic Detection (`ui/lib/atomic-detection.ts`)
- Brad Frost classification. Based on **nesting**, not count.
- Atom = component with no child components. Molecule = contains only atoms. Organism = contains molecules.
- `collectAtomicData()` does a single tree walk. Don't add separate walks.

### UI (`ui/`)
- No state library. React hooks only. This is a small plugin, not an app.
- **CSS Modules per component.** Each component has its own `.module.css`. Shared primitives (buttons, reset, animations) stay in `global.css`. Design tokens in `tokens.css`.
- When adding a component: create `.tsx` + `.module.css` + `.stories.tsx`.
- Global button classes (`btn-primary`, `btn-secondary`, `btn-link`, `btn-sm`, `btn-icon`) are referenced as plain strings, not CSS Module imports.
- Dark theme only, using Figma-native CSS variables (`--figma-color-*`). Fallbacks in `tokens.css` for Storybook.
- **Shared Icons** — `LocateIcon`, `EditIcon`, `DeleteIcon`, `FigmaIcon`, `SkillIcon`, `LevelIcon` are reusable components. Import them, don't create inline SVGs.
- **Plugin resize** — 480px idle, 768px when showing single-scan dashboard. Batch stays at 480px.
- **Gap-based layout** — use `gap` on flex containers, not `margin-bottom` on children.
- **Destructive actions** — always use inline confirm pattern (no layout shift). Red border + 6% tint.
- **Success states** — use `--dr-score-green` (#7ee787) with 6% tint, not `--dr-success` (#1bc47d).

## Common Patterns

### Adding a new serializer field
1. Add type to `SerializedNode` in `shared/types.ts`
2. Read from Figma node in `plugin/serializer.ts` (with `isMixed` check if applicable)
3. Render in `compactNode()` in `ui/lib/prompt-compact.ts`
4. If it's a color: add to `collectTokens()` in `prompt-shared.ts`

### Adding a new fix
1. Add message types to `PluginMessage` union in `shared/types.ts`
2. Add handler in `plugin/handlers/fixes.ts`
3. Route in `plugin/code.ts` (existing `handleFixMessage`)
4. Add UI in `ui/components/FixPanel.tsx`

### Adding a new scoring dimension
1. Create `ui/lib/scoring-{name}.ts` — export `score{Name}(node): ScoringResult`
2. Add to `ScoringDimension` type + `SCORE_WEIGHTS` in `shared/types.ts`
3. Call from `ui/lib/scanner.ts`
4. Rebalance weights (must sum to 1.0)
5. Add tests in `ui/lib/__tests__/scoring-{name}.test.ts`

## Known Traps
- `figma.variables.getVariableById()` is sync but can throw if variable is from a library without access. Always wrap in try/catch.
- `componentPropertyDefinitions` on instances comes from the parent ComponentSet, not the instance itself. Access via `mainComponent.parent`.
- `textAutoResize`, `textTruncation`, `maxLines` only exist on newer Figma API versions. Check with `"prop" in node` before reading.
- Re-scan after fixes: always call `refreshSelection()` to get fresh node data. Stale refs cause wrong scores.
- `GENERIC_PATTERNS` regex list exists in both `plugin/code.ts` and `ui/lib/scoring-naming.ts` — intentionally duplicated because plugin and UI are separate sandboxes.
- esbuild `--target=es6` converts async/await to generator functions (`__async` + `yield`). When debugging built `dist/code.js`, expect generators not native async.
- React hooks lint (`react-hooks/immutability`): assigning `useRef.current` inside `setTimeout` callbacks triggers lint errors. Use module-level variables instead for timers (see `FigmaImportPanel.tsx`).
- Plugin message handlers (`plugin/code.ts`): if an async handler never resolves (e.g. hanging API call), subsequent messages are not blocked — `await` yields control. But always ensure handlers post a response back to UI, even on failure, or the UI freezes on "Loading...".

## Architecture Decisions
- **Scoring in UI, not plugin** — Scoring needs no Figma API, works on serialized data. Running in UI iframe keeps plugin sandbox lean.
- **No API server** — Everything local. Scoring, prompt generation, persistence — all client-side.
- **Prompt-based, not API-based** — We generate prompts users copy into Claude, not API calls. Zero runtime cost, works offline, no auth needed.
- **Removed features** — Readable prompt, skill fragments/training, gap analysis, multi-stack templates were removed in v4 MVP. Skill Sync in the prompt replaces in-plugin learning. Don't re-add these.
