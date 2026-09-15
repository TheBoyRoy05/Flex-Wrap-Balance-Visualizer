<script lang="ts">
  // Everything here is $derived from the shared balanceState: no local $state at all,
  // because a table of computed cells is exactly what $derived is for — recompute
  // when inputs change, never mutate directly.
  import { balanceState } from './state.svelte';
  import { lastFittingEnd, isOverflowingLine } from './balance';

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

  // Overflow is a fact about length vs capacity, independent of eligibility.
  // `lastFittingEnd` always permits at least one item per line (a single item is
  // never rejected outright), so a single-item line that alone exceeds capacity is
  // still "eligible" — its score of 0 would otherwise render identically to a
  // genuine zero-free-space fit. Checking length directly (via the shared `len`
  // matrix, not a recomputation) catches that case too.
  function isOverflow(start: number, end: number): boolean {
    return end > start && isOverflowingLine(len, start, end, balanceState.capacity);
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

  // The row a reader is looking at is the same number the header row shows further
  // right, in the column of the same index — minScores does both jobs (produced by
  // its own row, consumed by earlier rows as `minScores[end]`), but until now only
  // the consumed half had a column. This is the produced half: one trailing cell
  // per row, equal to that row's own minimum.
  function settledTotal(start: number): number | null {
    return minScores[start] ?? null;
  }

  // Which row the stepper is currently deciding, so the matrix can highlight it —
  // the two views read as connected, not two unrelated panels. Undefined while no
  // trace exists (n === 0). The stepper itself is rendered here (via children), not
  // in App.svelte, so it sits with the table it drives instead of far below it.
  let { activeStart = undefined, children }: { activeStart?: number; children?: import('svelte').Snippet } = $props();
</script>



<div class="matrix-panel">
  <div class="legend">
    <span class="legend-item">
      <span class="legend-swatch legend-swatch--chosen"></span>
      chosen
    </span>
    <span class="legend-item">
      <span class="legend-swatch legend-swatch--rowmin"></span>
      row min
    </span>
    <span class="legend-item">
      <span class="legend-swatch legend-swatch--invalid"></span>
      out of range
    </span>
    <span class="legend-item">
      <span class="legend-mark legend-mark--overflow">&infin;</span>
      overflow (0 is waived, not earned)
    </span>
    <span class="legend-item legend-item--key" aria-label="cell total equals line score plus rest score">
      total = <span class="legend-key-term">line&sup2;</span> + <span class="legend-key-term">rest</span>
    </span>
  </div>

  <div class="matrix-scroll">
    <table class="matrix">
      <thead>
        <tr>
          <th class="matrix-corner matrix-corner--split">
            <svg class="corner-diagonal" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              <line x1="0" y1="0" x2="100" y2="100" />
            </svg>
            <span class="corner-label corner-label--start">start</span>
            <span class="corner-label corner-label--end">end</span>
          </th>
          {#each cols as end (end)}
            <th class="matrix-head tnum">{end}</th>
          {/each}
          <th class="matrix-head matrix-head--settled">settles at</th>
        </tr>
        <tr>
          <th class="matrix-corner matrix-corner--sub tnum">best from here</th>
          {#each cols as end (end)}
            <th class="matrix-minscore tnum">{minScores[end] ?? '\u2014'}</th>
          {/each}
          <th class="matrix-minscore matrix-minscore--settled"></th>
        </tr>
      </thead>
      <tbody>
        {#each rows as start (start)}
          <tr class:matrix-row--active={start === activeStart}>
            <th class="matrix-row-head tnum">{start}</th>
            {#each cols as end (end)}
              {@const eligible = isEligible(start, end)}
              {@const overflow = isOverflow(start, end)}
              {@const total = cellTotal(start, end)}
              {@const cellScore = eligible ? score[start]?.[end] : null}
              {@const rowMin = eligible && isRowMinimum(start, end)}
              {@const chosen = eligible && isChosen(start, end)}
              <td
                class={[
                  'matrix-cell',
                  !eligible && 'matrix-cell--invalid',
                  overflow && 'matrix-cell--overflow',
                  rowMin && 'matrix-cell--rowmin',
                  chosen && 'matrix-cell--chosen',
                ]}
              >
                {#if eligible}
                  <div class="matrix-cell-total tnum">
                    {total}
                    {#if overflow}
                      <span class="matrix-cell-inf-inline" title="overflow: length exceeds capacity">&infin;</span>
                    {/if}
                  </div>
                  <div class="matrix-cell-breakdown tnum">
                    <span>{cellScore}</span>
                    +
                    <span>{minScores[end]}</span>
                  </div>
                {:else if overflow}
                  <div class="matrix-cell-inf">&infin;</div>
                {/if}
              </td>
            {/each}
            <td class="matrix-cell matrix-cell--settled tnum">{settledTotal(start) ?? '\u2014'}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  {@render children?.()}

  <div class="summary">
    <div class="summary-title">Chosen line breaks</div>
    {#if n === 0}
      <p class="summary-empty">Enter at least one item size above.</p>
    {:else}
      <ol class="summary-list">
        {#each breaks as end, i (end)}
          {@const start = i === 0 ? 0 : breaks[i - 1]}
          {@const chipOverflow = isOverflowingLine(len, start, end, balanceState.capacity)}
          <li class="summary-chip" class:summary-chip--overflow={chipOverflow}>
            [{start}, {end}) &middot; len <span class="tnum">{len[start]?.[end]}</span> &middot; score <span class="tnum">{score[start]?.[end]}</span>
            {#if chipOverflow}
              <span class="summary-chip-inf" title="overflow: length exceeds capacity">&infin;</span>
            {/if}
          </li>
        {/each}
      </ol>
      <p class="summary-note">
        Total score (sum of squared free space): <span class="summary-total tnum">{totalScore}</span>
        {#if breaks.some((end, i) => isOverflowingLine(len, i === 0 ? 0 : breaks[i - 1], end, balanceState.capacity))}
          <span class="summary-total-overflow-note">— includes an overflowing line; its 0 is waived, not earned</span>
        {/if}
      </p>
    {/if}
  </div>
</div>

<style>
  .matrix-panel {
    display: flex;
    flex-direction: column;
    gap: var(--space-16);
  }

  .legend {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-16);
    font-size: var(--text-13);
    color: var(--color-text-secondary);
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: var(--space-8);
  }

  .legend-swatch {
    display: inline-block;
    width: var(--space-8);
    height: var(--space-8);
    border-radius: var(--radius-6);
  }

  .legend-swatch--chosen {
    background: var(--color-accent-tint);
    box-shadow: inset 0 0 0 1.5px var(--color-accent);
  }

  /* Row minimum's real treatment, echoed in the legend: a 1px neutral ring in
     the secondary-text color, clearly visible against black but deliberately
     thinner than the 1.5px accent ring above — weight and color both separate
     the two states, not color alone. */
  .legend-swatch--rowmin {
    background: var(--color-surface);
    box-shadow: inset 0 0 0 1px var(--color-text-secondary);
  }

  .legend-swatch--invalid {
    background: var(--color-overflow);
    opacity: 0.08;
    box-shadow: inset 0 0 0 1px var(--color-hairline);
  }

  /* Overflow legend glyph: same infinity mark used inline on overflowing cells,
     so the legend and the cell content read as the same symbol, not a color key.
     The tint background matches the overflowing cell's own background, so the
     swatch reads as "disqualified" at a glance, not just via the glyph color.
     Glyph itself stays full opacity: it carries meaning (disqualified line),
     never faded. */
  .legend-mark--overflow {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--space-16);
    height: var(--space-16);
    border-radius: var(--radius-6);
    background: var(--color-overflow-tint);
    box-shadow: none;
    font-size: var(--text-13);
    color: var(--color-overflow);
  }

  /* The visible arithmetic key: names the two parts every cell's breakdown
     subtext already shows (own line's score, then the rest), so the subtext
     never needs its own inline prose — it just reads against this key instead. */
  .legend-item--key {
    margin-left: auto;
    font-size: var(--text-13);
    color: var(--color-text-secondary);
  }

  .legend-key-term {
    font-weight: 600;
    color: var(--color-text);
  }

  .matrix-scroll {
    overflow-x: auto;
    /* One hairline frames the whole table — the minimum needed to bound a
       scrollable region — instead of a bordered panel around bordered rows. */
    border: 1px solid var(--color-hairline);
    border-radius: var(--radius-10);
  }

  .matrix {
    width: 100%;
    border-collapse: collapse;
    text-align: center;
    font-size: var(--text-13);
  }

  .matrix-corner,
  .matrix-head,
  .matrix-row-head,
  .matrix-minscore {
    position: sticky;
    font-weight: 500;
    color: var(--color-text-secondary);
    background: var(--color-surface);
    padding: var(--space-8);
  }

  .matrix-corner {
    left: 0;
    top: 0;
    z-index: 2;
    min-width: 96px;
    text-align: left;
    vertical-align: middle;
    border-bottom: 1px solid var(--color-hairline);
    border-right: 1px solid var(--color-hairline);
  }

  /* Split-corner convention: one hairline diagonal from corner to corner does
     the labeling job the two chip strips used to do. "start" sits in the
     lower-left triangle (reads against the row axis below it), "end" in the
     upper-right (reads against the column axis beside it). The diagonal is an
     inline SVG line, not a gradient: a gradient seam fades toward both ends
     and barely registers, where the table's other hairlines are crisp 1px
     rules. `preserveAspectRatio="none"` stretches the 0..100 viewBox to fill
     the cell's actual box, so the line always lands on the real corners
     whatever the cell's width or height. */
  .matrix-corner--split {
    position: relative;
    height: var(--space-48);
    background: var(--color-surface);
  }

  .corner-diagonal {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }

  .corner-diagonal line {
    stroke: var(--color-hairline);
    stroke-width: 1px;
    vector-effect: non-scaling-stroke;
  }

  .corner-label {
    position: absolute;
    font-size: var(--text-13);
    font-weight: 500;
    color: var(--color-text-secondary);
  }

  .corner-label--start {
    bottom: var(--space-8);
    left: var(--space-8);
  }

  .corner-label--end {
    top: var(--space-8);
    right: var(--space-8);
  }

  .matrix-corner--sub {
    font-size: var(--text-13);
    opacity: 0.75;
    padding: var(--space-4) var(--space-8);
  }

  .matrix-head {
    top: 0;
    z-index: 1;
    min-width: var(--space-32);
    height: var(--space-24);
    border-bottom: 1px solid var(--color-hairline);
  }

  .matrix-minscore {
    top: var(--space-24);
    z-index: 1;
    font-size: var(--text-13);
    color: var(--color-text);
    border-bottom: 1px solid var(--color-hairline);
  }

  /* Trailing column's header cells stay blank/neutral — "settles at" already
     labels the column once, up in .matrix-head--settled; repeating a value in
     both header rows of the same column would just be noise. */
  .matrix-head--settled,
  .matrix-minscore--settled {
    border-left: 1px solid var(--color-hairline);
  }

  .matrix-row-head {
    left: 0;
    z-index: 1;
    min-width: 96px;
    border-right: 1px solid var(--color-hairline);
  }

  /* The row the stepper is currently deciding — ties the matrix to the stepper
     panel below it so the two read as one connected view, not two side by side. */
  .matrix-row--active .matrix-row-head {
    color: var(--color-accent);
  }

  .matrix-row--active .matrix-cell,
  .matrix-row--active .matrix-cell--settled {
    background: var(--color-accent-tint);
  }

  .matrix-row--active .matrix-cell--chosen,
  .matrix-row--active .matrix-cell--overflow {
    background: var(--color-accent-tint);
  }

  .matrix-cell {
    padding: var(--space-8) var(--space-12);
    color: var(--color-text);
    border-top: 1px solid var(--color-hairline);
  }

  /* Produced value: the same number the header row shows in the column of the
     same index, now attached to the row that actually settles on it. Left
     hairline separates it from the [start, end) grid it summarizes. */
  .matrix-cell--settled {
    border-left: 1px solid var(--color-hairline);
    font-weight: 600;
    color: var(--color-text);
  }

  .matrix-cell-total {
    line-height: var(--lh-body);
    font-size: var(--text-13);
  }

  .matrix-cell-breakdown {
    font-size: var(--text-13);
    line-height: var(--lh-body);
    color: var(--color-text-secondary);
    opacity: 0.7;
  }

  /* Structurally impossible (end <= start): no line, nothing to show. Fully quiet —
     lower opacity than an overflow cell, no glyph, so it reads as absence, not cost. */
  .matrix-cell--invalid {
    background: var(--color-surface);
    opacity: 0.4;
  }

  /* Overflow: this line exists but its length exceeds capacity, so the DP scores
     it as infinite cost (when it's not eligible) or a waived 0 (when it is, as
     with a lone over-capacity item) — either way, never taken as competitive.
     The red tint and infinity glyph make that cost literal; full styling below,
     after --chosen, so it wins the cascade on cells that are both. Full opacity:
     this glyph says "disqualified", meaning that must never read as faded. */

  .matrix-cell-inf {
    font-size: var(--text-15);
    color: var(--color-overflow);
  }

  /* Row minimum: a structural fact true of every row, so every row's minimum
     must be readable at a glance — the hairline token was too close to black
     to do that. Secondary-text gives a neutral ring with real contrast, while
     staying at 1px so weight (not just color) keeps it subordinate to the
     1.5px accent ring below; a row minimum off the chosen path never reads
     as "picked". */
  .matrix-cell--rowmin {
    box-shadow: inset 0 0 0 1px var(--color-text-secondary);
  }

  /* The one accent on this page: the row-minimum cells that also lie on the
     chosen path. Every chosen cell is a row minimum (see isChosen/isRowMinimum
     above), so this box-shadow overrides, rather than stacks with, the hairline
     ring above — a heavier 1.5px accent-colored border reads as categorically
     different from the 1px neutral hairline, not just a recolor of it. */
  .matrix-cell--chosen {
    background: var(--color-accent-tint);
    color: var(--color-accent);
    font-weight: 600;
    box-shadow: inset 0 0 0 1.5px var(--color-accent);
  }

  .matrix-cell--chosen .matrix-cell-breakdown {
    color: var(--color-accent);
    opacity: 0.85;
  }

  /* Overflow beats chosen/rowmin: a line can be both "what the DP picked" and
     "over capacity" (a single item wider than capacity is always eligible — see
     isOverflow above), and that combination must still read as overflow, never
     as a clean accent pick. This rule sits after --chosen in source order so its
     background/color win the cascade on cells carrying both classes. */
  .matrix-cell--overflow {
    background: var(--color-overflow-tint);
  }

  .matrix-cell--overflow.matrix-cell--chosen,
  .matrix-cell--overflow.matrix-cell--rowmin {
    background: var(--color-overflow-tint);
    color: var(--color-overflow);
    box-shadow: inset 0 0 0 1.5px var(--color-overflow);
  }

  .matrix-cell--overflow.matrix-cell--chosen .matrix-cell-breakdown {
    color: var(--color-overflow);
    opacity: 0.7;
  }

  /* Inline glyph on an eligible-but-overflowing cell (single item over capacity):
     the total is genuinely 0 by the algorithm, but this mark says that 0 was
     waived, not earned — so it can never be mistaken for a perfect zero-free-space
     fit. Full opacity: this is the same disqualification meaning as .matrix-cell-inf. */
  .matrix-cell-inf-inline {
    margin-left: var(--space-4);
    font-size: var(--text-13);
    color: var(--color-overflow);
  }

  .summary {
    border-top: 1px solid var(--color-hairline);
    padding-top: var(--space-16);
    font-size: var(--text-15);
  }

  .summary-title {
    font-size: var(--text-13);
    font-weight: 500;
    color: var(--color-text);
    margin-bottom: var(--space-12);
  }

  .summary-empty {
    font-size: var(--text-15);
    color: var(--color-text-secondary);
  }

  .summary-list {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-8);
  }

  .summary-note {
    margin-top: var(--space-12);
    font-size: var(--text-15);
    color: var(--color-text-secondary);
  }

  /* Chip keeps a hairline only (no fill) — enough to read as a distinct entry
     in the list without stacking a bordered box on top of the summary panel. */
  .summary-chip {
    border-radius: var(--radius-6);
    border: 1px solid var(--color-hairline);
    padding: var(--space-4) var(--space-12);
    font-size: var(--text-13);
    color: var(--color-text);
  }

  /* Same overflow signal as the matrix cell: a chosen line can still be over
     capacity (single item wider than the container), and its score of 0 must
     not read as a clean fit here either. */
  .summary-chip--overflow {
    border-color: var(--color-overflow);
    color: var(--color-overflow);
  }

  /* Same disqualification meaning as the matrix's infinity glyph — full opacity. */
  .summary-chip-inf {
    margin-left: var(--space-4);
    color: var(--color-overflow);
  }

  .summary-total {
    font-weight: 600;
    color: var(--color-text);
  }

  .summary-total-overflow-note {
    font-weight: 400;
    color: var(--color-overflow);
  }
</style>
