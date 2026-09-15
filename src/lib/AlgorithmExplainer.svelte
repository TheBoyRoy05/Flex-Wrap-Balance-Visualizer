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
            <mo stretchy="false">[</mo>
            <mtext class="algorithm-mathcode">line.start</mtext>
            <mo>,</mo>
            <mtext class="algorithm-mathcode">line.end</mtext>
            <mo stretchy="false">)</mo>
          </mrow>
          <mn>2</mn>
        </msup>
      </mrow>
    </math>

    <p>
      Where <code>start</code> and <code>end</code> are both indices and
    </p>

    <math class="algorithm-formula algorithm-formula--display" display="block">
      <mrow>
        <mtext class="algorithm-mathcode">freeSpace</mtext>
        <mo stretchy="false">[</mo>
        <mtext class="algorithm-mathcode">start</mtext>
        <mo>,</mo>
        <mtext class="algorithm-mathcode">end</mtext>
        <mo stretchy="false">)</mo>
        <mo>=</mo>
        <mo>max</mo>
        <mrow>
          <mo stretchy="true">(</mo>
          <mn>0</mn>
          <mo>,</mo>
          <mspace width="0.2em" />
          <mtext class="algorithm-mathcode">capacity</mtext>
          <mo>&minus;</mo>
          <mrow>
            <mo stretchy="true">(</mo>
            <mo stretchy="false">(</mo>
            <mtext class="algorithm-mathcode">end</mtext>
            <mo>&minus;</mo>
            <mn>1</mn>
            <mo>&minus;</mo>
            <mtext class="algorithm-mathcode">start</mtext>
            <mo stretchy="false">)</mo>
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
            <mo stretchy="false">[</mo>
            <mi>i</mi>
            <mo stretchy="false">]</mo>
            <mo stretchy="true">)</mo>
          </mrow>
          <mo stretchy="true">)</mo>
        </mrow>
      </mrow>
    </math>

    <h3>Brute Force</h3>
    <p>
      Naively, if we have <math class="algorithm-formula"><mrow><mi>n</mi></mrow></math> items, we have
      <math class="algorithm-formula"><mrow><mi>n</mi><mo>&minus;</mo><mn>1</mn></mrow></math>
      break locations which gives us
      <math class="algorithm-formula"><mrow><mi>O</mi><mo stretchy="false">(</mo><msup><mn>2</mn><mi>n</mi></msup><mo stretchy="false">)</mo></mrow></math>
      possible solutions for a brute force search.
    </p>

    <h3>Knuth-Plass</h3>
    <p>
      However, we can do better by memoizing scores for suffixes of each item, i.e. for each item
      <math class="algorithm-formula"><mrow><mi>i</mi></mrow></math>, memoize the best scores for
      the remaining <math class="algorithm-formula"><mrow><mi>n</mi><mo>&minus;</mo><mi>i</mi></mrow></math>
      items. This gives us an
      <math class="algorithm-formula"><mrow><mi>O</mi><mo stretchy="false">(</mo><msup><mi>n</mi><mn>2</mn></msup><mo stretchy="false">)</mo></mrow></math>
      <a href="https://en.wikipedia.org/wiki/Dynamic_programming" target="_blank" rel="noopener noreferrer"
        >Dynamic Programming</a
      >
      solution, see
      <a
        href="https://en.wikipedia.org/wiki/Knuth%E2%80%93Plass_line-breaking_algorithm"
        target="_blank"
        rel="noopener noreferrer">Knuth-Plass Algorithm</a
      > for more background.
    </p>

    <h4>First Pass</h4>
    <p>
      Walking backwards through our items, for each start, we calculate the best end by finding
      minimum score where
    </p>

    <math class="algorithm-formula algorithm-formula--display" display="block">
      <mrow>
        <mtext class="algorithm-mathcode">minScore</mtext>
        <mo stretchy="false">[</mo>
        <mtext class="algorithm-mathcode">start</mtext>
        <mo stretchy="false">]</mo>
        <mo>=</mo>
        <munder>
          <mo>min</mo>
          <mrow>
            <mtext class="algorithm-mathcode">end</mtext>
            <mo>&isin;</mo>
            <mo stretchy="false">[</mo>
            <mtext class="algorithm-mathcode">start</mtext>
            <mo>+</mo>
            <mn>1</mn>
            <mo>,</mo>
            <mtext class="algorithm-mathcode">itemCount</mtext>
            <mo stretchy="false">]</mo>
          </mrow>
        </munder>
        <mrow>
          <mo stretchy="false">(</mo>
          <msup>
            <mrow>
              <mtext class="algorithm-mathcode">freeSpace</mtext>
              <mo stretchy="false">[</mo>
              <mtext class="algorithm-mathcode">start</mtext>
              <mo>,</mo>
              <mtext class="algorithm-mathcode">end</mtext>
              <mo stretchy="false">)</mo>
            </mrow>
            <mn>2</mn>
          </msup>
          <mo>+</mo>
          <mtext class="algorithm-mathcode">minScore</mtext>
          <mo stretchy="false">[</mo>
          <mtext class="algorithm-mathcode">end</mtext>
          <mo stretchy="false">]</mo>
          <mo stretchy="false">)</mo>
        </mrow>
      </mrow>
    </math>

    <p>
      We also store <math class="algorithm-formula"><mrow><mtext class="algorithm-mathcode">bestEndForStart</mtext><mo stretchy="false">[</mo><mtext class="algorithm-mathcode">start</mtext><mo stretchy="false">]</mo></mrow></math>
      as the last <math class="algorithm-formula"><mrow><mtext class="algorithm-mathcode">end</mtext></mrow></math>
      which achieves <math class="algorithm-formula"><mrow><mtext class="algorithm-mathcode">minScore</mtext><mo stretchy="false">[</mo><mtext class="algorithm-mathcode">start</mtext><mo stretchy="false">]</mo></mrow></math>.
      We store the last <math class="algorithm-formula"><mrow><mtext class="algorithm-mathcode">end</mtext></mrow></math>
      rather than any other to serve as the tie-breaker specified by the
      <a href="https://drafts.csswg.org/css-flexbox-2/#algo-balance" target="_blank" rel="noopener noreferrer"
        >CSS Specification</a
      >.
    </p>

    <h4>Second Pass</h4>
    <p>
      Now we recursively look at the best line ends starting at
      <math class="algorithm-formula"><mrow><mtext class="algorithm-mathcode">start</mtext><mo>=</mo><mn>0</mn></mrow></math>
      and updating it with
      <math class="algorithm-formula"><mrow><mtext class="algorithm-mathcode">start</mtext><mo>=</mo><mtext class="algorithm-mathcode">bestEndForStart</mtext><mo stretchy="false">[</mo><mtext class="algorithm-mathcode">start</mtext><mo stretchy="false">]</mo></mrow></math>
      and adding it to our resulting list of line starts.
    </p>
    <p>
      With this, we have found the best line breaks which minimzes the sum of the squares of free
      space, hence achieving a balanced solution.
    </p>

    <h3>Optimizations</h3>
    <ul class="algorithm-list">
      <li>
        Since we calculate
        <math class="algorithm-formula">
          <mrow>
            <mtext class="algorithm-mathcode">freeSpace</mtext>
            <mo stretchy="false">[</mo>
            <mtext class="algorithm-mathcode">start</mtext>
            <mo>,</mo>
            <mtext class="algorithm-mathcode">end</mtext>
            <mo stretchy="false">)</mo>
          </mrow>
        </math>
        as the sum of the item sizes in the main
        <math class="algorithm-formula"><mrow><mi>O</mi><mo stretchy="false">(</mo><msup><mi>n</mi><mn>2</mn></msup><mo stretchy="false">)</mo></mrow></math>
        loop, we can precompute
        <math class="algorithm-formula algorithm-formula--display" display="block">
          <mrow>
            <mtext class="algorithm-mathcode">prefixSum</mtext>
            <mo stretchy="false">[</mo>
            <mi>i</mi>
            <mo stretchy="false">]</mo>
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
            <mo stretchy="false">[</mo>
            <mi>j</mi>
            <mo stretchy="false">]</mo>
          </mrow>
        </math>
        This allows us to turn an <math class="algorithm-formula"><mrow><mi>O</mi><mo stretchy="false">(</mo><mi>n</mi><mo stretchy="false">)</mo></mrow></math>
        addition into an <math class="algorithm-formula"><mrow><mi>O</mi><mo stretchy="false">(</mo><mn>1</mn><mo stretchy="false">)</mo></mrow></math> subtraction:
        <math class="algorithm-formula algorithm-formula--display" display="block">
          <mrow>
            <mtext class="algorithm-mathcode">freeSpace</mtext>
            <mo stretchy="false">[</mo>
            <mtext class="algorithm-mathcode">start</mtext>
            <mo>,</mo>
            <mtext class="algorithm-mathcode">end</mtext>
            <mo stretchy="false">)</mo>
            <mo>=</mo>
            <mo>max</mo>
            <mrow>
              <mo stretchy="true">(</mo>
              <mn>0</mn>
              <mo>,</mo>
              <mspace width="0.2em" />
              <mtext class="algorithm-mathcode">capacity</mtext>
              <mo>&minus;</mo>
              <mo stretchy="false">(</mo>
              <mtext class="algorithm-mathcode">prefixSum</mtext>
              <mo stretchy="false">[</mo>
              <mtext class="algorithm-mathcode">end</mtext>
              <mo stretchy="false">]</mo>
              <mo>&minus;</mo>
              <mtext class="algorithm-mathcode">prefixSum</mtext>
              <mo stretchy="false">[</mo>
              <mtext class="algorithm-mathcode">start</mtext>
              <mo stretchy="false">]</mo>
              <mo>&minus;</mo>
              <mtext class="algorithm-mathcode">gap</mtext>
              <mo stretchy="false">)</mo>
              <mo stretchy="true">)</mo>
            </mrow>
          </mrow>
        </math>
      </li>
      <li>
        When looping through the ends for each start, if we overflow the capacity (red boxes), we
        break immediately and mark the rest of the row as impossible since all item sizes are
        non-negative so we&rsquo;ll stay above capacity for any larger rows.
      </li>
    </ul>

    <h3>Rules</h3>
    <ul class="algorithm-list">
      <li>
        At least one item is assigned to each line, even if that single item overflows the line
        by itself.
      </li>
      <li>
        Other than the case of a single overflowing item, the sum of the item sizes does not
        exceed the inner main size, i.e. the capacity.
      </li>
      <li>
        To tie-break, prefer adding items to earlier lines. Ex. if both [3, 2] and [2, 3] have the
        same score items per line, prefer 3 items in the first line.
      </li>
    </ul>
    <p>
      See the
      <a href="https://drafts.csswg.org/css-flexbox-2/#algo-balance" target="_blank" rel="noopener noreferrer"
        >CSS Specification</a
      > for exact wording.
    </p>
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
    font-size: var(--text-28);
    font-weight: 600;
    letter-spacing: var(--ls-28);
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
    gap: var(--space-12);
    padding-bottom: var(--space-48);
    font-size: var(--text-17);
    color: var(--color-text);
  }

  /* Tighten a heading to the paragraph/formula that starts its section, and
     pull a display formula up against the paragraph whose sentence it
     continues, so prose and formula read as one passage rather than a stack
     of same-weight disconnected blocks. The gap before a heading (a new
     section starting) stays the wider rhythm above. */
  .algorithm-body h3 + p,
  .algorithm-body h3 + math,
  .algorithm-body h4 + p,
  .algorithm-body h4 + math,
  .algorithm-body p + math.algorithm-formula--display,
  .algorithm-body math.algorithm-formula--display + p {
    margin-top: calc(-1 * var(--space-8));
  }

  .algorithm-body h3 {
    margin: 0;
    margin-top: var(--space-24);
    font-family: var(--sans);
    font-weight: 600;
    font-size: var(--text-21);
    color: var(--color-text);
  }

  .algorithm-body h4 {
    margin: 0;
    margin-top: var(--space-12);
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
    font-size: var(--text-17);
    color: var(--color-text);
    /* Inline formulas sit inside running prose. inline-block (not inline) is
       required here: this MathML implementation lays out a <math> element's
       internal rows as block-flow, so a plain `inline` display collapses the
       formula into a vertical stack of its own child boxes instead of one
       token on the text line. inline-block keeps the formula a single
       measured box that flows with surrounding text; none of these formulas
       are wide enough to need their own scrollbar or shrinking, so no
       overflow handling is needed at this size. */
    display: inline-block;
    vertical-align: middle;
  }

  .algorithm-formula--display {
    display: block;
    margin-block: var(--space-8);
    text-align: center;
    /* Display equations are wider than a line of prose by design, so they
       cannot wrap like inline text. At 1440/1280/768px every one fits inside
       the page measure at its own size, so no scaling or scrolling happens
       there. Only the narrow 375px breakpoint below needs an escape hatch. */
    max-width: 100%;
  }

  /* Below the page's own narrow-gutter breakpoint, the longest display
     equation (the freeSpace optimization inside Optimizations, ~30 MathML
     tokens across a max(), a subtraction and a prefixSum pair) is still wider
     than the viewport even at the smallest step down. Rather than shrink
     every formula's text illegibly small to force that one to fit, this
     formula alone scrolls horizontally in place at this width — the same
     escape hatch the score matrix's own .matrix-scroll uses for its wide
     table, scoped to just where it's needed instead of applied everywhere. */
  @media (max-width: 480px) {
    .algorithm-formula--display {
      overflow-x: auto;
    }
  }

  /* README identifiers written as \texttt{} render in the same monospace treatment
     as `minScore` elsewhere on the page (ScoreMatrix's <code> chip) — mtext is plain
     text in MathML, so the monospace font/tabular-nums come from this class rather
     than a math variant. */
  .algorithm-mathcode {
    font-family: var(--mono);
    font-size: 0.9em;
  }

  /* Rule must come after the base .algorithm-mathcode declaration above: both
     have the same selector specificity, so with equal specificity the later
     rule in source order wins regardless of the media query, and this one
     needs to win under 768px. */
  @media (max-width: 768px) {
    .algorithm-mathcode {
      font-size: 0.8em;
    }
  }

  /* Identifier styling for this section, made uniform: plain monospace text,
     not the global `code` chip (background/padding/inline-flex) — the section
     is dense with identifiers (start, end, minScore[0], ...) and boxing every
     one would read as a wall of buttons. `minScore[0]` is written as one
     `<code>` string so its subscript-style index renders as a single unit
     rather than a boxed name with an unboxed index trailing it. */
  .algorithm-body code {
    display: inline;
    padding: 0;
    border-radius: 0;
    background: none;
    font-variant-numeric: tabular-nums;
    color: var(--color-text);
  }
</style>
