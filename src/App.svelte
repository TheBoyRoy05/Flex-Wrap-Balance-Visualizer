<script lang="ts">
  import Controls from './lib/Controls.svelte';
  import LinePreview from './lib/LinePreview.svelte';
  import ScoreMatrix from './lib/ScoreMatrix.svelte';
</script>

<main class="mx-auto flex min-h-screen max-w-3xl flex-col gap-10 px-6 py-16">
  <header class="flex flex-col gap-3">
    <span class="font-mono text-[13px] font-medium text-[var(--accent)]">flex-wrap: balance</span>
    <h1>Score matrix visualizer</h1>
    <p class="max-w-xl text-[15px] leading-relaxed text-[var(--text)]">
      <code>flex-wrap: balance</code> chooses line breaks that minimize the total squared
      free space across lines, instead of greedily packing each line as full as possible.
      This matrix shows, for every candidate line <code>[start, end)</code>, the squared
      free space it would leave, and highlights the set the DP algorithm actually picked.
    </p>
  </header>

  <Controls />
  <LinePreview />
  <ScoreMatrix />

  <footer class="border-t border-[var(--border)] pt-6 text-[13px] text-[var(--text)]">
    Pure algorithm mirrors WebCore's <code>balancedLineBreaks</code> &mdash; see
    <code>src/lib/balance.ts</code>.
  </footer>
</main>
