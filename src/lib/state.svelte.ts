// Shared reactive app state, built from runes rather than a legacy `writable` store.
// A `.svelte.ts` module is a plain TS file where the compiler still processes rune
// calls, so top-level `$state`/`$derived` work outside of any `.svelte` component.
// A class with `$state` fields is the idiomatic Svelte 5 replacement for a store:
// every component that imports the *same instance* below reads/writes the same
// reactive fields, so updating `capacity` in Controls.svelte is immediately visible
// in ScoreMatrix.svelte, no subscribe/unsubscribe boilerplate required.
import {
  balancedLineBreaks,
  greedyLineBreaks,
  parseSizes,
  traceCellEvents,
  type BalanceResult,
  type CellEvent,
} from './balance';

class BalanceState {
  sizesInput = $state('40, 40, 40, 40, 90');
  capacity = $state(120);
  gap = $state(0);
  // Which cell-fill event the animation is showing. -1 is the empty/reset state:
  // no events fired yet, matrix blank, memo at its base case only. Genuine UI state —
  // no input combination determines "where the user has stepped to" — but it can point
  // past the end of a freshly recomputed event list (e.g. removing an item shrinks it),
  // so consumers read `clampedCellStep` below rather than this raw field.
  stepIndex = $state(-1);

  // Derived values recompute automatically whenever the $state fields they read change.
  sizes: number[] = $derived(parseSizes(this.sizesInput));
  result: BalanceResult = $derived(balancedLineBreaks(this.sizes, this.capacity, this.gap));
  // Greedy breaks (plain `flex-wrap: wrap`), kept alongside `result` so any component
  // can compare the two line-breaking strategies without recomputing them itself.
  greedyBreaks: number[] = $derived(greedyLineBreaks(this.sizes, this.capacity, this.gap));
  // Every candidate the DP compared, flattened to one event per evaluation plus one
  // settle event per completed row, in true execution order (start = n-1 down to 0).
  // A pure function of the same three inputs as `result`, so it's $derived rather
  // than recomputed by hand on every step change.
  cellEvents: CellEvent[] = $derived(traceCellEvents(this.sizes, this.capacity, this.gap));
  // Clamped so editing the inputs mid-session can never leave `stepIndex` pointing
  // past the end of an event list that just got shorter (or empty). Does not floor
  // at 0: -1 (the empty/reset state) is valid and must pass through unchanged.
  clampedCellStep: number = $derived(
    Math.min(this.stepIndex, this.cellEvents.length - 1),
  );
}

export const balanceState = new BalanceState();
