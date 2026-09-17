<script lang="ts">
  // Walks the flat cell-event list one candidate evaluation at a time. The DP computes
  // `start` from n-1 down to 0 (it needs `minScores[end]` for every `end > start` before
  // it can decide `start`), and within a row it visits candidate ends in ascending order —
  // `balanceState.cellEvents` already carries that real order, so stepping through it in
  // sequence is stepping through the algorithm's own execution, not a story imposed after.
  import { balanceState } from './state.svelte';
  import type { CellEvaluateEvent, TracebackStepEvent, ResultEvent } from './balance';
  import { prefersReducedMotion } from 'svelte/motion';

  const events = $derived(balanceState.cellEvents);
  const stepIndex = $derived(balanceState.clampedCellStep);
  // The event this step reveals. undefined before the first step (index -1, the
  // empty-matrix state) or once the list is empty (no items).
  const event = $derived(stepIndex >= 0 ? events[stepIndex] : undefined);
  const atStart = $derived(stepIndex <= -1 || events.length === 0);
  const atEnd = $derived(stepIndex >= events.length - 1);

  // The Lines Left control's own bounds: 1 (the lowest layer worth exposing — see
  // `balanceState.layer`'s field comment) through `requiredLineCount`, the deepest
  // layer this input actually needs. A $derived fact about the current inputs, not
  // a constant, since flex-line-count and item count both change it.
  const requiredLineCount = $derived(balanceState.result2D.requiredLineCount);
  const layer = $derived(balanceState.clampedLayer);
  // Item count, so the template can tell an evaluate event's candidate end apart
  // from the empty-rest case (end === n) — see the stepper-eval-math branch below.
  const n = $derived(balanceState.sizes.length);

  // Real UI state: whether autoplay is currently running. Nothing about "is the timer
  // ticking right now" can be computed from `sizes`/`capacity`/`stepIndex`, so this is
  // `$state`, not `$derived` — a value with no pure formula behind it has to live as
  // state; $derived is for the cases below it, where one always exists.
  let playing = $state(false);

  function stepForward() {
    if (balanceState.stepIndex < events.length - 1) balanceState.stepIndex += 1;
    else playing = false;
  }

  function stepBack() {
    if (balanceState.stepIndex > -1) balanceState.stepIndex -= 1;
  }

  function reset() {
    playing = false;
    balanceState.stepIndex = -1;
  }

  function jumpToEnd() {
    playing = false;
    balanceState.stepIndex = events.length - 1;
  }

  function togglePlay() {
    if (atEnd) balanceState.stepIndex = -1;
    playing = !playing;
  }

  // Same commit-time clamp pattern as Controls.svelte's capacity/gap/flex-line-count
  // fields: a typed value can be out of range or momentarily non-numeric while
  // editing, so it's only forced back into [1, requiredLineCount] on blur/change,
  // Both inputs are value + handler rather than `bind:`, because changing layer is not a
  // plain assignment: `setLayer` also saves this layer's step position and restores the
  // target's. They display `clampedLayer`, so neither input can show a value outside the
  // range and no write-through effect is needed to snap them back.
  function pickLayer(event: Event) {
    const raw = Number((event.currentTarget as HTMLInputElement).value);
    if (Number.isFinite(raw)) balanceState.setLayer(raw);
  }

  // Changing sizes/capacity/gap/flex-line-count produces a new `events` list with an
  // unrelated shape — clamping alone (see `clampedCellStep`) could still land mid-run of
  // the new list and show a partially-filled matrix that never actually happened. This
  // effect is a real side effect (it resets state in response to *other* state changing,
  // there's no expression that "equals" that reset), so it's `$effect`, not `$derived`.
  //
  // It depends on `runSignature`, NOT on `events`. `events` also changes when only the
  // layer changes, and an effect tracks every reactive value it touches, so reading it
  // here made this fire on layer moves too and wiped the position `setLayer` had just
  // restored. Depend on the narrowest thing that means "this is a different run".
  $effect(() => {
    balanceState.runSignature;
    playing = false;
    balanceState.stepIndex = -1;
  });


  // The play-timer interval is a genuine side effect — it reaches outside reactive state
  // to schedule work over time — so `$effect` is the right rune here, unlike the derived
  // values above. `$derived` can't do this: there's no expression that "equals" a
  // recurring callback, only a process to start and later tear down. `prefersReducedMotion.current`
  // (from `svelte/motion`) is itself reactive, so slowing the interval for that preference
  // is just another dependency of this effect, no separate wiring needed. The returned
  // teardown clears the previous interval before each re-run and on unmount, per Svelte's
  // effect-cleanup contract — the one part of this component that isn't a plain formula.
  $effect(() => {
    if (!playing) return;
    const delay = prefersReducedMotion.current ? 900 : 450;
    const id = setInterval(stepForward, delay);
    return () => clearInterval(id);
  });

  function itemsLabel(start: number, end: number): string {
    const items = balanceState.sizes.slice(start, end);
    return `[${items.join(', ')}]`;
  }

  function fmt(n: number): string {
    return n === Number.POSITIVE_INFINITY ? '\u221e' : String(n);
  }

  // Renders `breaks` (one-past-last-item indices) as the [start, end) segments
  // they describe — the same range notation `.stepper-eval-range` already uses
  // for a single candidate/traceback link, just one chip per line instead of one.
  const evalEvent = $derived(event?.kind === 'evaluate' ? (event as CellEvaluateEvent) : undefined);
  const settleEvent = $derived(event?.kind === 'settle' ? event : undefined);
  const tracebackEvent = $derived(event?.kind === 'traceback' ? (event as TracebackStepEvent) : undefined);
  const resultEvent = $derived(event?.kind === 'result' ? (event as ResultEvent) : undefined);
