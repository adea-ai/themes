/**
 * Colours a theme does not store, derived from the ones it does.
 *
 * The canonical schema is deliberately small — seventeen surface roles, sixteen
 * ANSI colours, a cursor and a selection — and three things an application needs
 * are deliberately absent from it: the **syntax roles** a code view wants, the
 * **chart series** a graph wants, and the **fills and foregrounds** a status chip
 * wants.
 *
 * They are absent because each is a *function of* the roles that are present, and a
 * schema that stored them would be a schema with three ways to say the same thing.
 * Deriving them here, once, means every consumer derives them identically — the
 * alternative, which this replaces, is each application inventing its own mapping
 * and two applications disagreeing about what colour a type is.
 *
 * ## Why syntax roles come from ANSI
 *
 * A theme carries no syntax palette, and Base24's editor-oriented slots are not
 * one: `base08` is documented as "variables" and `base0D` as "functions", but every
 * palette's author filled those slots for a terminal, where the question is "what
 * colour is `ls` output". Importing them as syntax roles would colour a diff by
 * accident.
 *
 * Reading the roles off the sixteen ANSI colours instead has a property worth more
 * than per-theme tuning: the ANSI set is the part of a palette its author *did*
 * choose carefully, every theme in the catalogue has one, and it is already tuned
 * for legibility against that theme's background — the same requirement a code view
 * has. It is the reasoning that makes `ls --color` readable in each of these
 * palettes today.
 */

import type { AdeaTheme } from './schema'
import type { Oklch } from './oklch'
import { contrastRatio, formatOklch, mix, oklchToHex, parseColor, repairContrast } from './oklch'

/** The syntax roles, matching the names Shiki's theme contract expects. */
export type SyntaxRole =
  | 'keyword'
  | 'string'
  | 'number'
  | 'comment'
  | 'function'
  | 'variable'
  | 'type'
  | 'tag'
  | 'attribute'
  | 'operator'
  | 'heading'
  | 'link'
  | 'constant'
  | 'punctuation'

/** Which ANSI role each syntax role is read from, and why. */
const SYNTAX_SOURCE: Readonly<Record<SyntaxRole, keyof AdeaTheme['ansi']>> = Object.freeze({
  // Magenta is the slot palettes spend on the most distinctive hue they have, and
  // a keyword is the token most worth making distinctive.
  keyword: 'magenta',
  string: 'green',
  number: 'yellow',
  // The dim grey every palette defines specifically for text it wants present but
  // quiet. Comments are the one role where "quiet" is the requirement.
  comment: 'brightBlack',
  function: 'blue',
  variable: 'white',
  type: 'cyan',
  tag: 'red',
  attribute: 'yellow',
  operator: 'white',
  heading: 'magenta',
  link: 'blue',
  constant: 'brightMagenta',
  punctuation: 'brightBlack',
})

/**
 * The syntax palette for a theme, as OKLCH strings.
 *
 * Comment and punctuation are additionally measured against the canvas: a
 * palette's dim grey is chosen to be read against its *terminal* background, which
 * is the same colour as the canvas here, so the measurement normally passes — but
 * when it does not, the same minimal lightness repair the semantic roles use is
 * applied rather than leaving unreadable comments.
 */
export function syntaxRoles(
  theme: AdeaTheme,
  options: { commentFloor?: number } = {}
): Record<SyntaxRole, string> {
  const background = parseColor(theme.colors.background)
  /**
   * Comments and punctuation are held to a *visibility* floor rather than a
   * legibility one.
   *
   * Their whole purpose is to be the faintest thing on screen, and every palette
   * here defines its comment colour that way on purpose: Everforest Light's is
   * 1.9:1 against its own canvas. Holding them to 3:1 could only be satisfied by
   * promoting comments to the body text's colour, which inverts the role — and the
   * floors that *do* carry text are measured separately and are not relaxed.
   */
  const floor = options.commentFloor ?? 2
  const roles = {} as Record<SyntaxRole, string>

  for (const [role, source] of Object.entries(SYNTAX_SOURCE) as [SyntaxRole, keyof AdeaTheme['ansi']][]) {
    const value: Oklch | undefined = parseColor(theme.ansi[source])
    if (!value) continue

    if (role === 'comment' || role === 'punctuation') {
      const repaired = background
        ? repairContrast(value, background, floor, 0.3)
        : { color: value }
      roles[role] = formatOklch(repaired.color)
      continue
    }

    roles[role] = formatOklch(value)
  }

  return roles
}

