<script lang="ts">
  import Controls from './lib/Controls.svelte';
  import LinePreview from './lib/LinePreview.svelte';
  import ScoreMatrix from './lib/ScoreMatrix.svelte';
</script>

<main class="page">
  <header class="measure-prose header">
    <span class="eyebrow">flex-wrap: balance</span>
    <h1>Score matrix visualizer</h1>
    <p class="subhead">
      Every candidate line, scored — the accent marks what the DP picked.
    </p>
  </header>

  <div class="measure-prose">
    <Controls />
  </div>

  <div class="measure-data">
    <LinePreview />
  </div>

  <div class="measure-data">
    <ScoreMatrix />
  </div>

  <footer class="measure-prose footer">
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
  }

  .footer {
    border-top: 1px solid var(--color-hairline);
    padding-top: var(--space-24);
    font-size: var(--text-13);
    color: var(--color-text-secondary);
  }
</style>
