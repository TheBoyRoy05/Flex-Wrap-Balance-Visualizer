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
}

/** Fired once a row has compared every candidate: settles minScores[start] and,
 *  simultaneously, the memo entry at `start` becomes available to rows evaluated
 *  after this point (start-1, start-2, ...). */
export interface CellSettleEvent {
  kind: 'settle';
  start: number;
  settledValue: number;
}

export type CellEvent = CellEvaluateEvent | CellSettleEvent;

/** Flat, cell-granular replay of the suffix DP: one `evaluate` event per candidate
 *  line considered, one `settle` event per row once its candidates are exhausted,
 *  in the exact order the algorithm produces them (start = n-1 down to 0, candidate
 *  ends in ascending order within each row). Built for step-by-step animation, where
 *  the unit of progress is a single candidate evaluation, not a whole row.
 *
 *  Kept separate from traceBalancedLineBreaks and balancedLineBreaks so neither
 *  function's behavior or signature is touched by this addition. */
export function traceCellEvents(sizes: number[], capacity: number, gap: number): CellEvent[] {
  const n = sizes.length;
  if (!n) return [];

  const { score, length } = buildMatrix(sizes, capacity, gap);

  // Everything fits on one line: same single-row shortcut as the other trace fns.
  if (length(0, n) <= capacity) {
    const total = score[0][n] as number;
    return [
      { kind: 'evaluate', start: 0, end: n, lineScore: total, memoIndex: n, memoValue: 0, total, isChosen: true },
      { kind: 'settle', start: 0, settledValue: total },
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
    for (let e = start + 1; e <= lastFittingEnd[start]; e++) {
      const lineScore = score[start][e] as number;
      const memoValue = minScores[e];
      const total = lineScore + memoValue;
      if (total <= minScores[start]) {
        minScores[start] = total;
        bestEnd[start] = e;
      }
      // isChosen is filled in below, once bestEnd[start] is final: an earlier
      // candidate in this row may tie the eventual minimum without being the
      // one the <= tie-break actually kept.
      events.push({ kind: 'evaluate', start, end: e, lineScore, memoIndex: e, memoValue, total, isChosen: false });
    }
    for (let i = events.length - 1; i >= 0 && (events[i] as CellEvaluateEvent).start === start; i--) {
      const ev = events[i] as CellEvaluateEvent;
      ev.isChosen = ev.end === bestEnd[start];
    }
    events.push({ kind: 'settle', start, settledValue: minScores[start] });
  }

  return events;
}

/** Parse "40, 40, 100" into [40, 40, 100], dropping blanks and non-numbers. */
export function parseSizes(input: string): number[] {
  return input
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map(Number)
    .filter((x) => Number.isFinite(x));
}
