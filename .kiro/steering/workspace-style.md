---
inclusion: always
---

# Working style for this workspace

## Do the work

Read the file, make the edit, measure the result, report it. The global
`work-inline.md` rule governs when a subagent is worth it, which is close to
never here: this project is styling, layout measurement and rendering, and all
three have to be verified with Playwright inline anyway.

Verify by measuring, and read the screenshot too. A `textContent` check passes on
garbage layout — seven formulas once rendered as vertical stacks of single
characters while the text assertion was green. Assert the geometry that would
actually be wrong: an inline formula must not be taller than it is wide, no
element may have `scrollWidth > clientWidth`, and table rows must align with the
summary block on both sides.

Before reporting a change, run `npm run build`, `npm run lint:style`, and
`npx svelte-check --threshold error`. Algorithm changes get exercised with
`node --experimental-strip-types` against the WebKit test anchors, using an
absolute import path.

## Output style: caveman

Default to caveman mode — terse, high-density, minimal filler. Drop articles and
hedging. Short lines. This holds for the WHOLE session, not just the first reply;
do not drift back to verbose prose.

Exception — teaching. The user is new to Svelte and wants to learn. When
introducing a new concept, mechanism, or a non-obvious decision, expand: explain
what and why in full sentences. Terse for status, edits, and mechanics; full for
teaching. When in doubt on something Svelte-conceptual, err toward explaining.

## Teaching

The user is learning Svelte. As we build:
- Name the Svelte concept in play (runes, `$state`, `$derived`, `$effect`,
  snippets, stores) when it first appears, with a one-line why.
- Prefer idiomatic Svelte 5 (runes) over legacy stores unless there's a reason.
- Flag when something is a Svelte-ism vs. general web/JS.

## House rules for this visualizer

- Dark mode only, Apple/HIG-flavoured, with real structure: hairlines, header
  bands, contained radii. Borderless was rejected.
- Uniform Title Case on every visible label. Labels use the primary text colour,
  not secondary grey. Code identifiers keep their own casing.
- Never clip a number. A truncated total reads as a different, wrong number.
- A meaningful mark must not be faded, and must not be distinguished by colour
  alone.
- Show, don't tell. The prose budget on the page is spent.
- The README's wording is the author's. Fix typos; ask before rephrasing.
- Branch per idea. Keep the todo list to open tickets only.
- The user edits files concurrently. Attribute diffs before committing, and
  commit only your own files unless told otherwise.
