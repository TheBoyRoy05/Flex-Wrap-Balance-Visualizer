<script lang="ts">
  // Walks the suffix DP one row at a time. The DP computes `start` from n-1 down to 0
  // (it needs `minScores[end]` for every `end > start` before it can decide `start`), so
  // step 0 here is the *last* item's row and the final step is start = 0 — the algorithm's
  // real direction, not a front-to-back story imposed on it afterward.
  import { balanceState } from './state.svelte';
  import { prefersReducedMotion } from 'svelte/motion';

  const steps = $derived(balanceState.trace.steps);
  const stepIndex = $derived(balanceState.clampedStepIndex);
  const step = $derived(steps[stepIndex]);
  const atStart = $derived(stepIndex === 0);
  const atEnd = $derived(stepIndex >= steps.length - 1);

  // Real UI state: whether autoplay is currently running. Nothing about "is the timer
  // ticking right now" can be computed from `sizes`/`capacity`/`stepIndex`, so this is
  // `$state`, not `$derived` — a value with no pure formula behind it has to live as
  // state; $derived is for the cases below it, where one always exists.
  let playing = $state(false);

  function stepForward() {
    if (balanceState.stepIndex < steps.length - 1) balanceState.stepIndex += 1;
    else playing = false;
  }

  function stepBack() {
    if (balanceState.stepIndex > 0) balanceState.stepIndex -= 1;
  }

  function reset() {
    playing = false;
    balanceState.stepIndex = 0;
  }

  function togglePlay() {
    if (atEnd) balanceState.stepIndex = 0;
    playing = !playing;
  }

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
    const delay = prefersReducedMotion.current ? 1600 : 900;
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
    <span class="stepper-progress tnum">{stepIndex + 1} / {steps.length}</span>
  </div>

  {#if step}
    <div class="stepper-body">
      <p class="stepper-headline tnum">
        row <strong>{step.start}</strong>
        {#if step.candidates.length === 1}
          &middot; only candidate
        {:else}
          &middot; {step.candidates.length} candidates
        {/if}
      </p>

      <ol class="stepper-candidates">
        {#each step.candidates as c (c.end)}
          <li class="stepper-candidate tnum" class:stepper-candidate--chosen={c.isChosen}>
            <span class="stepper-candidate-range">[{step.start}, {c.end})</span>
            <span class="stepper-candidate-items">{itemsLabel(step.start, c.end)}</span>
            <span class="stepper-candidate-math">
              {fmt(c.lineScore)} + {fmt(c.restScore)} = <strong>{fmt(c.total)}</strong>
            </span>
            {#if c.isChosen}
              <span class="stepper-candidate-tag">wins</span>
            {/if}
          </li>
        {/each}
      </ol>

      <p class="stepper-conclusion tnum">
        settles at <strong>{step.chosenTotal}</strong> &middot; feeds row {step.start - 1 >= 0 ? '< ' + step.start : '(final)'}
      </p>
    </div>
  {/if}
</div>

<style>
  .stepper {
    display: flex;
    flex-direction: column;
    gap: var(--space-16);
    padding: var(--space-16);
    border: 1px solid var(--color-hairline);
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
    border: 1px solid var(--color-hairline);
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
    color: var(--color-text-secondary);
  }

  .stepper-body {
    display: flex;
    flex-direction: column;
    gap: var(--space-8);
    border-top: 1px solid var(--color-hairline);
    padding-top: var(--space-12);
  }

  .stepper-headline {
    font-size: var(--text-13);
    color: var(--color-text);
  }

  .stepper-candidates {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .stepper-candidate {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-8);
    padding: var(--space-4) var(--space-8);
    border-radius: var(--radius-6);
    border: 1px solid var(--color-hairline);
    background: var(--color-bg);
    font-size: var(--text-13);
    color: var(--color-text-secondary);
  }

  .stepper-candidate--chosen {
    box-shadow: inset 0 0 0 1.5px var(--color-accent);
    background: var(--color-accent-tint);
    color: var(--color-accent);
  }

  .stepper-candidate-range {
    font-weight: 600;
    color: var(--color-text);
  }

  .stepper-candidate--chosen .stepper-candidate-range {
    color: var(--color-accent);
  }

  .stepper-candidate-items {
    opacity: 0.75;
  }

  .stepper-candidate-math {
    margin-left: auto;
  }

  .stepper-candidate-tag {
    font-size: var(--text-13);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: var(--ls-none);
    color: var(--color-accent);
  }

  .stepper-conclusion {
    font-size: var(--text-13);
    color: var(--color-text-secondary);
  }

  .stepper-conclusion strong {
    color: var(--color-text);
  }
</style>
