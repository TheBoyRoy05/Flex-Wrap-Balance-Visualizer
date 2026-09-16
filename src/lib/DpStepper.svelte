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

  // Changing sizes/capacity/gap produces a new `events` list with an unrelated shape —
  // clamping alone (see `clampedCellStep`) could still land mid-run of the new list and
  // show a partially-filled matrix that never actually happened. This effect is a real
  // side effect (it reaches out and resets state in response to *other* state changing,
  // there's no expression that "equals" that reset), so it's `$effect`, not `$derived` —
  // matching the same rule the autoplay timer below follows.
  $effect(() => {
    events;
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
    <span class="stepper-progress tnum">{stepIndex + 1} / {events.length}</span>
  </div>

  <div class="stepper-body">
    {#if evalEvent}
      <p class="stepper-headline tnum">
        Row <strong>{evalEvent.start}</strong> | Candidate End <strong>{evalEvent.end}</strong>
      </p>
      <div class="stepper-eval tnum">
        <span class="stepper-eval-range">[{evalEvent.start}, {evalEvent.end})</span>
        <span class="stepper-eval-items">{itemsLabel(evalEvent.start, evalEvent.end)}</span>
        <span class="stepper-eval-math">
          Reads minScore[<strong>{evalEvent.memoIndex}</strong>] = {fmt(evalEvent.memoValue)}
          | {fmt(evalEvent.lineScore)} + {fmt(evalEvent.memoValue)} = <strong>{fmt(evalEvent.total)}</strong>
        </span>
        {#if evalEvent.isChosen}
          <span class="stepper-eval-tag">Wins So Far</span>
        {/if}
      </div>
    {:else if settleEvent}
      <p class="stepper-headline tnum">
        Row <strong>{settleEvent.start}</strong> Settles
      </p>
      <p class="stepper-settle tnum">
        minScore[<strong>{settleEvent.start}</strong>] &larr; <strong>{fmt(settleEvent.settledValue)}</strong>
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
        <!-- What balancedLineBreaks actually returns: the end index of each
             line, in order. The segments and their item sizes were a friendlier
             restatement, but the point of the last step is to land on the
             function's own output. -->
        <code class="stepper-breaks tnum">[{resultEvent.breaks.join(', ')}]</code>
      </div>
    {:else}
      <p class="stepper-headline tnum">Matrix Empty | minScore[n] = 0</p>
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

  .stepper-progress {
    margin-left: auto;
    font-size: var(--text-13);
    color: var(--color-text);
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
    .stepper-controls {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      row-gap: var(--space-8);
    }

    .stepper-controls > :nth-child(2) {
      grid-area: 1 / 1 / 2 / 2;
    }

    .stepper-controls > :nth-child(3) {
      grid-area: 1 / 2 / 2 / 3;
    }

    .stepper-controls > :nth-child(4) {
      grid-area: 1 / 3 / 2 / 4;
    }

    .stepper-controls > :nth-child(1) {
      grid-area: 2 / 1 / 3 / 3;
    }

    .stepper-controls > :nth-child(5) {
      grid-area: 2 / 3 / 3 / 4;
    }

    .stepper-progress {
      grid-area: 3 / 1 / 4 / 4;
      text-align: right;
    }
  }
</style>
