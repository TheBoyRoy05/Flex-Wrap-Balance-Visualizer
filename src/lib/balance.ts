// Mirror of WebCore's balancedLineBreaks, 1D form (no flex-line-count).
// flex-wrap: balance chooses line breaks minimizing the sum of squared free space
// across lines. Knuth-Plass with penalty = free^2. An overflowing line scores 0.
// Arithmetic is in whatever integer unit the caller passes (px here).

export interface MatrixResult {
  /** score[start][end] = squared free space of a line holding items [start, end).
   *  null where end <= start (not a valid line). Indexed [start in 0..n-1][end in 0..n]. */
  score: (number | null)[][];
  /** len[start][end] = laid-out length of items [start, end) including gaps. */
  len: (number | null)[][];
}

export interface BalanceResult extends MatrixResult {
  /** Break indices: one past the last item of each line. Ends with n. Length = line count. */
  breaks: number[];
  /** minScores[start] = least total squared free space to cover items [start, n). */
  minScores: (number | null)[];
  /** bestEnd[start] = the end index chosen for the line starting at start. */
  bestEnd: number[];
}

function buildMatrix(sizes: number[], capacity: number, gap: number): MatrixResult & { length: (s: number, e: number) => number } {
  const n = sizes.length;
  // prefix[i] = sum over items < i of (max(0, size) + gap), so a line length is one subtraction.
  const prefix = new Array<number>(n + 1).fill(0);
  for (let i = 0; i < n; i++)
    prefix[i + 1] = prefix[i] + Math.max(0, sizes[i]) + gap;

  const length = (start: number, end: number): number => prefix[end] - prefix[start] - gap;

  const score: (number | null)[][] = Array.from({ length: n }, () => new Array<number | null>(n + 1).fill(null));
  const len: (number | null)[][] = Array.from({ length: n }, () => new Array<number | null>(n + 1).fill(null));
  for (let start = 0; start < n; start++) {
    for (let end = start + 1; end <= n; end++) {
      const l = length(start, end);
      len[start][end] = l;
      const free = l < capacity ? capacity - l : 0;
      score[start][end] = free * free;
    }
  }
  return { score, len, length };
}

/** Greedy line breaking: fill each line until the next item would overflow, then wrap.
 *  This is plain `flex-wrap: wrap`. Returned for side-by-side comparison against balance. */
export function greedyLineBreaks(sizes: number[], capacity: number, gap: number): number[] {
  const n = sizes.length;
  const breaks: number[] = [];
  let i = 0;
  while (i < n) {
    const lineStart = i;
    let lineLength = 0;
    for (; i < n; i++) {
      // Always place at least one item; otherwise wrap when this item would overflow.
      if (i > lineStart && lineLength + sizes[i] > capacity) break;
      lineLength += sizes[i] + gap;
    }
    breaks.push(i);
  }
  return breaks;
}

/** Score matrix only, no DP. Useful when we just want to display every line's cost. */
export function computeMatrix(sizes: number[], capacity: number, gap: number): MatrixResult {
  const { score, len } = buildMatrix(sizes, capacity, gap);
  return { score, len };
}

/** True when the laid-out length of items [start, end) exceeds capacity. A line in
 *  this state scores 0 by definition (cost waived, not earned) — indistinguishable
 *  from a genuine zero-free-space fit unless a caller checks this predicate too.
 *  Presentational escape hatch: does not change score/len/breaks numerics anywhere. */
export function isOverflowingLine(len: MatrixResult['len'], start: number, end: number, capacity: number): boolean {
  const l = len[start]?.[end];
  return l != null && l > capacity;
}

/** lastFittingEnd[start] = largest end whose line [start, end) still fits capacity,
 *  or start+1 when the item at start overflows on its own (a single item is always
 *  allowed on a line). Ends beyond this bound are not real candidates: their score
 *  is 0 by definition (overflow), not because they're competitive. Exposed standalone
 *  (mirrors the internal bound `balancedLineBreaks` computes) so callers such as the
 *  score matrix display can tell a genuinely-considered end from an overflowing one. */
export function lastFittingEnd(sizes: number[], capacity: number, gap: number): number[] {
  const n = sizes.length;
  const { length } = buildMatrix(sizes, capacity, gap);
  const result = new Array<number>(n).fill(0);
  let end = 1;
  for (let start = 0; start < n; start++) {
    end = Math.max(end, start + 1);
    while (end < n && length(start, end + 1) <= capacity) end++;
    result[start] = end;
  }
  return result;
}

