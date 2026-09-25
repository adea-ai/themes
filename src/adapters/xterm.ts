/**
 * The terminal adapter.
 *
 * xterm.js is the reason this adapter exists and the reason it works the way it
 * does: its theme contract takes **hex strings only**, and it takes a
 * `selectionForeground` and a `cursorAccent` that no palette publishes. Both gaps
 * have to be closed here rather than at the call site, because the call site is a
 * terminal emulator that will happily render invisible text if handed a
 * foreground that matches its own background.
 *
 * The type is declared structurally rather than imported from `@xterm/xterm`. This
 * package has no runtime dependencies and does not want one for a type that both
 * sides already agree on; anything assignable to this shape can be passed
 * straight to `terminal.options.theme`.
 */

import type { AdeaTheme } from '../schema'
import type { Oklch } from '../oklch'
import { contrastRatio, oklchToHex, parseColor, repairContrast } from '../oklch'

/**
 * The shape xterm.js's `ITheme` requires.
 *
 * Field names are xterm's, including its `brightBlack`-style camel case, so this
 * can be spread directly into `terminal.options.theme`.
 */
export interface XtermTheme {
  background: string
  foreground: string
  cursor: string
  cursorAccent: string
  selectionBackground: string
  selectionForeground: string
  black: string
  red: string
  green: string
  yellow: string
  blue: string
  magenta: string
  cyan: string
  white: string
  brightBlack: string
  brightRed: string
  brightGreen: string
  brightYellow: string
  brightBlue: string
  brightMagenta: string
  brightCyan: string
  brightWhite: string
}

/**
 * The floor for text drawn inside a selection.
 *
 * Selected text is text, so it takes the body floor.
 */
const SELECTION_FLOOR = 4.5

/**
 * The floor for the glyph under the cursor.
 *
 * Lower than the selection's, and deliberately. A cursor accent is a UI affordance
 * rather than text, and it is derived from a colour the palette did not choose for
 * this purpose: Solarized Light's cursor is a mid grey on a near-white canvas, and
 * nothing in that palette reaches 4.5:1 against it except near-black, which would
 * put a black glyph in a mid-grey cursor and lose the cursor's own shape. 3:1 is
 * WCAG's non-text floor and is what a caret needs.
 */
const CURSOR_FLOOR = 3

/**
 * Converts a theme to xterm's shape.
 *
 * The two derived fields are the whole point:
 *
 * - **`cursorAccent`** is the glyph *under* the block cursor. xterm draws it in
 *   this colour, so it must contrast with `cursor` — not with the background.
 *   Palettes frequently set their cursor to the foreground colour, which puts the
 *   accent at the far end of the canvas.
 * - **`selectionForeground`** is text inside a selection. Base24's `base02` is
 *   whatever the palette's author chose for a terminal selection, and several
 *   themes in the catalogue set it to a near-white; under near-white body text the
 *   selection would erase its own contents. Deriving the foreground from whichever
 *   of the canvas or the text measures better fixes that without discarding the
 *   author's selection colour.
 */
export function toXtermTheme(theme: AdeaTheme): XtermTheme {
  const background = parseColor(theme.colors.background)
  const foreground = parseColor(theme.colors.foreground)
  const cursor = parseColor(theme.cursor) ?? foreground
  const selection = parseColor(theme.selection) ?? background

  // The ANSI extremes are candidates alongside the canvas and the text. On a theme
  // whose cursor or selection is a mid tone, both of those measure poorly against
  // it and the palette's own near-black or near-white is the right answer.
  const extremes = [parseColor(theme.ansi.black), parseColor(theme.ansi.white)].filter(
    (candidate): candidate is Oklch => !!candidate
  )
  const candidates = [background, foreground, ...extremes].filter(
    (candidate): candidate is Oklch => !!candidate
  )

  return {
    background: hex(theme.colors.background),
    foreground: hex(theme.colors.foreground),
    cursor: cursor ? oklchToHex(cursor) : hex(theme.colors.foreground),
    cursorAccent: pickForeground(cursor, candidates, CURSOR_FLOOR),
    selectionBackground: selection ? oklchToHex(selection) : hex(theme.colors.background),
    selectionForeground: pickForeground(selection, candidates, SELECTION_FLOOR),
    black: hex(theme.ansi.black),
    red: hex(theme.ansi.red),
    green: hex(theme.ansi.green),
    yellow: hex(theme.ansi.yellow),
    blue: hex(theme.ansi.blue),
    magenta: hex(theme.ansi.magenta),
    cyan: hex(theme.ansi.cyan),
    white: hex(theme.ansi.white),
    brightBlack: hex(theme.ansi.brightBlack),
    brightRed: hex(theme.ansi.brightRed),
    brightGreen: hex(theme.ansi.brightGreen),
    brightYellow: hex(theme.ansi.brightYellow),
    brightBlue: hex(theme.ansi.brightBlue),
    brightMagenta: hex(theme.ansi.brightMagenta),
    brightCyan: hex(theme.ansi.brightCyan),
    brightWhite: hex(theme.ansi.brightWhite),
  }
}

/**
 * The better of the canvas and the text as a foreground for `surface`.
 *
 * Repaired if neither clears the floor, which happens when a palette picks a
 * selection colour that sits exactly between its background and its text. The
 * repair is bounded so it cannot drift into a colour the palette does not contain
 * by more than a perceptible step.
 */
function pickForeground(
  surface: Oklch | undefined,
  candidates: readonly Oklch[],
  floor: number
): string {
  if (!surface) return candidates[0] ? oklchToHex(candidates[0]) : '#000000'
  if (candidates.length === 0) return '#000000'

  let best = candidates[0] as Oklch
  for (const candidate of candidates.slice(1)) {
    if (contrastRatio(candidate, surface) > contrastRatio(best, surface)) best = candidate
  }

  // A generous budget: the alternative to a large lightness move here is an
  // invisible glyph, and the colour is already one of the palette's own.
  const repaired = repairContrast(best, surface, floor, 0.9)
  return oklchToHex(repaired.color)
}

function hex(value: string): string {
  const parsed = parseColor(value)
  return parsed ? oklchToHex(parsed) : value
}
