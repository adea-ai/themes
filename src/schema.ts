/**
 * The canonical schema.
 *
 * This file is the contract. Everything else in the package — the normalizer, the
 * Base24 bridge, the terminal and editor adapters — exists to move values into or
 * out of the shapes declared here, and no adapter is allowed to invent a role that
 * is not in this file.
 *
 * ## Why this and not Base24
 *
 * Base24 is an excellent interchange format and a poor application schema. Its
 * sixteen `base00`–`base0F` slots describe an editor: there is a slot for the
 * background, a slot for comments, and a slot for the colour of a deprecated API,
 * but nothing that means "the surface one step above the card" or "the text a
 * caption uses". A UI built by reading Base24 directly ends up with component
 * authors choosing between `base01` and `base02` by eye, which is how a design
 * system acquires four nearly-identical greys that no one dares consolidate.
 *
 * So the roles below are the ones a component actually asks for — a surface, a
 * border, a muted text, an accent — and Base24 is a bridge at the edge. See
 * `adapters/base24.ts` for both directions.
 *
 * ## Why OKLCH strings and not numbers
 *
 * Every colour here is an `oklch(L C H)` string rather than a parsed object. It
 * keeps the catalogue readable and diffable in review, it can be handed straight
 * to CSS with no serialisation step, and it cannot be mutated by a consumer that
 * receives it. Call {@link "../oklch".parseColor} when the numbers are needed.
 */

/** Whether a theme is a light or a dark theme. */
export type ThemeAppearance = 'dark' | 'light'

/**
 * The seventeen colours that describe a surface.
 *
 * The set is deliberately small and deliberately semantic. There is no `grey300`
 * and no `blue500`: a component that needs "a slightly raised panel" asks for
 * `surfaceElevated` and gets whichever value the active theme considers one step
 * up, at every theme in the catalogue, without the component knowing.
 */
export interface AdeaThemeColors {
  /** The canvas. Everything that is not a surface sits on this. */
  background: string
  /** Default body text on `background`. Clears 4.5:1 against it in every theme. */
  foreground: string
  /** The first rung above the canvas: cards, panels, sidebars. */
  surface: string
  /** The second rung: popovers, dialogs, menus floating above a card. */
  surfaceElevated: string
  /** A surface under the pointer. */
  surfaceHover: string
  /** A surface under an active press or a selected row. */
  surfaceActive: string
  /** The default divider and input outline. */
  border: string
  /** A divider that should recede: table rules, separators inside a card. */
  borderMuted: string
  /** Text at full strength. Identical to `foreground` unless a theme overrides it. */
  text: string
  /** Secondary text: descriptions, captions, table cell metadata. Clears 4.5:1. */
  textMuted: string
  /**
   * Tertiary text: timestamps, counts, placeholder copy. Clears 3:1, which is the
   * WCAG floor for large text and for non-essential text — the floor is lower
   * here on purpose, because at 4.5:1 there is no longer any visual difference
   * between this role and `textMuted` and the role stops earning its place.
   */
  textSubtle: string
  /** The one interactive colour: primary buttons, selected tabs, focus rings. */
  accent: string
  /** Text and icons drawn on top of `accent`. Clears 4.5:1 against it. */
  accentForeground: string
  /** Positive status. Text-legible against `background`, unlike most palettes' green. */
  success: string
  /** Cautionary status. Text-legible against `background`. */
  warning: string
  /** Destructive status and destructive text. Text-legible against `background`. */
  error: string
  /** Neutral notice. Text-legible against `background`. */
  info: string
}

/**
 * The sixteen ANSI colours.
 *
 * Carried in the canonical schema rather than derived on demand because they are
 * what a shell, a diff and a build log are coloured with, and a terminal embedded
 * in the app must agree with the terminal the user has open beside it. When a
 * theme is imported from a palette that publishes ANSI values, these are those
 * values, not a reconstruction.
 */
export interface AdeaAnsi {
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
 * A theme.
 *
 * This is the published contract: the three identity fields, the seventeen surface
 * roles, the sixteen ANSI colours, and the two state colours a selection needs.
 */
export interface AdeaTheme {
  /** Stable id. The `data-theme` value and what a preference stores. */
  id: string
  /** Human-readable name, e.g. `"Catppuccin Mocha"`. */
  name: string
  appearance: ThemeAppearance
  colors: AdeaThemeColors
  ansi: AdeaAnsi
  /** The text cursor. Usually the foreground, but a palette may disagree. */
  cursor: string
  /** The selection background. */
  selection: string
}

/** Where a palette came from and the terms it is used under. */
export interface ThemeProvenance {
  /** The project or person the palette belongs to. */
  project: string
  /** The canonical upstream URL. */
  url: string
  /** An SPDX identifier. Every palette in this catalogue is permissive. */
  license: string
  /**
   * The commit the vendored values were taken from, when they were taken from a
   * vendored artefact rather than from the project directly. This is what makes
   * the palette data auditable: the numbers in `palettes/` can be re-derived from
   * a named revision rather than trusted.
   */
  revision?: string
  /** The upstream artefacts this palette's ANSI half was bootstrapped from. */
  bootstrappedFrom?: readonly string[]
}

/**
 * A catalogue entry: the theme, plus what a picker and an audit need.
 *
 * Kept as a separate type rather than folded into {@link AdeaTheme} so that a
 * consumer receiving a theme can depend on exactly the documented contract and
 * nothing else, while the catalogue still carries the provenance that lets a
 * licence audit answer "where did this colour come from".
 */
export interface AdeaThemeRecord extends AdeaTheme {
  /** Groups the variants that came from one project, e.g. `catppuccin`. */
  family: string
  /** How the family is written in a picker, e.g. `Catppuccin`. */
  familyLabel: string
  /** Short display name within the family, e.g. `Mocha`. */
  label: string
  /** One line, shown in a picker. */
  description: string
  provenance: ThemeProvenance
  /** Search and filter terms, e.g. `['dark', 'muted', 'popular']`. */
  tags: readonly string[]
}

/** A family of themes: one project, one or more variants. */
export interface ThemeFamily {
  id: string
  label: string
  themes: readonly AdeaThemeRecord[]
}

/** The keys of {@link AdeaThemeColors}, for iteration and validation. */
export const THEME_COLOR_KEYS = [
  'background',
  'foreground',
  'surface',
  'surfaceElevated',
  'surfaceHover',
  'surfaceActive',
  'border',
  'borderMuted',
  'text',
  'textMuted',
  'textSubtle',
  'accent',
  'accentForeground',
  'success',
  'warning',
  'error',
  'info',
] as const satisfies readonly (keyof AdeaThemeColors)[]

/** The keys of {@link AdeaAnsi}. */
export const ANSI_KEYS = [
  'black',
  'red',
  'green',
  'yellow',
  'blue',
  'magenta',
  'cyan',
  'white',
  'brightBlack',
  'brightRed',
  'brightGreen',
  'brightYellow',
  'brightBlue',
  'brightMagenta',
  'brightCyan',
  'brightWhite',
] as const satisfies readonly (keyof AdeaAnsi)[]

export type ThemeColorKey = (typeof THEME_COLOR_KEYS)[number]
export type AnsiKey = (typeof ANSI_KEYS)[number]
