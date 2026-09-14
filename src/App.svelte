<script lang="ts">
  import Controls from './lib/Controls.svelte';
  import LinePreview from './lib/LinePreview.svelte';
  import ScoreMatrix from './lib/ScoreMatrix.svelte';
</script>

<main class="mx-auto flex min-h-screen max-w-3xl flex-col gap-10 px-6 py-16">
  <header class="flex flex-col gap-3">
    <span class="font-mono text-[13px] font-medium text-[var(--accent)]">flex-wrap: balance</span>
    <h1>Score matrix visualizer</h1>
    <p class="text-[15px] text-[var(--text)]">
      Every candidate line, scored — the accent marks what the DP picked.
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
