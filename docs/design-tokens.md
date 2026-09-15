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

| Token | Value | Role |
|---|---|---|
| `--color-bg` | #ffffff | page background |
| `--color-surface` | #fafafa | raised surface |
| `--color-text` | #1d1d1f | primary text |
| `--color-text-secondary` | #6e6e73 | secondary text |
| `--color-hairline` | #d2d2d7 | hairline / border |
| `--color-accent` | #0071e3 | accent |
| `--color-accent-tint` | rgba(0, 113, 227, 0.08) | accent tint |
| `--color-overflow` | #d70015 | overflow / error red |

## Widths

| Token | Value | Applies to |
|---|---|---|
| `--measure-prose` | 720px | title, subhead, input row |
| `--measure-data` | 1120px | preview panels, matrix |
| `--gutter` | 24px | page gutter, ≥768px |
| `--gutter-narrow` | 16px | page gutter, <768px |

## Rule

These are the only permitted values. Any value not on this list, found
anywhere in the codebase outside these definitions, is a bug: snap it to the
nearest scale value instead of introducing a new one.
