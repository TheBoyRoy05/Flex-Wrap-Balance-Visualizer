<script lang="ts">
  // Everything here is $derived from the shared balanceState: no local $state at all,
  // because a table of computed cells is exactly what $derived is for — recompute
  // when inputs change, never mutate directly.
  import { balanceState } from './state.svelte';
  import { lastFittingEnd } from './balance';

  const n = $derived(balanceState.sizes.length);
  // Row order mirrors computation order: the suffix DP resolves start = n-1 first
  // and works backwards, reusing each row's minScores in the next row down. Rows
  // are displayed in that same order — last item's row at top, start = 0 at the
  // bottom — so reading down the page follows the order values are actually
  // computed, and row 0 (whose minimum is the final answer) lands last.
  const rows = $derived(Array.from({ length: n }, (_, i) => n - 1 - i)); // start: n-1..0
  const cols = $derived(Array.from({ length: n }, (_, i) => i + 1)); // end: 1..n

  const { score, len, breaks, minScores, bestEnd } = $derived(balanceState.result);

  // The largest `end` genuinely considered for each `start` — the DP never looks
  // past this, because a line stretching further has already overflowed. A cell
  // beyond it has score 0 by the algorithm's definition (overflow, not "cheap"),
  // so it must never be compared against real totals.
  const fittingEnd = $derived(lastFittingEnd(balanceState.sizes, balanceState.capacity, balanceState.gap));

  function isEligible(start: number, end: number): boolean {
    return end > start && end <= fittingEnd[start];
  }

  // The DP's actual recurrence: cheapest way to finish line [start, end) plus the
  // best achievable score for everything after it. Only defined for eligible cells.
  function cellTotal(start: number, end: number): number | null {
    if (!isEligible(start, end)) return null;
    const s = score[start]?.[end];
    const rest = minScores[end];
    if (s == null || rest == null) return null;
    return s + rest;
  }

  // The chosen line segments are [prevBreak, break) for each entry in `breaks`.
  // Store them as "start,end" keys in a Set for O(1) cell lookup in the template.
  // Every one of these is also a row minimum (see isRowMinimum below): the path
  // is built by following bestEnd from 0, so chosenCells is always a subset of
  // "the cell each row's minimum lands on" — never a competing, unrelated set.
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

  // bestEnd[start] is, by definition, the end that achieves minScores[start] —
  // the row's minimum total. True for every row, whether or not that row lies
  // on the final path. This is the structural fact the legend was missing.
  function isRowMinimum(start: number, end: number): boolean {
    return bestEnd[start] === end;
  }
</script>

