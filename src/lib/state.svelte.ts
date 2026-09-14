// Shared reactive app state, built from runes rather than a legacy `writable` store.
// A `.svelte.ts` module is a plain TS file where the compiler still processes rune
// calls, so top-level `$state`/`$derived` work outside of any `.svelte` component.
// A class with `$state` fields is the idiomatic Svelte 5 replacement for a store:
// every component that imports the *same instance* below reads/writes the same
// reactive fields, so updating `capacity` in Controls.svelte is immediately visible
// in ScoreMatrix.svelte, no subscribe/unsubscribe boilerplate required.
import { balancedLineBreaks, greedyLineBreaks, parseSizes, type BalanceResult } from './balance';

class BalanceState {
  sizesInput = $state('40, 40, 40, 40, 90');
  capacity = $state(120);
  gap = $state(0);

  // Derived values recompute automatically whenever the $state fields they read change.
  sizes: number[] = $derived(parseSizes(this.sizesInput));
  result: BalanceResult = $derived(balancedLineBreaks(this.sizes, this.capacity, this.gap));
  // Greedy breaks (plain `flex-wrap: wrap`), kept alongside `result` so any component
  // can compare the two line-breaking strategies without recomputing them itself.
  greedyBreaks: number[] = $derived(greedyLineBreaks(this.sizes, this.capacity, this.gap));
}

export const balanceState = new BalanceState();
