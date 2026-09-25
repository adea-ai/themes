/**
 * The Base24 bridge.
 *
 * Base24 is the interchange format this package speaks to the outside world, in
 * both directions. Importing is the normalizer's first step for every theme that
 * is not authored here ({@link "./normalize"}); exporting is how a theme reaches a
 * terminal, a tmux theme, or another tool that has never heard of Adea.
 *
 * ## The slot order is not the ANSI order
 *
 * Base24's `base12`–`base17` are *bright red, bright yellow, bright green, bright
 * cyan, bright blue, bright magenta* — the order Base16 needed to keep its ramps
 * monotonic, not the ANSI order of yellow before green. Reading them positionally
 * as ANSI 1–6 silently swaps green and yellow and blue and cyan, which is the kind
 * of mistake that survives review because the theme still *looks* like itself.
 * {@link BASE24_TO_ANSI} names the mapping explicitly so it cannot be inferred
 * wrongly.
 *
 * ## The two slots with no Adea role
 *
 * `base09` (orange) and `base0F` (brown) have no counterpart in the canonical
 * schema: Adea has no "constant" or "deprecated" role, because a UI does not. On
 * export they are re-derived from `red` and `yellow` by a fixed rotation, and
 * {@link AdeaThemeRecord} carries the vendored schemes separately for callers who
 * need the originals byte-for-byte. Round-tripping is therefore lossless for every
 * role Adea models, and explicitly approximate for the two it does not — rather
 * than silently lossy, which is what an unnamed slot would have been.
 */

import type { AdeaAnsi, AdeaTheme, AdeaThemeColors } from '../schema'
import type { Oklch } from '../oklch'
import { formatOklch, parseColor } from '../oklch'

/** The twenty-four Base24 slots, in the order the specification lists them. */
export const BASE24_SLOTS = [
  'base00',
  'base01',
  'base02',
  'base03',
  'base04',
  'base05',
  'base06',
  'base07',
  'base08',
  'base09',
  'base0A',
  'base0B',
  'base0C',
  'base0D',
  'base0E',
  'base0F',
  'base10',
  'base11',
  'base12',
  'base13',
  'base14',
  'base15',
  'base16',
  'base17',
] as const

export type Base24Slot = (typeof BASE24_SLOTS)[number]

/** A Base24 palette. Values are colours in any notation {@link parseColor} accepts. */
export type Base24Palette = Readonly<Record<Base24Slot, string>>

/** A Base24 scheme: the palette plus the metadata the specification defines. */
export interface Base24Scheme {
  system: 'base24'
  name: string
  author: string
  variant: 'dark' | 'light'
  palette: Base24Palette
}

/**
 * What each slot means, in the specification's own terms.
 *
 * Kept as data because the normalizer reads it rather than hard-coding slot names
 * in its logic, and because it is the documentation a reader needs to check that
 * the mapping is right.
 */
export const BASE24_SLOT_MEANING: Readonly<Record<Base24Slot, string>> = Object.freeze({
  base00: 'Background',
  base01: 'Lighter background (status bars, line numbers)',
  base02: 'Selection background',
  base03: 'Comments, invisibles',
  base04: 'Dark foreground (status bars)',
  base05: 'Default foreground, caret, delimiters',
  base06: 'Light foreground',
  base07: 'Light background',
  base08: 'Variables, XML tags, diff deleted',
  base09: 'Constants, numbers, XML attributes',
  base0A: 'Classes, search background, diff changed',
  base0B: 'Strings, inserted',
  base0C: 'Support, regex, escape characters',
  base0D: 'Functions, methods, headings',
  base0E: 'Keywords, storage, selector',
  base0F: 'Deprecated, embedded tags',
  base10: 'Dark black',
  base11: 'Darker than base10',
  base12: 'Bright red',
  base13: 'Bright yellow',
  base14: 'Bright green',
  base15: 'Bright cyan',
  base16: 'Bright blue',
  base17: 'Bright magenta',
})

/**
 * Base24 slot → ANSI role.
 *
 * `black`, `white` and `brightBlack` are absent because Base24 does not name them:
 * the background and foreground slots do double duty. The normalizer decides those
 * three; see its `ANSI_FROM_BASE24` note for why the choice is the one it is.
 */
export const BASE24_TO_ANSI = Object.freeze({
  red: 'base08',
  yellow: 'base0A',
  green: 'base0B',
  cyan: 'base0C',
  blue: 'base0D',
  magenta: 'base0E',
  brightRed: 'base12',
  brightYellow: 'base13',
  brightGreen: 'base14',
  brightCyan: 'base15',
  brightBlue: 'base16',
  brightMagenta: 'base17',
} as const satisfies Partial<Record<keyof AdeaAnsi, Base24Slot>>)

