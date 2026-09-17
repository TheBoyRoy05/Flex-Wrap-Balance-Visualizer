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
  // Which layer of the 2D DP ("Lines Left") the stepper/matrix are showing. Lives
  // here, not as a local in DpStepper, because ScoreMatrix reads it too — same
  // reasoning as `stepIndex` below: shared position state, not a per-component detail.
  // 1-based: layer 0 is provably identical to layer 1 for every reachable state, so
  // 1 is the lowest position actually worth exposing.
  layer = $state(1);
  // Which cell-fill event the animation is showing. -1 is the empty/reset state:
  // no events fired yet, matrix blank, memo at its base case only. Genuine UI state —
  // no input combination determines "where the user has stepped to" — but it can point
  // past the end of a freshly recomputed event list (e.g. removing an item shrinks it),
  // so consumers read `clampedCellStep` below rather than this raw field.
  stepIndex = $state(-1);

  // Remembered step position per layer, so moving Lines Left and coming back resumes
  // where you were instead of snapping to the start. Keyed by the inputs as well as the
  // layer: when sizes/capacity/gap/flex-line-count change, every old key stops matching
  // and is simply never read again, which is cheaper and safer than watching for those
  // edits and clearing the map. A remembered step can still be stale relative to a
  // shorter trace, so `clampedCellStep` keeps doing the clamping it already did.
  private stepMemory: Record<string, number> = $state({});

  /** Identity of the current run: everything a trace depends on EXCEPT which layer is
   *  being shown. Moving between layers of one run is navigation and keeps its progress;
   *  changing an input starts a different run and discards it. */
  runSignature: string = $derived(
    `${this.sizesInput}|${this.capacity}|${this.gap}|${this.flexLineCount}`,
  );

  private stepKey(layer: number): string {
    return `${this.runSignature}|${layer}`;
  }

  /** Move to another layer, saving this layer's position and restoring that layer's. */
  setLayer(next: number): void {
    const target = Math.min(Math.max(1, Math.floor(next)), Math.max(1, this.result2D.requiredLineCount));
    if (target === this.clampedLayer) return;
    this.stepMemory[this.stepKey(this.clampedLayer)] = this.stepIndex;
    this.layer = target;
    this.stepIndex = this.stepMemory[this.stepKey(target)] ?? -1;
  }

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

  // Clamped so editing sizes/flex-line-count mid-session can never leave `layer`
  // pointing past the top of a run that just got shallower. Floors at 1 for the
  // reason `layer`'s own field comment gives.
  clampedLayer: number = $derived(
    Math.min(Math.max(1, this.layer), Math.max(1, this.result2D.requiredLineCount)),
  );

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
