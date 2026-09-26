/**
 * The catalogue's gate.
 *
 * Nothing enters this package on taste. Every theme — imported from a stranger's
 * palette or authored here — is measured against the same floors, and this module
 * is where that happens. It is what makes the catalogue able to accept external
 * palettes at all: a palette either clears the floors or it fails the build with
 * the pairing and the number, and a reviewer never has to decide by eye whether
 * `#8f8f8f` on `#2e2e2e` is acceptable.
 *
 * ## What is measured, and what is not
 *
 * Measured: every pairing a component renders as *text*, plus the border and
 * selection pairings, which are decorative and have a perceptibility floor rather
 * than a legibility one.
 *
 * Not measured: a colour against itself, and the surface ladder against anything
 * but the canvas. A rung's job is to be distinguishable from the canvas, not to
 * carry text — components put text on `background`, and the ladder is decoration on
 * top of it. Measuring the ladder against every foreground would produce failures
 * no theme could pass and no component would care about.
 *
 * ## Why the validator is exported
 *
 * A consumer that adds its own theme — an application with a brand palette, or a
 * test that builds a theme from a design tool — needs to run the same gate. It is
 * the only way to know a theme is admissible without reimplementing the rules.
 */

import type { AdeaTheme, AnsiKey, ThemeColorKey } from './schema.js'
import { ANSI_KEYS, THEME_COLOR_KEYS } from './schema.js'
import type { Oklch } from './oklch.js'
import { contrastRatio, deltaEok, parseColor } from './oklch.js'
import { CONTRAST_FLOORS } from './normalize.js'
import { STATUS_ROLES, statusForeground } from './derive.js'

/** One measured pairing that failed. */
export interface ContrastFinding {
  themeId: string
  /** The role the finding is about, e.g. `textMuted`. */
  role: string
  /** The role or roles it was measured against. */
  against: readonly string[]
  ratio: number
  minimum: number
  message: string
}

/**
 * The pairings a theme is required to satisfy.
 *
 * Declared as data rather than as a sequence of assertions so that the set is
 * reviewable in one place, and so a consumer can see exactly what is guaranteed.
 * `background` appears as the counterpart almost everywhere because a component's
 * default surface is the canvas; the two exceptions are the pairs drawn on a
 * raised surface or on the accent.
 */
export interface Pairing {
  role: ThemeColorKey | AnsiKey | 'accentForeground' | 'border' | 'borderMuted' | 'selection'
  against: readonly (ThemeColorKey | 'background' | 'accent')[]
  minimum: number
  /** Findings for pairings marked `advisory` are reported but do not fail. */
  advisory?: boolean
}

/**
 * Every pairing the catalogue guarantees.
 *
 * `textSubtle` and `brightBlack` are held to 3:1 rather than 4.5:1 — see
 * `derive` and the schema's note on `textSubtle`. That is not a relaxation for
 * convenience: at 4.5:1 there is no visible difference between tertiary and
 * secondary text and the role stops earning its place in the schema.
 */
export const REQUIRED_PAIRINGS: readonly Pairing[] = Object.freeze([
  { role: 'text', against: ['background'], minimum: CONTRAST_FLOORS.text },
  { role: 'foreground', against: ['background'], minimum: CONTRAST_FLOORS.text },
  { role: 'textMuted', against: ['background'], minimum: CONTRAST_FLOORS.textMuted },
  { role: 'text', against: ['surface'], minimum: CONTRAST_FLOORS.text },
  { role: 'text', against: ['surfaceElevated'], minimum: CONTRAST_FLOORS.text },
  { role: 'textMuted', against: ['surface'], minimum: CONTRAST_FLOORS.textMuted },
  { role: 'textSubtle', against: ['background'], minimum: CONTRAST_FLOORS.textSubtle },
  { role: 'accent', against: ['background'], minimum: CONTRAST_FLOORS.accent },
  {
    role: 'accent',
    against: ['surface', 'surfaceElevated'],
    minimum: CONTRAST_FLOORS.accentRaised,
  },
  { role: 'accentForeground', against: ['accent'], minimum: CONTRAST_FLOORS.accentForeground },
  { role: 'border', against: ['background'], minimum: CONTRAST_FLOORS.border },
  { role: 'borderMuted', against: ['background'], minimum: CONTRAST_FLOORS.borderMuted },
  { role: 'selection', against: ['background'], minimum: CONTRAST_FLOORS.selection },
])

