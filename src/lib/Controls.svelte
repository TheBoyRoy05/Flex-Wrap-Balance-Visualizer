<script lang="ts">
  // No props: this component reads/writes the shared `balanceState` instance directly,
  // via `bind:value`, which is two-way binding — the input both displays state.capacity
  // and writes back to it on every keystroke, no manual oninput handler needed.
  import { balanceState } from './state.svelte';
</script>

<div class="grid gap-6 sm:grid-cols-[2fr_1fr_1fr]">
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
