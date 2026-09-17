<script lang="ts">
  // Everything here is $derived from the shared balanceState: no local $state at all,
  // because a table of computed cells is exactly what $derived is for — recompute
  // when inputs change, never mutate directly.
  import { balanceState } from './state.svelte';
  import { lastFittingEnd, isOverflowingLine } from './balance';
  import { tick } from 'svelte';

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

  // The narrow-only spanning `minScore[end]` label row's own height (see
  // `.matrix-memo-label-row`/`.matrix-memo-label` in the template/stylesheet):
  // one line of `--text-13` content plus `--space-4` padding top and bottom,
  // plus the 1px `border-bottom` that row draws — the same "content + padding
  // + border" accounting `rowHeight` above uses for the table's body rows,
  // sized for this row's actual (shorter, single-line) content instead. The
  // `+ 1px` term is the same table-cell-specific correction `rowHeight`
  // documents above: a `<th>`'s declared `height` is a minimum content-box
  // target, and its own border renders in addition to that target rather
  // than being carved out of it, so the row measured 1px taller than the
  // bare content+padding+border sum until this term was added. The narrow
  // summary block's blank second header box (see the template) reads this
  // same constant so it reserves exactly the height this row adds, rather
  // than a guess that could drift from it.
  const labelRowHeight = `calc(var(--text-13) * var(--lh-body) + var(--space-4) * 2 + 1px + 1px)`;

  // The scroll container's candidate columns must each hold at least one
  // fifth of the *candidate* space — the part of the container's width left
  // over once the sticky index column's own width is set aside, since that
  // column is a row header, not a candidate, and must not be counted toward
  // the "five columns fill it" budget. This is a fact about the container's
  // live rendered size, not a fixed pixel guess, so it has to be measured
  // from the DOM rather than assumed in a stylesheet. This is the same
  // $state-at-the-DOM-boundary reasoning: Svelte
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
  // Below 768px the probe measures `widestTotalText`, not
  // `widestDecompositionText` (see the template's probe element and
  // `isNarrow` above) — so this same variable holds "the widest text a cell
  // currently renders" at either width, not always the two-part breakdown its
  // name describes at the wide layout. Not renamed throughout, since the
  // floor's role (a live-measured minimum column width) is identical at both
  // widths; only which text it is measured from changes.
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

  // Below 768px the cell's breakdown line (lineScore + memoValue) is hidden —
  // see the media query in the template's stylesheet — and only the total
  // itself has to fit the column. Reusing `widestDecompositionText`'s much
  // wider floor at this width would still reserve room for text nothing ever
  // renders, undermining the whole point of hiding it (fitting more candidate
  // columns in the same space). This is the total-only counterpart: the
  // widest bare total this run will ever reveal, same "known up front from
  // the full matrix, not from playback progress" reasoning as above.
  const widestTotalText = $derived.by(() => {
    let widest = '';
    const { score, minScores } = balanceState.result;
    for (let start = 0; start < n; start++) {
      for (let end = start + 1; end <= fittingEnd[start]; end++) {
        if (isOverflowingLine(len, start, end, balanceState.capacity)) continue;
        const lineScore = score[start][end];
        const memoValue = minScores[end];
        if (lineScore == null || memoValue == null) continue;
        const text = String(lineScore + memoValue);
        if (text.length > widest.length) widest = text;
      }
    }
    return widest;
  });

  // Tracks the same 767px boundary the stylesheet's `@media (max-width: 767px)`
  // block uses, so the script's own floor-selection logic (see
  // `decompositionFloorWidth`'s effect below) never disagrees with which
  // layout the CSS is actually showing. A `matchMedia` listener, not a
  // measured-pixel guess from `panelEl`'s own width, because the panel sits
  // inside `.measure`'s gutter padding (see app.css) — the panel's own box
  // width is not the viewport width, so re-deriving the breakpoint from it
  // would drift from the CSS breakpoint by the gutter's width. Genuine
  // external state (the browser's own media-query match, not a value this
  // component computes), so `$state` set from a listener, not `$derived`.
  let isNarrow = $state(false);

  $effect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    isNarrow = mq.matches;
    const handler = (e: MediaQueryListEvent) => {
      isNarrow = e.matches;
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  });

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
    // Explicit reactive reads: an `$effect` only re-runs when a *reactive*
    // value it read last time changes, and `probeEl.getBoundingClientRect()`
    // is a plain DOM call, invisible to that tracking. Reading `isNarrow`,
    // `widestTotalText`, and `widestDecompositionText` here — even though
    // the actual text is set via the template, not by this effect — is what
    // makes the effect re-run (and re-measure) when any of the three change:
    // crossing the 768px boundary, or the sizes/capacity/gap inputs producing
    // a new widest string at the current width.
    isNarrow;
    widestTotalText;
    widestDecompositionText;
    // Deferred one microtask via `tick()`: this effect can run in the same
    // flush as the state write that changed the probe's own text (e.g.
    // `isNarrow` flipping on first mount at a narrow viewport), and reading
    // `getBoundingClientRect()` synchronously in that case can observe the
    // DOM before Svelte has applied the corresponding text update to
    // `probeEl` — measuring the previous string's width instead of the
    // current one. `tick()` resolves once pending component updates have
    // been applied to the DOM, so the measurement below is guaranteed to see
    // the text this same effect run actually depends on.
    tick().then(() => {
      if (!probeEl) return;
      // Padding matches `.matrix-cell`'s own space-12 each side, so the
      // measured width already includes the padding the real cell reserves —
      // `decompositionFloorWidth` below is then a direct column-width floor,
      // not a bare text width the caller has to remember to pad separately.
      decompositionFloorWidth = probeEl.getBoundingClientRect().width;
    });
  });

  function updateMiddleWidth() {
    if (!panelEl || !summaryEl || !indexColEl) return;
    indexColWidth = indexColEl.getBoundingClientRect().width;
    middleRegionWidth = panelEl.clientWidth - summaryEl.getBoundingClientRect().width - indexColWidth;
  }

  // Re-measure whenever the region's content could have changed the overflow:
  // on mount, on every scroll, and whenever the item count changes the number
  // of candidate columns (n is read here only to retrigger the effect — the
  // actual measurement always comes from the live DOM box, never from a
  // computed guess at column count × column width). A ResizeObserver on the
  // outer row also covers the viewport-resize case (768px/375px breakpoints),
  // since the region's own width changes there without any Svelte state
  // changing on its own to retrigger this effect. `isNarrow` is read
  // explicitly too: crossing 768px swaps which summary block is in the DOM
  // (see `.matrix-summary-wide`/`.matrix-summary-narrow`), which changes
  // `summaryEl`'s own rendered width — the ResizeObserver below watches
  // `panelEl`, not `summaryEl`, so it would not by itself notice that change.
  $effect(() => {
    n;
    isNarrow;
    updateMiddleWidth();
  });

  $effect(() => {
    if (!panelEl) return;
    const observer = new ResizeObserver(() => {
      updateMiddleWidth();
    });
    observer.observe(panelEl);
    return () => observer.disconnect();
  });

  // `panelEl`'s own box does not necessarily resize when the 768px breakpoint
  // flips — it is a flex child sized by its parent, and the narrow/wide swap
  // only changes its children's widths (the summary block shrinks from two
  // 152px columns to one 80px column; the sticky index column shrinks from
  // 152px to 40px). A direct load at a narrow viewport hits exactly this
  // gap: the `isNarrow` effect above fires and calls `updateMiddleWidth()`
  // once, but that call can land in the same paint as the state write, before
  // the browser has applied the new `@media` layout to `summaryEl`/
  // `indexColEl` — so it reads their still-wide rects and this component's
  // own `--candidate-min-w` floor is computed from a `middleRegionWidth` that
  // is too small. Observing these two elements directly (rather than only
  // their shared ancestor) means their own post-layout size change is what
  // triggers the next `updateMiddleWidth()` call, closing that gap without
  // guessing at a fixed delay.
  $effect(() => {
    if (!summaryEl || !indexColEl) return;
    const observer = new ResizeObserver(() => {
      updateMiddleWidth();
    });
    observer.observe(summaryEl);
    observer.observe(indexColEl);
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
    <span class="legend-item legend-item--axes">
      <span>Start<span class="axis-word">&nbsp;Index</span> &darr;</span>
      <span>End<span class="axis-word">&nbsp;Index</span> &rarr;</span>
    </span>
    <span class="legend-item legend-item--key" aria-label="cell total equals free squared plus minScore at end">
      <code class="legend-key-code">total[start, end) = free[start, end)² + minScore[end]</code>
    </span>
  </div>

  <div class="matrix-width-probe tnum" aria-hidden="true" bind:this={probeEl}>{isNarrow ? widestTotalText : widestDecompositionText}</div>

  <div class="matrix-panel-body" bind:this={panelEl} style={`--row-h: ${rowHeight}`}>
    <!-- SCROLL: the one scrollable element. Row index column (sticky left),
         end headers, minScore[end] memo values, and every candidate cell —
         one table again, so a candidate cell shares its <tr> with the start
         index that labels it. Candidate columns floor at one fifth of the
         candidate space's own measured width (candidateMinWidth), so five
         columns exactly fill it and a sixth begins to overflow, at which
         point .matrix-scroll takes over from table-layout: fixed dividing
         the space evenly. -->
    <div class="matrix-scroll">
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
              <div class="corner-split-inner">
                <svg class="corner-diagonal" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                  <line x1="0" y1="0" x2="100" y2="100" />
                </svg>
                <!-- Named in the triangles the diagonal already makes, which reads more
                     directly than stating the axes over in the legend. Hidden below
                     768px, where a 40px corner cannot hold two words and the legend
                     names them instead. -->
                <span class="corner-label corner-label--start">start</span>
                <span class="corner-label corner-label--end">end</span>
              </div>
            </th>
            {#each cols as end (end)}
              <th class="matrix-head tnum" style={`height: ${headRowOneHeight}`}>{end}</th>
            {/each}
          </tr>
          <tr class="matrix-memo-row" style={`height: ${headRowTwoHeight}`}>
            <th class="matrix-corner--sub matrix-sticky-col tnum" style={`height: ${headRowTwoHeight}`}>
              <!-- Desktop keeps the label beside its values, exactly as
                   before. Narrow moves it to the spanning row above (see
                   `.matrix-memo-label-row` just above), so this cell goes
                   empty instead of duplicating the text — and, critically,
                   empty is all this cell needs to hold: with no `<code>`
                   chip inside, the sticky column's width floor (set on
                   `.matrix-sticky-col`/`.matrix-row-head`, media-queried down
                   to 40px below 768px) is never fought by this cell's own
                   content the way the 152px-wide label text used to fight it. -->
              {#if !isNarrow}<code>minScore[end]</code>{/if}
            </th>
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

    <!-- SUMMARY: fixed width, never scrolls, not a table. Two real layouts live
         here, not one, because "one column, values stacked" and "two columns,
         values side by side" are different numbers of boxes per row — a
         header cell either labels one field per column (desktop) or both
         fields stacked in front of one column (narrow) — not a CSS
         reflow of the same nodes. A single-structure version was tried first
         (CSS Grid, both fields pinned to the same grid column and column-row
         at narrow width, top/bottom-anchored within one shared cell) but it
         needs one explicit `grid-row` per index, up to MAX_ITEMS rows, which
         is more fragile than two small `{#each}` blocks and buys nothing a
         reader can see. The two blocks below render the exact same
         `rows`/`liveSettled`/`runningBestEndAtStep` data the single-layout
         version did; only which one is present in the DOM changes, gated by
         a matching `@media` boundary in the stylesheet, so the two can never
         show at once and never drift apart in what they read from state. -->
    <div class="matrix-summary" bind:this={summaryEl}>
      <div class="matrix-summary-wide">
        <div class="matrix-summary-col matrix-summary-col--settled">
          <div class="matrix-summary-head" style={`height: calc(${headRowOneHeight} + ${headRowTwoHeight})`}><code>minScore[start]</code></div>
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
          <div class="matrix-summary-head" style={`height: calc(${headRowOneHeight} + ${headRowTwoHeight})`}><code>bestEnd[start]</code></div>
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

      <!-- NARROW (<768px): one column, minScore stacked above bestEnd inside
           each row's own already-two-line-tall box (--row-h). Labels reuse
           the same two header rows the wide layout uses, `minScore` in row 1
           and `bestEnd` in row 2, dropping the `[start]` suffix — every row
           IS a start, and the table's own corner cell already says so — so
           both labels fit ~80px without clipping. -->
      <div class="matrix-summary-narrow">
        <!-- One header box, matching the table's own first header row (the
             column-index row) at this width. -->
        <div class="matrix-summary-head matrix-summary-head--narrow" style={`height: ${headRowOneHeight}`}>
          <span>minScore</span>
          <span class="matrix-summary-head--bestend-label">bestEnd</span>
        </div>
        {#each rows as start (start)}
          {@const runningEnd = runningBestEndAtStep.get(start)}
          {@const bestEndChosen = runningEnd != null && isChosen(start, runningEnd)}
          <div
            class={['matrix-summary-cell--stacked', justSettledMemo(start) && 'matrix-summary-cell--justsettled']}
            class:matrix-row--active={start === activeStart}
            style={`height: var(--row-h)`}
          >
            <span class="matrix-summary-stacked-value tnum">
              {#if liveSettled[start] != null}{fmtLive(liveSettled[start])}{/if}
            </span>
            <span
              class={['matrix-summary-stacked-value', 'matrix-summary-cell--bestend', 'tnum', bestEndChosen && 'matrix-summary-cell--bestend-chosen']}
            >
              {#if runningEnd != null}{runningEnd}{/if}
            </span>
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
    color: var(--color-text);
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
  /* Names both axes once, here, rather than in the corner cell: that cell is
     40px wide on a phone, and two words plus a diagonal cannot share it. The
     diagonal still shows the split; these say which side is which. Sits at the
     left of the same line the arithmetic key ends, since the key already
     pushes itself right. */
  .legend-item--axes {
    gap: var(--space-12);
    font-variant-numeric: tabular-nums;
  }

  .legend-item--key {
    margin-left: auto;
    font-size: var(--text-13);
    color: var(--color-text);
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
    /* Brighter than the hairlines inside it, so the matrix reads as one framed
       object rather than a grid that happens to stop. Weight alone did not carry
       that: a thicker hairline still looked like a gridline. */
    border: 1px solid var(--color-border-strong);
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
  /* The index column's width is declared HERE, on every cell in the column,
     not only on the body cells. Under `table-layout: fixed` the first row
     decides each column's width, and the first row holds the corner cell — a
     width on `.matrix-row-head` alone is in the wrong row to be consulted, so
     the column collapsed to an equal share of the table and the
     `minScore[end]` label no longer fit it. */
  .matrix-sticky-col {
    position: sticky;
    left: 0;
    z-index: 2;
    background: var(--color-surface);
    width: calc(var(--space-64) + var(--space-64) + var(--space-24));
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
  }

  /* Wide (>=768px): the original two-column layout, untouched. Hidden below
     768px in favor of `.matrix-summary-narrow` (see the media query at the
     bottom of this file) — see the markup comment above for why this is two
     real blocks rather than one CSS-reflowed one. */
  .matrix-summary-wide {
    display: flex;
  }

  .matrix-summary-narrow {
    display: none;
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

  /* Keeps its left border, unlike the table cells' first-column exception: this
     edge is the seam between the scrolling candidates and the fixed summary,
     and nothing else draws it. The summary block sits outside the scroller, so
     the line is static and cannot double against a scrolling neighbour. */
  .matrix-summary-col--settled {
    border-left: 1px solid var(--color-border-strong);
  }

  .matrix-summary-head {
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 500;
    font-size: var(--text-13);
    color: var(--color-text);
    background: var(--color-surface);
    padding: var(--space-8);
    border-bottom: 1px solid var(--color-hairline);
  }


  .matrix-corner,
  .matrix-head,
  .matrix-row-head,
  .matrix-minscore,
  .matrix-corner--sub {
    font-weight: 500;
    color: var(--color-text);
    background: var(--color-surface);
    /* padding: var(--space-8); */
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

  /* The diagonal's positioning context lives on this inner div, never on the
     `<th>`: that cell carries `.matrix-sticky-col` (`position: sticky`), and a
     `<th>` can only have one `position` value, so `relative` here would win
     the cascade and silently un-pin this one cell. */
  .corner-split-inner {
    position: relative;
    width: 100%;
    height: 100%;
  }

  .corner-label {
    position: absolute;
    font-size: var(--text-13);
    font-weight: 400;
    color: var(--color-text-secondary);
    pointer-events: none;
  }

  .corner-label--start {
    left: var(--space-8);
    bottom: var(--space-4);
  }

  .corner-label--end {
    right: var(--space-8);
    top: var(--space-4);
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

  /* Row 2's own leading cell — the `minScore[end]` label. Opaque background
     (from the shared `.matrix-sticky-col` rule, applied via the class in the
     template) is what keeps it pinned and legible: a transparent version of
     this exact cell was the earlier bug — scrolling candidate values slid
     underneath it and the text collided, since the label had no opaque
     surface of its own to occupy. The label's subdued look comes from
     `color: var(--color-text)` (inherited from the shared
     .matrix-corner/.matrix-head/.matrix-row-head/.matrix-minscore rule
     above), no `opacity` shortcut — `opacity` would also fade this cell's
     background translucent and let a scrolled neighbour show through it,
     the same bug in a different form. */
  .matrix-corner--sub {
    font-size: var(--text-13);
    padding: var(--space-4) var(--space-8);
    /* This cell carries `--sub` but not the base `.matrix-corner` class, so it
       does not inherit that rule's right edge, and the index column's own
       border stopped for exactly one row. */
    border-right: 1px solid var(--color-hairline);
  }

  /* Narrow-only spanning label row (see the template's `{#if isNarrow}`
     block) — the memo row's `minScore[end]` label, promoted out of the
     sticky index column into its own full-width row directly above the row
     of values it describes. Left-aligned rather than centered like every
     other header cell, so it reads as a caption sitting above its row (the
     way a section label reads above the content it introduces) rather than
     as a column heading centered over nothing in particular. Not sticky and
     not part of `.matrix-sticky-col`: a single cell spanning every column
     already covers the full scroll width by construction, so pinning it
     while its own row scrolls under it is not a real concern here the way it
     is for the corner/label cells that share a column with scrolling
     candidates. */
  .matrix-memo-label {
    text-align: left;
    font-weight: 500;
    font-size: var(--text-13);
    color: var(--color-text);
    background: var(--color-surface);
    padding: var(--space-4) var(--space-8);
    border-bottom: 1px solid var(--color-hairline);
  }

  /* Flattens the global `code` chip's own padding/inline-flex box (same
     reasoning as `.legend-key-code` above) so this label's height is exactly
     the `<th>`'s own padding plus one line of text — nothing more. Left as
     the default chip, the chip's own `--space-4`/`--space-8` padding stacked
     on top of the `<th>`'s padding, and the row rendered visibly taller than
     `labelRowHeight` (the script's matching height reservation for the
     narrow summary block, see the script) accounted for — the two blocks'
     header stacks drifted apart by exactly that stacked padding, and every
     body row below inherited the same offset. */
  .matrix-memo-label code {
    display: inline;
    padding: 0;
    border-radius: 0;
    background: none;
    color: inherit;
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
  /* The row separator has to be declared here too. Under
     `border-collapse: separate` no border is shared between neighbours, so a
     candidate cell's own `border-top` stops at its own box and cannot draw the
     rule across this column — the index column looked unruled while every
     other column was separated. Same 1px hairline, same edge, so rows stay the
     height the shared `--row-h` expects. */
  /* Vertical rules between columns. Declared with the adjacent sibling
     selector so the FIRST candidate column is skipped: the index column
     already draws its own `border-right`, and that edge belongs to the sticky
     cell rather than to a scrolling neighbour, so it stays put while the
     candidates move under it. A `border-left` on the first candidate would
     double that line into 2px under `border-collapse: separate`, where
     neighbours never share an edge.

     `box-sizing: border-box` (set globally) keeps this 1px inside the column's
     declared width, so it cannot widen a column or disturb the measured floor
     that keeps decomposition text unclipped. */
  .matrix-head + .matrix-head,
  .matrix-minscore + .matrix-minscore,
  .matrix-cell + .matrix-cell {
    border-left: 1px solid var(--color-hairline);
  }

  /* Same rule between minScore[start] and bestEnd[start]. These are flex
     columns, not table cells, so they need it declared on the column itself. */
  .matrix-summary-col + .matrix-summary-col {
    border-left: 1px solid var(--color-hairline);
  }

  .matrix-row-head {
    width: calc(var(--space-64) + var(--space-64) + var(--space-24));
    border-top: 1px solid var(--color-hairline);
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
    color: var(--color-text);
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

  /* Narrow-layout stacked cell: one box per row (--row-h, already two lines
     tall), holding minScore above bestEnd — see the markup comment on
     `.matrix-summary-narrow` above. `justify-content: space-evenly` splits
     the box's existing two-line height into two even halves without adding
     any new height token, so this reuses the same reserved box the wide
     layout's single-value cell already claims. */
  .matrix-summary-cell--stacked {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: space-evenly;
    color: var(--color-text);
    font-weight: 600;
    background: var(--color-surface);
    border-top: 1px solid var(--color-hairline);
    box-sizing: border-box;
  }

  .matrix-summary-stacked-value {
    font-size: var(--text-13);
    line-height: var(--lh-body);
  }

  .matrix-summary-cell--stacked .matrix-summary-cell--bestend {
    font-weight: 500;
    color: var(--color-text);
  }

  .matrix-summary-cell--stacked.matrix-summary-cell--justsettled {
    background: var(--color-accent-tint);
  }

  .matrix-summary-cell--stacked.matrix-summary-cell--justsettled .matrix-summary-stacked-value:first-child {
    color: var(--color-accent);
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
  /* Dashed, where the chosen cell's ring is solid. The two states were
     separated only by hue and half a pixel of weight, which asks a reader to
     learn the legend before the matrix means anything, and fails outright
     without colour. Dashed reads as provisional on its own. `outline` rather
     than a border so it cannot affect the cell's box, and a negative offset to
     sit inside the cell like the ring it replaces. */
  .matrix-cell--rowmin {
    outline: 1px dashed var(--color-text);
    outline-offset: -1px;
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
    /* Every chosen cell is also its row's minimum, so it would otherwise wear
       the provisional dashed outline underneath the solid ring and read as both
       states at once. The traceback has resolved this one; drop the dashes. */
    outline: none;
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

  /* Below 768px: the narrow layout described at the top of the file (three
     space-saving changes, each moving information rather than losing it):
       1. Cell decomposition subtext hidden; total-only, one-line reservation.
       2. Wide two-column summary swapped for the narrow stacked column.
       3. The `minScore[end]` memo row's label moves off the sticky index
          column onto its own full-width spanning row just above the row of
          memo values (see `.matrix-memo-label-row`/`.matrix-memo-label` and
          the `{#if isNarrow}` block in the template) — the row itself stays,
          spending a little vertical room to let the sticky index column
          shrink to a single digit's width.
     One block, so the three changes are read together as one breakpoint, not
     three independent ones that could drift out of sync. Above 768px none of
     these selectors match, so the wide layout (verified byte-identical: 152px
     index column, five 122.4px candidate columns, two 152px summary columns)
     is completely untouched. */
  /* The corner names the axes at this width, so the legend saying it too would state
     one fact twice. Below 768px this flips: the corner is 40px and the legend owns it. */
  @media (min-width: 768px) {
    .legend-item--axes {
      display: none;
    }
  }

  @media (max-width: 767px) {
    .corner-label {
      display: none;
    }

    /* (1) Totals only. The placeholder's second reserved line and the real
       breakdown line both disappear, and .matrix-cell's own reserved height
       drops from a two-line to a one-line box to match — a total alone never
       needs the second line's room, and leaving it reserved would show a
       tall empty gap under every filled cell. */
    .matrix-cell-breakdown,
    .matrix-cell-placeholder-line:last-child {
      display: none;
    }

    .matrix-cell {
      height: calc(var(--text-13) * var(--lh-body) + var(--space-8) * 2);
    }

    .matrix-cell-inf-solo {
      height: calc(var(--text-13) * var(--lh-body));
    }

    /* (2) One combined summary column instead of two labelled ones. */
    .matrix-summary-wide {
      display: none;
    }

    /* `start index` and `end index` together with the arithmetic key need about
       350px, and the panel is 343px at 375px wide, so the two wrapped onto
       separate lines. The arrows carry the meaning; the repeated word does not,
       and dropping it lets both sit on the key's line as intended. */
    .axis-word {
      display: none;
    }

    /* minScore[end] does not appear at this width at all. It is the same array
       the summary column already shows per row, indexed the other way, and that
       column stacks two numbers in every row — so a header stacking two numbers
       as well would make one visual convention mean two different things. The
       stepper still prints both addends for the current step. */
    .matrix-memo-row {
      display: none;
    }

    /* A five digit total renders 41px and the cell's content box was 40px, so
       every wide number clipped by a pixel. Narrower side padding here rather
       than a wider column, since the column count is what a phone is short of. */
    .matrix-cell {
      padding-left: var(--space-8);
      padding-right: var(--space-8);
    }


    .matrix-summary-narrow {
      display: flex;
      flex-direction: column;
      width: calc(var(--space-64) + var(--space-16));
      /* The seam between the scrolling candidates and this column. Its rows
         line up with the table's exactly (measured 0px offset), but with no
         vertical rule and the row separators alone, the stacked pairs read as
         floating free of the rows they belong to. */
      border-left: 1px solid var(--color-hairline);
    }


    /* Both labels stack inside the table's one remaining header row (row 2,
       the memo row, is hidden below — see (3)), same order as the stacked
       values beneath: minScore first, bestEnd second. */
    .matrix-summary-head--narrow {
      flex-direction: column;
      gap: 0;
      line-height: var(--lh-body);
    }

    .matrix-summary-head--bestend-label {
      color: var(--color-text);
    }

    /* (3) The memo row stays, but its label moves off the sticky index
       column and onto its own full-width row just above (rendered only when
       `isNarrow`, see the template) — freeing the width the `minScore[end]`
       label held so the index column can shrink to a single digit. Costs one
       short extra row of height; the vertical room a phone has to spare is
       the whole point of putting the row back rather than deleting it. */
    .matrix-sticky-col,
    .matrix-row-head {
      width: calc(var(--space-32) + var(--space-8));
    }
  }
</style>