/** Full balance: score matrix + the minimizing set of line breaks via a suffix DP.
 *  Tie-break gives the most items to the earliest line (spec's front-to-back tie-break),
 *  achieved by accepting the last end that ties the minimum. */
export function balancedLineBreaks(sizes: number[], capacity: number, gap: number): BalanceResult {
  const n = sizes.length;
  if (!n)
    return { breaks: [], minScores: [], bestEnd: [], score: [], len: [] };

  const { score, len, length } = buildMatrix(sizes, capacity, gap);

  // Everything fits on one line: the common case, kept off the quadratic path.
  if (length(0, n) <= capacity) {
    const minScores: (number | null)[] = new Array<number | null>(n + 1).fill(null);
    minScores[0] = score[0][n];
    return { breaks: [n], minScores, bestEnd: [n], score, len };
  }

  // lastFittingEnd[start] = largest end whose line still fits, or start+1 when the item at
  // start overflows on its own (a single item is always allowed on a line).
  const lastFittingEnd = new Array<number>(n).fill(0);
  let end = 1;
  for (let start = 0; start < n; start++) {
    end = Math.max(end, start + 1);
    while (end < n && length(start, end + 1) <= capacity) end++;
    lastFittingEnd[start] = end;
  }

  const INF = Number.POSITIVE_INFINITY;
  const minScores = new Array<number>(n + 1).fill(INF);
  minScores[n] = 0;
  const bestEnd = new Array<number>(n).fill(0);

  for (let start = n - 1; start >= 0; start--) {
    for (let e = start + 1; e <= lastFittingEnd[start]; e++) {
      const total = (score[start][e] as number) + minScores[e];
      // <= so the last (largest) end that ties wins: most items to the earliest line.
      if (total <= minScores[start]) {
        minScores[start] = total;
        bestEnd[start] = e;
      }
    }
  }

  const breaks: number[] = [];
  for (let start = 0; start < n; ) {
    const e = bestEnd[start];
    breaks.push(e);
    start = e;
  }

  return { breaks, minScores, bestEnd, score, len };
}

/** Result of the two-dimensional DP that `flex-line-count` requires. */
export interface Balance2DResult extends MatrixResult {
  /** min(flexLineCount, itemCount) — a line always holds at least one item, so asking for more
   *  lines than there are items clamps. Mirrors `requiredLineCount` in FlexLineBreaker.cpp. */
  requiredLineCount: number;
  /** minScores[start][remaining] = least total squared free space to cover items [start, n)
   *  using AT LEAST `remaining` further lines. `null` where the state is unreachable: you
   *  cannot cover fewer items than the lines you are required to use. */
  minScores: (number | null)[][];
  /** bestEnd[start][remaining] = the end chosen for the line starting at start, in that layer. */
  bestEnd: (number | null)[][];
  /** Break indices, one past the last item of each line, ending with n. */
  breaks: number[];
}

/** The balance algorithm with a minimum line count, as a second DP dimension.
 *
 *  A faithful port of WebCore's `balancedLineBreaks(..., size_t flexLineCount)`. The extra axis is
 *  a budget, not an exact count: `remaining` means "at least this many further lines", which is why
 *  the successor index floors at zero and why layer 0 is exactly the unconstrained 1D problem the
 *  single-argument version solves.
 *
 *  Note on capacity: WebCore accumulates in UInt128 because an auto-height column flow has capacity
 *  LayoutUnit::max(), and five lines of (2^31-1)^2 overflow uint64. JavaScript numbers cannot
 *  represent that case exactly either, and this visualiser's capacity is bounded by its own input,
 *  so the port does not attempt it. */
