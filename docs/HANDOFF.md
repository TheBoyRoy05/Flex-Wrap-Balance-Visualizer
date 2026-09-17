# Handoff

An interactive visualizer for the line-breaking algorithm behind CSS `flex-wrap: balance`,
mirroring WebKit's `FlexLineBreaker.cpp`. Live at `flexbalance.issacroy.com`. The audience is
developers evaluating or learning the feature, including the WebKit reviewer, so the page's job
is to be *correct first* — every number on screen must be one the real algorithm would produce.

Svelte 5 with runes, TypeScript, Vite. No runtime dependencies (`dependencies` is empty); Tailwind
was removed because it styled nothing.

## Where things stand

`main` is at `67b6cbf` and is pushed. It holds the finished 1D visualizer: greedy vs balanced
preview panels, the score matrix, and a two-phase stepper.

`idea/flex-line-count` is at `ce4610a`, two commits on top of `main`, linear:

| Commit | Contents |
|---|---|
| `21e98c9` | the 2D DP and its per-layer trace, in `balance.ts` only |
| `ce4610a` | the UI: the CSS input, the layer control, matrix and panel plumbing |

`git diff main...idea/flex-line-count` touches only the six files under `src/lib/`. It is
functionally complete and verified, but see [The open design question](#the-open-design-question)
before building on it — the author finds the layer axis confusing and it may be replaced.

Branches safe to delete once you agree they are redundant: `idea/flex-line-count-premerge`
(a superseded merge-based version of the same tree), `idea/dp-stepper`, `idea/penalty-squares`.

## Layout of the code

```
src/lib/balance.ts          Pure algorithm, no Svelte. The source of truth.
src/lib/state.svelte.ts     One `$state` class instance shared by every component.
src/lib/Controls.svelte     The CSS inputs: sizes, capacity, gap, flex-line-count.
src/lib/LinePreview.svelte  Greedy vs balanced panels, with proportional item geometry.
src/lib/ScoreMatrix.svelte  The matrix. By far the largest file (~2000 lines).
src/lib/DpStepper.svelte    Step controls and the per-step narration.
src/App.svelte              Layout, `.measure` wrappers, the README link snippet.
src/app.css                 The `:root` token block. All colors live here.
scripts/check-style.mjs     Style linter. Enforces the token contract.
docs/design-tokens.md       What the tokens mean and why the scale is closed.
```

State flows one way: inputs live in `state.svelte.ts` as `$state`, everything else is `$derived`
from them, and components read derived values. No component owns algorithm state.

## The algorithm contract

`balance.ts` exports the 1D functions (`computeMatrix`, `balancedLineBreaks`, `greedyLineBreaks`,
`parseSizes`, `lastFittingEnd`, `isOverflowingLine`, `traceBalancedLineBreaks`, `traceCellEvents`,
`MAX_ITEMS`) plus the 2D ones on the feature branch:

```ts
balancedLineBreaksWithLineCount(sizes, capacity, gap, flexLineCount = 1): Balance2DResult
traceCellEventsForLayer(sizes, capacity, gap, flexLineCount, layer): CellEvent[]
```

`minScores[start][lines]` is the least total squared free space to cover items `[start, n)` in **at
least** `lines` lines. Points that are easy to get wrong, all of them faithful to the landed
WebKit code at `eng/flex-line-count` `b70275f6af49`:

- **The layer axis is indexed from 1**, and there is no row for `itemCount`. A non-empty suffix
  always needs a line, so "at least 0 lines" and "at least 1 line" are the same constraint —
  measured identical for all 11260 reachable states before the axis was designed.
- **The successor layer floors at 1**, not 0 (`restLines = max(lines - 1, 1)`).
- **The final line is handled by an empty rest costing nothing**, not by a base row. When
  `end === n` there is no `minScores` read at all. The UI must not present that zero as a memo
  lookup, because no such entry exists.
- **A final line alone cannot satisfy `lines > 1`** — an explicit skip.
- **Ties go to the later `end`** (`<=`), which gives the earliest line the most items, per the
  spec's tie-break.
- **One pass fills every layer.** The line count is the middle loop, not a re-run of the solver.
- **`UInt128` is deliberately not ported.** WebCore needs it because an auto-height column flow
  has capacity `LayoutUnit::max()`, whose square overflows `uint64` after five lines. JavaScript
  cannot represent that and the capacity input cannot reach it.

The single-line shortcut (`requiredLineCount <= 1` and everything fits) returns immediately and
leaves the table sparse. `traceCellEventsForLayer` mirrors the shortcut for exactly this reason;
an earlier version narrated a full DP the solver never ran, which is how the divergence was found.

## How to verify a change

Run all four before reporting anything. Subagents cannot run a shell, so this is the main
thread's job.

```bash
npm run build
npm run lint:style                       # the token contract
npx svelte-check --threshold error        # expect 0 errors, 5 pre-existing tsconfig warnings
node --experimental-strip-types /tmp/x.test.ts   # algorithm changes only; Node 22.23.2
```

Algorithm tests must import `balance.ts` by **absolute** path. Anchor them on the WebKit unit
tests: `[50,50,50,50]`/200/0/k=2 → `{2,4}`; `[60,60,60]`/220/20/k=2 → `{2,3}`;
`[50,50,50]`/500/0/k=10 → `{1,2,3}` (clamps); `[50,300,50]`/100/0/k=1 → `{1,2,3}`. A fifth WebKit
test uses `LayoutUnit::max()` and is out of reach by design. Also worth re-running: `k=1` must
reproduce `balancedLineBreaks` exactly, and every trace `settle` must equal the solver's own value.

Known-good numbers for the default input `50, 40, 40, 50, 100`, capacity 150, gap 10: greedy
12500, balanced 7500, breaks `[2, 4, 5]`, **23 steps**, row minima 2500/12500/5000/2500/7500 for
starts 4 down to 0. Twelve 40px items at capacity 120 gap 10 gives 52 steps, though the
input is capped at 10 items (`MAX_ITEMS`), so that case is only reachable from a test.

**Measuring is not enough — read the screenshot too.** A `textContent` assertion passes on
garbage layout: seven formulas once rendered as vertical stacks of single characters while the
text check was green. Assert the geometry that would actually be wrong.

## Invariants that have each broken at least once

- **Row alignment between the table and the summary block.** Both resolve from one shared
  `--row-h`, with an explicit `+1px` for table-cell border behavior. Verify by comparing every
  row's top and bottom on both sides, at 375 and 1440. Must be exactly zero.
- **Proportional item geometry** in `LinePreview.svelte`. `bind:clientWidth` on `.track` feeds a
  `$derived` scale; `rowInset = 8` accounts for row padding; `.track-pad` keeps padding off the
  measured element. Check that a size-100 item is 100/150 of the inset track width.
- **No clipping, ever.** Assert no element has `scrollWidth > clientWidth + 0.5`. A truncated
  total reads as a different, wrong number.
- **Stable geometry while filling.** Table width, height and per-row heights must be identical
  empty and filled. At 1440 the table is 766 × 357.44.
- **The style contract.** No raw hex/rgb/rgba/hsl outside `:root`; font sizes only
  13/15/17/21/28/40; radii 6/8/10; spacing on the 0/4/8/12/16/24/32/48/64 scale. `calc()` from
  tokens is the escape hatch.

## Root causes worth not rediscovering

| Symptom | Cause |
|---|---|
| Matrix scrolled vertically, clipping rows | The scroll affordance was a sticky pseudo-element *inside* the scroller, adding to `scrollHeight` |
| Row heights drifted 1px per row | A table cell's `height` is a content-box minimum with borders drawn on top; a `border-box` flex child carves it out |
| Index column collapsed 152 → 127.8px | The width was set on a *body* cell, but `table-layout: fixed` sizes columns from the first row |
| Candidate columns starved, clipping numbers | The table's `min-width` omitted the sticky index column's own width |
| Free-space label collided with a chip | Free space has no trailing gap, so the row's flex `gap` stole one (`end-1-start`) |
| Every label dim | `:root` set inherited `color` to the secondary gray |
| A bare `[1]` orphaned on its own line | Not clipping — wrapping. The browser broke the label before the layer index |
| Step position reset when changing layer | An `$effect` depended on the events list, which changes on layer moves too, so it fired and wiped the restored position. Depend on the narrowest value that means "different run" |

One thing that is **provably impossible**, so don't attempt it: clipping the matrix to a global
column band. `lastFittingEnd[n-1]` is always `n`, so the max over rows is always `n`. The
sparsity is diagonal, not a right-hand block.

## The open design question

`flex-line-count` works, but the author's verdict after using it: *"even I'm confused by the
visual, and I've been working with this DP for some time."* That is the most important open item,
above any new feature. Four reasons it fights the reader:

1. The axis is a countdown ("lines left") while CSS states a minimum. The reader translates
   every time.
2. Two layers are on screen at once — cells are layer N, the memo row is layer N−1 — separated
   only by a label. This is inherent to the recurrence, not a styling failure.
3. It usually does nothing visible. Row 0's layer stack has one distinct value in about 45% of
   random cases, so the control looks inert, then occasionally matters.
4. It is not faithful anyway. The real loop interleaves layers per row, so per-layer stepping
   already diverges from execution order (an accepted, stated divergence).

Two proposals, not yet chosen:

- **A — answer layer only.** Always show `lines = requiredLineCount` and drop the layer control.
  A cell that reads a shallower layer names it inline instead of devoting a row to it. Returns
  the page to two axes.
- **B — outcome table instead of internals.** A compact table of `k = 1..n` to the resulting
  breaks and total score, current `k` highlighted. Answers what a developer actually asks —
  "what does `flex-line-count: 3` give me?" — without exposing the DP's third axis. This also
  subsumes the open request for showing results across a range.

The recommendation on the table is A plus B, with layer inspection demoted to an off-by-default
disclosure. The README should carry *why* a third axis exists at all, since it is an artifact of
this formulation — Chrome bisects a width instead.

## Other open items

- Show results across a sliding capacity range: a compact plot of total score or break count
  against capacity. Sliders sweep by hand; seeing a range at once needs a plot.
- Re-run a UX audit after `flex-line-count` settles.
- Two cosmetic issues noticed and deliberately left: at narrow widths the matrix scroller cuts a
  candidate column mid-cell, leaving a visible sliver (a consequence of the deliberate choice to
  hide scrollbars with no fade), and the `Unreachable Row` legend swatch is a small diagonal that
  is hard to read as a hatch.
- The README's `flex-line-count` section still says the extra dimension is "not captured by this
  visualizer". Update it when the design question is settled.

## House rules

- Dark mode only, Apple/HIG-flavored, with real structure: hairlines, header bands, contained
  radii. Borderless was rejected. Structural boundaries between different *kinds* of thing use
  `--color-border-strong`; gridlines between same-kind cells stay `--color-hairline`.
- Uniform Title Case on every visible label, in the primary text color. Code identifiers keep
  their own casing.
- A meaningful mark must not be faded, and must not be distinguished by color alone — provisional
  versus settled is dashed versus solid.
- Show, don't tell. The prose budget on the page is spent; the README carries explanation.
- **The README's wording is the author's.** Fix typos, but ask before rephrasing.
- Branch per idea.
- **The author edits files concurrently.** Attribute diffs before committing and commit only your
  own files. `git add -A` has swept the author's uncommitted work into an unrelated commit, and
  `git checkout <ref> -- <paths>` *stages* as it writes, which caused the same thing.
