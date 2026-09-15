<script lang="ts">
  import Controls from './lib/Controls.svelte';
  import LinePreview from './lib/LinePreview.svelte';
  import ScoreMatrix from './lib/ScoreMatrix.svelte';
  import DpStepper from './lib/DpStepper.svelte';
  import { balanceState } from './lib/state.svelte';

  // The row the stepper is currently deciding, read out of the current cell event so
  // the matrix can highlight it. Undefined once the event list is empty (no items) or
  // the animation is at the empty/reset state (index -1, nothing evaluated yet).
  const currentCellEvent = $derived(balanceState.cellEvents[balanceState.clampedCellStep]);
  const activeStart = $derived(currentCellEvent?.kind !== 'traceback' ? currentCellEvent?.start : undefined);
</script>

<main class="page">
  <header class="measure header">
    <span class="eyebrow">flex-wrap: balance</span>
    <h1>Score matrix visualizer</h1>
    <p class="subhead">
      Every candidate line, scored — the accent marks what the DP picked.
    </p>
    <div class="objective" role="img" aria-label="minimizes the sum over lines of the squared free space of each line">
      <span class="objective-label">minimizes</span>
      <math class="objective-formula">
        <mrow>
          <munder>
            <mo>&sum;</mo>
            <mtext>line</mtext>
          </munder>
          <msup>
            <mtext>free</mtext>
            <mn>2</mn>
          </msup>
        </mrow>
      </math>
    </div>
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

  /* The objective, rendered once as a formula rather than a fourth sentence —
     MathML, not a LaTeX/KaTeX dependency, so a two-line stack of native <math>
     elements does the sum-of-squares typesetting the browser already knows
     how to lay out. The "minimizes" label is the only prose here, capped at
     one word so this reads as a formula with a caption, not new prose. */
  .objective {
    display: flex;
    align-items: baseline;
    gap: var(--space-8);
  }

  .objective-label {
    font-size: var(--text-13);
    color: var(--color-text-secondary);
  }

  .objective-formula {
    font-size: var(--text-17);
    color: var(--color-text);
  }

  .footer {
    border-top: 1px solid var(--color-hairline);
    padding-top: var(--space-24);
    font-size: var(--text-13);
    color: var(--color-text-secondary);
  }
</style>
