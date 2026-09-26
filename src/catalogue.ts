/**
 * The catalogue's public surface.
 *
 * The generated data is a flat, sorted array; everything a consumer wants to *do*
 * with it — find one theme, group it by family, list what exists, check that a
 * stored preference still names a real theme — is here.
 *
 * ## Lookups answer, they do not throw
 *
 * `getTheme` returns `undefined` rather than throwing, because the overwhelmingly
 * common caller is restoring a stored preference and the overwhelmingly common
 * failure is a preference naming a theme that has since been removed. A component
 * that has to wrap a lookup in a try/catch to survive a stale preference is a
 * component that will eventually ship without the try/catch.
 */

import type { AdeaTheme, AdeaThemeRecord, ThemeAppearance, ThemeFamily } from './schema.js'
import type { Base24Scheme } from './adapters/base24.js'
import { generatedSchemes } from './generated/schemes.js'
import { generatedThemes } from './generated/themes.js'

/**
 * Every theme in the catalogue, ordered by id.
 *
 * The full records, including provenance and tags, because a picker needs the
 * labels and an audit needs the licences. Consumers that only want the theme
 * contract can treat each entry as an {@link AdeaTheme}; the extra keys are
 * additive.
 */
export const themes: readonly AdeaThemeRecord[] = generatedThemes

/** The default theme for each appearance. */
export const DEFAULT_THEME_IDS: Readonly<Record<ThemeAppearance, string>> = Object.freeze({
  dark: 'adea-dark',
  light: 'adea-light',
})

/** Looks a theme up by id. Returns `undefined` for an id the catalogue does not have. */
export function getTheme(id: string): AdeaThemeRecord | undefined {
  return generatedThemes.find((theme) => theme.id === id)
}

/**
 * Looks a theme up, falling back to the default for an appearance.
 *
 * This is the function a preference restore should call: a stored id that no longer
 * exists resolves to the default rather than to nothing, so removing a theme from
 * the catalogue degrades to a theme change instead of a blank window.
 */
export function resolveTheme(
  id: string | undefined | null,
  appearance: ThemeAppearance
): AdeaThemeRecord {
  const found = id ? getTheme(id) : undefined
  if (found) return found
  return getTheme(DEFAULT_THEME_IDS[appearance]) as AdeaThemeRecord
}

/** True when the catalogue still contains this id. */
export function hasTheme(id: string): boolean {
  return generatedThemes.some((theme) => theme.id === id)
}

/**
 * The themes grouped by project, in the order the source list declares.
 *
 * Grouping is by family rather than by appearance so that a picker can show
 * "Catppuccin: Latte, Frappé, Macchiato, Mocha" the way the project itself presents
 * its flavours, which is how someone who wants Mocha looks for it.
 */
export function themeFamilies(
  themesList: readonly AdeaThemeRecord[] = generatedThemes
): ThemeFamily[] {
  const families: ThemeFamily[] = []
  const index = new Map<string, ThemeFamily>()

  for (const theme of themesList) {
    let family = index.get(theme.family)
    if (!family) {
      family = { id: theme.family, label: theme.familyLabel, themes: [] }
      index.set(theme.family, family)
      families.push(family)
    }
    ;(family.themes as AdeaThemeRecord[]).push(theme)
  }

  return families
}

/** The catalogued themes that match an appearance. */
export function themesByAppearance(
  appearance: ThemeAppearance,
  themesList: readonly AdeaThemeRecord[] = generatedThemes
): AdeaThemeRecord[] {
  return themesList.filter((theme) => theme.appearance === appearance)
}

/**
 * The vendored Base24 scheme for a theme, untouched.
 *
 * Present for interop and for licence auditing. `toBase24()` writes a scheme too,
 * but it has to re-derive Base24's orange and brown slots — the canonical schema
 * has no role for them — so it is not a byte-exact round trip. This returns the
 * artefact as it was reproduced, so a caller that needs exactness has it.
 */
export function getBase24Scheme(id: string): Base24Scheme | undefined {
  return generatedSchemes[id]
}

/** The ids of every theme, for validation and for a preference guard. */
export function themeIds(): string[] {
  return generatedThemes.map((theme) => theme.id)
}

/** The catalogue's size, so a test can assert it without importing the data. */
export function themeCount(): number {
  return generatedThemes.length
}

/** Narrows a theme record to the published contract, dropping catalogue metadata. */
export function toTheme(record: AdeaThemeRecord): AdeaTheme {
  return {
    id: record.id,
    name: record.name,
    appearance: record.appearance,
    colors: record.colors,
    ansi: record.ansi,
    cursor: record.cursor,
    selection: record.selection,
  }
}
