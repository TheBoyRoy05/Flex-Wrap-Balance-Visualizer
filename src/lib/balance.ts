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

/** Parse "40, 40, 100" into [40, 40, 100], dropping blanks and non-numbers. */
export function parseSizes(input: string): number[] {
  return input
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map(Number)
    .filter((x) => Number.isFinite(x));
}
