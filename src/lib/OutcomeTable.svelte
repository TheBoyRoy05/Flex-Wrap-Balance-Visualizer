<script lang="ts">
  // Option B: the outcome table. Reads the pure `outcomeTable` derived off the shared
  // state — one row per requestable line count k = 1..n, its resulting breaks and total
  // squared free space — and highlights the row for the k the Flex Line Count control
  // currently selects. No algorithm logic lives here; this component only renders the
  // derived, the same one-way-data-flow the rest of the app follows (inputs are $state
  // in state.svelte.ts, everything else is $derived from them, components just read).
  import { balanceState } from './state.svelte';

  const rows = $derived(balanceState.outcomeTable);
  const currentK = $derived(balanceState.currentK);

  function fmt(n: number | null): string {
    return n == null ? '—' : String(n);
  }
</script>

<section class="outcome" aria-label="Outcome by flex line count">
  <div class="outcome-head">
    <h2 class="outcome-title">Outcome By Flex Line Count</h2>
    <p class="outcome-sub">What Each <code>flex-line-count</code> Produces</p>
  </div>

  {#if rows.length === 0}
    <p class="outcome-empty">Add Items To See Outcomes</p>
  {:else}
    <table class="outcome-table tnum">
      <thead>
        <tr>
          <th scope="col" class="col-k">Flex Line Count</th>
          <th scope="col" class="col-lines">Lines Used</th>
          <th scope="col" class="col-breaks">Line Breaks</th>
          <th scope="col" class="col-score">Total Squared Free Space</th>
        </tr>
      </thead>
      <tbody>
        {#each rows as row (row.k)}
          <tr class:is-current={row.k === currentK}>
            <th scope="row" class="col-k">
              {row.k}
              {#if row.k === currentK}<span class="current-tag">Current</span>{/if}
            </th>
            <td class="col-lines">
              {row.lineCount}{#if row.clamped}<span class="clamp-note" title="Requested more lines than items; clamped">Clamped</span>{/if}
            </td>
            <td class="col-breaks"><code>[{row.breaks.join(', ')}]</code></td>
            <td class="col-score">{fmt(row.score)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</section>

<style>
  .outcome {
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-10);
    background: var(--color-surface);
    overflow: hidden;
  }

  .outcome-head {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding: var(--space-16);
    border-bottom: 1px solid var(--color-border-strong);
  }

  .outcome-title {
    font-size: var(--text-15);
    font-weight: 600;
    color: var(--color-text);
  }

  .outcome-sub {
    font-size: var(--text-13);
    color: var(--color-text);
  }

  .outcome-sub code {
    font-family: var(--mono);
    color: var(--color-accent);
  }

  .outcome-empty {
    padding: var(--space-24) var(--space-16);
    font-size: var(--text-13);
    color: var(--color-text-secondary);
  }

  .outcome-table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--text-13);
    color: var(--color-text);
  }

  .outcome-table th,
  .outcome-table td {
    padding: var(--space-12) var(--space-16);
    text-align: left;
    border-bottom: 1px solid var(--color-hairline);
  }

  .outcome-table tbody tr:last-child th,
  .outcome-table tbody tr:last-child td {
    border-bottom: none;
  }

  .outcome-table thead th {
    font-weight: 500;
    color: var(--color-text);
    border-bottom: 1px solid var(--color-border-strong);
  }

  .col-score,
  .col-lines {
    text-align: right;
  }
  .outcome-table thead .col-score,
  .outcome-table thead .col-lines {
    text-align: right;
  }

  .col-breaks code {
    font-family: var(--mono);
    color: var(--color-accent);
  }

  /* Current row: an accent tint AND a solid left accent border, so the mark is not
     carried by color alone (house rule) and survives for a reader who cannot tell the
     tint apart. The border is drawn inside a box-shadow inset to avoid shifting the
     cell box and disturbing row alignment. */
  .outcome-table tbody tr.is-current th,
  .outcome-table tbody tr.is-current td {
    background: var(--color-accent-tint);
    box-shadow: inset var(--space-4) 0 0 0 var(--color-accent);
  }

  .outcome-table tbody tr.is-current th.col-k {
    color: var(--color-accent);
    font-weight: 600;
  }

  .current-tag {
    margin-left: var(--space-8);
    font-size: var(--text-13);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: var(--ls-none);
    color: var(--color-accent);
  }

  .clamp-note {
    margin-left: var(--space-8);
    font-size: var(--text-13);
    color: var(--color-text-secondary);
  }
</style>
