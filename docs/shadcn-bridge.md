# The shadcn bridge

This organisation's components are written against [shadcn](https://ui.shadcn.com)'s
custom-property vocabulary: `--background`, `--card`, `--muted-foreground`,
`--primary`, `--ring`. The catalogue's canonical schema uses different names, because
the schema describes what a component _asks for_ rather than where shadcn happened to
put it.

Both are generated from the same theme object by `src/adapters/shadcn.ts`, so they
cannot disagree. This document is the table, and the reasoning for the entries that
are not a plain rename.

## The mapping

| Canonical role        | shadcn property                                                                     | Note                                                    |
| --------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `background`          | `--background`                                                                      |                                                         |
| `foreground`          | `--foreground`                                                                      |                                                         |
| `surface`             | `--card`                                                                            | the first rung is what shadcn calls a card              |
| `surfaceElevated`     | `--popover`                                                                         | the second rung floats above a card                     |
| `surfaceHover`        | `--surface-hover`, **`--accent`**                                                   | see below                                               |
| `surfaceActive`       | `--surface-active`                                                                  |                                                         |
| `border`              | `--border`, `--input`                                                               | shadcn separates input outlines; the catalogue does not |
| `borderMuted`         | `--border-muted`                                                                    |                                                         |
| `text`                | `--foreground`                                                                      |                                                         |
| `textMuted`           | `--muted-foreground`                                                                |                                                         |
| `textSubtle`          | `--subtle-foreground`                                                               |                                                         |
| `accent`              | **`--primary`**, `--primary-hover`, `--primary-subtle`, `--ring`                    | see below                                               |
| `accentForeground`    | `--primary-foreground`                                                              |                                                         |
| `success`             | `--success`                                                                         |                                                         |
| `warning`             | `--warning`                                                                         |                                                         |
| `error`               | `--destructive`                                                                     | same position in a component's vocabulary               |
| `info`                | `--info`                                                                            |                                                         |
| `cursor`, `selection` | `--cursor`, `--selection`                                                           |                                                         |
| —                     | `--card-foreground`, `--popover-foreground`, `--secondary`, `--muted`, `--sidebar*` | filled from existing roles; see below                   |

## The two entries that are not renames

### `accent` → `--primary`, not `--accent`

This is the one that will bite anyone who assumes the names line up.

In shadcn, `--primary` is the **action colour**: the fill of a primary button, the
selected tab, the thing `bg-primary text-primary-foreground` paints. `--accent` is
something else entirely — a low-contrast wash used as the background of a hovered
menu item, which is why shadcn pairs it with `--accent-foreground` that is usually
the regular text colour.

Adea's `accent` is the interactive colour: what a primary button is filled with, what
a focus ring is drawn in. That is shadcn's `--primary`. Mapping it to `--accent`
would paint every primary button as a hover wash.

The shadcn `--accent` slot is therefore filled from `surfaceHover`, which is what it
is actually used for, and `--ring` is filled from the accent, because a focus ring
drawn in anything else is a focus state that cannot be seen.

The bridge also emits the primary's two state values from the shared accent
derivations in `src/accents.ts`. `--primary-hover` applies the same fixed lightness
step as `primaryHover`, moving away from the canvas (darker in light themes, lighter
in dark themes) while retaining the primary hue. `--primary-subtle` uses
`primarySubtleCss`, a `color-mix()` over `var(--primary)` with the appearance-specific
tint strength, so it follows a runtime override of `--primary`. The hover value is
resolved from the theme's canonical accent, so a consumer overriding `--primary` at
runtime must also recompute `--primary-hover` with `primaryHover(customPrimary,
appearance)`; otherwise the hover retains the theme accent. The adapter tests check
both values and the primary foreground's 4.5:1 contrast on the hover fill for every
exported theme.

### `border` fills both `--border` and `--input`

The canonical schema has one border role and a muted variant; shadcn distinguishes a
divider from an input outline. The catalogue's `border` is the stronger of the two
roles and is the correct choice for both — an input outline is a divider that happens
to have a text cursor in it. A consumer that wants the quieter rule has
`--border-muted`, which is the catalogue's `borderMuted`.

## Status fills

shadcn expects each status role to come with a `-foreground` and a `-subtle`. The
bridge follows the mapped shadcn name, so canonical `error` becomes the destructive
tokens. The catalogue derives each status foreground and subtle fill:

- `--<mapped-role>-foreground` is the text colour to draw on a **solid** fill of that role.
  It is derived per theme rather than taken from the body text: a dark theme's body
  text is near-white, and near-white on a bright green measures about 2.6:1. The
  derivation picks whichever of the theme's two extremes measures better, which for a
  bright green is black and for a deep red is white.
