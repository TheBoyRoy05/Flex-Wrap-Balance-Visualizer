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

  // Columns are the true item indices 1..n — every end from 1 to n is a genuine
  // column, never renumbered, so a cell always matches the item axis it's drawn
  // against.
  const cols = $derived(Array.from({ length: n }, (_, i) => i + 1)); // end: 1..n

  const { len, bestEnd } = $derived(balanceState.result);

  // The largest `end` genuinely considered for each `start` — the DP never looks
  // past this, because a line stretching further has already overflowed. A cell
  // beyond it has score 0 by the algorithm's definition (overflow, not "cheap"),
  // so it must never be compared against real totals.
  const fittingEnd = $derived(lastFittingEnd(balanceState.sizes, balanceState.capacity, balanceState.gap));

  function isEligible(start: number, end: number): boolean {
    return end > start && end <= fittingEnd[start];
  }

  // Structurally impossible: a line cannot end before or at the point it starts.
  // True independent of the algorithm's progress or of capacity — this is a fact
  // about (start, end) as coordinates, never about what's been computed yet, so
  // it must read as permanently inapplicable rather than "not yet filled".
  function isVoid(start: number, end: number): boolean {
    return end <= start;
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

  // bestEnd[start] is, by definition, the end that achieves minScores[start] —
  // the row's minimum total. True for every row, whether or not that row lies
  // on the final path. This is the structural fact the legend was missing.
  function isRowMinimum(start: number, end: number): boolean {
    return bestEnd[start] === end;
  }

  // --- Cell-by-cell fill animation state ---------------------------------
  // Everything below is derived from `balanceState.cellEvents` sliced at the
  // current step — never mutated by hand, never written to from an $effect.
  // The revealed set and the live memo are both pure functions of "which prefix
  // of the event list has fired", exactly the shape $derived is for: recompute
  // the whole picture from the events-so-far, never patch it incrementally.
  const events = $derived(balanceState.cellEvents);
  const cellStep = $derived(balanceState.clampedCellStep);

  // Cells the backward traceback has actually walked as of this step — never the
  // full static path. Phase two (traceback events) runs strictly after every
  // evaluate/settle event, so this set is empty throughout the whole forward
  // fill: nothing may read as "chosen" before the walk that chooses it has run.
  const chosenCellsAtStep: Set<string> = $derived.by(() => {
    const cells = new Set<string>();
    for (let i = 0; i <= cellStep; i++) {
      const ev = events[i];
      if (ev?.kind === 'traceback') cells.add(`${ev.start},${ev.end}`);
    }
    return cells;
  });

  function isChosen(start: number, end: number): boolean {
    return chosenCellsAtStep.has(`${start},${end}`);
  }


  interface RevealedCell {
    lineScore: number;
    memoIndex: number;
    memoValue: number;
    total: number;
  }

  // revealedCells[start][end] once the evaluate event for that candidate has fired,
  // otherwise absent — this *is* "the matrix starts empty and fills one cell at a
  // time": before any events have fired the map is empty, so every cell renders blank.
  // A probe event (the single overflow test per row) also marks every end it implies
  // impossible as revealed in this same pass, at this same step index — one click
  // rules out the whole rest of the row, not one cell at a time.
  const revealedCells: Map<string, RevealedCell> = $derived.by(() => {
    const map = new Map<string, RevealedCell>();
    for (let i = 0; i <= cellStep; i++) {
      const ev = events[i];
      if (ev?.kind === 'evaluate') {
        map.set(`${ev.start},${ev.end}`, {
          lineScore: ev.lineScore,
          memoIndex: ev.memoIndex,
          memoValue: ev.memoValue,
          total: ev.total,
        });
        if (ev.isProbe) {
          for (const impliedEnd of ev.impliedEnds ?? []) {
            map.set(`${ev.start},${impliedEnd}`, {
              lineScore: ev.lineScore,
              memoIndex: ev.memoIndex,
              memoValue: ev.memoValue,
              total: ev.total,
            });
          }
        }
      }
    }
    return map;
  });

  // Live memo, rebuilt from the settle events seen so far. `null` means "not
  // computed yet" — genuinely unknown, not a sentinel value — for every index
  // except n (the base case: best total for everything after the last item is
  // 0, the one fact that makes the first row computable at all, so it's known
  // before any event fires). Each settle event flips exactly one more entry
  // from null to its real number; nothing is ever shown as Infinity here,
  // because the viewer has no way to tell "shown Infinity" from "not yet run"
  // apart — the whole point is that blank *is* the "not yet run" signal.
  const liveMemo: (number | null)[] = $derived.by(() => {
    const memo = new Array<number | null>(n + 1).fill(null);
    memo[n] = 0;
    for (let i = 0; i <= cellStep; i++) {
      const ev = events[i];
      if (ev?.kind === 'settle') memo[ev.start] = ev.settledValue;
    }
    return memo;
  });

  // Live "settles at" column: null (blank) until that row's own settle event
  // fires — same reasoning as liveMemo above, and in fact the same numbers:
  // this column read row-wise and the memo row read column-wise are one array.
  const liveSettled: (number | null)[] = $derived.by(() => {
    const settled = new Array<number | null>(n).fill(null);
    for (let i = 0; i <= cellStep; i++) {
      const ev = events[i];
      if (ev?.kind === 'settle') settled[ev.start] = ev.settledValue;
    }
    return settled;
  });

  // The single event this step reveals, so a just-settled row/memo entry can get
  // a moment of distinct emphasis (the settle instant the task calls out as the
  // point: the same number landing in both the settles-at column and the memo row).
  const currentEvent = $derived(cellStep >= 0 ? events[cellStep] : undefined);

  function isRevealed(start: number, end: number): boolean {
    return revealedCells.has(`${start},${end}`);
  }

  function revealed(start: number, end: number): RevealedCell | undefined {
    return revealedCells.get(`${start},${end}`);
  }

  function isReadingMemo(index: number): boolean {
    return currentEvent?.kind === 'evaluate' && currentEvent.memoIndex === index;
  }

  // True only for the exact candidate cell the current step is evaluating right
  // now — distinct from `isReadingMemo`, which marks the memo entry being read,
  // not the cell doing the reading. Both light up together on an evaluate step:
  // the dependency (memo entry) and the dependent (this cell) are visibly linked.
  function isCurrentCandidate(start: number, end: number): boolean {
    return currentEvent?.kind === 'evaluate' && currentEvent.start === start && currentEvent.end === end;
  }

  // The one cell actually tested this step, when this step is a probe — the
  // candidate whose overflow the algorithm discovered. Distinct from the cells
  // merely implied by it (isProbeConsequence below): same red infinity, but this
  // is the discovery, not a consequence of it.
  function isProbeDiscovery(start: number, end: number): boolean {
    return currentEvent?.kind === 'evaluate' && !!currentEvent.isProbe && currentEvent.start === start && currentEvent.end === end;
  }

  // Every cell this step's probe rules out without testing it directly — the rest
  // of the row, ruled impossible in the same step as the one test that found the
  // first overflow. Quietly distinguished from the tested cell itself via weight/
  // opacity, not a new color: both are still "overflow", just discovered differently.
  function isProbeConsequence(start: number, end: number): boolean {
    return currentEvent?.kind === 'evaluate' && !!currentEvent.isProbe && currentEvent.start === start
      && (currentEvent.impliedEnds ?? []).includes(end);
  }

  function justSettledMemo(index: number): boolean {
    return currentEvent?.kind === 'settle' && currentEvent.start === index;
  }

  // Formats a value already known to be a real, settled number — liveMemo/liveSettled
  // entries are only ever passed here after their own null-check in the template, and
  // cell.memoValue is always a settled minScores entry by construction (see
  // CellEvaluateEvent above). No null/Infinity branch: neither can reach this function.
  function fmtLive(v: number): string {
    return String(v);
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
      Chosen
    </span>
    <span class="legend-item">
      <span class="legend-swatch legend-swatch--rowmin"></span>
      row min
    </span>
    <span class="legend-item">
      <span class="legend-swatch legend-swatch--void"></span>
      out of range
    </span>
    <span class="legend-item">
      <span class="legend-mark legend-mark--overflow">&infin;</span>
      overflows
    </span>
    <span class="legend-item legend-item--key" aria-label="cell total equals free squared plus minScore at end">
      <code class="legend-key-code">total = free² + minScore[end]</code>
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
          <th class="matrix-head matrix-head--settled"><code>minScore</code></th>
        </tr>
        <tr>
          <th class="matrix-corner matrix-corner--sub tnum"><code>minScore</code></th>
          {#each cols as end (end)}
            {@const memoJustSettled = justSettledMemo(end)}
            {@const memoReading = isReadingMemo(end)}
            {@const memoVal = liveMemo[end]}
            <th
              class={['matrix-minscore', 'tnum', memoJustSettled && 'matrix-minscore--justsettled', memoReading && 'matrix-minscore--reading']}
            >
              {#if memoVal != null}
                {fmtLive(memoVal)}
              {/if}
            </th>
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
              {@const voidCell = isVoid(start, end)}
              {@const cell = revealed(start, end)}
              {@const shown = isRevealed(start, end)}
              {@const rowMin = shown && eligible && isRowMinimum(start, end)}
              {@const chosen = shown && eligible && isChosen(start, end)}
              {@const current = isCurrentCandidate(start, end)}
              {@const probeDiscovery = isProbeDiscovery(start, end)}
              {@const probeConsequence = isProbeConsequence(start, end)}
              <td
                class={[
                  'matrix-cell',
                  shown && overflow && 'matrix-cell--overflow',
                  rowMin && 'matrix-cell--rowmin',
                  chosen && 'matrix-cell--chosen',
                  current && 'matrix-cell--current',
                  probeDiscovery && 'matrix-cell--probe-discovery',
                  probeConsequence && 'matrix-cell--probe-consequence',
                ]}
              >
                {#if shown && cell}
                  {#if overflow}
                    <div class="matrix-cell-inf-solo" title="overflow: length exceeds capacity">&infin;</div>
                  {:else}
                    <div class="matrix-cell-total tnum">
                      {cell.total}
                    </div>
                    <div class="matrix-cell-breakdown tnum">
                      <span>{cell.lineScore}</span>
                      +
                      <span>{fmtLive(cell.memoValue)}</span>
                    </div>
                  {/if}
                {:else if !voidCell}
                  <div class="matrix-cell-placeholder">
                    <span class="matrix-cell-placeholder-line"></span>
                    <span class="matrix-cell-placeholder-line"></span>
                  </div>
                {:else}
                  <div class="matrix-cell-void" aria-hidden="true">
                    <svg class="void-diagonal" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                      <line x1="0" y1="0" x2="100" y2="100" />
                      <line x1="100" y1="0" x2="0" y2="100" />
                    </svg>
                  </div>
                {/if}
              </td>
            {/each}
            <td
              class={['matrix-cell', 'matrix-cell--settled', 'tnum', justSettledMemo(start) && 'matrix-cell--justsettled']}
            >
              {#if liveSettled[start] != null}
                {fmtLive(liveSettled[start])}
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>


  {@render children?.()}
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

  /* Row minimum's real treatment, echoed in the legend: a white box using the
     primary text token for its border — deliberately not the accent (that's
     reserved for the chosen path, decided later by the traceback) and not the
     secondary-grey hairline (too close to the void/hairline treatment). Weight
     (1px, vs. the 1.5px accent ring below) as well as color separates the two
     states, so a row minimum off the chosen path never reads as "picked". */
  .legend-swatch--rowmin {
    background: var(--color-surface);
    box-shadow: inset 0 0 0 1px var(--color-text);
  }

  /* Structurally void (end <= start): quiet neutral fill, no accent, no red — this
     is a fact about the coordinate grid itself, never about cost or overflow, so it
     must never borrow the overflow swatch's red tint. */
  .legend-swatch--void {
    background: var(--color-hairline);
    opacity: 0.4;
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

  /* One code element, one continuous string — overrides the global `code`
     chip (inline-flex, background, padding) so the whole expression reads as
     a single line of monospace, not an assembled row of boxed pieces. The
     free² term uses U+00B2 SUPERSCRIPT TWO so the exponent survives as plain
     text inside <code> rather than needing its own <sup> or MathML box. */
  .legend-key-code {
    display: inline;
    padding: 0;
    border-radius: 0;
    background: none;
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
    /* Fixed layout: column widths come only from the explicit `width` values
       below, never grown by content. `min-width` alone doesn't do this — the
       browser's auto layout still widens a column past its min-width once a
       cell's content demands more room, which is exactly the jitter a
       cell-by-cell fill animation must not have (a column sized for "4" at
       reset must stay that width once it holds "6400 + 900"). */
    table-layout: fixed;
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
    /* 96px, composed from tokens (64 + 32) — wide enough for "best from here"
       in the sub-header row without introducing an off-scale literal. */
    width: calc(var(--space-64) + var(--space-32));
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
    /* Fixed column width (96px, composed from tokens 64+32) reserved for the
       widest content a data column will ever hold once fully revealed — a
       "line² + rest" breakdown line such as "6400 + 7300" — so `table-layout:
       fixed` never has to grow a column mid-run. */
    width: calc(var(--space-64) + var(--space-32));
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
    width: calc(var(--space-64) + var(--space-32));
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
    /* Reserved space for the two-line total+breakdown content (see
       .matrix-cell-total / .matrix-cell-breakdown below), so a cell claims the
       same box whether it's still blank or has just been revealed — filling in
       one cell at a time must not resize or reflow the table around it. The
       cell's own top/bottom padding (space-8 each) is added on top of the two
       content lines: `height` on a table cell is a floor the browser will
       still grow past if the padded content needs more room than the box
       declares, so the box has to declare the padded total up front, not just
       the inner content height.

       This alone isn't sufficient: table-layout: fixed fixes column *width*,
       not row *height*, and a td's height is a floor the row can still grow
       past. The real culprit was two separately-laid-out lines
       (.matrix-cell-total, .matrix-cell-breakdown) each rounding their own
       line-box to a whole device pixel; summed, two independent roundings can
       land above the one continuously-computed `calc()` value below by a
       device pixel or more, and a row grows to fit its tallest cell. Fixing
       each line's own `height` (not just line-height) to an exact half-share
       of this cell's reserved content height forces the browser through the
       identical box math whether that line is empty or holds text — the
       placeholder below reserves two such lines too, so nothing here can ever
       measure taller than what the empty state already claims. */
    height: calc(var(--text-13) * var(--lh-body) * 2 + var(--space-8) * 2);
    transition: background-color 200ms ease-out, box-shadow 200ms ease-out;
  }

  /* Blank reserved space for a not-yet-revealed cell — two invisible lines of
     the exact height .matrix-cell-total/.matrix-cell-breakdown occupy once
     filled, so the empty state goes through the same two-line box math as the
     filled one instead of collapsing to a single shorter box that a filled
     sibling cell in the same row would then grow past. Content is absent
     (nothing rendered inside), only the geometry is shared. */
  .matrix-cell-placeholder {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
  }

  .matrix-cell-placeholder-line {
    height: calc(var(--text-13) * var(--lh-body));
  }

  /* Structurally void cell (end <= start): same reserved box as any other body
     cell, so it never perturbs row height either — see .matrix-cell-void below
     for its visual treatment. */
  .matrix-cell-void {
    width: 100%;
    height: 100%;
  }

  /* The step currently being evaluated: a quiet outline, not a fill, so it
     reads as "in progress" rather than competing with the settled rowmin/chosen
     rings. Kept subtle per the no-bounce/no-glow constraint — a static ring,
     no animation. */
  .matrix-cell--current {
    box-shadow: inset 0 0 0 1px var(--color-accent);
  }

  /* The one candidate a probe step actually tests: full-weight overflow ring, so it
     reads as "discovered here" against the fainter consequence cells beside it —
     weight/opacity carries the distinction, no third color. */
  .matrix-cell--probe-discovery {
    box-shadow: inset 0 0 0 1.5px var(--color-overflow);
  }

  /* Every cell a probe rules out without testing directly: same overflow red as the
     discovery cell, but dimmed — a quiet way to say "implied, not tested" without a
     new hue. Both still show only the infinity glyph, never a total. */
  .matrix-cell--probe-consequence {
    opacity: 0.6;
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
    height: calc(var(--text-13) * var(--lh-body));
    line-height: var(--lh-body);
    font-size: var(--text-13);
    white-space: nowrap;
  }

  .matrix-cell-breakdown {
    height: calc(var(--text-13) * var(--lh-body));
    font-size: var(--text-13);
    line-height: var(--lh-body);
    color: var(--color-text-secondary);
    opacity: 0.7;
    white-space: nowrap;
  }

  /* Structurally void cell (end <= start): same reserved box as any other body
     cell, so it never perturbs row height either. Two hairline diagonals cross
     corner to corner — the conventional not-applicable table treatment — drawn
     the same way as the corner header's single diagonal: an inline SVG line per
     stroke, `preserveAspectRatio="none"` so it always lands on the cell's real
     corners regardless of size, `vector-effect: non-scaling-stroke` so the 1px
     weight matches every other hairline rule on the table rather than scaling
     with the cell's box. No fill, no accent, no red: this is a fact about the
     coordinate grid itself, distinct from a blank not-yet-computed cell (which
     has no lines at all) and from overflow (which is red). */
  .matrix-cell-void {
    position: relative;
    width: 100%;
    height: 100%;
  }

  .void-diagonal {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }

  .void-diagonal line {
    stroke: var(--color-hairline);
    stroke-width: 1px;
    vector-effect: non-scaling-stroke;
  }

  /* Overflow: this line exists but its length exceeds capacity, so the DP scores
     it as infinite cost (when it's not eligible) or a waived 0 (when it is, as
     with a lone over-capacity item) — either way, never taken as competitive.
     The red tint and standalone infinity glyph (.matrix-cell-inf-solo, in the
     revealed-cell markup above) make that cost literal, and only appear once
     this exact candidate has been evaluated — an out-of-range candidate's
     overflow is a fact the algorithm discovers at that step, never shown
     ahead of it. Full styling below, after --chosen, so it wins the cascade
     on cells that are both. */

  /* The instant a row settles: its own minScore and the memo entry at that same
     index become the same visible number at the same moment. A brief accent
     tint on both cells (no motion, no glow) is the only cue tying them together
     — subtle per the "no bounce/no glow" transition constraint. */
  .matrix-minscore--justsettled,
  .matrix-cell--justsettled {
    background: var(--color-accent-tint);
    color: var(--color-accent);
    font-weight: 600;
  }

  /* The memo entry the current evaluate step is reading from — a quiet ring,
     matching .matrix-cell--current's treatment of the cell doing the reading,
     so the dependency between the two reads as one visual relationship. */
  .matrix-minscore--reading {
    box-shadow: inset 0 0 0 1px var(--color-accent);
    color: var(--color-accent);
  }

  /* Row minimum: a structural fact true of every row, settled by the forward
     fill alone — this ring must never depend on whether the traceback has run.
     White box, primary-text-token border: distinct from the accent (reserved
     for the chosen path, decided later) and from the secondary-grey hairline
     (too close to the void treatment). 1px weight keeps it subordinate to the
     1.5px accent ring below once a row minimum also becomes chosen; a row
     minimum off the chosen path (row 1 at the default input) stays this way
     forever, never upgraded. */
  .matrix-cell--rowmin {
    box-shadow: inset 0 0 0 1px var(--color-text);
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

  /* Overflowing candidate: the infinity glyph stands alone, with no total number
     and no lineScore+memoValue breakdown next to it — a 0 total next to the mark
     would read as "its real score", inviting the reader to think it should have
     won, when the line is actually disqualified. Centered in the same reserved
     two-line box every other revealed cell fills, so geometry never shifts.
     Full opacity: same disqualification meaning as every other overflow mark on
     this page, and only ever rendered once this candidate has been revealed
     (shown && cell, same as the eligible branch) — never ahead of its step. */
  .matrix-cell-inf-solo {
    display: flex;
    align-items: center;
    justify-content: center;
    height: calc(var(--text-13) * var(--lh-body) * 2);
    font-size: var(--text-15);
    color: var(--color-overflow);
  }
</style>
