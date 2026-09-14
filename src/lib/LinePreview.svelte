<script lang="ts">
  // Payoff view: render the actual lines greedy vs balanced produce, side by side.
  // Like ScoreMatrix, everything here is $derived from the shared balanceState —
  // there's no local $state, because every value is a pure function of the shared
  // inputs and recomputing on change is exactly what $derived is for.
  import { balanceState } from './state.svelte';

  interface Line {
    start: number;
    end: number;
    items: number[];
    /** Laid-out length of the line (items + internal gaps), same unit as capacity. */
    length: number;
    /** Free space left on the line; 0 when the line overflows capacity. */
    free: number;
    /** Squared free space — what flex-wrap: balance actually minimizes. */
    score: number;
    /** True when the line's laid-out length exceeds capacity — rendering must contain this, not spill it. */
    overflow: boolean;
  }

  /** Turn a break-index list (one-past-last-item of each line) into renderable lines. */
  function buildLines(sizes: number[], breaks: number[], capacity: number, gap: number): Line[] {
    let start = 0;
    return breaks.map((end) => {
      const items = sizes.slice(start, end);
      const length = items.reduce((sum, size) => sum + size, 0) + gap * Math.max(0, items.length - 1);
      const free = length < capacity ? capacity - length : 0;
      const line: Line = { start, end, items, length, free, score: free * free, overflow: length > capacity };
      start = end;
      return line;
    });
  }

  const greedyLines = $derived(
    buildLines(balanceState.sizes, balanceState.greedyBreaks, balanceState.capacity, balanceState.gap),
  );
  const balancedLines = $derived(
    buildLines(balanceState.sizes, balanceState.result.breaks, balanceState.capacity, balanceState.gap),
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
  const trackPx = 360;

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
            {/if}
          </div>
        {/each}
      </div>
      <p class="panel-total">
        Total squared free space: <span class="panel-total-value">{total}</span>
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
    gap: 24px;
  }

  @media (max-width: 640px) {
    .preview {
      grid-template-columns: 1fr;
    }
  }

  .panel {
    display: flex;
    flex-direction: column;
    gap: 12px;
    /* No panel border/fill: the two panels are separated by the grid gap and
       their own title, not a box. Whitespace does the separating. */
    /* Grid items default to a min-width equal to their content's intrinsic width;
       without this a fixed-width .track can force the column (and the page) wider
       than the viewport instead of shrinking. */
    min-width: 0;
  }

  .panel-title {
    font-size: 13px;
    font-weight: 500;
    color: var(--text-h);
  }

  .panel-empty {
    font-size: 15px;
    color: var(--text);
  }

  .track {
    display: flex;
    flex-direction: column;
    gap: 10px;
    max-width: 100%;
  }

  .line-row {
    display: flex;
    align-items: center;
    height: 36px;
    /* A single hairline stands in for the row frame that used to be a bordered
       box; it still separates one line from the next without nesting a panel
       inside a panel. */
    border-bottom: 1px solid var(--border);
    padding: 0 4px 8px;
    max-width: 100%;
  }

  .line-row-overflow {
    border-bottom-color: var(--overflow);
  }

  /* Item chips keep a minimal fill (no border) so proportional widths still read
     as distinct blocks — removing this would lose the "line is made of items"
     shape that the geometry exists to show. Monochrome: items don't carry meaning,
     so they don't get the accent. */
  .item {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 28px;
    flex: 0 0 auto;
    border-radius: 4px;
    background: var(--code-bg);
    overflow: hidden;
  }

  .item-label {
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    color: var(--text-h);
    font-weight: 500;
    white-space: nowrap;
    padding: 0 4px;
  }

  .free {
    flex: 1 1 auto;
    min-width: 0;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    padding: 0 6px;
    overflow: hidden;
  }

  .free-label {
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    color: var(--text);
    opacity: 0.75;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .panel-total {
    font-size: 13px;
    color: var(--text);
    padding-top: 2px;
  }

  .panel-total-value {
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: var(--text-h);
  }
</style>
