<script lang="ts">
  // Everything here is $derived from the shared balanceState: no local $state at all,
  // because a table of computed cells is exactly what $derived is for — recompute
  // when inputs change, never mutate directly.
  import { balanceState } from './state.svelte';

  const n = $derived(balanceState.sizes.length);
  const rows = $derived(Array.from({ length: n }, (_, i) => i)); // start: 0..n-1
  const cols = $derived(Array.from({ length: n }, (_, i) => i + 1)); // end: 1..n

  const { score, len, breaks } = $derived(balanceState.result);

  // The chosen line segments are [prevBreak, break) for each entry in `breaks`.
  // Store them as "start,end" keys in a Set for O(1) cell lookup in the template.
  const chosenCells: Set<string> = $derived.by(() => {
    const cells = new Set<string>();
    let start = 0;
    for (const end of breaks) {
      cells.add(`${start},${end}`);
      start = end;
    }
    return cells;
  });

  const totalScore = $derived(breaks.reduce((sum, end, i) => {
    const start = i === 0 ? 0 : breaks[i - 1];
    return sum + (score[start]?.[end] ?? 0);
  }, 0));

  function isChosen(start: number, end: number): boolean {
    return chosenCells.has(`${start},${end}`);
  }

  function isOverflow(start: number, end: number): boolean {
    const l = len[start]?.[end];
    return l != null && l > balanceState.capacity;
  }
</script>

<div class="flex flex-col gap-5">
  <div class="legend">
    <span class="legend-item">
      <span class="legend-swatch legend-swatch--chosen"></span>
      chosen line
    </span>
    <span class="legend-item">
      <span class="legend-swatch legend-swatch--overflow"></span>
      overflow (line too long)
    </span>
    <span class="legend-item">
      <span class="legend-swatch legend-swatch--invalid"></span>
      invalid (end &le; start)
    </span>
  </div>

  <div class="matrix-scroll">
    <table class="matrix">
      <thead>
        <tr>
          <th class="matrix-corner">start \ end</th>
          {#each cols as end (end)}
            <th class="matrix-head">{end}</th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each rows as start (start)}
          <tr>
            <th class="matrix-row-head">{start}</th>
            {#each cols as end (end)}
              {@const valid = end > start}
              {@const cellScore = valid ? score[start]?.[end] : null}
              {@const cellLen = valid ? len[start]?.[end] : null}
              {@const chosen = valid && isChosen(start, end)}
              {@const overflow = valid && isOverflow(start, end)}
              <td
                class={[
                  'matrix-cell',
                  !valid && 'matrix-cell--invalid',
                  valid && overflow && !chosen && 'matrix-cell--overflow',
                  chosen && !overflow && 'matrix-cell--chosen',
                  chosen && overflow && 'matrix-cell--chosen-overflow',
                ]}
              >
                {#if valid}
                  <div class="matrix-cell-score">{cellScore}</div>
                  <div class="matrix-cell-len">len {cellLen}</div>
                {:else}
                  &mdash;
                {/if}
              </td>
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <div class="summary">
    <div class="summary-title">Chosen line breaks</div>
    {#if n === 0}
      <p class="text-[15px] text-[var(--text)]">Enter at least one item size above.</p>
    {:else}
      <ol class="flex flex-wrap gap-2">
        {#each breaks as end, i (end)}
          {@const start = i === 0 ? 0 : breaks[i - 1]}
          <li class="summary-chip">
            [{start}, {end}) &middot; len {len[start]?.[end]} &middot; score {score[start]?.[end]}
          </li>
        {/each}
      </ol>
      <p class="mt-3 text-[15px] text-[var(--text)]">
        Total score (sum of squared free space): <span class="summary-total">{totalScore}</span>
      </p>
    {/if}
  </div>
</div>

<style>
  .legend {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 16px;
    font-size: 12px;
    color: var(--text);
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .legend-swatch {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 3px;
  }

  .legend-swatch--chosen {
    background: var(--accent-tint);
    box-shadow: inset 0 0 0 1.5px var(--accent);
  }

  .legend-swatch--overflow {
    background: var(--overflow-tint);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--overflow) 55%, transparent);
  }

  .legend-swatch--invalid {
    background: var(--code-bg);
    box-shadow: inset 0 0 0 1px var(--border);
  }

  .matrix-scroll {
    overflow-x: auto;
    border: 1px solid var(--border);
    border-radius: 10px;
  }

  .matrix {
    width: 100%;
    border-collapse: collapse;
    text-align: center;
    font-size: 13px;
  }

  .matrix-corner,
  .matrix-head,
  .matrix-row-head {
    position: sticky;
    font-family: var(--mono);
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    color: var(--text);
    background: var(--code-bg);
    padding: 8px 12px;
  }

  .matrix-corner {
    left: 0;
    top: 0;
    z-index: 2;
    font-family: var(--sans);
    font-size: 12px;
    border-bottom: 1px solid var(--border);
    border-right: 1px solid var(--border);
  }

  .matrix-head {
    top: 0;
    z-index: 1;
    border-bottom: 1px solid var(--border);
  }

  .matrix-row-head {
    left: 0;
    z-index: 1;
    border-right: 1px solid var(--border);
  }

  .matrix-cell {
    padding: 8px 12px;
    font-family: var(--mono);
    font-variant-numeric: tabular-nums;
    color: var(--text-h);
    border-top: 1px solid var(--border);
    transition: background-color 200ms ease-out, color 200ms ease-out, box-shadow 200ms ease-out;
  }

  .matrix-cell:hover {
    background: var(--code-bg);
  }

  .matrix-cell-score {
    line-height: 1.3;
  }

  .matrix-cell-len {
    font-size: 10px;
    line-height: 1.3;
    color: var(--text);
    opacity: 0.7;
  }

  .matrix-cell--invalid {
    color: var(--text);
    opacity: 0.35;
  }

  .matrix-cell--overflow {
    background: var(--overflow-tint);
    color: var(--overflow);
  }

  .matrix-cell--chosen {
    background: var(--accent-tint);
    color: var(--accent);
    font-weight: 600;
    box-shadow: inset 0 0 0 1.5px var(--accent);
  }

  .matrix-cell--chosen-overflow {
    background: var(--overflow-tint);
    color: var(--overflow);
    font-weight: 600;
    box-shadow: inset 0 0 0 1.5px var(--overflow);
  }

  .summary {
    border-top: 1px solid var(--border);
    padding-top: 16px;
    font-size: 14px;
  }

  .summary-title {
    font-size: 13px;
    font-weight: 500;
    color: var(--text-h);
    margin-bottom: 10px;
  }

  .summary-chip {
    border-radius: 6px;
    border: 1px solid var(--border);
    padding: 4px 10px;
    font-family: var(--mono);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    color: var(--accent);
  }

  .summary-total {
    font-family: var(--mono);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: var(--text-h);
  }
</style>