/** The syntax palette as hex, for engines that cannot evaluate `oklch()`. */
export function syntaxRolesHex(theme: AdeaTheme): Record<SyntaxRole, string> {
  const roles = syntaxRoles(theme)
  return Object.fromEntries(
    Object.entries(roles).map(([role, value]) => {
      const parsed = parseColor(value)
      return [role, parsed ? oklchToHex(parsed) : value]
    })
  ) as Record<SyntaxRole, string>
}

/**
 * The categorical chart series, derived from the ANSI hues.
 *
 * Six series, taken in the order that keeps adjacent ones furthest apart on the
 * hue circle: blue, magenta, cyan, green, yellow, red. A palette's own ordering
 * would put red next to green, which is the pair a pie chart most needs to
 * separate. Constant across themes by construction — every theme has these six
 * slots — so a chart's series colours mean the same thing in every theme.
 */
export const CHART_SERIES: readonly (keyof AdeaTheme['ansi'])[] = Object.freeze([
  'blue',
  'magenta',
  'cyan',
  'green',
  'yellow',
  'red',
] as const)

/** The chart series for a theme, as OKLCH strings. */
export function chartSeries(theme: AdeaTheme): readonly string[] {
  return CHART_SERIES.map((role) => formatOklch(parseColor(theme.ansi[role]) as Oklch))
}

/**
 * A tint of a role for use as a background behind text of that role.
 *
 * Status chips need a fill that is the role's colour at low strength, and doing
 * that with alpha would put a translucent colour into a token whose contrast was
 * measured as opaque — and a translucent fill's real contrast depends on whatever
 * happens to be behind it. Blending toward the canvas in OKLCH keeps the result
 * opaque, so the chip's own text pairing can be asserted like any other.
 */
export function tint(color: string, background: string, amount = 0.14): string {
  const foreground = parseColor(color)
  const canvas = parseColor(background)
  if (!foreground || !canvas) return color
  return formatOklch(mix(canvas, foreground, amount))
}

/** The four status roles, in the order an alert stack shows them. */
export const STATUS_ROLES = ['success', 'warning', 'error', 'info'] as const
export type StatusRole = (typeof STATUS_ROLES)[number]

/**
 * The text colour to draw on a **solid** fill of a status role.
 *
 * Not the appearance's `foreground`, which is the shortcut and is wrong half the
 * time: a dark theme's foreground is near-white, and near-white on AdEA Dark's
 * `success` at `#3fb950` measures 2.6:1 — illegible. The correct answer is
 * whichever of the theme's two extremes measures better against the fill, which
 * for a bright green is black and for a deep red is white.
 *
 * Where neither clears the floor — a mid-tone fill, which some palettes have —
 * the better of the two is returned and {@link validateTheme} is what reports the
 * pairing as failing, rather than a silent blend being substituted here.
 */
export function statusForeground(theme: AdeaTheme, role: StatusRole): string {
  const fill = parseColor(theme.colors[role])
  const background = parseColor(theme.colors.background)
  const foreground = parseColor(theme.colors.foreground)
  if (!fill || !background || !foreground) return theme.colors.foreground

  const best =
    contrastRatio(foreground, fill) >= contrastRatio(background, fill) ? foreground : background
  return formatOklch(best)
}

/** {@link statusForeground} as hex, for engines that cannot evaluate `oklch()`. */
export function statusForegroundHex(theme: AdeaTheme, role: StatusRole): string {
  const parsed = parseColor(statusForeground(theme, role))
  return parsed ? oklchToHex(parsed) : theme.colors.foreground
}