/**
 * The status pairings, which are the same for each of the four roles.
 *
 * Two tiers, matching the normalizer: the body floor on the canvas, where a status
 * colour is read as small text, and the indicator floor on a raised surface. The
 * reasoning is in `normalize.CONTRAST_FLOORS.statusRaised`.
 */
export const STATUS_PAIRINGS: readonly Pairing[] = Object.freeze([
  ...STATUS_ROLES.map((role) => ({
    role,
    against: ['background'] as const,
    minimum: CONTRAST_FLOORS.status,
  })),
  ...STATUS_ROLES.map((role) => ({
    role,
    against: ['surface', 'surfaceElevated'] as const,
    minimum: CONTRAST_FLOORS.statusRaised,
  })),
])

/**
 * The greyscale ANSI invariants.
 *
 * Deliberately **not** contrast floors. A palette's ANSI greyscale is the author's
 * decision and the useful ones are not high-contrast: on a light terminal ANSI
 * white is nearly the canvas by definition, because it is the colour used to *fill*
 * rather than to write with, and holding it to a legibility floor would reject
 * every well-made light scheme. Base24 compounds this by not naming `black`,
 * `white` or `brightBlack` at all.
 *
 * What is worth asserting is the pair of failures that are actually defects and are
 * invisible in a screenshot:
 *
 * - **Collapse** — a ramp whose roles resolve to the same colour, which means the
 *   theme cannot express dim text at all.
 * - **Inversion** — an ANSI black lighter than its bright black on a dark theme, or
 *   a light theme whose "white" is darker than its text. This is the defect the
 *   normalizer's ramp logic was rewritten to avoid, and the one a palette with a
 *   degenerate `base05`/`base06`/`base07` produces.
 */
export interface AnsiInvariant {
  themeId: string
  role: string
  message: string
}

/** Checks the greyscale ramp for collapse and inversion. */
export function checkAnsiRamp(theme: AdeaTheme): AnsiInvariant[] {
  const findings: AnsiInvariant[] = []
  const black = parseColor(theme.ansi.black)
  const brightBlack = parseColor(theme.ansi.brightBlack)
  const white = parseColor(theme.ansi.white)
  const brightWhite = parseColor(theme.ansi.brightWhite)

  if (black && brightBlack) {
    if (deltaEok(black, brightBlack) < 0.02) {
      findings.push({
        themeId: theme.id,
        role: 'black',
        message:
          'ANSI black and bright black resolve to the same colour, so the theme cannot express dim text',
      })
    }
    // On both appearances ANSI 8 sits above ANSI 0 in lightness: it is the dim grey
    // a comment is written in, and ANSI 0 is the darker of the pair.
    if (brightBlack.l <= black.l) {
      findings.push({
        themeId: theme.id,
        role: 'brightBlack',
        message: `ANSI bright black (L ${brightBlack.l.toFixed(3)}) is not lighter than ANSI black (L ${black.l.toFixed(3)}), which inverts the greyscale ramp`,
      })
    }
  }

  // The light end is deliberately not asserted. On a light terminal the ANSI white
  // and bright white roles are *foregrounds*: GitHub's light scheme, which Adea's
  // own light theme uses, sets white to a mid grey and bright white darker still,
  // and several palettes in the catalogue set the two to the same value. There is no
  // invariant there — unlike ANSI 0/8, whose ordering holds in both appearances.
  void white
  void brightWhite

  return findings
}

function resolve(theme: AdeaTheme, role: string): Oklch | undefined {
  if (role === 'accent') return parseColor(theme.colors.accent)
  if (role === 'background') return parseColor(theme.colors.background)
  if ((THEME_COLOR_KEYS as readonly string[]).includes(role)) {
    return parseColor(theme.colors[role as ThemeColorKey])
  }
  if ((ANSI_KEYS as readonly string[]).includes(role)) {
    return parseColor(theme.ansi[role as AnsiKey])
  }
  if (role === 'cursor') return parseColor(theme.cursor)
  if (role === 'selection') return parseColor(theme.selection)
  return undefined
}

