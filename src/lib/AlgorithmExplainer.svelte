<script lang="ts">
  // Reads the same `balanceState` instance every other panel reads — no second DP
  // run. `result` is already a $derived on the class (see state.svelte.ts), so these
  // two fields are themselves $derived: they recompute only when `result` changes,
  // and stay untouched by ScoreMatrix's own step/animation state.
  import { balanceState } from './state.svelte';

  // minScores[0]: least total squared free space to cover every item, the same
  // number the matrix's own "minScore" column settles at row 0.
  const minScoreAtZero = $derived(balanceState.result.minScores[0]);
  // bestEnd[0]: the winning end for the line starting at item 0 — where the
  // README's "our next row starts there" points.
  const bestEndForZero = $derived(balanceState.result.bestEnd[0]);
</script>

<details class="algorithm">
  <summary class="algorithm-summary">The Algorithm</summary>

  <div class="algorithm-body">
    <p>
      The goal of balancing items is to homogenize the free space. To achieve this, we aim to
      minimize the following &ldquo;score&rdquo;:
    </p>

    <math class="algorithm-formula algorithm-formula--display" display="block">
      <mrow>
        <munder>
          <mo>min</mo>
        </munder>
        <munder>
          <mo>&sum;</mo>
          <mtext>line</mtext>
        </munder>
        <msup>
          <mrow>
            <mtext class="algorithm-mathcode">freeSpace</mtext>
            <mo>[</mo>
            <mtext class="algorithm-mathcode">line.start</mtext>
            <mo>,</mo>
            <mtext class="algorithm-mathcode">line.end</mtext>
            <mo>)</mo>
          </mrow>
          <mn>2</mn>
        </msup>
      </mrow>
    </math>

    <p>
      Where <code>start</code> and <code>end</code> are both indices and
      <math class="algorithm-formula">
        <mrow>
          <mtext class="algorithm-mathcode">freeSpace</mtext>
          <mo>[</mo>
          <mtext class="algorithm-mathcode">start</mtext>
          <mo>,</mo>
          <mtext class="algorithm-mathcode">end</mtext>
          <mo>)</mo>
          <mo>=</mo>
          <mtext class="algorithm-mathcode">capacity</mtext>
          <mo>&minus;</mo>
          <mo>[</mo>
          <mo>(</mo>
          <mtext class="algorithm-mathcode">end</mtext>
          <mo>&minus;</mo>
          <mtext class="algorithm-mathcode">start</mtext>
          <mo>&minus;</mo>
          <mn>1</mn>
          <mo>)</mo>
          <mo>*</mo>
          <mtext class="algorithm-mathcode">gap</mtext>
          <mo>+</mo>
          <munderover>
            <mo>&sum;</mo>
            <mrow>
              <mi>i</mi>
              <mo>=</mo>
              <mtext class="algorithm-mathcode">start</mtext>
            </mrow>
            <mrow>
              <mtext class="algorithm-mathcode">end</mtext>
              <mo>&minus;</mo>
              <mn>1</mn>
            </mrow>
          </munderover>
          <mtext class="algorithm-mathcode">itemSize</mtext>
          <mo>[</mo>
          <mi>i</mi>
          <mo>]</mo>
          <mo>]</mo>
        </mrow>
      </math>.
    </p>

    <h3>Brute Force</h3>
    <p>
      Naively, if we have <math class="algorithm-formula"><mi>n</mi></math> items, we have
      <math class="algorithm-formula"><mi>n</mi><mo>&minus;</mo><mn>1</mn></math>
      break locations which gives us
      <math class="algorithm-formula"><mi>O</mi><mo>(</mo><msup><mn>2</mn><mi>n</mi></msup><mo>)</mo></math>
      possible solutions for a brute force search.
    </p>

    <h3>Knuth-Plass</h3>
    <p>
      However, we can do better by memoizing scores for subsets of items, giving us an
      <math class="algorithm-formula"><mi>O</mi><mo>(</mo><msup><mi>n</mi><mn>2</mn></msup><mo>)</mo></math>
      <a href="https://en.wikipedia.org/wiki/Dynamic_programming" target="_blank" rel="noopener noreferrer"
        >Dynamic Programming</a
      >
      solution, see
      <a
        href="https://en.wikipedia.org/wiki/Knuth%E2%80%93Plass_line-breaking_algorithm"
        target="_blank"
        rel="noopener noreferrer">Knuth-Plass Algorithm</a
      >.
    </p>

    <h4>First Pass</h4>
    <p>
      Walking backwards through our items for each start, we calculate the best end by finding
      minimum score where
    </p>

    <math class="algorithm-formula algorithm-formula--display" display="block">
      <mrow>
        <mtext class="algorithm-mathcode">minScore</mtext>
        <mo>[</mo>
        <mtext class="algorithm-mathcode">start</mtext>
        <mo>]</mo>
        <mo>=</mo>
        <munder>
          <mo>min</mo>
          <mrow>
            <mtext class="algorithm-mathcode">end</mtext>
            <mo>&isin;</mo>
            <mo>[</mo>
            <mtext class="algorithm-mathcode">start</mtext>
            <mo>+</mo>
            <mn>1</mn>
            <mo>,</mo>
            <mtext class="algorithm-mathcode">itemCount</mtext>
            <mo>]</mo>
          </mrow>
        </munder>
        <mrow>
          <mo>(</mo>
          <msup>
            <mrow>
              <mtext class="algorithm-mathcode">freeSpace</mtext>
              <mo>[</mo>
              <mtext class="algorithm-mathcode">start</mtext>
              <mo>,</mo>
              <mtext class="algorithm-mathcode">end</mtext>
              <mo>)</mo>
            </mrow>
            <mn>2</mn>
          </msup>
          <mo>+</mo>
          <mtext class="algorithm-mathcode">minScore</mtext>
          <mo>[</mo>
          <mtext class="algorithm-mathcode">end</mtext>
          <mo>]</mo>
          <mo>)</mo>
        </mrow>
      </mrow>
    </math>

    <h4>Second Pass</h4>
    <p>
      Now we know the best end for <code>minScore</code>[0], in our case this is
      <code class="algorithm-live">{minScoreAtZero}</code>. Because it is in column
      <code class="algorithm-live">{bestEndForZero}</code>, our next row starts there. We then
      repeat this, finding the column with the lowest score and using that as our next start
      until we run out of items.
    </p>

    <h3>Optimizations</h3>
    <ol class="algorithm-list">
      <li>
        Since we calculate
        <math class="algorithm-formula">
          <mrow>
            <mtext class="algorithm-mathcode">freeSpace</mtext>
            <mo>[</mo>
            <mtext class="algorithm-mathcode">start</mtext>
            <mo>,</mo>
            <mtext class="algorithm-mathcode">end</mtext>
            <mo>)</mo>
          </mrow>
        </math>
        as the sum of the item sizes in the main
        <math class="algorithm-formula"><mi>O</mi><mo>(</mo><msup><mi>n</mi><mn>2</mn></msup><mo>)</mo></math>
        loop, we can precompute
        <math class="algorithm-formula">
          <mrow>
            <mtext class="algorithm-mathcode">prefixSum</mtext>
            <mo>[</mo>
            <mi>i</mi>
            <mo>]</mo>
            <mo>=</mo>
            <mi>i</mi>
            <mo>*</mo>
            <mtext class="algorithm-mathcode">gap</mtext>
            <mo>+</mo>
            <munderover>
              <mo>&sum;</mo>
              <mrow><mi>j</mi><mo>=</mo><mn>0</mn></mrow>
              <mrow><mi>i</mi><mo>&minus;</mo><mn>1</mn></mrow>
            </munderover>
            <mtext class="algorithm-mathcode">itemSize</mtext>
            <mo>[</mo>
            <mi>j</mi>
            <mo>]</mo>
          </mrow>
        </math>. This allows us to turn an <math class="algorithm-formula"><mi>O</mi><mo>(</mo><mi>n</mi><mo>)</mo></math>
        addition into an <math class="algorithm-formula"><mi>O</mi><mo>(</mo><mn>1</mn><mo>)</mo></math> subtraction:
        <math class="algorithm-formula algorithm-formula--display" display="block">
          <mrow>
            <mtext class="algorithm-mathcode">freeSpace</mtext>
            <mo>[</mo>
            <mtext class="algorithm-mathcode">start</mtext>
            <mo>,</mo>
            <mtext class="algorithm-mathcode">end</mtext>
            <mo>)</mo>
            <mo>=</mo>
            <mtext class="algorithm-mathcode">capacity</mtext>
            <mo>&minus;</mo>
            <mo>(</mo>
            <mtext class="algorithm-mathcode">prefixSum</mtext>
            <mo>[</mo>
            <mtext class="algorithm-mathcode">end</mtext>
            <mo>]</mo>
            <mo>&minus;</mo>
            <mtext class="algorithm-mathcode">prefixSum</mtext>
            <mo>[</mo>
            <mtext class="algorithm-mathcode">start</mtext>
            <mo>]</mo>
            <mo>&minus;</mo>
            <mtext class="algorithm-mathcode">gap</mtext>
            <mo>)</mo>
          </mrow>
        </math>.
      </li>
      <li>
        When looping through the ends for each start, if we overflow the capacity (red boxes), we
        break immediately and mark the rest of the row as impossible since all item sizes are
        non-negative so we&rsquo;ll stay above capacity for any larger rows.
      </li>
    </ol>
  </div>
