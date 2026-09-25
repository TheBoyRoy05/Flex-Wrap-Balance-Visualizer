# Open tickets

Durable, cross-session ticket list for this project (the in-session `todo_list`
tool is for the steps of the task in hand and dies with the session; this file is
the tracker that outlives it). Open a ticket when it appears, delete it when it's
done — git history is the record of what was closed. Ordered, most important first.

## flex-line-count v2 (branch `idea/flex-line-count-v2`)

The layer-control design was replaced. The branch holds the combined solution:
Option A (matrix fixed to the answer layer, "Lines Left" control removed) + Option
B (`OutcomeTable.svelte` — `k = 1..n` → line breaks + total squared free space,
current `k` highlighted). Verified: build, lint:style, svelte-check (0 errors),
algorithm test vs the WebKit anchors, screenshots at `k=1` and `k=4`.

1. **Update the README's `flex-line-count` note.** The README says the extra
   dimension is "not captured by this visualizer" — Option B now captures it across
   `k = 1..n`. The README's wording is the author's, so draft a replacement and ask
   (via the `ask_question` card) before applying.
2. **Merge `idea/flex-line-count-v2`** into `idea/flex-line-count` or `main` after
   the author reviews it in the browser.

## Forced-line-count shortcut (branch `idea/forced-line-count-shortcut`)

Off `idea/flex-line-count-v2`. `balancedLineBreaksWithLineCount` now returns early
when `requiredLineCount === itemCount`, because the answer is forced to one item
per line; `traceCellEventsForLayer` mirrors the shortcut and the stepper states the
forcing instead of narrating a scan that never ran (`f9eb955`).

3. **Merge `idea/forced-line-count-shortcut`.** Unblocked: the WebKit counterpart
   landed as `5fa6b0283035` (bug 325009).

## Pre-existing (from the author's original handoff)

4. **Re-run a UX audit** on the whole page now that the layer control is gone and
   the outcome table is in. This was deferred until the line-count design settled;
   it has.
5. **Two cosmetic issues, deliberately left:** at narrow widths the matrix scroller
   cuts a candidate column mid-cell (consequence of hiding scrollbars with no fade);
   the `Unreachable Row` legend swatch is a small diagonal that is hard to read as a
   hatch.
6. **Show results across a sliding capacity range** — a compact plot of total score
   or break count against capacity. (Option B partially addresses the "range"
   request across `k`, but not across capacity.)
