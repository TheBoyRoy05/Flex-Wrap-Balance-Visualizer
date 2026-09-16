<script lang="ts">
  // No props: this component reads/writes the shared `balanceState` instance directly,
  // via `bind:value`, which is two-way binding — the input both displays state.capacity
  // and writes back to it on every keystroke, no manual oninput handler needed.
  import { balanceState } from './state.svelte';

  // Capacity range: wide enough that, for the default item sizes (40, 40, 40, 40, 90;
  // sum 250), sweeping the slider walks through every line-break outcome from one item
  // per line up to all five on one line, with headroom either side.
  const CAPACITY_MIN = 40;
  const CAPACITY_MAX = 320;
  const CAPACITY_STEP = 4;

  // Gap range: intentionally small — gap is a spacing nudge between items, not a
  // layout driver, so the slider only needs to cover the range where its effect on
  // line breaks is visible.
  const GAP_MIN = 0;
  const GAP_MAX = 48;
  const GAP_STEP = 2;

  // Both the slider and the number input below bind to the same two `$state` fields
  // on `balanceState` (`bind:value={balanceState.capacity}` twice, same for `gap`).
  // Neither element owns the value — the class field does — so there is one source
  // of truth. Moving the slider writes `balanceState.capacity`; because the number
  // input's `bind:value` reads that same field, Svelte's reactivity re-renders it
  // on the next tick with no `$effect` copying one into the other. An `$effect` here
  // would just be a slower, indirect way of doing what one shared binding already does.

  // Native <input type="number"> can emit an out-of-range or empty value while typing
  // (e.g. clearing the field, or typing "0" before a second digit). Clamping only on
  // this explicit commit point (blur/change) — rather than on every keystroke via
  // `oninput` — avoids fighting the user mid-type while still guaranteeing capacity
  // can never reach 0 or below, and gap never negative, once the field is left.
  /* Rewrite the field to the numbers actually parsed, once editing is done.
     parseSizes silently drops any token that is not a finite number, so
     "abc, def, 40, , xyz, 50" laid out as two items while the field still read
     as five — the visible text and the thing being visualised disagreed, with
     nothing to say which tokens survived. Normalising on commit rather than on
     every keystroke leaves typing alone. */
  function normalizeSizes() {
    balanceState.sizesInput = balanceState.sizes.join(', ');
  }

  function clampCapacity(event: Event) {
    const raw = Number((event.target as HTMLInputElement).value);
    balanceState.capacity = Number.isFinite(raw)
      ? Math.min(CAPACITY_MAX, Math.max(CAPACITY_MIN, raw))
      : CAPACITY_MIN;
  }

  function clampGap(event: Event) {
    const raw = Number((event.target as HTMLInputElement).value);
    balanceState.gap = Number.isFinite(raw) ? Math.min(GAP_MAX, Math.max(GAP_MIN, raw)) : GAP_MIN;
  }
</script>

<div class="controls">
  <label class="field">
    <span class="field-label">Item Sizes (px)</span>
    <input
      type="text"
      bind:value={balanceState.sizesInput}
      onchange={normalizeSizes}
      class="field-input"
    />
  </label>

  <label class="field">
    <span class="field-label">Container Capacity</span>
    <div class="slider-row">
      <input
        type="range"
        bind:value={balanceState.capacity}
        min={CAPACITY_MIN}
        max={CAPACITY_MAX}
        step={CAPACITY_STEP}
        class="field-slider"
        aria-label="Container capacity"
      />
      <input
        type="number"
        bind:value={balanceState.capacity}
        min={CAPACITY_MIN}
        max={CAPACITY_MAX}
        step={CAPACITY_STEP}
        onchange={clampCapacity}
        class="field-input field-input-number"
        aria-label="Container capacity, numeric"
      />
    </div>
  </label>

  <label class="field">
    <span class="field-label">Gap</span>
    <div class="slider-row">
      <input
        type="range"
        bind:value={balanceState.gap}
        min={GAP_MIN}
        max={GAP_MAX}
        step={GAP_STEP}
        class="field-slider"
        aria-label="Gap"
      />
      <input
        type="number"
        bind:value={balanceState.gap}
        min={GAP_MIN}
        max={GAP_MAX}
        step={GAP_STEP}
        onchange={clampGap}
        class="field-input field-input-number"
        aria-label="Gap, numeric"
      />
    </div>
  </label>
</div>

<style>
  .controls {
    display: grid;
    gap: var(--space-24);
    grid-template-columns: 1fr;
  }

  @media (min-width: 640px) {
    .controls {
      grid-template-columns: 2fr 1fr 1fr;
    }
  }

  .slider-row {
    display: flex;
    align-items: center;
    gap: var(--space-12);
  }

  /* Number field next to a slider only needs to show up to 3-4 digits, so it is
     narrowed to roughly a third of the shared control height's multiple, composed
     via calc() from --control-height rather than a new width token. */
  .field-input-number {
    width: calc(var(--control-height) * 2);
    flex: none;
  }

  .field-slider {
    flex: 1;
    /* Match the touch-target height of the paired number input, without a raw
       height declaration on the slider's own box: --control-height is the token
       for that, and the range input renders its centered track/thumb inside it. */
    height: var(--control-height);
    -webkit-appearance: none;
    appearance: none;
    background: transparent;
    padding: 0;
    margin: 0;
    cursor: pointer;
  }

  .field-slider:focus-visible {
    outline: none;
  }

  /* Webkit (Chrome/Safari): track + thumb are separate pseudo-elements. */
  .field-slider::-webkit-slider-runnable-track {
    height: var(--space-4);
    border-radius: var(--radius-6);
    background: var(--color-hairline);
  }

  .field-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: var(--space-16);
    height: var(--space-16);
    margin-top: calc((var(--space-4) - var(--space-16)) / 2);
    border-radius: var(--radius-8);
    background: var(--color-accent);
    border: none;
    box-shadow: 0 0 0 0 transparent;
    transition: box-shadow 0.15s ease;
  }

  .field-slider:focus-visible::-webkit-slider-thumb {
    box-shadow: 0 0 0 var(--space-4) var(--color-accent-tint);
  }

  /* Firefox: track and thumb are styled directly, and the filled portion left of
     the thumb is approximated with a progress-colored track segment. */
  .field-slider::-moz-range-track {
    height: var(--space-4);
    border-radius: var(--radius-6);
    background: var(--color-hairline);
  }

  .field-slider::-moz-range-progress {
    height: var(--space-4);
    border-radius: var(--radius-6);
    background: var(--color-accent);
  }

  .field-slider::-moz-range-thumb {
    width: var(--space-16);
    height: var(--space-16);
    border-radius: var(--radius-8);
    background: var(--color-accent);
    border: none;
    box-shadow: 0 0 0 0 transparent;
    transition: box-shadow 0.15s ease;
  }

  .field-slider:focus-visible::-moz-range-thumb {
    box-shadow: 0 0 0 var(--space-4) var(--color-accent-tint);
  }
</style>