</details>

<style>
  /* Native <details>/<summary>: works with no script, is keyboard-operable (Enter/Space
     toggle a focused <summary> for free), and needs no `open` state of our own — the
     browser owns it, so there is nothing to wire to `$state` here. Collapsed by default
     because the element has no `open` attribute. */
  .algorithm {
    border-top: 1px solid var(--color-hairline);
  }

  .algorithm-summary {
    display: flex;
    align-items: center;
    gap: var(--space-8);
    padding-block: var(--space-16);
    font-size: var(--text-15);
    font-weight: 500;
    color: var(--color-text);
    cursor: pointer;
    list-style: none;
    user-select: none;
  }

  /* Firefox/older Safari still render a default disclosure triangle marker on
     <summary> unless it's suppressed; the custom ::before glyph below is the
     only disclosure indicator this component wants. */
  .algorithm-summary::-webkit-details-marker {
    display: none;
  }

  .algorithm-summary::marker {
    content: '';
  }

  .algorithm-summary::before {
    content: '';
    width: var(--space-8);
    height: var(--space-8);
    flex: none;
    border-right: 1.5px solid var(--color-text-secondary);
    border-bottom: 1.5px solid var(--color-text-secondary);
    transform: rotate(-45deg);
    transition: transform 150ms ease-out;
  }

  @media (prefers-reduced-motion: reduce) {
    .algorithm-summary::before {
      transition: none;
    }
  }

  /* Open state rotates the same chevron to point down, rather than swapping glyphs —
     one shape, one rule, keyed off the parent <details>' own `open` attribute. */
  .algorithm[open] > .algorithm-summary::before {
    transform: rotate(45deg);
  }

  .algorithm-summary:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px var(--accent-focus-ring);
    border-radius: var(--radius-6);
  }

  .algorithm-body {
    display: flex;
    flex-direction: column;
    gap: var(--space-16);
    max-width: var(--measure-text);
    padding-bottom: var(--space-48);
    font-size: var(--text-15);
    color: var(--color-text-secondary);
  }

  .algorithm-body h3 {
    margin: 0;
    font-family: var(--sans);
    font-weight: 600;
    font-size: var(--text-21);
    letter-spacing: var(--ls-21);
    color: var(--color-text);
  }

  .algorithm-body h4 {
    margin: 0;
    font-family: var(--sans);
    font-weight: 600;
    font-size: var(--text-17);
    color: var(--color-text);
  }

  .algorithm-body p {
    line-height: var(--lh-body);
  }

  .algorithm-body a {
    color: var(--color-accent);
  }

  .algorithm-body a:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px var(--accent-focus-ring);
    border-radius: var(--radius-6);
  }

  .algorithm-list {
    margin: 0;
    padding-left: var(--space-24);
    display: flex;
    flex-direction: column;
    gap: var(--space-12);
    line-height: var(--lh-body);
  }

  .algorithm-formula {
    font-size: var(--text-15);
    color: var(--color-text);
    /* Some inline formulas (the freeSpace optimization equation) are wider than
       the text measure on narrow viewports. Same escape hatch as the display
       variant below: scroll the one formula horizontally in place rather than
       letting it push the page wider. display: inline-block is required for
       overflow-x to take effect on an inline-level box. Undecorated by design —
       most formulas here are a few characters and never need it; framing every
       one to flag the rare wide exception would clutter the common case. */
    display: inline-block;
    max-width: 100%;
    overflow-x: auto;
    vertical-align: middle;
  }

  .algorithm-formula--display {
    display: block;
    margin-block: var(--space-8);
    text-align: center;
    /* Long display equations (the freeSpace optimization, the minScore recurrence)
       exceed the text measure on narrow viewports. Scroll horizontally rather than
       shrink the formula or let it overflow the page — same escape hatch the score
       matrix's own .matrix-scroll already uses for its wide table. */
    overflow-x: auto;
  }

  /* README identifiers written as \texttt{} render in the same monospace treatment
     as `minScore` elsewhere on the page (ScoreMatrix's <code> chip) — mtext is plain
     text in MathML, so the monospace font/tabular-nums come from this class rather
     than a math variant. */
  .algorithm-mathcode {
    font-family: var(--mono);
    font-size: 0.9em;
  }

  /* The two live placeholders: same visual language as the static <code> chip
     (app.css), so they read as "a piece of code" like every other identifier in
     this passage, while still being the one thing on the page that is a number,
     not a word. */
  .algorithm-live {
    font-variant-numeric: tabular-nums;
  }
</style>