- `--<mapped-role>-subtle` is an opaque OKLCH tint of the role into the theme's canvas.
  A translucent fill's real contrast depends on whatever is behind it, so it cannot
  provide a stable text pairing. Small text on a subtle fill uses the theme's body
  `foreground`; the status `-foreground` is reserved for text on the solid role.

The destructive solid pair has one additional presentation rule. The shared Button
uses `--destructive/90` on hover, so its text must stay readable after that alpha fill
is composited over a canvas or either card surface. `shadcnDestructiveProjection`
searches the smallest lightness adjustment along the canonical error hue that targets
a 5:1 floor for rounded sRGB foreground/fill pairs on the solid fill and its 90%
composition over the canvas, the canonical surface ladder, and the resolved `--card`
and `--popover` surfaces, including owner-authored projection overrides. That margin
protects the 4.5:1 AA floor from browser color quantization. The canonical
`theme.colors.error`, ANSI values, and
syntax roles stay unchanged; `--destructive-subtle` is still tinted from the raw
canonical error. Consumers that assign the destructive tokens directly can use this
projection from `@adea-ai/themes/adapters/shadcn`, or use the values from
`shadcnVariables`.

## The rest of shadcn's default vocabulary

shadcn's starter theme has more properties than the canonical schema has roles, and
they are filled from the roles that exist rather than given entries of their own:

| shadcn property                             | Filled from        | Why                                                          |
| ------------------------------------------- | ------------------ | ------------------------------------------------------------ |
| `--card-foreground`, `--popover-foreground` | `text`             | the surface's own foreground is the body text                |
| `--secondary`, `--muted`                    | `surface`          | both are the first rung used as a fill                       |
| `--secondary-foreground`                    | `text`             |                                                              |
| `--sidebar`                                 | `surface`          |                                                              |
| `--sidebar-foreground`                      | `text`             |                                                              |
| `--sidebar-accent`                          | `surfaceHover`     | shadcn's sidebar accent is a hover wash, like its `--accent` |
| `--sidebar-border`                          | `border`           |                                                              |
| `--sidebar-primary`                         | `accent`           |                                                              |
| `--sidebar-primary-foreground`              | `accentForeground` |                                                              |
| `--sidebar-ring`                            | `accent`           |                                                              |
| `--sidebar-muted-foreground`                | `textMuted`        |                                                              |

## First-party compatibility projections

The `shadcn` field on a catalogue record is an optional, typed projection owned by
this adapter. It preserves source distinctions that the canonical schema does not
represent, such as a separate muted fill, input alpha, or focus ring. The canonical
roles remain the design authority; generic palette validation deliberately does not
evaluate these presentation-only values. `tests/adapters.test.ts` instead checks the
exact projected values (including the legacy input and border alpha) and the
foreground/background pairs that the shared UI actually renders.

The retained Slate Dark source uses `#94a3b8` for canonical `textMuted` and `#334155`
for its muted fill. The shared UI pairs these in enabled components including the
message composer, keyboard hints, empty-state icons, avatars, and button groups. That
pair measures 4.04:1, below the 4.5:1 small-text floor. Its adapter projection raises
only `--muted-foreground` to `oklch(0.7427 0.0351 256.79)`. A 0.03 step clears 4.5:1
in OKLCH but rounds to `#9dacc2` in sRGB, which measures 4.49378:1; the next 0.002
step rounds to `#9eadc2` and measures 4.54142:1. The canonical `textMuted` value,
saved theme ID, and every other legacy shadcn role remain unchanged. This bounded
presentation exception preserves the published component contrast contract; it does
not change the canonical source palette.

A consumer with its _own_ extra namespaces — a `--terminal-*` ramp, an `--editor-*`
ramp — should build them from `theme.ansi` and `derive.syntaxRoles` rather than
expecting the bridge to know about them. Those are presentations of the ANSI and
syntax data that is already in the schema.

## Adding a role to the schema

`SHADCN_MAPPING` in `src/adapters/shadcn.ts` is exhaustive over the schema's roles, so
the compiler will refuse a new role until it has a destination. Add the entry, add it
to this table, and add it to the assertions in `tests/adapters.test.ts`.

## Consuming it

```ts
import { getTheme } from '@adea-ai/themes'
import { shadcnVariables } from '@adea-ai/themes/adapters/shadcn'

const theme = getTheme('adea-dark')!
for (const [name, value] of Object.entries(shadcnVariables(theme))) {
  document.documentElement.style.setProperty(name, value)
}
```

To generate a stylesheet containing every theme instead:

```ts
import { shadcnCss } from '@adea-ai/themes/adapters/shadcn'
const css = themes.map((theme) => shadcnCss(theme, `[data-theme='${theme.id}']`)).join('\n\n')
```