/** The inverse of {@link BASE24_TO_ANSI}, for export. */
export const ANSI_TO_BASE24: Readonly<Record<string, Base24Slot>> = Object.freeze(
  Object.fromEntries(
    Object.entries(BASE24_TO_ANSI).map(([ansi, slot]) => [slot, ansi])
  ) as Record<string, Base24Slot>
)

/**
 * How each semantic role is written back to a Base24 slot on export.
 *
 * The choices are not arbitrary. `base01` receives `black` rather than the
 * background because an ANSI black that equals the background is invisible as
 * foreground text — which is precisely the defect the import side documents. The
 * surface ladder has no Base24 slot at all, so it is deliberately absent here:
 * Base24 cannot express it, and pretending otherwise by packing four rungs into
 * `base01`/`base02` would make the export lie about what it preserves.
 */
export const THEME_TO_BASE24: Readonly<Record<keyof AdeaThemeColors, Base24Slot | undefined>> =
  Object.freeze({
    background: 'base00',
    foreground: 'base05',
    surface: undefined,
    surfaceElevated: undefined,
    surfaceHover: undefined,
    surfaceActive: undefined,
    border: undefined,
    borderMuted: undefined,
    text: 'base06',
    textMuted: 'base04',
    textSubtle: 'base03',
    accent: 'base0D',
    accentForeground: undefined,
    success: 'base0B',
    warning: 'base0A',
    error: 'base08',
    info: 'base0C',
  })

/** Thrown when a palette is missing a slot or holds an unparseable colour. */
export class Base24ParseError extends Error {
  constructor(
    message: string,
    readonly slot: string
  ) {
    super(message)
    this.name = 'Base24ParseError'
  }
}

/** Parses every slot of a palette into OKLCH, or throws naming the offending slot. */
export function parseBase24Palette(palette: Base24Palette): Record<Base24Slot, Oklch> {
  const parsed = {} as Record<Base24Slot, Oklch>
  for (const slot of BASE24_SLOTS) {
    const raw = palette[slot]
    if (typeof raw !== 'string' || raw.length === 0) {
      throw new Base24ParseError(`Base24 slot ${slot} is missing`, slot)
    }
    const color = parseColor(raw)
    if (!color) {
      throw new Base24ParseError(`Base24 slot ${slot} is not a colour: ${String(raw)}`, slot)
    }
    parsed[slot] = color
  }
  return parsed
}

/**
 * Rotates a hue by a fixed number of degrees.
 *
 * Used only for the two Base24 slots Adea has no role for. A rotation is chosen
 * over an interpolation toward grey because both source colours are already
 * saturated, and a rotation keeps saturation while moving the hue far enough to
 * read as a distinct token.
 */
function rotateHue(color: Oklch, degrees: number): Oklch {
  return { ...color, h: (color.h + degrees + 360) % 360 }
}

/**
 * Writes a theme back to Base24.
 *
 * `base09` and `base0F` are synthesised — see this module's header. `base10` and
 * `base11` are the two rungs below `base00`, which is what the specification
 * defines them as and what a terminal needs in order to draw a black that is
 * darker than the background.
 */
export function toBase24(
  theme: AdeaTheme,
  options: { author?: string; name?: string } = {}
): Base24Scheme {
  const background = requireColor(theme.colors.background, 'background')
  const red = requireColor(theme.ansi.red, 'ansi.red')
  const yellow = requireColor(theme.ansi.yellow, 'ansi.yellow')
  const text = requireColor(theme.colors.text, 'text')

  const palette: Record<Base24Slot, string> = {
    base00: theme.colors.background,
    base01: theme.ansi.black,
    base02: theme.selection,
    base03: theme.colors.textSubtle,
    base04: theme.colors.textMuted,
    base05: theme.colors.foreground,
    base06: theme.colors.text,
    base07: theme.ansi.brightWhite,
    base08: theme.ansi.red,
    // Synthesised: Base24's constants/orange slot and its deprecated/brown slot
    // have no Adea role. See the module header.
    base09: formatOklch(rotateHue(red, -18)),
    base0A: theme.ansi.yellow,
    base0B: theme.ansi.green,
    base0C: theme.ansi.cyan,
    base0D: theme.ansi.blue,
    base0E: theme.ansi.magenta,
    base0F: formatOklch(rotateHue(yellow, 22)),
    base10: formatOklch({ ...background, l: Math.max(0, background.l - 0.03) }),
    base11: formatOklch({ ...background, l: Math.max(0, background.l - 0.06) }),
    base12: theme.ansi.brightRed,
    base13: theme.ansi.brightYellow,
    base14: theme.ansi.brightGreen,
    base15: theme.ansi.brightCyan,
    base16: theme.ansi.brightBlue,
    base17: theme.ansi.brightMagenta,
  }

  // `base05` is the default foreground and the caret; a palette whose text role
  // differs from its ANSI white means the two disagree about which is the body
  // colour. The foreground role wins, because every contrast floor is defined
  // against it.
  void text

  return {
    system: 'base24',
    name: options.name ?? theme.name,
    author: options.author ?? 'Adea',
    variant: theme.appearance,
    palette,
  }
}

