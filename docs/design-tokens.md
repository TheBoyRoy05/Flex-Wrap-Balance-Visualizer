# Design tokens

Closed set. Any value used in `src/app.css` or any `.svelte` file must be one
of these. No raw hex colors, no off-scale font sizes, radii, spacing, or
widths anywhere outside this file's definitions in `src/app.css`.

## Type

| Token | Value |
|---|---|
| `--text-13` | 13px |
| `--text-15` | 15px |
| `--text-17` | 17px |
| `--text-21` | 21px |
| `--text-28` | 28px |
| `--text-40` | 40px |

| Token | Value | Applies to |
|---|---|---|
| `--lh-tight` | 1.05 | 28, 40 |
| `--lh-body` | 1.45 | 13, 15, 17 |

| Token | Value | Applies to |
|---|---|---|
| `--ls-40` | -0.03em | 40 |
| `--ls-28` | -0.02em | 28 |
| `--ls-21` | -0.02em | 21 |
| `--ls-none` | 0em | below 21 |

## Spacing

| Token | Value |
|---|---|
| `--space-4` | 4px |
| `--space-8` | 8px |
| `--space-12` | 12px |
| `--space-16` | 16px |
| `--space-24` | 24px |
| `--space-32` | 32px |
| `--space-48` | 48px |
| `--space-64` | 64px |

## Radii

| Token | Value |
|---|---|
| `--radius-6` | 6px |
| `--radius-8` | 8px |
| `--radius-10` | 10px |

## Controls

| Token | Value | Applies to |
|---|---|---|
| `--control-height` | 36px | height of text/number inputs |

The spacing scale has no step between 24px and 32px, and 32px undershoots the
Apple HIG's 36-44px control-height range. This token exists so inputs snap to
a value in that range instead of down to the nearest spacing step.

## Color

Dark is the only mode — there is no light variant and no `prefers-color-scheme`
branch. `color-scheme: dark` is set once in `:root`.

| Token | Value | Role |
|---|---|---|
| `--color-bg` | #000000 | page background |
| `--color-surface` | #161617 | raised surface |
| `--color-text` | #f5f5f7 | primary text |
| `--color-text-secondary` | #86868b | secondary text |
| `--color-hairline` | #38383a | hairline / border |
| `--color-accent` | #0a84ff | accent |
| `--color-accent-tint` | rgba(10, 132, 255, 0.16) | accent tint |
| `--color-overflow` | #ff453a | overflow / error red |
| `--color-overflow-tint` | rgba(255, 69, 58, 0.18) | overflow cell / legend swatch background |

## Widths

| Token | Value | Applies to |
|---|---|---|
| `--measure-data` | 1120px | the whole page — one shared content edge |
| `--measure-text` | 640px | internal readability cap on a text line only (e.g. the subhead); never a container width |
| `--gutter` | 24px | page gutter, ≥768px |
| `--gutter-narrow` | 16px | page gutter, <768px |

The page has a single content measure. Every top-level section — header,
controls, preview panels, matrix, footer — sits in the same `.measure`
container at `--measure-data`, so the page has one consistent left/right edge.
`--measure-text` is not a second container tier: it only caps the width of a
line of prose *inside* a `.measure` container when an unconstrained line would
run past a comfortable reading width.

## Rule

These are the only permitted values. Any value not on this list, found
anywhere in the codebase outside these definitions, is a bug: snap it to the
nearest scale value instead of introducing a new one.
