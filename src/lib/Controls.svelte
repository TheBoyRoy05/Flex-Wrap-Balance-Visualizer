<script lang="ts">
  // No props: this component reads/writes the shared `balanceState` instance directly,
  // via `bind:value`, which is two-way binding — the input both displays state.capacity
  // and writes back to it on every keystroke, no manual oninput handler needed.
  import { balanceState } from './state.svelte';
</script>

<div class="controls">
  <label class="field">
    <span class="field-label">Item sizes (px)</span>
    <input
      type="text"
      bind:value={balanceState.sizesInput}
      placeholder="40, 40, 40, 100"
      class="field-input"
    />
  </label>

  <label class="field">
    <span class="field-label">Container capacity</span>
    <input type="number" bind:value={balanceState.capacity} min="0" class="field-input" />
  </label>

  <label class="field">
    <span class="field-label">Gap</span>
    <input type="number" bind:value={balanceState.gap} min="0" class="field-input" />
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
</style>