export function balancedLineBreaksWithLineCount(
  sizes: number[],
  capacity: number,
  gap: number,
  flexLineCount = 1,
): Balance2DResult {
  const n = sizes.length;
  if (!n)
    return { breaks: [], minScores: [], bestEnd: [], score: [], len: [], requiredLineCount: 0 };

  const { score, len, length } = buildMatrix(sizes, capacity, gap);
  const requiredLineCount = Math.min(Math.max(1, Math.floor(flexLineCount)), n);

  const empty = (): (number | null)[][] =>
    Array.from({ length: n }, () => new Array<number | null>(requiredLineCount + 1).fill(null));

  // Only asking for one line keeps the fits-on-one-line shortcut. At two or more the constraint
  // can split a line that would otherwise fit, so the shortcut no longer applies.
  if (requiredLineCount <= 1 && length(0, n) <= capacity) {
    const minScores = empty();
    minScores[0][1] = score[0][n];
    const bestEnd = empty();
    bestEnd[0][1] = n;
    return { breaks: [n], minScores, bestEnd, score, len, requiredLineCount };
  }

  const lastFittingEnd = new Array<number>(n).fill(0);
  let scan = 1;
  for (let start = 0; start < n; start++) {
    scan = Math.max(scan, start + 1);
    while (scan < n && length(start, scan + 1) <= capacity) scan++;
    lastFittingEnd[start] = scan;
  }

  // minScores[start][lines] is the least total squared free space to cover items [start, n) in AT
  // LEAST `lines` lines, for lines in [1, requiredLineCount]. Indexed from 1, exactly as the landed
  // WebCore code is: there is no zero layer, because a non-empty suffix always needs a line, which
  // is also why layer 0 was measurably identical to layer 1 in the earlier formulation.
  const INF = Number.POSITIVE_INFINITY;
  const minScores: number[][] = Array.from({ length: n }, () => new Array<number>(requiredLineCount + 1).fill(INF));
  const bestEnd: (number | null)[][] = Array.from({ length: n }, () => new Array<number | null>(requiredLineCount + 1).fill(null));

  for (let start = n - 1; start >= 0; start--) {
    for (let lines = 1; lines <= requiredLineCount; lines++) {
      for (let end = start + 1; end <= lastFittingEnd[start]; end++) {
        // This line covers [start, end); the rest is [end, n). When the rest is empty this is the
        // final line, which alone cannot satisfy a requirement of more than one line.
        const restIsEmpty = end === n;
        if (restIsEmpty && lines > 1) continue;

        // The rest needs one fewer line, but a non-empty rest always needs at least one.
        const restLines = Math.max(lines - 1, 1);
        if (!restIsEmpty && restLines > n - end) continue;

        const restScore = restIsEmpty ? 0 : minScores[end][restLines];
        const total = (score[start][end] as number) + restScore;
        // <= so the last end that ties wins, giving the earliest line the most items.
        if (total <= minScores[start][lines]) {
          minScores[start][lines] = total;
          bestEnd[start][lines] = end;
        }
      }
    }
  }

  const breaks: number[] = [];
  for (let start = 0, lines = requiredLineCount; start < n; ) {
    const end = bestEnd[start][lines];
    if (end == null) break;
    breaks.push(end);
    lines = Math.max(lines - 1, 1);
    start = end;
  }

  // Infinity is an internal sentinel; a caller should see "no such state" instead.
  const reported: (number | null)[][] = minScores.map((row) =>
    row.map((v) => (Number.isFinite(v) ? v : null)),
  );

  return { breaks, minScores: reported, bestEnd, score, len, requiredLineCount };
}

/** One candidate end considered for the line starting at `start`, in the order the DP visits it. */
export interface DpCandidate {
  end: number;
  /** score[start][end]: this line's own squared free space. */
  lineScore: number;
  /** minScores[end]: best achievable total for everything after this candidate's end. */
  restScore: number;
  /** lineScore + restScore: what this candidate actually costs, start to finish. */
  total: number;
  /** True only for the candidate the DP actually kept as bestEnd[start] (its own <= tie-break
   *  favors the last candidate matching the minimum, giving the earliest line the most items). */
  isChosen: boolean;
}

/** One row of the suffix DP: every candidate end for a given `start`, and which one won. */
export interface DpStep {
  start: number;
  candidates: DpCandidate[];
  /** bestEnd[start] once every candidate has been compared. */
  chosenEnd: number;
  /** minScores[start] once every candidate has been compared. */
  chosenTotal: number;
}

export interface TraceResult extends BalanceResult {
  /** DP rows in the order the algorithm computes them: start = n-1 down to 0. */
  steps: DpStep[];
}

/** Same suffix DP as balancedLineBreaks, but also records every candidate it compared and why
 *  it won or lost, one DpStep per `start`, in the order the algorithm actually runs (n-1 down to 0).
 *  Kept separate from balancedLineBreaks so that function's behavior/signature never changes. */