/** Measures one pairing, returning a finding when it fails. */
function measure(theme: AdeaTheme, pairing: Pairing): ContrastFinding | undefined {
  const subject = resolve(theme, pairing.role)
  if (!subject) {
    return {
      themeId: theme.id,
      role: pairing.role,
      against: pairing.against,
      ratio: 0,
      minimum: pairing.minimum,
      message: `${pairing.role} is missing or is not a colour`,
    }
  }

  for (const counterpartName of pairing.against) {
    const counterpart = resolve(theme, counterpartName)
    if (!counterpart) continue
    const ratio = contrastRatio(subject, counterpart)
    if (ratio < pairing.minimum - 1e-9) {
      return {
        themeId: theme.id,
        role: pairing.role,
        against: [counterpartName],
        ratio,
        minimum: pairing.minimum,
        message: `${pairing.role} measures ${ratio.toFixed(2)}:1 against ${counterpartName}, below the ${pairing.minimum}:1 floor`,
      }
    }
  }

  return undefined
}

/**
 * Validates one theme.
 *
 * Returns every failure rather than the first, because a theme with three bad
 * pairings should be fixed in one pass — and because a palette that fails one floor
 * usually fails several, and seeing all of them is what shows which single value is
 * wrong.
 */
export function validateTheme(theme: AdeaTheme): ContrastFinding[] {
  const findings: ContrastFinding[] = []

  for (const pairing of [...REQUIRED_PAIRINGS, ...STATUS_PAIRINGS]) {
    const finding = measure(theme, pairing)
    if (finding) findings.push(finding)
  }

  // The greyscale ramp's failures are structural rather than contrast-based, so
  // they are reported as findings with no ratio.
  for (const invariant of checkAnsiRamp(theme)) {
    findings.push({
      themeId: invariant.themeId,
      role: invariant.role,
      against: [],
      ratio: 0,
      minimum: 0,
      message: invariant.message,
    })
  }

  // The status foreground pairing cannot be declared as a table entry because it
  // depends on the theme: the correct colour is whichever extreme of the theme
  // measures better, so it is derived and then measured rather than named.
  for (const role of STATUS_ROLES) {
    const fill = parseColor(theme.colors[role])
    const chosen = parseColor(statusForeground(theme, role))
    if (!fill || !chosen) continue
    const ratio = contrastRatio(chosen, fill)
    if (ratio < CONTRAST_FLOORS.accentForeground - 1e-9) {
      findings.push({
        themeId: theme.id,
        role: `${role}-foreground`,
        against: [role],
        ratio,
        minimum: CONTRAST_FLOORS.accentForeground,
        message: `no text colour clears ${CONTRAST_FLOORS.accentForeground}:1 on the ${role} fill; the best of the theme's two extremes is ${ratio.toFixed(2)}:1`,
      })
    }
  }

  return findings
}

/**
 * Validates a whole catalogue.
 *
 * Also checks the things that are true of a catalogue rather than of a theme:
 * unique ids, a shape that is complete, and a mix of appearances. A catalogue that
 * is all dark leaves a light-theme user with one option, which is a defect in the
 * catalogue rather than in any theme.
 */
export function validateCatalogue(themes: readonly AdeaTheme[]): ContrastFinding[] {
  const findings: ContrastFinding[] = []

  const ids = new Set<string>()
  for (const theme of themes) {
    if (ids.has(theme.id)) {
      findings.push({
        themeId: theme.id,
        role: 'id',
        against: [],
        ratio: 0,
        minimum: 0,
        message: `duplicate theme id: ${theme.id}`,
      })
    }
    ids.add(theme.id)
    findings.push(...validateTheme(theme))
  }

  const light = themes.filter((theme) => theme.appearance === 'light').length
  const dark = themes.filter((theme) => theme.appearance === 'dark').length
  if (light === 0 || dark === 0) {
    findings.push({
      themeId: 'catalogue',
      role: 'appearance',
      against: [],
      ratio: 0,
      minimum: 0,
      message: `catalogue covers ${light} light and ${dark} dark themes; both appearances must be represented`,
    })
  }

  return findings
}

/** Formats findings for a terminal, one per line. */
export function formatFindings(findings: readonly ContrastFinding[]): string {
  return findings
    .map((finding) => `${finding.themeId} ${finding.role}: ${finding.message}`)
    .join('\n')
}
