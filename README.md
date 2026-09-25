# @adea-ai/themes

The Adea theme catalogue. Twenty-seven themes — every one an OKLCH theme with the
full set of semantic surface roles, sixteen ANSI colours, a cursor and a selection —
normalized from mature upstream palettes, with adapters for the places a theme has
to arrive in a foreign shape.

```sh
bun add @adea-ai/themes
```

## The catalogue

| Family | Variants |
| --- | --- |
| **Adea** | Light, Dark |
| **Catppuccin** | Latte, Frappé, Macchiato, Mocha |
| **Tokyo Night** | Day, Storm, Night |
| **Rosé Pine** | Dawn, Moon, Main |
| **Gruvbox** | Light, Dark |
| **Everforest** | Light, Dark |
| **Ayu** | Light, Mirage, Dark |
| **Solarized** | Light, Dark |
| **Monokai** | Classic |
| **Nord**, **Dracula**, **One Dark**, **Kanagawa**, **Vesper** | one each |

`adea-light` and `adea-dark` are the defaults. Everything else is somebody else's
palette, reproduced from a named revision and credited in [NOTICE](NOTICE).

## Using it

```ts
import { getTheme, themeFamilies, resolveTheme } from '@adea-ai/themes'
import { themeCssVariables } from '@adea-ai/themes/adapters/css'
import { toXtermTheme } from '@adea-ai/themes/adapters/xterm'
import { toShikiTheme } from '@adea-ai/themes/adapters/shiki'

// Apply a theme to the document.
const theme = resolveTheme('catppuccin-mocha', 'dark')
for (const [name, value] of Object.entries(themeCssVariables(theme))) {
  document.documentElement.style.setProperty(name, value)
}

// Colour a terminal.
terminal.options.theme = toXtermTheme(theme)

// Register a syntax theme.
const highlighter = await createHighlighter({ themes: [toShikiTheme(theme)], langs: [...] })
```

Every exported theme value is an `oklch()` string, which means the browser does the
colour work and a consumer can compose — `color-mix(in oklch, var(--adea-accent),
transparent 20%)` — and get a predictable result. The adapters that need hex (xterm,
Shiki) convert, gamut-mapping rather than clipping.

## The design, in four decisions

**Adea owns the schema and the transformation, not the colours.** The seventeen
surface roles in `src/schema.ts` are the contract. No upstream project is asked to
satisfy it, and no palette is hand-authored here: `palettes/` holds Base24 schemes
reproduced from a pinned revision, and `src/normalize.ts` is the single place a
terminal palette becomes an application theme. Adding a theme is a line in
`src/sources.ts` plus a rebuild.

**OKLCH is the representation.** Perceptually uniform lightness is what makes a
surface ladder buildable by adding fixed steps, a contrast failure repairable by
moving one axis, and a theme re-hueable without re-deriving its ramp by eye.

**Contrast is measured, not assumed.** Nothing enters the catalogue without clearing
the floors in `src/validate.ts`, and `bun run catalogue:build` fails if a theme
cannot be repaired within budget. The pipeline caught real defects that a
hand-authored catalogue would have shipped:

- Solarized Light's body text measures 4.28:1 on its own background — under WCAG AA.
- Tokyo Night's black is 1.17:1 against its canvas, and Gruvbox Light's `white` was
  resolving to a near-black, both from light schemes that invert Base24's greyscale
  ramp.
- Everforest Light contains no colour above 2.6:1 on its own canvas, so its status
  and accent roles have to be deepened rather than used as published.

**Derived colours are derived.** Syntax roles, chart series and status fills are
functions of the roles a theme does hold (`src/derive.ts`), so two consumers cannot
disagree about what colour a keyword is.

## Base24 is a bridge, not the schema

Base24 is an excellent interchange format and a poor application schema: it has a
slot for the colour of a deprecated API and nothing that means "the surface one step
above the card". So Base24 is how values get *in* and how they get *out*:

```ts
import { toBase24, formatBase24Scheme, parseBase24Scheme } from '@adea-ai/themes'
import { getBase24Scheme } from '@adea-ai/themes'

formatBase24Scheme(toBase24(getTheme('nord')!))   // a Base24 scheme
getBase24Scheme('nord')                            // the vendored original, untouched
```

`toBase24` re-derives Base24's orange and brown slots, because Adea's schema has no
role for them; `getBase24Scheme` returns the artefact as reproduced, for callers that
need it byte-for-byte. The mapping is documented in `src/adapters/base24.ts`.

## Adapters

| Import | For | Output |
| --- | --- | --- |
| `adapters/css` | the application | CSS custom properties in OKLCH |
| `adapters/tailwind` | the application | a Tailwind v4 `@theme inline` block |
| `adapters/shadcn` | this org's components | the shadcn vocabulary, bridged from the same source |
| `adapters/xterm` | shells | xterm.js's hex-only `ITheme` |
| `adapters/shiki` | code views | a Shiki theme registration |
| `adapters/base24` | interop | Base24, both directions |

The shadcn bridge is worth knowing about before you read the code: Adea's `accent`
becomes shadcn's **`primary`**, because in shadcn `--primary` is the action colour and
`--accent` is a hover wash. Mapping it the other way turns every primary button grey.
The mapping is in `src/adapters/shadcn.ts`.

## Working on it

```sh
bun install
bun run verify          # typecheck, lint, catalogue freshness, tests, build
bun run catalogue:build # regenerate src/generated from palettes/ and sources.ts
bun run catalogue:check # fail if the committed catalogue is stale
bun run vendor          # refresh palettes/ from the pinned upstream revision
```

The generated catalogue is **committed**, and `catalogue:check` fails when it and its
inputs disagree. A palette change is therefore a reviewable diff rather than an
invisible drift.

`palettes/` is regenerated by `bun run vendor`, which reproduces Base24 schemes from
a revision pinned in `src/sources.ts`. To adopt a newer upstream, change
`CATALOGUE_REVISION`, run `vendor`, then `catalogue:build` and read the diff — the
build prints every value it repaired and why.

### Adding a theme

1. Add its Base24 scheme to `palettes/` (or let `vendor` fetch it: add the slug to
   `VENDORED_SOURCES` in `src/sources.ts` first).
2. Record its family's project, URL and licence in `FAMILY_PROVENANCE`, and its
   entry in `VENDORED_SOURCES` — id, labels, description, appearance, tags.
3. Declare `accentSlot` if the family's identity is not in its blue slot. Everforest
   is green, Rosé Pine is iris, Monokai is magenta.
4. Add a fidelity assertion to `tests/provenance.test.ts`. The suite fails without
   one — a theme cannot be added without recording where its colours come from.
5. `bun run catalogue:build && bun run verify`.

If the build reports a role it could not repair within budget, the answer is a
decision rather than a tweak: either the palette genuinely cannot express that role,
in which case say so in the entry's description, or the floor is wrong, in which case
change it in `CONTRAST_FLOORS` and justify it there.

## Licence

Apache-2.0. The palettes are not: see [NOTICE](NOTICE) for each project and its terms.