</script>

<div class="stepper">
  <div class="stepper-controls">
    <button type="button" class="stepper-btn" onclick={reset} disabled={atStart && !playing}>
      Reset
    </button>
    <button type="button" class="stepper-btn" onclick={stepBack} disabled={atStart}>
      &larr;
    </button>
    <button type="button" class="stepper-btn stepper-btn--primary" onclick={togglePlay}>
      {playing ? 'Pause' : atEnd ? 'Replay' : 'Play'}
    </button>
    <button type="button" class="stepper-btn" onclick={stepForward} disabled={atEnd}>
      &rarr;
    </button>
    <button type="button" class="stepper-btn" onclick={jumpToEnd} disabled={atEnd}>
      Fill all
    </button>
    <label class="stepper-layer-field">
      <span class="stepper-layer-label">Lines Left</span>
      <input
        type="range"
        value={balanceState.clampedLayer}
        oninput={pickLayer}
        min={1}
        max={requiredLineCount}
        step={1}
        class="stepper-layer-slider"
        aria-label="Lines left"
      />
      <input
        type="number"
        value={balanceState.clampedLayer}
        onchange={pickLayer}
        min={1}
        max={requiredLineCount}
        step={1}
        class="field-input stepper-layer-number"
        aria-label="Lines left, numeric"
      />
    </label>

    <span class="stepper-progress tnum stepper-progress--end">{stepIndex + 1} / {events.length}</span>
  </div>


  <div class="stepper-body">
    {#if evalEvent}
      <p class="stepper-headline tnum">
        Layer <strong>{layer}</strong> | Row <strong>{evalEvent.start}</strong> | Candidate End <strong>{evalEvent.end}</strong>
      </p>
      <div class="stepper-eval tnum">
        <span class="stepper-eval-range">[{evalEvent.start}, {evalEvent.end})</span>
        <span class="stepper-eval-items">{itemsLabel(evalEvent.start, evalEvent.end)}</span>
        <span class="stepper-eval-math">
          {#if evalEvent.end === n}
            <!-- end === n: the rest is empty. balance.ts's restScoreFor short-circuits
                 this to a literal 0 before any minScore array read happens — there is no
                 minScore[n][...] entry to name, so this must never read as a memo lookup
                 like every other candidate's math line does. -->
            Empty rest costs 0 (no line owed by nothing)
            | {fmt(evalEvent.lineScore)} + 0 = <strong>{fmt(evalEvent.total)}</strong>
          {:else}
            Reads minScore[<strong>{evalEvent.memoIndex}</strong>][<strong>{evalEvent.memoRemaining ?? 1}</strong>] = {fmt(evalEvent.memoValue)}
            | {fmt(evalEvent.lineScore)} + {fmt(evalEvent.memoValue)} = <strong>{fmt(evalEvent.total)}</strong>
          {/if}
        </span>
        {#if evalEvent.isChosen}
          <span class="stepper-eval-tag">Wins So Far</span>
        {/if}
      </div>
    {:else if settleEvent}
      <p class="stepper-headline tnum">
        Layer <strong>{layer}</strong> | Row <strong>{settleEvent.start}</strong> Settles
      </p>
      <p class="stepper-settle tnum">
        minScore[<strong>{settleEvent.start}</strong>][<strong>{layer}</strong>] &larr; <strong>{fmt(settleEvent.settledValue)}</strong>
        | Now Readable by Rows &lt; {settleEvent.start}
      </p>
    {:else if tracebackEvent}
      <p class="stepper-headline tnum">
        Selecting Link <strong>{tracebackEvent.start}</strong> &rarr; <strong>{tracebackEvent.end}</strong>
      </p>
      <div class="stepper-eval tnum">
        <span class="stepper-eval-range">[{tracebackEvent.start}, {tracebackEvent.end})</span>
        <span class="stepper-eval-items">{itemsLabel(tracebackEvent.start, tracebackEvent.end)}</span>
        <span class="stepper-eval-tag">On Chosen Path</span>
      </div>
    {:else if resultEvent}
      <p class="stepper-headline tnum">Chosen Line Breaks</p>
      <div class="stepper-result">
        <!-- What balancedLineBreaksWithLineCount actually returns: the end index of
             each line, in order. The segments and their item sizes were a friendlier
             restatement, but the point of the last step is to land on the
             function's own output. -->
        <code class="stepper-breaks tnum">[{resultEvent.breaks.join(', ')}]</code>
      </div>
    {:else}
      <p class="stepper-headline tnum">Layer <strong>{layer}</strong> | Press Play To Fill This Layer</p>
    {/if}
  </div>
</div>

<style>
  .stepper {
    display: flex;
    flex-direction: column;
    gap: var(--space-16);
    padding: var(--space-16);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-10);
    background: var(--color-surface);
  }

  .stepper-controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-8);
  }

  .stepper-btn {
    height: var(--control-height);
    padding: 0 var(--space-12);
    border-radius: var(--radius-8);
    border: 1px solid var(--color-border-strong);
    background: var(--color-bg);
    color: var(--color-text);
    font: inherit;
    font-size: var(--text-13);
    font-weight: 500;
    cursor: pointer;
    transition: border-color 200ms ease-out, box-shadow 200ms ease-out, opacity 200ms ease-out;
  }

  .stepper-btn:hover:not(:disabled) {
    border-color: var(--color-accent);
  }

  .stepper-btn:focus-visible {
    outline: none;
    border-color: var(--color-accent);
    box-shadow: 0 0 0 3px var(--accent-focus-ring);
  }

  .stepper-btn:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .stepper-btn--primary {
    border-color: var(--color-accent);
    color: var(--color-accent);
  }

  .stepper-progress--end {
    margin-left: auto;
  }

  .stepper-progress {
    margin-left: auto;
    font-size: var(--text-13);
    color: var(--color-text);
  }

  /* Lines Left: same slider+number pairing as Controls.svelte's CSS inputs, but
     this is a position in the run, not a CSS property, so it sits here with
     Reset/back/play/forward/Fill all rather than in Controls.svelte. Reuses
     .field-input for the number field so both panels' numeric inputs match. */
  /* Sits in the button row: the layer is a position in the run, like the step index, so
     it belongs with the controls that move through the run rather than in a band below. */
  .stepper-layer-field {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: var(--space-8);
    margin-left: var(--space-16);
  }

  .stepper-layer-label {
    font-size: var(--text-13);
    font-weight: 500;
    color: var(--color-text);
  }

  /* The range is 1..requiredLineCount, so at most ten positions and usually two or
     three. A full-width track implied far more travel than there is. */


  .stepper-layer-number {
    width: calc(var(--control-height) * 2);
    flex: none;
  }

  /* Same track/thumb treatment as Controls.svelte's .field-slider, duplicated
     rather than shared across files since Svelte scopes component styles. */
  .stepper-layer-slider {
    width: calc(var(--space-64) * 2);
    flex: none;
    height: var(--control-height);
    -webkit-appearance: none;
    appearance: none;
    background: transparent;
    padding: 0;
    margin: 0;
    cursor: pointer;
  }

  .stepper-layer-slider:focus-visible {
    outline: none;
  }

  .stepper-layer-slider::-webkit-slider-runnable-track {
    height: var(--space-4);
    border-radius: var(--radius-6);
    background: var(--color-hairline);
  }

  .stepper-layer-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: var(--space-16);
    height: var(--space-16);
    margin-top: calc((var(--space-4) - var(--space-16)) / 2);
    border-radius: var(--radius-8);
    background: var(--color-accent);
    border: none;
    box-shadow: 0 0 0 0 transparent;
    transition: box-shadow 0.15s ease;
  }

  .stepper-layer-slider:focus-visible::-webkit-slider-thumb {
    box-shadow: 0 0 0 var(--space-4) var(--color-accent-tint);
  }

  .stepper-layer-slider::-moz-range-track {
    height: var(--space-4);
    border-radius: var(--radius-6);
    background: var(--color-hairline);
  }

  .stepper-layer-slider::-moz-range-progress {
    height: var(--space-4);
    border-radius: var(--radius-6);
    background: var(--color-accent);
  }

  .stepper-layer-slider::-moz-range-thumb {
    width: var(--space-16);
    height: var(--space-16);
    border-radius: var(--radius-8);
    background: var(--color-accent);
    border: none;
    box-shadow: 0 0 0 0 transparent;
    transition: box-shadow 0.15s ease;
  }

  .stepper-layer-slider:focus-visible::-moz-range-thumb {
    box-shadow: 0 0 0 var(--space-4) var(--color-accent-tint);
  }

  .stepper-body {
    display: flex;
    flex-direction: column;
    gap: var(--space-8);
    border-top: 1px solid var(--color-hairline);
    padding-top: var(--space-12);
    /* Reserve height across all three states (empty / evaluate / settle) so the
       stepper panel itself doesn't resize as it steps. */
    min-height: 64px;
  }

  .stepper-headline {
    font-size: var(--text-13);
    color: var(--color-text);
  }

  .stepper-eval {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-8);
    padding: var(--space-4) var(--space-8);
    border-radius: var(--radius-6);
    border: 1px solid var(--color-accent);
    background: var(--color-accent-tint);
    font-size: var(--text-13);
    color: var(--color-accent);
  }

  .stepper-eval-range {
    font-weight: 600;
  }

  .stepper-eval-items {
    opacity: 0.75;
  }

  .stepper-eval-math {
    margin-left: auto;
  }

  .stepper-eval-tag {
    font-size: var(--text-13);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: var(--ls-none);
  }

  /* Final-step layout only: compact inline chips, one per chosen segment,
     sitting side by side and wrapping only once they run out of row width —
     matching the scale of the stepper's other status content (the same
     .stepper-eval chip is one full-width status line; a result chip is a
     short label repeated per segment, so it gets its own smaller treatment
     rather than stacking .stepper-eval full-width, one per row). */
  .stepper-result {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-8);
  }

  .stepper-breaks {
    font-size: var(--text-15);
    color: var(--color-accent);
  }

  .stepper-chip {
    display: inline-flex;
    align-items: center;
    gap: var(--space-4);
    padding: var(--space-4) var(--space-8);
    border-radius: var(--radius-6);
    border: 1px solid var(--color-accent);
    background: var(--color-accent-tint);
    font-size: var(--text-13);
    color: var(--color-accent);
  }

  .stepper-chip .stepper-eval-items {
    opacity: 0.75;
  }

  .stepper-settle {
    font-size: var(--text-13);
    color: var(--color-text);
  }

  .stepper-settle strong {
    color: var(--color-text);
  }

  /* Below the tablet floor the five controls no longer fit one line, and left
     to wrap they stranded `Fill all` alone on a second row. A fixed grid
     instead: the three stepping controls share the first row, and the two
     jumps-to-an-end share the second, which is the pairing they already have
     in meaning. Deterministic at every narrow width, rather than depending on
     where the text happens to break. */
  @media (max-width: 767px) {
    /* Fixed grid rather than wrapping, so the row never reflows into a ragged shape as
       button labels change (Play/Pause/Replay). Targeted by type and class instead of
       nth-child: the layer control joined this row, and positional selectors silently
       shift by one when a child is added. */
    .stepper-controls {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      row-gap: var(--space-8);
    }

    .stepper-btn:nth-of-type(2) { grid-area: 1 / 1 / 2 / 2; }
    .stepper-btn:nth-of-type(3) { grid-area: 1 / 2 / 2 / 3; }
    .stepper-btn:nth-of-type(4) { grid-area: 1 / 3 / 2 / 4; }
    .stepper-btn:nth-of-type(1) { grid-area: 2 / 1 / 3 / 3; }
    .stepper-btn:nth-of-type(5) { grid-area: 2 / 3 / 3 / 4; }

    .stepper-layer-field {
      grid-area: 3 / 1 / 4 / 4;
      margin-left: 0;
    }

    .stepper-layer-slider {
      flex: 1;
      width: auto;
    }

    .stepper-progress {
      grid-area: 4 / 1 / 5 / 4;
      text-align: right;
    }
  }
</style>
