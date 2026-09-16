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
            <div class="line-row" class:line-row-overflow={line.overflow}>
              <!-- `.items` owns the flex gap so it only ever lands BETWEEN item
                   chips, matching the model where gaps sit between items and
                   never after the last one. `.free`/`.overflow-badge` are
                   `.line-row`'s siblings, outside this gapped group, so no gap
                   is stolen from the free region. `.items` adds no padding or
                   border, so it doesn't change what `rowInset` accounts for. -->
              <div class="items" style="gap: {Math.max(0, balanceState.gap * scale)}px">
                {#each line.items as size, i (`${line.start}-${i}`)}
                  <div class="item" style="width: {itemPx(size, scale)}px">
                    <span class="item-label">{size}</span>
                  </div>
                {/each}
              </div>
              {#if line.free > 0}
                <div class="free" title="free: {line.free}">
                  <!-- The number is dropped once the free region is too narrow to
                       hold it clear of the item beside it: pinned to the row's
                       right edge, it would otherwise grow left until it touched
                       the chip and read as one garbled value. Free space that
                       small is already legible as "barely any room", so the
                       digits were adding nothing the row did not show. -->
                  {#if line.free * scale > 24}
                    <span class="free-label">
                      {#if line.free > 20}free: {/if}
                      {line.free}
                    </span>
                  {/if}
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
      <p class="panel-total" class:panel-total--overflow={lines.some((line) => line.overflow)}>
        Total Squared Free Space: <span class="panel-total-value">{total}</span>
        {#if lines.some((line) => line.overflow)}
          <span class="panel-total-overflow-note">— includes an overflowing line</span>
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
    color: var(--color-text);
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
    /* No gap here — the row's own children are `.items` (which owns the item
       gap internally) and `.free`/`.overflow-badge`. If this row had a gap,
       flex would insert it between `.items` and `.free` too, stealing one
       gap's width from the free region even though no gap exists there in
       the model (gaps sit between items, never after the last one). */
    gap: 0;
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

  /* Owns the item gap so it only ever lands between item chips. No padding, no
     border, no `box-sizing` change — this wrapper must be invisible to the
     geometry invariant (`rowInset` still only accounts for `.line-row`'s own
     padding). `flex: 0 0 auto` mirrors the chips' own sizing: this group never
     grows or shrinks, so it can't take width from `.free`. */
  .items {
    display: flex;
    align-items: center;
    flex: 0 0 auto;
    min-width: 0;
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
    box-sizing: border-box;
    overflow: hidden;

    background: var(--color-accent-tint);
    color: var(--color-accent);
    font-weight: 600;
    box-shadow: inset 0 0 0 1.5px var(--color-accent);
  }

  .item-label {
    font-size: var(--text-13);
    font-variant-numeric: tabular-nums;
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
    /* Positioning context for `.free-label`: the label is pinned to this
       box's right edge (see below) rather than laid out in normal flow, so
       it can never push `.free` — or the row — wider than the free space
       it's labeling. */
    position: relative;
    overflow: visible;
  }

  .free-label {
    /* Pinned to `.free`'s right edge — which is the row's own right edge,
       since `.free` is the last child — instead of flowing inside `.free`'s
       padded box. A label wider than the free region it names (tiny free
       space, long number) now grows LEFTWARD across the blank gap area
       instead of clipping, ellipsizing, or escaping past the row's right
       edge. `.free`'s own width is untouched, so this can't steal width
       from the proportional item chips. */
    position: absolute;
    right: var(--space-8);
    top: 50%;
    transform: translateY(-50%);
    font-size: var(--text-13);
    font-variant-numeric: tabular-nums;
    color: var(--color-text);
    opacity: 0.75;
    white-space: nowrap;
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
    color: var(--color-text);
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

  /* An overflowing line's score is waived to 0 rather than earned, so the total
     must not wear the same confident weight as a real minimum — at a capacity
     below every item BOTH strategies read 0, and in primary bold that looks
     like a perfect tie rather than "cannot be scored". */
  .panel-total--overflow .panel-total-value {
    color: var(--color-overflow);
  }
</style>