export function traceBalancedLineBreaks(sizes: number[], capacity: number, gap: number): TraceResult {
  const n = sizes.length;
  if (!n)
    return { breaks: [], minScores: [], bestEnd: [], score: [], len: [], steps: [] };

  const { score, len, length } = buildMatrix(sizes, capacity, gap);

  if (length(0, n) <= capacity) {
    const minScores: (number | null)[] = new Array<number | null>(n + 1).fill(null);
    minScores[0] = score[0][n];
    const step: DpStep = {
      start: 0,
      candidates: [{ end: n, lineScore: score[0][n] as number, restScore: 0, total: score[0][n] as number, isChosen: true }],
      chosenEnd: n,
      chosenTotal: score[0][n] as number,
    };
    return { breaks: [n], minScores, bestEnd: [n], score, len, steps: [step] };
  }

  const lastFittingEnd = new Array<number>(n).fill(0);
  let end = 1;
  for (let start = 0; start < n; start++) {
    end = Math.max(end, start + 1);
    while (end < n && length(start, end + 1) <= capacity) end++;
    lastFittingEnd[start] = end;
  }

  const INF = Number.POSITIVE_INFINITY;
  const minScores = new Array<number>(n + 1).fill(INF);
  minScores[n] = 0;
  const bestEnd = new Array<number>(n).fill(0);
  const steps: DpStep[] = [];

  for (let start = n - 1; start >= 0; start--) {
    const candidates: DpCandidate[] = [];
    for (let e = start + 1; e <= lastFittingEnd[start]; e++) {
      const lineScore = score[start][e] as number;
      const restScore = minScores[e];
      const total = lineScore + restScore;
      if (total <= minScores[start]) {
        minScores[start] = total;
        bestEnd[start] = e;
      }
      candidates.push({ end: e, lineScore, restScore, total, isChosen: false });
    }
    // Only the candidate matching bestEnd[start] is the one the DP actually kept, even
    // if an earlier candidate tied its total (the <= tie-break overwrites on ties).
    for (const c of candidates) c.isChosen = c.end === bestEnd[start];
    steps.push({ start, candidates, chosenEnd: bestEnd[start], chosenTotal: minScores[start] });
  }

  const breaks: number[] = [];
  for (let start = 0; start < n; ) {
    const e = bestEnd[start];
    breaks.push(e);
    start = e;
  }

  return { breaks, minScores, bestEnd, score, len, steps };
}

/** One candidate line scored against an already-settled memo entry, in DP visit order. */
export interface CellEvaluateEvent {
  kind: 'evaluate';
  start: number;
  end: number;
  /** score[start][end]: this candidate line's own squared free space. */
  lineScore: number;
  /** The memo index this candidate reads from — always `end`, always already settled
   *  by the time this event fires (suffix DP: end > start, and every row from n-1
   *  down to end has already produced its settle event). */
  memoIndex: number;
  /** minScores[memoIndex] at the moment it's read — never Infinity, for the reason above. */
  memoValue: number;
  /** lineScore + memoValue. */
  total: number;
  /** True only for the candidate this row ultimately keeps as bestEnd[start]. */
  isChosen: boolean;
  /** True only for the one candidate per row that actually overflows and got tested —
   *  the first `end` past `lastFittingEnd[start]`. Line length grows monotonically with
   *  `end` (each extra item only adds width), so this single failing test is enough for
   *  the algorithm to know every longer end in the row overflows too, without trying any
   *  of them. lineScore/memoValue/total above are still real numbers for this candidate
   *  (the memo entry is always already settled) but it never competes for the row's
   *  minimum and can never be isChosen. Absent (undefined) on every other event. */
  isProbe?: boolean;
  /** Which layer of the 2D DP this evaluation belongs to: `remaining`, the number of
   *  further lines still owed. Absent for the 1D trace. */
  remaining?: number;
  /** The layer the memo entry is read FROM — `remaining - 1`, floored at 0. The whole
   *  point of the second dimension: a cell in one layer is priced using the layer
   *  beneath it. Absent for the 1D trace. */
  memoRemaining?: number;
  /** Present only when isProbe is true: every `end` from this candidate's `end + 1`
   *  through `n` — the rest of the row, ruled out by this one test rather than
   *  individually tried. Consumers render these as impossible in the same step as
   *  the probe itself. */
  impliedEnds?: number[];
}

/** Fired once a row has compared every candidate: settles minScores[start] and,
 *  simultaneously, the memo entry at `start` becomes available to rows evaluated
 *  after this point (start-1, start-2, ...). */
