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
  // the row's minimum total, known only once the whole row has been scanned.
  // Used solely to cross-check the running mark below at settle time; the
  // rendered white box itself must never read this array directly (see
  // runningBestEndAtStep), or it would show the winner before the scan that
  // decides it has finished.
  function isRowMinimum(start: number, end: number): boolean {
    return bestEnd[start] === end;
  }

  // The running best-so-far, replaying the DP's own scan one revealed candidate
  // at a time — never derived from bestEnd. Only non-probe evaluate events
  // compete (a probe candidate overflows and is disqualified on arrival, so it
  // can never take the title, matching isEligible/isOverflow above). Comparison
  // is `<=`, mirroring the `<=` in balance.ts's own DP loop exactly: a later
  // candidate that only ties the incumbent still takes over, which is the
  // documented tie-break favoring the last end achieving the minimum. A row
  // with no revealed candidate yet has no entry, so it shows no box at all.
  const runningBestEndAtStep: Map<number, number> = $derived.by(() => {
    const bestEndSoFar = new Map<number, number>();
    const bestTotalSoFar = new Map<number, number>();
    for (let i = 0; i <= cellStep; i++) {
      const ev = events[i];
      if (ev?.kind !== 'evaluate' || ev.isProbe) continue;
      const incumbent = bestTotalSoFar.get(ev.start);
      if (incumbent === undefined || ev.total <= incumbent) {
        bestTotalSoFar.set(ev.start, ev.total);
        bestEndSoFar.set(ev.start, ev.end);
      }
    }
    return bestEndSoFar;
  });

  function isRunningBest(start: number, end: number): boolean {
    return runningBestEndAtStep.get(start) === end;
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

  // Consistency guard, not a rendering concern: at the exact step a row settles,
  // the running mark's current end for that row must equal bestEnd[start] — the
  // DP's own answer. This is a genuine side effect (a console assertion against
  // the outside world), never a derived value, so it belongs in $effect rather
  // than in one of the $derived.by blocks above. A mismatch means the `<=` replay
  // above has drifted from balance.ts's own comparison, which is a bug to surface
  // loudly, not swallow.
  //
  // The `bestEnd[start]` column renders this exact same `runningBestEndAtStep`
  // value (see the template), so this one check already covers both the white
  // row-minimum mark and the column: there's no second read of `bestEnd` to
  // duplicate the assertion for, and no way for the column to diverge from the
  // mark without also tripping this same error.
  $effect(() => {
    const ev = currentEvent;
    if (ev?.kind !== 'settle') return;
    const runningEnd = runningBestEndAtStep.get(ev.start);
    if (runningEnd !== bestEnd[ev.start]) {
      console.error(
        `[ScoreMatrix] running best-so-far mark (and bestEnd[start] column) diverged from bestEnd at settle: ` +
          `start=${ev.start} runningEnd=${runningEnd} bestEnd=${bestEnd[ev.start]}`,
      );
    }
  });

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

  // --- Layout: one table (index column + candidates) plus a flex summary --
  // The matrix is now one <table> (row index column, merged back in as its
  // first column, plus every candidate column) and a separate flex block for
  // the two summary fields (minScore[start], bestEnd[start]), sitting outside
  // the scroll container. Only the candidate columns scroll; the index column
  // is `position: sticky; left: 0` within that same scrolling element, and the
  // summary flex block is a sibling, never inside the scroller at all.
  //
  // The risk this design takes on is that the table and the flex block resolve
  // their row heights independently — nothing forces them to agree by
  // construction the way two rows of one <tr> would. `--row-h` is that
  // agreement made explicit: computed once, from the exact two-line content
  // box the candidate cells already reserved, and applied as the same fixed
  // row height to the table's body rows and the flex block's rows alike.
  //
  // The `+ 1px` term is a table-cell-specific correction, not part of the
  // content box itself: a `<td>`'s `height` is a minimum content-box target
  // (CSS2 §17.5.3), and — unlike an ordinary block element under the
  // page-wide `box-sizing: border-box` — a table cell's own `border-top`
  // renders in addition to that target rather than being carved out of it.
  // Measured empirically: a `<tr>` given `height: calc(2-line content + 2×
  // padding)` rendered 1px *taller* than that value once its cells' 1px
  // border-top was accounted for, because the border added on top instead of
  // sharing the box. `.matrix-summary-cell` is an ordinary flex `div` with
  // real `box-sizing: border-box`, where a `border-top` *is* carved out of a
  // declared `height` — so matching the *table's actual rendered row height*
  // (content + padding + border) is what this constant restores, not a
  // guess: leaving it off reproduced a steady 1px-per-row drift between the
  // table and the flex block that compounded across every row.
  const rowHeight = `calc(var(--text-13) * var(--lh-body) * 2 + var(--space-8) * 2 + 1px)`;
  const headRowOneHeight = 'var(--space-48)';
  // Row 2's content (each column's live memo value) needs more than a bare
  // `--space-24` to render without the row growing past its own declared
  // height — a memo digit at `--text-13` inside `.matrix-minscore`'s own
  // `--space-8` padding needs slightly more than 24px. The summary flex
  // block's own row 2 is deliberately empty (its field is already labelled
  // once, in row 1), so it must still reserve this same height explicitly —
  // otherwise it would sit at the bare default while the table's real content
  // grows its row past it, and the two blocks would resolve different header
  // heights only by accident. `--space-24 + --space-12` reserves enough for
  // the tallest real content (the memo digit) with no slack to spare, applied
  // as an explicit `height` on every row-2 header cell in the table and on the
  // flex block's own second header row (see the template).
  const headRowTwoHeight = 'calc(var(--space-24) + var(--space-12))';

  // The scroll container's candidate columns must each hold at least one
  // fifth of the *candidate* space — the part of the container's width left
  // over once the sticky index column's own width is set aside, since that
  // column is a row header, not a candidate, and must not be counted toward
  // the "five columns fill it" budget. This is a fact about the container's
  // live rendered size, not a fixed pixel guess, so it has to be measured
  // from the DOM rather than assumed in a stylesheet. This is the same
  // $state-at-the-DOM-boundary reasoning `canScrollRight` below uses: Svelte
  // has no way to know a container's own box size except by asking it.
  //
  // Measured from `.matrix-panel` (this component's own root), not from the
  // scroll element's own `clientWidth` — the scroll element's width is
  // downstream of the table's `min-width`, which is itself built from this
  // same measurement. Reading clientWidth back from that element closes a
  // feedback loop: a first measurement of 0 would floor candidateMinWidth at
  // 0, then a later real measurement would need a fresh layout pass to
  // notice the table's own min-width no longer matches — a self-referential
  // loop that a naive fix (floor the minimum at some legibility constant)
  // breaks the wrong direction: any floor above the true 1/5 forces a
  // scrollbar at exactly five columns, which the task states must never
  // happen. `.matrix-panel`'s own width has no such dependency: it's sized by
  // its parent, never by the table's min-width, so subtracting the summary
  // block's and the index column's real rendered widths from it gives the
  // true available candidate space with no circularity.
  let panelEl: HTMLDivElement | undefined = $state();
  let summaryEl: HTMLDivElement | undefined = $state();
  let indexColEl: HTMLTableCellElement | undefined = $state();
  let middleScrollEl: HTMLDivElement | undefined = $state();
  let middleRegionWidth = $state(0);
  // The sticky index column's own rendered width — needed again below when
  // setting the table's total min-width. `table-layout: fixed` divides
  // whatever total width the table is given across *every* column, index
  // column included, proportional to each column's own width/min-width; if
  // the table's min-width budget only covered `n * candidateMinWidth` (the
  // candidate columns' own floor), the index column's fixed 152px would still
  // be carved out of that same total, so each candidate column would resolve
  // to `n * candidateMinWidth / (n + indexColShare)` — always short of the
  // floor once the table actually overflows and fixed-layout math kicks in.
  // Reserving the index column's real width in the table's own min-width (see
  // the template) fixes this at the source instead of fighting fixed-layout's
  // per-column distribution after the fact.
  let indexColWidth = $state(0);

  // One fifth of the candidate space's measured width — the task's own floor —
  // except where that would clip a decomposition ("10000 + 10800"), which the
  // task states must never happen. The two constraints conflict at narrow
  // viewports: at 1440px, one fifth of the candidate space is comfortably wider
  // than any decomposition this table renders, so the 1/5 rule is what
  // decides the floor and five columns fill with no scrollbar, exactly as
  // specified. Below roughly 768px, one fifth of a much narrower space
  // shrinks under what a decomposition needs, and clipping a number is the
  // more serious failure of the two — a truncated number reads as a
  // different, wrong number, where an early scrollbar is just a
  // scrollbar — so `decompositionFloorWidth` (measured live from the actual
  // rendered decomposition text, see below, not a constant borrowed from a
  // different scenario) wins once it exceeds the 1/5 share. A floor sized
  // from a fixed guess was tried and rejected: 140px (a figure measured
  // against a *different*, larger-number run) forced a scrollbar at exactly
  // five columns even at 1440px for this app's smaller-number default
  // scenario — the opposite of what the task requires there. Measuring the
  // real content instead means the floor tracks whatever numbers the current
  // sizes/capacity/gap inputs actually produce, never a number from an
  // unrelated scenario. Below the width this floor needs, the candidate
  // space no longer fits five columns and starts scrolling sooner than five
  // columns' worth — an explicit, verified tradeoff for narrow viewports, not
  // a silent one.
  let decompositionFloorWidth = $state(0);
  const candidateMinWidth = $derived(Math.max(middleRegionWidth / 5, decompositionFloorWidth));

  // The widest decomposition text ("lineScore + memoValue") this run will ever
  // reveal, computed from the full score/minScores matrices — not from
  // whichever cells the animation has revealed *so far*. Using only the
  // revealed-so-far text would let the floor grow mid-run as later, wider
  // numbers appear, which would resize the column (and therefore the table)
  // partway through the fill — exactly the reflow the task requires *not* to
  // happen between the empty and filled states. Every eligible, non-overflowing
  // (start, end) pair's total is known up front from `balanceState.result`
  // regardless of playback step, so the widest string is a fact about the
  // current sizes/capacity/gap inputs, never about how far the stepper has
  // gotten.
  const widestDecompositionText = $derived.by(() => {
    let widest = '';
    const { score, minScores } = balanceState.result;
    for (let start = 0; start < n; start++) {
      for (let end = start + 1; end <= fittingEnd[start]; end++) {
        if (isOverflowingLine(len, start, end, balanceState.capacity)) continue;
        const lineScore = score[start][end];
        const memoValue = minScores[end];
        if (lineScore == null || memoValue == null) continue;
        const text = `${lineScore} + ${memoValue}`;
        if (text.length > widest.length) widest = text;
      }
    }
    return widest;
  });

  // `canScrollRight` is genuine runtime state, not a derived value: it depends
  // on the scroll container's own layout (does its content overflow, and if so,
  // how far has the reader already scrolled), which Svelte has no way to
  // observe except by asking the DOM directly.
  let canScrollRight = $state(false);

  // Offscreen probe element, styled identically to `.matrix-cell-breakdown`
  // (same font/size/tabular-nums — see the template, `class="tnum"` on the
  // probe and `font-size: var(--text-13)` in its style block below), used
  // purely to ask the browser how wide `widestDecompositionText` actually
  // renders. Measuring the real string in the real font/size is the only way
  // to get an exact answer; a canvas-based estimate would still need the
  // exact computed font shorthand duplicated from CSS, and would drift the
  // moment either copy changed independently of the other.
  let probeEl: HTMLDivElement | undefined = $state();

  $effect(() => {
    if (!probeEl) return;
    // Padding matches `.matrix-cell`'s own space-12 each side, so the
    // measured width already includes the padding the real cell reserves —
    // `decompositionFloorWidth` below is then a direct column-width floor,
    // not a bare text width the caller has to remember to pad separately.
    decompositionFloorWidth = probeEl.getBoundingClientRect().width;
  });

  function updateMiddleWidth() {
    if (!panelEl || !summaryEl || !indexColEl) return;
    indexColWidth = indexColEl.getBoundingClientRect().width;
    middleRegionWidth = panelEl.clientWidth - summaryEl.getBoundingClientRect().width - indexColWidth;
  }

  function updateScrollAffordance() {
    if (!middleScrollEl) return;
    // 1px slack: some browsers report a fractional scrollWidth/clientWidth
    // mismatch even at the true scrolled-to-end position.
    canScrollRight = middleScrollEl.scrollWidth - middleScrollEl.scrollLeft - middleScrollEl.clientWidth > 1;
  }

  // Re-measure whenever the region's content could have changed the overflow:
  // on mount, on every scroll, and whenever the item count changes the number
  // of candidate columns (n is read here only to retrigger the effect — the
  // actual measurement always comes from the live DOM box, never from a
  // computed guess at column count × column width). A ResizeObserver on the
  // outer row also covers the viewport-resize case (768px/375px breakpoints),
  // since the region's own width changes there without any Svelte state
  // changing on its own to retrigger this effect.
  $effect(() => {
    n;
    updateMiddleWidth();
    updateScrollAffordance();
  });

  $effect(() => {
    if (!panelEl) return;
    const observer = new ResizeObserver(() => {
      updateMiddleWidth();
      updateScrollAffordance();
    });
    observer.observe(panelEl);
    return () => observer.disconnect();
  });
</script>



<div class="matrix-panel">
  <div class="legend">
    <span class="legend-item">
      <span class="legend-swatch legend-swatch--rowmin"></span>
      Row Minimum
    </span>
    <span class="legend-item">
      <span class="legend-swatch legend-swatch--chosen"></span>
      Best Breakpoints
    </span>
    <span class="legend-item">
      <span class="legend-mark legend-mark--overflow">&infin;</span>
      Overflows
    </span>
    <span class="legend-item legend-item--key" aria-label="cell total equals free squared plus minScore at end">
      <code class="legend-key-code">total = free² + minScore[end]</code>
    </span>
  </div>

  <div class="matrix-width-probe tnum" aria-hidden="true" bind:this={probeEl}>{widestDecompositionText}</div>

  <div class="matrix-panel-body" bind:this={panelEl} style={`--row-h: ${rowHeight}`}>
    <!-- SCROLL: the one scrollable element. Row index column (sticky left),
         end headers, minScore[end] memo values, and every candidate cell —
         one table again, so a candidate cell shares its <tr> with the start
         index that labels it. Candidate columns floor at one fifth of the
         candidate space's own measured width (candidateMinWidth), so five
         columns exactly fill it and a sixth begins to overflow, at which
         point .matrix-scroll takes over from table-layout: fixed dividing
         the space evenly. -->
    <div
      class="matrix-scroll"
      class:matrix-scroll--overflowing={canScrollRight}
      bind:this={middleScrollEl}
      onscroll={updateScrollAffordance}
    >
      <table
        class="matrix-table matrix-middle"
        style={`--candidate-min-w: ${candidateMinWidth}px; min-width: calc(${indexColWidth}px + ${n} * ${candidateMinWidth}px)`}
      >
        <thead>
          <tr style={`height: ${headRowOneHeight}`}>
            <th
              class="matrix-corner matrix-corner--split matrix-sticky-col"
              bind:this={indexColEl}
              style={`height: ${headRowOneHeight}`}
            >
              <span class="corner-axes">start \ end</span>
            </th>
            {#each cols as end (end)}
              <th class="matrix-head tnum" style={`height: ${headRowOneHeight}`}>{end}</th>
            {/each}
          </tr>
          <tr style={`height: ${headRowTwoHeight}`}>
            <th class="matrix-corner--sub matrix-sticky-col tnum" style={`height: ${headRowTwoHeight}`}><code>minScore[end]</code></th>
            {#each cols as end (end)}
              {@const memoJustSettled = justSettledMemo(end)}
              {@const memoReading = isReadingMemo(end)}
              {@const memoVal = liveMemo[end]}
              <th
                class={['matrix-minscore', 'tnum', memoJustSettled && 'matrix-minscore--justsettled', memoReading && 'matrix-minscore--reading']}
                style={`height: ${headRowTwoHeight}`}
              >
                {#if memoVal != null}
                  {fmtLive(memoVal)}
                {/if}
              </th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each rows as start (start)}
            <tr class:matrix-row--active={start === activeStart} style={`height: var(--row-h)`}>
              <th class="matrix-row-head matrix-sticky-col tnum" scope="row">{start}</th>
              {#each cols as end (end)}
                {@const eligible = isEligible(start, end)}
                {@const overflow = isOverflow(start, end)}
                {@const voidCell = isVoid(start, end)}
                {@const cell = revealed(start, end)}
                {@const shown = isRevealed(start, end)}
                {@const rowMin = shown && eligible && isRunningBest(start, end)}
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
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <!-- SUMMARY: fixed width, never scrolls, not a table — minScore[start] and
         bestEnd[start] are two plain per-row values, so a flex column per
         field (rather than a flex row per record) is the shape used here: it
         keeps each field's own header directly above its own column of
         values, matching how the scrolling table reads (one header row,
         then a value per record below it), and needs no per-row wrapper
         element the flex-row-per-record shape would otherwise add. -->
    <div class="matrix-summary" bind:this={summaryEl}>
      <div class="matrix-summary-col matrix-summary-col--settled">
        <div class="matrix-summary-head" style={`height: ${headRowOneHeight}`}><code>minScore[start]</code></div>
        <div class="matrix-summary-head matrix-summary-head--sub" style={`height: ${headRowTwoHeight}`}></div>
        {#each rows as start (start)}
          <div
            class={['matrix-summary-cell', 'tnum', justSettledMemo(start) && 'matrix-summary-cell--justsettled']}
            class:matrix-row--active={start === activeStart}
            style={`height: var(--row-h)`}
          >
            {#if liveSettled[start] != null}
              {fmtLive(liveSettled[start])}
            {/if}
          </div>
        {/each}
      </div>
      <div class="matrix-summary-col matrix-summary-col--bestend">
        <div class="matrix-summary-head" style={`height: ${headRowOneHeight}`}><code>bestEnd[start]</code></div>
        <div class="matrix-summary-head matrix-summary-head--sub" style={`height: ${headRowTwoHeight}`}></div>
        {#each rows as start (start)}
          {@const runningEnd = runningBestEndAtStep.get(start)}
          {@const bestEndChosen = runningEnd != null && isChosen(start, runningEnd)}
          <div
            class={[
              'matrix-summary-cell',
              'matrix-summary-cell--bestend',
              'tnum',
              justSettledMemo(start) && 'matrix-summary-cell--justsettled',
              bestEndChosen && 'matrix-summary-cell--bestend-chosen',
            ]}
            class:matrix-row--active={start === activeStart}
            style={`height: var(--row-h)`}
          >
            {#if runningEnd != null}
              {runningEnd}
            {/if}
          </div>
        {/each}
      </div>
    </div>
  </div>

  {@render children?.()}
</div>

<style>
  .matrix-panel {
    display: flex;
    flex-direction: column;
    gap: var(--space-16);
  }

  /* Offscreen measurement probe (see `probeEl` in the script) — never
     painted, positioned so it can never affect layout or be reached by
     assistive tech (both `aria-hidden` in the markup and taken out of flow
     here). `white-space: nowrap` matches `.matrix-cell-breakdown` (see
     below): the real cell never wraps its decomposition text either, so the
     probe's natural width is the same single-line width the real cell would
     need. Padding matches `.matrix-cell`'s own `space-12` each side, so the
     measured box already includes the padding a real column needs — see the
     script for why that makes `decompositionFloorWidth` usable directly as a
     column-width floor. */
  .matrix-width-probe {
    position: absolute;
    top: -9999px;
    left: -9999px;
    visibility: hidden;
    white-space: nowrap;
    padding: 0 var(--space-12);
    font-size: var(--text-13);
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

  /* The scroll container plus the fixed summary block, side by side. Only
     the scroll container (`.matrix-scroll`) actually scrolls; the summary
     block is a plain sibling with a fixed width, never inside it.
     `align-items: stretch` (the flex default) is what lets the table and the
     summary block stand at equal height as a row — nothing here needs an
     explicit height, only the shared --row-h both sides' rows are built from
     (see the template) keeps them level internally. One hairline frames the
     whole strip. */
  .matrix-panel-body {
    display: flex;
    align-items: stretch;
    border: 1px solid var(--color-hairline);
    border-radius: var(--radius-10);
    overflow: hidden;
  }

  .matrix-table {
    border-collapse: separate;
    border-spacing: 0;
    text-align: center;
    font-size: var(--text-13);
  }

  /* The one scrollable element. `overflow-x: auto` engages only once the
     table's own `min-width` (n candidate columns at their one-fifth floor,
     set inline from the measured candidate space — see candidateMinWidth in
     the script) exceeds this wrapper's width; below that the table's
     `width: 100%` lets table-layout: fixed share the leftover space evenly
     across whatever columns exist, so fewer than five columns never leaves a
     gap. `flex: 1 1 auto` with `min-width: 0` is what lets this element
     actually shrink below its content's natural width in the flex row — the
     default `min-width: auto` on a flex item would otherwise refuse to
     shrink past the table's own intrinsic width and defeat the whole
     scrolling mechanism. */
  .matrix-scroll {
    position: relative;
    flex: 1 1 auto;
    min-width: 0;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: none;
  }

  .matrix-scroll::-webkit-scrollbar {
    width: 0;
    height: 0;
  }

  .matrix-middle {
    width: 100%;
    table-layout: fixed;
  }

  /* Scroll affordance: a fade at the scroll container's own trailing edge, so
     a reader can tell there is more to the right without a sentence of
     prose. Shown only when `.matrix-scroll` carries `--overflowing` —
     toggled from `canScrollRight`, genuine runtime state set by measuring
     the DOM (see the script block), because "is there more content to the
     right of what's currently visible" is a fact about live scroll
     position, not something derivable from props alone. Hidden by default
     (`opacity: 0`), so it never appears when the content already fits and
     never lingers once scrolled all the way to the right edge. */
  /* Anchored on the summary block, NOT inside the scroller. Inside it, this
     pseudo-element sat in the scroll container's flow and added its own height
     to scrollHeight, so the matrix gained a vertical scrollbar and clipped
     half its own rows. Out here it cannot affect the scroller's content size
     at all, and it still lands exactly on the seam because the summary block
     begins where the scrolling area ends. */
  .matrix-scroll--overflowing + .matrix-summary::before {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    right: 100%;
    width: var(--space-24);
    pointer-events: none;
    background: linear-gradient(to right, transparent, var(--color-surface));
  }

  /* The sticky index column: corner, minScore[end] label, and every row's
     start index. `position: sticky; left: 0` keeps it visible while the
     candidate columns scroll underneath — this is the one sticky column, and
     it is sticky only to the left edge, never the right, which is where the
     earlier seam artifacts came from (a hairline bleeding through a pinned
     cell at the *trailing* edge, where a scrolling neighbour's own border sat
     directly beneath it under border-collapse). `border-collapse: separate`
     on `.matrix-table` (above) is what keeps that from happening here too: a
     neighbour's border can never paint into this column's box, because the
     two cells never share a collapsed edge to begin with. `background` is
     set explicitly to the same opaque surface color every other header/body
     cell uses (never inherited, never left to default to transparent) so a
     scrolling candidate cannot show through underneath while this column is
     pinned — including the corner cell and the minScore[end] label cell,
     both of which sit in this same column and got exactly this treatment. */
  .matrix-sticky-col {
    position: sticky;
    left: 0;
    z-index: 2;
    background: var(--color-surface);
  }

  /* RIGHT: fixed width, never scrolls. Two flex columns, minScore[start] and
     bestEnd[start] — plain per-row values, not a table, since neither field
     is more than one value per row and a table's row/column machinery has
     nothing to add over a flex column of same-height boxes. Each column's
     own width comes from the same tokens the old table columns used — see
     `.matrix-summary-head` below for why each needs the full label width
     rather than its narrower body content's width. */
  .matrix-summary {
    display: flex;
    flex: none;
    position: relative;
  }

  .matrix-summary-col {
    display: flex;
    flex-direction: column;
    /* minScore[start]/bestEnd[start]'s own fixed width. The header label,
       `minScore[start]`/`bestEnd[start]` inside a monospace `<code>` chip,
       measures ~150px including the chip's own padding — wider than either
       column's body content ever gets — and this header text cannot wrap
       (the two-row header is a fixed-height box, see `.matrix-summary-head`
       below; wrapping would grow it and violate the same "geometry never
       grows once set" invariant the body cells are built around). Widening
       the whole column to fit its own label (narrower below ~480px, where
       the label's own `<code>` element is hidden instead, see the
       visually-hidden rule further below) is the option that keeps that
       invariant intact without shrinking or wrapping the label. */
    width: calc(var(--space-64) + var(--space-64) + var(--space-24));
    border-left: 1px solid var(--color-hairline);
  }

  .matrix-summary-col--settled {
    border-left: none;
  }

  .matrix-summary-head {
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 500;
    font-size: var(--text-13);
    color: var(--color-text-secondary);
    background: var(--color-surface);
    padding: var(--space-8);
    border-bottom: 1px solid var(--color-hairline);
  }

  /* Row 2's header cell in each summary column stays blank/neutral —
     "minScore[start]"/"bestEnd[start]" already labels the column once, in
     row 1 above; repeating a value in both header rows of the same column
     would just be noise. Still reserves the same `headRowTwoHeight` the
     table's own row-2 `<th>` cells reserve (set inline from the script), so
     the two header rows agree on height without relying on content to make
     them agree by accident. */
  .matrix-summary-head--sub {
    border-bottom: 1px solid var(--color-hairline);
  }

  .matrix-corner,
  .matrix-head,
  .matrix-row-head,
  .matrix-minscore,
  .matrix-corner--sub {
    font-weight: 500;
    color: var(--color-text-secondary);
    background: var(--color-surface);
    padding: var(--space-8);
    /* Same reasoning as `.matrix-cell`'s own `vertical-align: middle` below:
       the header/row-head rows must not resolve to a different height from
       each cell's own baseline metrics — the flex summary block's rows are
       built from the same explicit `--row-h`/`headRowOneHeight`/
       `headRowTwoHeight` values, never from baseline math, so this table's
       own cells must not either, or the two would drift apart. */
    vertical-align: middle;
  }

  .matrix-corner {
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
     whatever the cell's width or height.

     This cell carries `.matrix-sticky-col` (`position: sticky`), and a `<th>`
     can only have one `position` value, so nothing here may set `relative`:
     it would win the cascade over `sticky` and silently un-pin this one cell
     while the rest of the column stayed put. */
  .matrix-corner--split {
    height: var(--space-48);
  }

  /* One label naming both axes, rather than a drawn diagonal with a label in
     each triangle. This cell is 152px wide and 48px tall, so a corner-to-corner
     diagonal is shallow enough that both labels sit at almost the same height,
     crowding the line they are supposed to be separated by. The backslash says
     the same thing in the space available. */
  .corner-axes {
    display: block;
    font-size: var(--text-13);
    font-weight: 500;
    color: var(--color-text-secondary);
    white-space: nowrap;
  }

  /* Row 2's own leading cell — the `minScore[end]` label. Opaque background
     (from the shared `.matrix-sticky-col` rule, applied via the class in the
     template) is what keeps it pinned and legible: a transparent version of
     this exact cell was the earlier bug — scrolling candidate values slid
     underneath it and the text collided, since the label had no opaque
     surface of its own to occupy. The label's subdued look comes from
     `color: var(--color-text-secondary)` (inherited from the shared
     .matrix-corner/.matrix-head/.matrix-row-head/.matrix-minscore rule
     above), no `opacity` shortcut — `opacity` would also fade this cell's
     background translucent and let a scrolled neighbour show through it,
     the same bug in a different form. */
  .matrix-corner--sub {
    font-size: var(--text-13);
    padding: var(--space-4) var(--space-8);
  }

  .matrix-head {
    z-index: 1;
    /* No `width` here, deliberately: under `table-layout: fixed`, a column
       with no declared `width` absorbs an equal share of whatever space is
       left over — that is the whole mechanism this column model relies on to
       make the candidate columns fill the candidate space exactly when there
       are fewer than five, with no per-column width computed from the item
       count in script. `min-width` is set inline from the measured candidate
       space (`--candidate-min-w`, one fifth of it — see candidateMinWidth in
       the script) rather than a fixed token here, since "one fifth of this
       space's own width" is a fact about live layout, not a constant.
       Reserved height (unaffected by this column's width) is still the floor
       for "line² + rest" content such as "6400 + 7300" — a column at or
       above its minimum width never has to grow mid-run, because nothing
       here shrinks the column below what that content needs once fixed
       layout has settled on a width. */
    min-width: var(--candidate-min-w);
    border-bottom: 1px solid var(--color-hairline);
  }

  .matrix-minscore {
    z-index: 1;
    font-size: var(--text-13);
    color: var(--color-text);
    border-bottom: 1px solid var(--color-hairline);
  }

  /* The sticky index column's own fixed width — sized to fit its own longest
     content without overflow, the same figure (152px, composed from tokens
     64 + 64 + 24) the summary columns use for the same reason: it's a
     measured fit for the `minScore[end]` label's `<code>` chip, the widest
     thing this column ever holds (wider than a two-digit row index, wider
     than "start"/"end"). Applies to every cell in the column — corner, label,
     and every row's index — so the column never resolves to different
     widths for different rows under `table-layout: fixed`. */
  .matrix-corner,
  .matrix-corner--sub,
  .matrix-row-head {
    width: calc(var(--space-64) + var(--space-64) + var(--space-24));
  }

  .matrix-row-head {
    border-right: 1px solid var(--color-hairline);
  }

  /* The row the stepper is currently deciding — ties the matrix to the stepper
     panel below it so the two read as one connected view, not two side by side.
     The summary block's own per-row div picks up this same class in the
     template (see `class:matrix-row--active` on `.matrix-summary-cell`), so
     the highlight stays coherent between the table and the flex block despite
     them being genuinely separate elements now. */
  .matrix-row--active .matrix-row-head {
    color: var(--color-accent);
  }

  .matrix-row--active .matrix-cell,
  .matrix-row--active.matrix-summary-cell {
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
    /* `middle`, not the table cell default of `baseline` — the table and the
       flex summary block each resolve their own row height independently
       (see the note on `--row-h` in the script), and a cell's baseline
       offset depends on its own content's font ascent/descent, which is not
       identical between a cell holding two stacked lines (a candidate's
       total+breakdown) and a flex row holding one centered line (the
       summary block's single value) even at the same font-size/line-height.
       Left at the default, that per-cell baseline math would add a
       different amount of extra space on each side, which is exactly the
       kind of drift `--row-h` is supposed to rule out. Forcing `middle` here
       removes baseline geometry from the row-height calculation entirely, so
       `--row-h` (an explicit `height` on every `<tr>` and every
       `.matrix-summary-cell`, see the template) is the only input either
       side's rows can grow from. */
    vertical-align: middle;
    /* Clip at this cell's own box, never past it. `--candidate-min-w` (set
       inline from the measured candidate space — see `candidateMinWidth` and
       `decompositionFloorWidth` in the script) never sits below the widest
       real decomposition text this run will render, so the two content lines
       below (.matrix-cell-total / .matrix-cell-breakdown)
       never need clipping of their own to fit inside this box — a clip on
       the text itself once cut a value like "14400 + 40" out of what was
       actually "14400 + 400", a truncated number that reads as a different,
       wrong one. Widening the floor instead of clipping the content is the
       fix; this box-level clip is now purely defensive, never a bound the
       arithmetic itself has to fit inside. */
    overflow: hidden;
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
       measure taller than what the empty state already claims.

       `--row-h` (declared once from the same shared formula, see the script)
       is set as an explicit height on every <tr> — this per-cell height
       stays as the floor that formula also describes, so the two can never
       disagree even though only the <tr> height is what actually keeps the
       table's rows level with the flex summary block's rows. */
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

  /* The summary block's own per-row cell — a flex box, not a table cell,
     since minScore[start]/bestEnd[start] are one value per row with no
     column/row-header machinery to gain from a <table>. Given the exact
     same box math as the candidate cells' two-line total+breakdown pair
     (height, vertical centering) rather than left to size itself from a
     raw text node's natural line-height, so this row can never disagree
     with the table's row for the same start index — the flex block and the
     table resolve their heights independently (see the note on `--row-h` in
     the script), and a bare text node's natural line box does not round to
     the exact same device-pixel height this explicit height does, even at
     identical font-size/line-height inputs. */
  .matrix-summary-cell {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-8) var(--space-12);
    color: var(--color-text);
    font-weight: 600;
    background: var(--color-surface);
    border-top: 1px solid var(--color-hairline);
    box-sizing: border-box;
  }

  /* bestEnd[start]: an end INDEX, not a score, so it deliberately does not
     borrow the settled column's bold/primary-text treatment — that look is
     reserved for minScore's totals. The value itself renders at
     secondary-text weight/color, same as the sticky index column on the
     left edge of the same row: same kind of number (a coordinate into the
     item axis), same visual family, so the two summary columns read as "a
     score" and "an index" rather than two scores. */
  .matrix-summary-cell--bestend {
    font-weight: 500;
    color: var(--color-text-secondary);
  }

  /* Settle instant wins over the index's usual secondary-color treatment: the
     same accent flash minScore/settled cells get must show here too, not get
     quietly overridden by this rule's own color. */
  .matrix-summary-cell--justsettled {
    background: var(--color-accent-tint);
    color: var(--color-accent);
    font-weight: 600;
  }

  /* Makes the traceback's walk visible in this column too: once this row's
     start is on the chosen path (the same fact .matrix-cell--chosen uses,
     just read for this row's own bestEnd[start] value instead of a specific
     grid cell), the index itself turns accent-colored — the reader can follow
     the chain straight down this column during the backward pass instead of
     only hunting for accent rings in the wide grid. No new ring/box-shadow
     here (the grid cell for this exact (start, end) already carries that),
     just the text color, so this stays a quiet echo, not a second copy of the
     grid's chosen treatment. */
  .matrix-summary-cell--bestend-chosen {
    color: var(--color-accent);
    font-weight: 600;
  }

  .matrix-cell-total {
    height: calc(var(--text-13) * var(--lh-body));
    line-height: var(--lh-body);
    font-size: var(--text-13);
    white-space: nowrap;
    /* No `overflow: hidden` here on purpose: this line's own text — the
       cell's total — always fits inside `--candidate-min-w`, since that
       floor is measured directly from the widest real decomposition text
       this run produces (see `decompositionFloorWidth` in the script), never a clip the arithmetic
       itself has to fit inside: clipping a number is not an acceptable way to
       fit content, since a truncated number reads as a different, wrong
       number (e.g. what should be "14400 + 400" clipped to "14400 + 40"). */
  }

  .matrix-cell-breakdown {
    height: calc(var(--text-13) * var(--lh-body));
    font-size: var(--text-13);
    line-height: var(--lh-body);
    color: var(--color-text-secondary);
    opacity: 0.7;
    white-space: nowrap;
    /* Same reasoning as .matrix-cell-total above: this line — the
       lineScore + memoValue breakdown — is the exact text the floor was
       measured from, so it fits by construction, needing no clip of its
       own. */
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
  .matrix-minscore--justsettled {
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

  /* Below ~480px, the summary block's two columns at their full label-driven
     width (152px + 152px = 304px) plus the sticky index column (152px)
     leave little to no room for even a sliver of the scroll container in the
     flex row — every element here has a fixed width except the scroll
     container, so the scroll container is what absorbs the shortfall
     (shrinking toward, and eventually below, its own five-column floor and
     scrolling), never the fixed elements giving up their own width. The
     actual mitigation is narrowing the two summary columns back down near
     their number content's real width, freeing space for the scroll
     container to stay usable. Their header labels no longer fit at this
     width alongside a chip: each label's `<code>` element (see markup above
     and the visually-hidden rule below) is hidden visually only, staying in
     the accessibility tree, at this breakpoint. */
  @media (max-width: 480px) {
    .matrix-summary-col {
      width: calc(var(--space-48) + var(--space-16));
    }

    /* The label itself, not just its column, has to give way at this width:
       `minScore[start]` and `bestEnd[start]` both measure wider than even
       the roomier 152px column did (see the width comment above), so simply
       narrowing the column back down would clip the very text it holds.
       Standard visually-hidden clipping (off-screen, not `display: none`)
       keeps the label in the accessibility tree — a screen reader still
       announces the column's name — while removing it from the visual box
       entirely, so the column can shrink to its number content's real width
       instead. */
    .matrix-summary-head code {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
    }
  }
</style>
