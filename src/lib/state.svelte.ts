// Shared reactive app state, built from runes rather than a legacy `writable` store.
// A `.svelte.ts` module is a plain TS file where the compiler still processes rune
// calls, so top-level `$state`/`$derived` work outside of any `.svelte` component.
// A class with `$state` fields is the idiomatic Svelte 5 replacement for a store:
// every component that imports the *same instance* below reads/writes the same
// reactive fields, so updating `capacity` in Controls.svelte is immediately visible
// in ScoreMatrix.svelte, no subscribe/unsubscribe boilerplate required.
import {
  balancedLineBreaksWithLineCount,
  greedyLineBreaks,
  parseSizes,
  traceCellEventsForLayer,
  type Balance2DResult,
  type CellEvent,
} from './balance';

class BalanceState {
  sizesInput = $state('50, 40, 40, 50, 100');
  capacity = $state(150);
  gap = $state(10);
  // `flex-line-count`: a real CSS property, so it lives beside capacity/gap here.
  // Its slider max is the current item count (see Controls.svelte), which makes
  // the effective clamp below structural in the common case — but a typed value
  // committed via the number field can still exceed today's item count, or a
  // later edit to Item Sizes can shrink the count out from under an already-set
  // value, so `effectiveFlexLineCount` below re-clamps on every read rather than
  // trusting the raw field.
  flexLineCount = $state(1);
  // Which cell-fill event the animation is showing. -1 is the empty/reset state:
  // no events fired yet, matrix blank, memo at its base case only. Genuine UI state —
  // no input combination determines "where the user has stepped to" — but it can point
  // past the end of a freshly recomputed event list (e.g. removing an item shrinks it),
  // so consumers read `clampedCellStep` below rather than this raw field.
  stepIndex = $state(-1);

  /** Identity of the current run: everything a trace depends on. Changing any of
   *  these starts a different run and resets progress (see the $effect in
   *  DpStepper). Option A fixes the line count to `requiredLineCount`, so there is
   *  no separate layer axis to key on any more. */
  runSignature: string = $derived(
    `${this.sizesInput}|${this.capacity}|${this.gap}|${this.flexLineCount}`,
  );

  // Derived values recompute automatically whenever the $state fields they read change.
  sizes: number[] = $derived(parseSizes(this.sizesInput));
  // Greedy breaks (plain `flex-wrap: wrap`), kept alongside `result` so any component
  // can compare the two line-breaking strategies without recomputing them itself.
  greedyBreaks: number[] = $derived(greedyLineBreaks(this.sizes, this.capacity, this.gap));

  // The slider's own max is the item count, so this mirrors that structural clamp
  // for a typed value that could still exceed it, or an item-count edit that shrinks
  // the count out from under an already-set value. Floors at 1: a line always holds
  // at least one item, so asking for zero lines is not a real state.
  effectiveFlexLineCount: number = $derived(
    Math.min(Math.max(1, Math.floor(this.flexLineCount)), Math.max(1, this.sizes.length)),
  );

  // The 2D DP result for the current inputs. `requiredLineCount` here is the one
  // `traceCellEventsForLayer`/the Lines Left control both key off, since it's the
  // same clamp WebCore applies (min(flexLineCount, itemCount)) and is never assumed
  // to equal `effectiveFlexLineCount` directly by any consumer.
  result2D: Balance2DResult = $derived(
    balancedLineBreaksWithLineCount(this.sizes, this.capacity, this.gap, this.effectiveFlexLineCount),
  );

  // Option A: the visualizer always shows the ANSWER layer — the deepest layer the
  // current inputs need, `requiredLineCount` (WebCore's min(flexLineCount, itemCount)).
  // There is no browsable layer axis any more, so `clampedLayer` is simply that value.
  // Kept under the old name so ScoreMatrix/DpStepper read it unchanged, and so
  // `cellEvents` still hands it to `traceCellEventsForLayer`. Floors at 1 for the
  // reason the old field comment gave: a non-empty suffix always owes at least one line.
  clampedLayer: number = $derived(Math.max(1, this.result2D.requiredLineCount));

  // Option B — the outcome table. For every requestable line count k = 1..n, the
  // breaks the balanced algorithm produces and the total squared free space it
  // costs. This is what a developer actually asks the feature ("what does
  // flex-line-count: 3 give me?"), and it answers the k > 1 derivation gap Option A
  // leaves in the matrix: the matrix shows ONE layer's mechanics; this shows the
  // OUTCOME across every k without exposing the DP's third axis.
  //
  // A pure function of sizes/capacity/gap (NOT of flexLineCount — the whole point is
  // to sweep k), so it is `$derived`. Each row re-runs the 2D DP at its own k; n is
  // capped at MAX_ITEMS (10) so this is at most ten cheap solves, recomputed only
  // when the sizes/capacity/gap inputs change. `score` is the least total squared
  // free space for the whole run at layer k = `minScores[0][requiredLineCount]`; an
  // unreachable layer (should not occur for k <= n, but guarded) reads as null.
  // `clamped` marks the rows where the requested k exceeded the item count and the
  // algorithm clamped to `requiredLineCount` — so k and the line count it actually
  // used can differ, and the table says which.
  outcomeTable: { k: number; lineCount: number; breaks: number[]; score: number | null; clamped: boolean }[] =
    $derived.by(() => {
      const n = this.sizes.length;
      const rows = [];
      for (let k = 1; k <= n; k++) {
        const r = balancedLineBreaksWithLineCount(this.sizes, this.capacity, this.gap, k);
        rows.push({
          k,
          lineCount: r.requiredLineCount,
          breaks: r.breaks,
          score: r.minScores[0]?.[r.requiredLineCount] ?? null,
          clamped: r.requiredLineCount < k,
        });
      }
      return rows;
    });

  // The k currently selected by the Flex Line Count control, so the table can
  // highlight the row the rest of the page is showing. Same value `result2D` uses.
  currentK: number = $derived(this.effectiveFlexLineCount);

  // Every candidate the DP compared IN THE SELECTED LAYER, flattened to one event
  // per evaluation plus one settle event per completed row, in true execution order
  // (start = n-1 down to 0) for that layer. A pure function of sizes/capacity/gap/
  // flexLineCount/layer, so it's $derived rather than recomputed by hand on every
  // step change. At flexLineCount 1 (so requiredLineCount 1, clampedLayer 1) this is
  // exactly today's single-layer trace: layer 1 with only one line owed is the
  // unconstrained 1D problem.
  cellEvents: CellEvent[] = $derived(
    traceCellEventsForLayer(
      this.sizes,
      this.capacity,
      this.gap,
      this.effectiveFlexLineCount,
      this.clampedLayer,
    ),
  );
  // Clamped so editing the inputs mid-session can never leave `stepIndex` pointing
  // past the end of an event list that just got shorter (or empty). Does not floor
  // at 0: -1 (the empty/reset state) is valid and must pass through unchanged.
  clampedCellStep: number = $derived(
    Math.min(this.stepIndex, this.cellEvents.length - 1),
  );
}

export const balanceState = new BalanceState();