export interface CellSettleEvent {
  kind: 'settle';
  start: number;
  settledValue: number;
  /** The layer this row settled in. Absent for the 1D trace. */
  remaining?: number;
}

/** Fired once per link of the reconstructed path, during a second, backward pass that
 *  runs only after every row has settled. The forward fill (evaluate/settle events)
 *  computes each row's own best end; it never decides which rows lie on the final path.
 *  That decision is this separate walk: start at 0, follow `bestEnd[start]` to the next
 *  start, and repeat until reaching n. One event per link followed, in the order the
 *  walk actually visits them (0 first, n last) — the order a viewer should see the
 *  chosen path's cells turn blue, one at a time. */
export interface TracebackStepEvent {
  kind: 'traceback';
  start: number;
  end: number;
  /** Lines still owed when this link was taken. The walk decrements it, floored at 0,
   *  so the chosen path descends through the layers. Absent for the 1D trace. */
  remaining?: number;
}

/** Fired exactly once, after every traceback link has been walked: states the
 *  final answer as the list of chosen line segments. Kept as its own event kind
 *  rather than folded into the last `TracebackStepEvent` — that event's job is
 *  "this one link joined the chosen path", not "here is the whole path", and
 *  conflating them would make a consumer choose between animating the last link
 *  and presenting the summary. `breaks` is exactly `BalanceResult.breaks` for the
 *  same input: this event never computes its own answer, only reports the one
 *  `balancedLineBreaks`/the traceback walk above already produced. */
export interface ResultEvent {
  kind: 'result';
  breaks: number[];
}

export type CellEvent = CellEvaluateEvent | CellSettleEvent | TracebackStepEvent | ResultEvent;

/** Flat, cell-granular replay of the suffix DP: one `evaluate` event per candidate
 *  the algorithm actually tests, one `settle` event per row once that row's
 *  candidates have all been shown. Built for step-by-step animation, where the
 *  unit of progress is a single candidate evaluation and no cell may stay blank
 *  for the run's whole duration.
 *
 *  A row's candidates fit up through `lastFittingEnd[start]` and overflow at every
 *  `end` past it. Line length grows monotonically as `end` increases — each extra
 *  item only adds width — so the moment one candidate overflows, every longer
 *  candidate in the row overflows too, without needing its own test. The real
 *  algorithm exploits exactly this via `lastFittingEnd`: it never scores past that
 *  bound. So this trace tests each fitting candidate in turn, then — only if the
 *  row has any overflowing ends left — tests exactly one more (the first one past
 *  the bound) and reports the rest of the row as ruled out by that single test via
 *  `impliedEnds`, rather than emitting a separate event per overflowing candidate.
 *  A row whose fitting bound reaches `n` (nothing overflows) has no probe at all.
 *
 *  The DP state (minScores/bestEnd) is updated only by fitting candidates, exactly
 *  as balancedLineBreaks/traceBalancedLineBreaks compute it — the probe candidate
 *  is scored for display (its line's own squared free space and the already-settled
 *  memo entry it would read) but never compared against minScores[start] and never
 *  eligible to become bestEnd[start]. The implied ends past it are never scored at
 *  all: the algorithm never visits them, so this trace doesn't either.
 *
 *  Kept separate from traceBalancedLineBreaks and balancedLineBreaks so neither
 *  function's behavior or signature is touched by this addition. */