<div class="flex flex-col gap-5">
  <p class="matrix-intro">
    Each eligible cell is <code>score[start, end) + minScores[end]</code>: the cost of a
    line covering items <code>[start, end)</code>, plus the best achievable total for
    everything after it. Every row has a minimum — marked with a rule — and it always
    equals <code>minScores[start]</code> in the header row above. Only the minima that
    chain from row 0 are the DP's actual answer; those get the accent. Cells past the
    last fitting end are struck out: the line they describe overflows, so the DP never
    considers them, no matter how low their raw score reads.
  </p>

  <div class="legend">
    <span class="legend-item">
      <span class="legend-swatch legend-swatch--chosen"></span>
      chosen path (this row's minimum, and it leads to the next)
    </span>
    <span class="legend-item">
      <span class="legend-mark legend-mark--rowmin"></span>
      row minimum (always equals minScores[start], not always on the path)
    </span>
    <span class="legend-item">
      <span class="legend-swatch legend-swatch--invalid"></span>
      out of consideration (overflow, or end &le; start)
    </span>
  </div>

  <div class="matrix-scroll">
    <table class="matrix">
      <thead>
        <tr>
          <th class="matrix-corner">
            <span class="matrix-axis-row">Row: line starts at item&hellip;</span>
            <span class="matrix-axis-col">Column: line ends before item&hellip; <span class="tnum">[start, end)</span></span>
          </th>
          {#each cols as end (end)}
            <th class="matrix-head tnum">{end}</th>
          {/each}
        </tr>
        <tr>
          <th class="matrix-corner matrix-corner--sub">minScores[end]</th>
          {#each cols as end (end)}
            <th class="matrix-minscore tnum">{minScores[end] ?? '\u2014'}</th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each rows as start (start)}
          <tr>
            <th class="matrix-row-head tnum">{start}</th>
            {#each cols as end (end)}
              {@const eligible = isEligible(start, end)}
              {@const total = cellTotal(start, end)}
              {@const cellScore = eligible ? score[start]?.[end] : null}
              {@const rowMin = eligible && isRowMinimum(start, end)}
              {@const chosen = eligible && isChosen(start, end)}
              <td
                class={[
                  'matrix-cell',
                  !eligible && 'matrix-cell--invalid',
                  rowMin && 'matrix-cell--rowmin',
                  chosen && 'matrix-cell--chosen',
                ]}
              >
                {#if eligible}
                  <div class="matrix-cell-total tnum">{total}</div>
                  <div class="matrix-cell-breakdown tnum">{cellScore} + {minScores[end]}</div>
                  {#if chosen}
                    <div class="matrix-cell-next tnum">&darr; row {end}</div>
                  {/if}
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
            [{start}, {end}) &middot; len <span class="tnum">{len[start]?.[end]}</span> &middot; score <span class="tnum">{score[start]?.[end]}</span>
          </li>
        {/each}
      </ol>
      <p class="mt-3 text-[15px] text-[var(--text)]">
        Total score (sum of squared free space): <span class="summary-total tnum">{totalScore}</span>
      </p>
    {/if}
  </div>
</div>

<style>
  .matrix-intro {
    font-size: 15px;
    color: var(--text);
    max-width: 68ch;
  }

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

  /* Row minimum's quiet mark, echoed in the legend: a rule underneath, same
     weight as the cell itself carries — no fill, no second hue. */
  .legend-mark {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 3px;
    background: var(--code-bg);
    box-shadow: inset 0 0 0 1px var(--border);
  }

  .legend-mark--rowmin {
    box-shadow: inset 0 -2px 0 0 var(--text-h), inset 0 0 0 1px var(--border);
  }

  .legend-swatch--invalid {
    background: var(--code-bg);
    box-shadow: inset 0 0 0 1px var(--border);
  }

  .matrix-scroll {
    overflow-x: auto;
    /* One hairline frames the whole table — the minimum needed to bound a
       scrollable region — instead of a bordered panel around bordered rows. */
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
  .matrix-row-head,
  .matrix-minscore {
    position: sticky;
    font-weight: 500;
    color: var(--text);
    background: var(--code-bg);
    padding: 8px 12px;
  }

  .matrix-corner {
    left: 0;
    top: 0;
    z-index: 2;
    text-align: left;
    vertical-align: top;
    border-bottom: 1px solid var(--border);
    border-right: 1px solid var(--border);
  }

  /* Axis labels, spelled out in words rather than a cryptic "start \ end":
     the row label reads down the left edge, the column label sits above the
     grid — quiet (11px, secondary gray) but unmissable, so a reader always
     knows which axis is which and that end is exclusive. */
  .matrix-axis-row,
  .matrix-axis-col {
    display: block;
    font-size: 11px;
    font-weight: 500;
    line-height: 1.4;
    color: var(--text);
  }

  .matrix-axis-col {
    margin-top: 2px;
  }

  .matrix-corner--sub {
    font-size: 10px;
    opacity: 0.75;
  }

  .matrix-head {
    top: 0;
    z-index: 1;
    border-bottom: 1px solid var(--border);
  }

  .matrix-minscore {
    top: 41px;
    z-index: 1;
    font-size: 11px;
    color: var(--text-h);
    border-bottom: 1px solid var(--border);
  }

  .matrix-row-head {
    left: 0;
    z-index: 1;
    border-right: 1px solid var(--border);
  }

  .matrix-cell {
    padding: 8px 12px;
    color: var(--text-h);
    border-top: 1px solid var(--border);
  }

  .matrix-cell-total {
    line-height: 1.3;
    font-size: 14px;
  }

  .matrix-cell-breakdown {
    font-size: 10px;
    line-height: 1.3;
    color: var(--text);
    opacity: 0.7;
  }

  .matrix-cell--invalid {
    color: var(--text);
    opacity: 0.35;
  }

  /* Row minimum: a structural fact true of every row, so it gets a quiet mark,
     not a hue. A single rule under the total (same weight as bold text, not a
     fill or a border box) says "this is minScores[start] for this row" without
     competing with the accent reserved for the chosen path below. */
  .matrix-cell--rowmin .matrix-cell-total {
    font-weight: 600;
    box-shadow: inset 0 -2px 0 0 var(--text-h);
    padding-bottom: 2px;
  }

  /* The one accent on this page: the row-minimum cells that also lie on the
     chosen path. Every chosen cell is a row minimum (see isChosen/isRowMinimum
     above), so this always layers on top of, never instead of, the rule above. */
  .matrix-cell--chosen {
    background: var(--accent-tint);
    color: var(--accent);
    font-weight: 600;
    box-shadow: inset 0 0 0 1.5px var(--accent);
  }

  .matrix-cell--chosen .matrix-cell-total {
    /* Accent cells drop the rowmin rule in favor of the accent frame itself —
       the box-shadow above already says "chosen"; a second rule would be a
       competing mark on the one cell that most needs to read as singular. */
    box-shadow: none;
  }

  .matrix-cell--chosen .matrix-cell-breakdown {
    color: var(--accent);
    opacity: 0.85;
  }

  /* Chaining mark: names the next row this chosen cell hands off to, so the
     path reads as a sequence (0 -> 2 -> 4 -> 5) and not four isolated cells. */
  .matrix-cell-next {
    margin-top: 2px;
    font-size: 10px;
    font-weight: 500;
    color: var(--accent);
    opacity: 0.85;
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

  /* Chip keeps a hairline only (no fill) — enough to read as a distinct entry
     in the list without stacking a bordered box on top of the summary panel. */
  .summary-chip {
    border-radius: 6px;
    border: 1px solid var(--border);
    padding: 4px 10px;
    font-size: 12px;
    color: var(--text-h);
  }

  .summary-total {
    font-weight: 600;
    color: var(--text-h);
  }
</style>
