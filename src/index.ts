/**
 * `@adea-ai/themes`
 *
 * The Adea theme catalogue. Semantic OKLCH themes normalized from mature upstream
 * palettes, with adapters for the places a theme has to arrive in a foreign shape:
 * Base24 for interop, xterm for a shell, CSS and Tailwind for an application, and
 * Shiki for a code view.
 *
 * The design is described in four decisions, and the rest of this package follows
 * from them.
 *
 * **Adea owns the schema and the transformation, not the colours.** The seventeen
 * surface roles in `schema.ts` are the contract, and no upstream project is asked
 * to satisfy it. The palettes in `palettes/` are other people's, reproduced from a
 * pinned revision, each recording the project it belongs to and the licence it is
 * used under. Normalizing them is this package's job and it happens once, here.
 *
 * **OKLCH is the representation.** Every role is an `oklch()` string. Lightness in
 * OKLCH is perceptually uniform, which is what lets a surface ladder be built by
 * adding fixed steps, a contrast failure be repaired by moving one axis, and a
 * theme be re-hued without re-deriving its ramp by eye.
 *
 * **Contrast is measured, not assumed.** Nothing enters the catalogue without
 * clearing the floors in `validate.ts`; a palette that cannot is repaired by the
 * least move that works, and reported. Several famous palettes fail on their own
 * background, and the catalogue says so rather than shipping them.
 *
 * **Derived colours are derived.** Syntax roles, chart series and status fills are
 * functions of the roles a theme does hold, computed in `derive.ts`, so two
 * consumers cannot disagree about what colour a keyword is.
 *
 * ```ts
 * import { getTheme } from '@adea-ai/themes'
 * import { themeCssVariables } from '@adea-ai/themes/adapters/css'
 * import { toXtermTheme } from '@adea-ai/themes/adapters/xterm'
 *
 * const theme = getTheme('catppuccin-mocha')
 * if (theme) {
 *   for (const [name, value] of Object.entries(themeCssVariables(theme))) {
 *     document.documentElement.style.setProperty(name, value)
 *   }
 * }
 * ```
 */

/* --- The schema, which is the contract ---------------------------------- */
export type {
  AdeaAnsi,
  AdeaTheme,
  AdeaThemeColors,
  AdeaThemeRecord,
  AnsiKey,
  ThemeAppearance,
  ThemeColorKey,
  ThemeFamily,
  ThemeMetadata,
  ThemeProvenance,
} from './schema.js'
export { ANSI_KEYS, THEME_COLOR_KEYS } from './schema.js'

export type { AccentPreset, AccentRoles } from './accents.js'
export {
  ACCENTS,
  ACCENT_HOVER_STEP,
  ACCENT_IDS,
  ACCENT_SUBTLE_ALPHA,
  accentForeground,
  accentForegroundContrast,
  accentRoles,
  accentValue,
  getAccent,
  primaryHover,
  primarySubtleCss,
} from './accents.js'

/* --- The catalogue ------------------------------------------------------ */
export {
  DEFAULT_THEME_IDS,
  getBase24Scheme,
  getTheme,
  hasTheme,
  resolveTheme,
  themeCount,
  themeFamilies,
  themeIds,
  themes,
  themesByAppearance,
  toTheme,
} from './catalogue.js'

/* --- The colour core ---------------------------------------------------- */
export type { ContrastRepair, Oklch } from './oklch.js'
export {
  contrastRatio,
  deltaEok,
  formatOklch,
  gamutMap,
  hexToOklch,
  inGamut,
  mix,
  oklchToHex,
  parseColor,
  parseOklch,
  relativeLuminance,
  repairContrast,
  shiftLightness,
} from './oklch.js'

/* --- The gate ----------------------------------------------------------- */
export type { AnsiInvariant, ContrastFinding, Pairing } from './validate.js'
export {
  REQUIRED_PAIRINGS,
  STATUS_PAIRINGS,
  checkAnsiRamp,
  formatFindings,
  validateCatalogue,
  validateTheme,
} from './validate.js'

/* --- Normalization, for a consumer bringing its own palette ------------- */
export type { NormalizationFinding, NormalizedTheme, ThemeSourceSpec } from './normalize.js'
export { CONTRAST_FLOORS, normalizeTheme } from './normalize.js'

/* --- Derived colours --------------------------------------------------- */
export type { StatusRole, SyntaxRole } from './derive.js'
export {
  CHART_SERIES,
  STATUS_ROLES,
  chartSeries,
  statusForeground,
  statusForegroundHex,
  syntaxRoles,
  syntaxRolesHex,
  tint,
} from './derive.js'

/* --- Adapters ---------------------------------------------------------- */
export type { Base24Palette, Base24Scheme, Base24Slot } from './adapters/base24.js'
export {
  BASE24_SLOTS,
  BASE24_SLOT_MEANING,
  BASE24_TO_ANSI,
  Base24ParseError,
  formatBase24Scheme,
  parseBase24Palette,
  parseBase24Scheme,
  toBase24,
} from './adapters/base24.js'

export type { XtermTheme } from './adapters/xterm.js'
export { toXtermTheme } from './adapters/xterm.js'

export type { CssOptions } from './adapters/css.js'
export { catalogueCss, cssVariableName, themeCss, themeCssVariables } from './adapters/css.js'

export type { TailwindOptions } from './adapters/tailwind.js'
export { toTailwindTheme } from './adapters/tailwind.js'

export type { ShikiThemeRegistration, ShikiTokenSetting } from './adapters/shiki.js'
export { toShikiTheme, toShikiThemes } from './adapters/shiki.js'

export { SHADCN_MAPPING, shadcnCss, shadcnRoles, shadcnVariables } from './adapters/shadcn.js'