export function traceCellEvents(sizes: number[], capacity: number, gap: number): CellEvent[] {
  const n = sizes.length;
  if (!n) return [];

  const { score, length } = buildMatrix(sizes, capacity, gap);

  // Everything fits on one line: same single-row shortcut as the other trace fns.
  // n === 1 here too, so the row has exactly one candidate (end = n) and it fits —
  // no probe to add.
  if (length(0, n) <= capacity) {
    const total = score[0][n] as number;
    return [
      { kind: 'evaluate', start: 0, end: n, lineScore: total, memoIndex: n, memoValue: 0, total, isChosen: true },
      { kind: 'settle', start: 0, settledValue: total },
      { kind: 'traceback', start: 0, end: n },
      { kind: 'result', breaks: [n] },
    ];
  }

  const lastFittingEnd = new Array<number>(n).fill(0);
  let end = 1;
  for (let start = 0; start < n; start++) {
    end = Math.max(end, start + 1);
    while (end < n && length(start, end + 1) <= capacity) end++;
    lastFittingEnd[start] = end;
  }

  const INF = Number.POSITIVE_INFINITY;
  const minScores = new Array<number>(n + 1).fill(INF);
  minScores[n] = 0;
  const bestEnd = new Array<number>(n).fill(0);
  const events: CellEvent[] = [];

  for (let start = n - 1; start >= 0; start--) {
    const bound = lastFittingEnd[start];
    const rowStart = events.length;

    // Fitting candidates: end from start+1 through bound. These are exactly what
    // the real DP scores and compares against minScores[start].
    for (let e = start + 1; e <= bound; e++) {
      const lineScore = score[start][e] as number;
      const memoValue = minScores[e];
      const total = lineScore + memoValue;
      if (total <= minScores[start]) {
        minScores[start] = total;
        bestEnd[start] = e;
      }
      events.push({ kind: 'evaluate', start, end: e, lineScore, memoIndex: e, memoValue, total, isChosen: false });
    }

    // The single probe: the first end past the fitting bound, if the row has one.
    // Its own numbers are still real (the memo entry it reads is always already
    // settled) but it never enters the minScores[start] comparison above, and
    // every end past it is implied impossible without being scored at all.
    if (bound < n) {
      const e = bound + 1;
      const lineScore = score[start][e] as number;
      const memoValue = minScores[e];
      const total = lineScore + memoValue;
      const impliedEnds: number[] = [];
      for (let rest = e + 1; rest <= n; rest++) impliedEnds.push(rest);
      events.push({
        kind: 'evaluate',
        start,
        end: e,
        lineScore,
        memoIndex: e,
        memoValue,
        total,
        isChosen: false,
        isProbe: true,
        impliedEnds,
      });
    }

    // isChosen is filled in once bestEnd[start] is final: an earlier candidate in
    // this row may tie the eventual minimum without being the one the <= tie-break
    // actually kept. The probe (if any) is never eligible and stays false.
    for (let i = events.length - 1; i >= rowStart; i--) {
      const ev = events[i] as CellEvaluateEvent;
      if (!ev.isProbe) ev.isChosen = ev.end === bestEnd[start];
    }
    events.push({ kind: 'settle', start, settledValue: minScores[start] });
  }

  // Second, backward pass: reconstruct the chosen path from bestEnd, starting at 0.
  // Runs only after every row above has already settled — mirrors the forward DP's
  // own dependency order (a row's bestEnd is only meaningful once its comparisons
  // are done), and keeps "which cells are chosen" a decision made strictly after
  // "what is each row's own minimum", never simultaneously with it.
  const breaks: number[] = [];
  for (let start = 0; start < n; ) {
    const end = bestEnd[start];
    events.push({ kind: 'traceback', start, end });
    breaks.push(end);
    start = end;
  }

  // Final event: states the answer the walk above just assembled. `breaks` here
  // is exactly the list of `end`s pushed by the traceback loop, so this event can
  // never disagree with the blue cells the reader just watched turn chosen — it's
  // the same array, not a second computation of it.
  events.push({ kind: 'result', breaks });

  return events;
}

/** Parse "40, 40, 100" into [40, 40, 100], dropping blanks and non-numbers. */
/** Most items the visualiser will lay out. The matrix is O(n^2) cells, and past
 *  roughly this many the informative diagonal band is buried in a field of
 *  structurally impossible and overflowing cells — it stops teaching and becomes
 *  wallpaper. The cap is on the input rather than the render so every part of
 *  the page agrees on how many items exist. */
export const MAX_ITEMS = 10;

/** The step sequence for ONE layer of the 2D DP.
 *
 *  The real loop interleaves layers per row (`start` outer, `remaining` middle), so no single
 *  layer can be stepped in the literal execution order. This trace instead walks one layer's own
 *  cells, which is faithful about the dependency that matters: a cell in layer `remaining` is
 *  priced with `minScores[end][remaining - 1]`, and that shallower layer is genuinely already
 *  complete, because its rows all sit at a higher `start`.
 *
 *  Only the answer layer gets traceback and result events. A lower layer settles and stops,
 *  because it does not produce the answer — it prices the layer above it. */