function requireColor(value: string, role: string): Oklch {
  const color = parseColor(value)
  if (!color) throw new Error(`Theme role ${role} is not a colour: ${value}`)
  return color
}

/** Serialises a scheme to the YAML dialect Base24 schemes are published in. */
export function formatBase24Scheme(scheme: Base24Scheme): string {
  const lines = [
    'system: "base24"',
    `name: ${JSON.stringify(scheme.name)}`,
    `author: ${JSON.stringify(scheme.author)}`,
    `variant: ${JSON.stringify(scheme.variant)}`,
    'palette:',
    ...BASE24_SLOTS.map((slot) => `  ${slot}: ${JSON.stringify(scheme.palette[slot])}`),
  ]
  return `${lines.join('\n')}\n`
}

/**
 * Reads the YAML dialect Base24 schemes are published in.
 *
 * Hand-written rather than pulled from a YAML library: the format is a fixed set
 * of scalar keys, the package has no runtime dependencies and no build-time
 * dependencies beyond the TypeScript compiler, and a general parser would accept
 * documents this bridge cannot actually honour. Anything outside the specification
 * is rejected loudly instead of being parsed into a half-scheme.
 */
/**
 * A line with its trailing `#` comment removed.
 *
 * Written as a scan rather than `replace(/\s+#.*$/, '')`, which is what it was: that
 * pattern is a quantified `\s+` followed by `.*`, so on a line with many spaces and no
 * `#` the engine retries every split of the run at every start position — quadratic
 * in the line length, on input this function does not control. CodeQL reports it as
 * `js/polynomial-redos`, which is how it was found.
 *
 * The semantics are the ones the pattern had, including the part that is easy to get
 * wrong when rewriting: a `#` is only a comment marker when **whitespace precedes
 * it**, so a line that *begins* with `#` is not stripped here. Those lines are
 * skipped later, by the `separator === -1` check — a leading `#` has no `:` to split
 * on — so the outcome is the same and this stays a faithful replacement.
 */
function stripTrailingComment(line: string): string {
  for (let index = 1; index < line.length; index += 1) {
    if (line[index] !== '#') continue
    // A single-character test, so there is nothing to backtrack over.
    if (/\s/.test(line[index - 1]!)) return line.slice(0, index)
  }
  return line
}

export function parseBase24Scheme(source: string): Base24Scheme {
  const scalars = new Map<string, string>()
  const palette = new Map<string, string>()
  let inPalette = false

  for (const rawLine of source.split('\n')) {
    // Strip comments before trimming so the dataset's provenance comments, which
    // sit on the same line as a value, do not end up inside the colour string.
    const line = stripTrailingComment(rawLine).trimEnd()
    if (line.trim().length === 0) continue

    const indented = /^\s/.test(line)
    const separator = line.indexOf(':')
    if (separator === -1) continue

    const key = (indented ? line.slice(0, separator) : line.slice(0, separator)).trim()
    const value = line
      .slice(separator + 1)
      .trim()
      .replace(/^["']|["']$/g, '')

    if (!indented) {
      inPalette = key === 'palette'
      if (!inPalette) scalars.set(key, value)
      continue
    }
    if (inPalette) palette.set(key, value)
  }

  const missing = ['name', 'variant'].filter((key) => !scalars.get(key))
  if (missing.length > 0) {
    throw new Error(`Base24 scheme is missing required keys: ${missing.join(', ')}`)
  }

  const variant = scalars.get('variant')
  if (variant !== 'dark' && variant !== 'light') {
    throw new Error(`Base24 scheme variant must be dark or light, got: ${String(variant)}`)
  }

  const resolved = {} as Record<Base24Slot, string>
  for (const slot of BASE24_SLOTS) {
    const value = palette.get(slot)
    if (!value) throw new Base24ParseError(`Base24 scheme is missing ${slot}`, slot)
    if (!parseColor(value)) {
      throw new Base24ParseError(`Base24 scheme has an unparseable ${slot}: ${value}`, slot)
    }
    resolved[slot] = value
  }

  return {
    system: 'base24',
    name: scalars.get('name') ?? '',
    author: scalars.get('author') ?? 'unknown',
    variant,
    palette: resolved,
  }
}
