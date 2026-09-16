<script lang="ts">
  import Controls from './lib/Controls.svelte';
  import LinePreview from './lib/LinePreview.svelte';
  import ScoreMatrix from './lib/ScoreMatrix.svelte';
  import DpStepper from './lib/DpStepper.svelte';
  import { balanceState } from './lib/state.svelte';

  // The row the stepper is currently deciding, read out of the current cell event so
  // the matrix can highlight it. Undefined once the event list is empty (no items),
  // the animation is at the empty/reset state (index -1, nothing evaluated yet), the
  // current event is a traceback link (that phase highlights via chosen cells, not a
  // row), or the final result event (no single row applies to "the chosen breaks").
  const currentCellEvent = $derived(balanceState.cellEvents[balanceState.clampedCellStep]);
  const activeStart = $derived(
    currentCellEvent?.kind === 'evaluate' || currentCellEvent?.kind === 'settle'
      ? currentCellEvent.start
      : undefined,
  );
</script>

{#snippet algorithmLink()}
  <a
    class="algorithm-link"
    href="https://github.com/TheBoyRoy05/Flex-Wrap-Balance-Visualizer#the-algorithm"
    target="_blank"
    rel="noopener noreferrer"
  >
    Read More Here ↗
  </a>
{/snippet}

<main class="page">
  <header class="measure header">
    <span class="eyebrow">flex-wrap: balance</span>
    <h1>Score Matrix Visualizer</h1>
    {@render algorithmLink()}
  </header>

  <div class="measure">
    <Controls />
  </div>

  <div class="measure">
    <LinePreview />
  </div>

  <div class="measure">
    <ScoreMatrix {activeStart}>
      <DpStepper />
    </ScoreMatrix>
  </div>

  <!-- Second call site: a reader who has just watched the run end is exactly
       the one who wants the written explanation, and by then the header is far
       above them. -->
  <div class="measure">
    {@render algorithmLink()}
  </div>
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

  .algorithm-link {
    display: inline-flex;
    align-items: center;
    align-self: flex-start;
    height: var(--control-height);
    padding: 0 var(--space-16);
    border: 1px solid var(--color-hairline);
    border-radius: var(--radius-8);
    font-size: var(--text-15);
    font-weight: 500;
    color: var(--color-accent);
    text-decoration: none;
    transition: border-color 200ms ease-out, box-shadow 200ms ease-out;
  }

  .algorithm-link:hover {
    border-color: var(--color-accent);
  }

  .algorithm-link:focus-visible {
    outline: none;
    border-color: var(--color-accent);
    box-shadow: 0 0 0 3px var(--accent-focus-ring);
  }
</style>
