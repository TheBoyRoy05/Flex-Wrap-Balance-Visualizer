<script lang="ts">
  // Payoff view: render the actual lines greedy vs balanced produce, side by side.
  // Like ScoreMatrix, everything here is $derived from the shared balanceState —
  // there's no local $state, because every value is a pure function of the shared
  // inputs and recomputing on change is exactly what $derived is for.
  import { balanceState } from './state.svelte';
  import { isOverflowingLine, type MatrixResult } from './balance';

  interface Line {
    start: number;
    end: number;
    items: number[];
    /** Laid-out length of the line (items + internal gaps), same unit as capacity. */
    length: number;
    /** Free space left on the line; 0 when the line overflows capacity. */
    free: number;
    /** Squared free space — what flex-wrap: balance actually minimizes. Read from
     *  the shared score matrix (balanceState.result), never recomputed here, so this
     *  panel and ScoreMatrix.svelte can never disagree about the same line's cost. */
    score: number;
    /** True when the line's laid-out length exceeds capacity — rendering must contain this, not spill it. */
    overflow: boolean;
  }

  // The score matrix is a pure function of (sizes, capacity, gap) — it holds a
  // score/len entry for every [start, end) pair, independent of which breaks any
  // particular strategy chose. That means the one matrix balanceState.result
  // already computes for the DP also covers greedy's breaks: both strategies are
  // just different subsets of the same [start, end) index space, so both read from
  // this one source instead of each keeping its own free/score arithmetic.
  const matrix: MatrixResult = $derived(balanceState.result);

  /** Turn a break-index list (one-past-last-item of each line) into renderable lines,
   *  looking up length/score in the shared matrix rather than recomputing them. */
  function buildLines(sizes: number[], breaks: number[], m: MatrixResult, capacity: number): Line[] {
    let start = 0;
    return breaks.map((end) => {
      const items = sizes.slice(start, end);
      const length = m.len[start]?.[end] ?? 0;
      const score = m.score[start]?.[end] ?? 0;
      const overflow = isOverflowingLine(m.len, start, end, capacity);
      const free = overflow ? 0 : capacity - length;
      const line: Line = { start, end, items, length, free, score, overflow };
      start = end;
      return line;
    });
  }

  const greedyLines = $derived(
    buildLines(balanceState.sizes, balanceState.greedyBreaks, matrix, balanceState.capacity),
  );
  const balancedLines = $derived(
    buildLines(balanceState.sizes, balanceState.result.breaks, matrix, balanceState.capacity),
  );

  const greedyTotal = $derived(greedyLines.reduce((sum, line) => sum + line.score, 0));
  const balancedTotal = $derived(balancedLines.reduce((sum, line) => sum + line.score, 0));

  // Nominal pixel width standing in for `capacity`, so both panels share one
  // scale and lines are visually comparable. This is a *target* passed to the
  // track element's `style width`; the CSS layout (grid columns, panel padding,
  // `max-width: 100%`) can still render the track narrower than this on small
  // viewports. Item widths must be computed against the track's true rendered
  // width (`trackClientWidth`, measured via `bind:clientWidth` below), not this
  // constant — otherwise an item sized as a fraction of 360 can be wider than
  // a track that's actually only, say, 336px, and it escapes the box.
  const trackPx = 720;

  // `bind:clientWidth` is a readonly dimension binding: Svelte measures the
  // element with a ResizeObserver and keeps this $state in sync whenever the
  // element's layout box changes size (window resize, panel reflow, etc).
  // Starts at trackPx before the element has mounted/measured.
  let trackClientWidth = $state(trackPx);

  // `.line-row` reserves 4px padding on each side (see CSS below) for its own
  // chrome; that space is not available to the item/free children laid out
  // inside it. Item widths must be computed against the row's inner content
  // width, not the outer track width, or the last item in a full row overruns
  // the row by exactly that padding amount. The row's hairline divider sits on
  // the bottom edge only, so it consumes no horizontal space.
  const rowInset = 8; // 2 * 4px padding

  const pxPerUnit = $derived(
    balanceState.capacity > 0 ? (trackClientWidth - rowInset) / balanceState.capacity : 0,
  );

  // A line that overflows capacity would otherwise render wider than the track
  // and spill out of the panel. Instead of letting it spill, compress that one
  // line's own scale so its total length maps exactly to the row's inner
  // content width — it still reads as "packed tighter than the others", which
  // *is* the overflow signal, rather than clipping content or breaking layout.
  function lineScale(line: Line): number {
    if (!line.overflow || line.length <= 0) return pxPerUnit;
    return (trackClientWidth - rowInset) / line.length;
  }

  function itemPx(size: number, scale: number): number {
    return Math.max(2, size * scale);
  }
</script>