export function traceCellEventsForLayer(
  sizes: number[],
  capacity: number,
  gap: number,
  flexLineCount: number,
  layer: number,
): CellEvent[] {
  const n = sizes.length;
  const events: CellEvent[] = [];
  if (!n) return events;

  const solved = balancedLineBreaksWithLineCount(sizes, capacity, gap, flexLineCount);
  const { requiredLineCount, score } = solved;
  const remaining = Math.min(Math.max(1, Math.floor(layer)), requiredLineCount);
  // A non-empty rest always needs at least one line, so the layer beneath floors at 1, matching
  // `restLines` in WebCore. The final line's rest is empty and simply costs nothing.
  const restLayer = Math.max(remaining - 1, 1);

  const { length } = buildMatrix(sizes, capacity, gap);

  // The algorithm's own shortcut: one line asked for, and everything fits on one line, so no DP
  // runs at all. The trace has to take it too, or it would narrate work the solver never did —
  // and the solver's table is left sparse in exactly this case.
  if (requiredLineCount <= 1 && length(0, n) <= capacity) {
    const lineScore = score[0][n] as number;
    events.push({
      kind: 'evaluate',
      start: 0,
      end: n,
      remaining: 1,
      memoIndex: n,
      memoRemaining: 1,
      memoValue: 0,
      lineScore,
      total: lineScore,
      isChosen: true,
    });
    events.push({ kind: 'settle', start: 0, settledValue: lineScore, remaining: 1 });
    events.push({ kind: 'traceback', start: 0, end: n, remaining: 1 });
    events.push({ kind: 'result', breaks: solved.breaks });
    return events;
  }

  const lastFittingEnd = new Array<number>(n).fill(0);
  let scan = 1;
  for (let start = 0; start < n; start++) {
    scan = Math.max(scan, start + 1);
    while (scan < n && length(start, scan + 1) <= capacity) scan++;
    lastFittingEnd[start] = scan;
  }

  const INF = Number.POSITIVE_INFINITY;

  const restScoreFor = (end: number): number | null => {
    if (end === n) return remaining > 1 ? null : 0;
    if (restLayer > n - end) return null;
    return solved.minScores[end][restLayer];
  };

  for (let start = n - 1; start >= 0; start--) {
    let best = INF;
    let bestEndHere: number | null = null;
    for (let end = start + 1; end <= lastFittingEnd[start]; end++) {
      const rest = restScoreFor(end);
      if (rest == null) continue;
      const lineScore = score[start][end] as number;
      const total = lineScore + rest;
      if (total <= best) {
        best = total;
        bestEndHere = end;
      }
      events.push({
        kind: 'evaluate',
        start,
        end,
        remaining,
        memoIndex: end,
        memoRemaining: end === n ? remaining : restLayer,
        memoValue: rest,
        lineScore,
        total,
        isChosen: false,
      });
    }
    const probeEnd = lastFittingEnd[start] + 1;
    if (probeEnd <= n) {
      const rest = restScoreFor(probeEnd);
      if (rest != null) {
        events.push({
          kind: 'evaluate',
          start,
          end: probeEnd,
          remaining,
          memoIndex: probeEnd,
          memoRemaining: probeEnd === n ? remaining : restLayer,
          memoValue: rest,
          lineScore: score[start][probeEnd] as number,
          total: (score[start][probeEnd] as number) + rest,
          isChosen: false,
          isProbe: true,
          impliedEnds: Array.from({ length: n - probeEnd }, (_, i) => probeEnd + 1 + i),
        });
      }
    }
    if (bestEndHere != null) {
      for (let i = events.length - 1; i >= 0; i--) {
        const ev = events[i];
        if (ev.kind !== 'evaluate' || ev.start !== start) continue;
        if (ev.end === bestEndHere && !ev.isProbe) { ev.isChosen = true; break; }
      }
    }
    if (Number.isFinite(best)) events.push({ kind: 'settle', start, settledValue: best, remaining });
  }

  // Only the answer layer reconstructs a path.
  if (remaining === requiredLineCount) {
    for (let start = 0, owed = requiredLineCount; start < n; ) {
      const end = solved.bestEnd[start][owed];
      if (end == null) break;
      events.push({ kind: 'traceback', start, end, remaining: owed });
      owed = Math.max(owed - 1, 1);
      start = end;
    }
    events.push({ kind: 'result', breaks: solved.breaks });
  }

  return events;
}

export function parseSizes(input: string): number[] {
  return input
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map(Number)
    .filter((x) => Number.isFinite(x))
    .slice(0, MAX_ITEMS);
}
