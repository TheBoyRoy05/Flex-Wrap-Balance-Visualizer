<script lang="ts">
  import Controls from './lib/Controls.svelte';
  import LinePreview from './lib/LinePreview.svelte';
  import ScoreMatrix from './lib/ScoreMatrix.svelte';
  import DpStepper from './lib/DpStepper.svelte';
  import { balanceState } from './lib/state.svelte';

  // The row the stepper is currently deciding, read out of the trace so the matrix
  // can highlight it. Undefined once the trace is empty (no items).
  const activeStart = $derived(balanceState.trace.steps[balanceState.clampedStepIndex]?.start);
</script>

<main class="page">
  <header class="measure header">
    <span class="eyebrow">flex-wrap: balance</span>
    <h1>Score matrix visualizer</h1>
    <p class="subhead">
      Every candidate line, scored — the accent marks what the DP picked.
    </p>
  </header>

  <div class="measure">
    <Controls />
  </div>

  <div class="measure">
    <LinePreview />
  </div>

  <div class="measure">
    <ScoreMatrix {activeStart} />
  </div>

  <div class="measure">
    <DpStepper />
  </div>

  <footer class="measure footer">
    Pure algorithm mirrors WebCore's <code>balancedLineBreaks</code> &mdash; see
    <code>src/lib/balance.ts</code>.
  </footer>
</main>

<style>
  .page {
    display: flex;
    min-height: 100vh;
    flex-direction: column;
    gap: var(--space-64);
    padding-block: var(--space-64);
  }

  .header {
    display: flex;
    flex-direction: column;
    gap: var(--space-12);
  }

  .eyebrow {
    font-family: var(--mono);
    font-size: var(--text-13);
    font-weight: 500;
    color: var(--color-accent);
  }

  .subhead {
    font-size: var(--text-15);
    color: var(--color-text-secondary);
    /* Text measure constraint stays internal to the line itself — the header's
       container shares the page's one content edge (.measure), but a long
       sentence at 1120px would run past a comfortable reading width. */
    max-width: var(--measure-text);
  }

  .footer {
    border-top: 1px solid var(--color-hairline);
    padding-top: var(--space-24);
    font-size: var(--text-13);
    color: var(--color-text-secondary);
  }
</style>