{#snippet panel(title: string, lines: Line[], total: number)}
  <div class="panel">
    <div class="panel-title">{title}</div>
    {#if lines.length === 0}
      <p class="panel-empty">Enter at least one item size above.</p>
    {:else}
      <!-- Both panels sit in equal `1fr` grid columns (see .preview below), so
           their tracks are always the same width. Either can drive the shared
           `trackClientWidth` reactively — bind:clientWidth just keeps writing
           the same measured number from whichever track last resized. -->
      <div class="track-pad">
        <div class="track" style="width: {trackPx}px" bind:clientWidth={trackClientWidth}>
          {#each lines as line (line.start)}
            {@const scale = lineScale(line)}
            <div class="line-row" class:line-row-overflow={line.overflow} style="gap: {Math.max(0, balanceState.gap * scale)}px">
              {#each line.items as size, i (`${line.start}-${i}`)}
                <div class="item" style="width: {itemPx(size, scale)}px">
                  <span class="item-label">{size}</span>
                </div>
              {/each}
              {#if line.free > 0}
                <div class="free" title="free: {line.free}">
                  <span class="free-label">{line.free}</span>
                </div>
              {:else if line.overflow}
                <div class="overflow-badge" title="overflow: length exceeds capacity — this line's 0 is waived, not earned">
                  <span class="overflow-badge-label">&infin; over</span>
                </div>
              {/if}
            </div>
          {/each}
        </div>
      </div>
      <p class="panel-total">
        Total squared free space: <span class="panel-total-value">{total}</span>
        {#if lines.some((line) => line.overflow)}
          <span class="panel-total-overflow-note">— includes an overflowing line; its 0 is waived, not earned</span>
        {/if}
      </p>
    {/if}
  </div>
{/snippet}

<div class="preview">
  {@render panel('Greedy (flex-wrap: wrap)', greedyLines, greedyTotal)}
  {@render panel('Balanced (flex-wrap: balance)', balancedLines, balancedTotal)}
</div>

<style>
  .preview {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-24);
  }

  @media (max-width: 640px) {
    .preview {
      grid-template-columns: 1fr;
    }
  }

  .panel {
    display: flex;
    flex-direction: column;
    gap: 0;
    min-width: 0;
    border: 1px solid var(--color-hairline);
    border-radius: var(--radius-10);
    overflow: hidden;
  }

  .panel-title {
    font-size: var(--text-13);
    font-weight: 500;
    color: var(--color-text);
    padding: var(--space-8) var(--space-16);
    background: var(--color-surface);
    border-bottom: 1px solid var(--color-hairline);
  }

  .panel-empty {
    font-size: var(--text-15);
    color: var(--color-text-secondary);
    padding: var(--space-16);
  }

  .track {
    display: flex;
    flex-direction: column;
    gap: var(--space-8);
    max-width: 100%;
  }

  .track-pad {
    padding: var(--space-16) var(--space-16) var(--space-4);
  }

  .line-row {
    display: flex;
    align-items: center;
    height: var(--space-32);
    /* A single hairline stands in for the row frame that used to be a bordered
       box; it still separates one line from the next without nesting a panel
       inside a panel. */
    border-bottom: 1px solid var(--color-hairline);
    padding: 0 var(--space-4) var(--space-8);
    max-width: 100%;
  }

  .line-row-overflow {
    border-bottom-color: var(--color-overflow);
  }

  /* Item chips: accent border in both panels, per this task. `border-box` sizing
     keeps the 1px border inside the runtime-computed `width` (see `itemPx` above)
     rather than adding to it — the geometry is proportional to `capacity`, and a
     border that grew the box would throw that proportion off. Border color is the
     only change here: width stays 1px, box model stays border-box. */
  /* Item chips: accent border in both panels, per this task. `border-box` sizing
     keeps the 1px border inside the runtime-computed `width` (see `itemPx` above)
     rather than adding to it — the geometry is proportional to `capacity`, and a
     border that grew the box would throw that proportion off. Border color is the
     only change here: width stays 1px, box model stays border-box. */
  .item {
    display: flex;
    align-items: center;
    justify-content: center;
    height: var(--space-24);
    flex: 0 0 auto;
    border-radius: var(--radius-6);
    background: var(--color-surface);
    border: 1px solid var(--color-accent);
    box-sizing: border-box;
    overflow: hidden;
  }

  .item-label {
    font-size: var(--text-13);
    font-variant-numeric: tabular-nums;
    color: var(--color-text);
    font-weight: 500;
    white-space: nowrap;
    padding: 0 var(--space-4);
  }

  .free {
    flex: 1 1 auto;
    min-width: 0;
    height: var(--space-24);
    display: flex;
    align-items: center;
    justify-content: flex-end;
    padding: 0 var(--space-8);
    overflow: hidden;
  }

  .free-label {
    font-size: var(--text-13);
    font-variant-numeric: tabular-nums;
    color: var(--color-text-secondary);
    opacity: 0.75;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Overflow badge fills the same slot the free-space chip would occupy, so an
     overflowing line (free is 0 by definition) still carries an explicit mark
     instead of rendering as a bare row that could pass for a clean, zero-free fit. */
  .overflow-badge {
    flex: 1 1 auto;
    min-width: 0;
    height: var(--space-24);
    display: flex;
    align-items: center;
    justify-content: flex-end;
    padding: 0 var(--space-8);
    overflow: hidden;
  }

  .overflow-badge-label {
    font-size: var(--text-13);
    font-variant-numeric: tabular-nums;
    color: var(--color-overflow);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .panel-total {
    font-size: var(--text-13);
    color: var(--color-text-secondary);
    padding: var(--space-8) var(--space-16) var(--space-16);
  }

  .panel-total-value {
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: var(--color-text);
  }

  .panel-total-overflow-note {
    color: var(--color-overflow);
  }
</style>
