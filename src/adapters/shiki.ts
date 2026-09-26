/**
 * The code adapter: a theme as a Shiki theme registration.
 *
 * Shiki drives the code views and diffs in Adea's editor and conversation surfaces,
 * and its theme contract is an editor contract: a `colors` map for the chrome and a
 * `settings` list of scope selectors. Neither is in the canonical schema, so both
 * are derived — the chrome from the semantic roles, the scopes from the ANSI
 * colours via `derive.syntaxRoles`.
 *
 * ## Hex, not OKLCH
 *
 * Shiki is the one adapter that gets hex. Its colour resolution runs through a
 * syntax highlighter that does not evaluate CSS colour functions, and its output is
 * used to build inline styles and a text-mate scopes map — places where an
 * `oklch()` string is not a colour but a string. The conversion gamut-maps rather
 * than clipping, so an out-of-gamut accent becomes a slightly less saturated real
 * colour instead of a broken channel.
 *
 * ## Why a registration and not a bundled theme
 *
 * `themeToShikiTheme` returns the object; it does not call `loadTheme`, and it does
 * not import Shiki. That keeps this package free of a dependency on a library that
 * is an application's choice, and it means a consumer can register the result
 * however it likes — synchronously, into a custom highlighter, or inside a worker.
 */

import type { AdeaTheme } from '../schema'
import type { SyntaxRole } from '../derive'
import { syntaxRolesHex } from '../derive'
import { oklchToHex, parseColor } from '../oklch'

/**
 * A Shiki theme registration.
 *
 * Structurally compatible with `ThemeRegistration` from `shiki`; declared here so
 * this package needs no dependency on it.
 */
export interface ShikiThemeRegistration {
  name: string
  type: 'dark' | 'light'
  colors: Record<string, string>
  settings: ShikiTokenSetting[]
}

/** One entry in Shiki's `settings` list. */
export interface ShikiTokenSetting {
  scope?: string | readonly string[]
  settings: {
    foreground?: string
    background?: string
    fontStyle?: string
  }
}

/**
 * Syntax role → the TextMate scopes it colours.
 *
 * The scope lists are the ones an editor grammar actually emits, and several roles
 * claim more than one scope because grammars disagree: a type annotation may arrive
 * as `entity.name.type`, as `support.type`, or as `storage.type` depending on the
 * language, and a theme that names only one of them renders that language
 * unhighlighted. The lists are conservative — they claim the scopes that mean the
 * role unambiguously, and leave the rest to the editor's default.
 */
const SHIKI_SCOPES: Readonly<Record<SyntaxRole, readonly string[]>> = Object.freeze({
  keyword: [
    'keyword',
    'keyword.control',
    'keyword.operator.new',
    'storage',
    'storage.type',
    'storage.modifier',
  ],
  string: ['string', 'string.quoted', 'string.template', 'punctuation.definition.string'],
  number: ['constant.numeric', 'constant.language', 'constant.other'],
  comment: ['comment', 'punctuation.definition.comment'],
  function: ['entity.name.function', 'support.function', 'meta.function-call', 'variable.function'],
  variable: ['variable', 'variable.other', 'variable.parameter', 'meta.definition.variable'],
  type: ['entity.name.type', 'entity.name.class', 'support.type', 'support.class'],
  tag: ['entity.name.tag', 'meta.tag'],
  attribute: ['entity.other.attribute-name'],
  operator: ['keyword.operator'],
  heading: ['markup.heading', 'entity.name.section'],
  link: ['markup.underline.link', 'string.other.link'],
  constant: ['constant', 'support.constant', 'variable.language'],
  punctuation: ['punctuation', 'meta.brace', 'punctuation.separator'],
  diffAdd: ['markup.inserted', 'meta.diff.header.to-file', 'punctuation.definition.inserted'],
  diffDelete: ['markup.deleted', 'meta.diff.header.from-file', 'punctuation.definition.deleted'],
  diffHunk: ['meta.diff.range', 'meta.diff.index', 'punctuation.definition.range.diff'],
  searchMatch: ['markup.highlight', 'markup.underline.match'],
})

/**
 * Converts a theme to a Shiki registration.
 *
 * Order matters in Shiki's `settings` list: later entries win, and the scopes here
 * overlap by design (`keyword.operator` is claimed by both `keyword` and
 * `operator`). `operator` is emitted last so its narrower claim wins, which is what
 * every editor does and what makes `+` and `=` read differently from `if` and
 * `return`.
 */
export function toShikiTheme(theme: AdeaTheme): ShikiThemeRegistration {
  const roles = syntaxRolesHex(theme)

  const colors: Record<string, string> = {
    'editor.background': hex(theme.colors.background),
    'editor.foreground': hex(theme.colors.text),
    'editorCursor.foreground': hex(theme.cursor),
    'editor.selectionBackground': hex(theme.selection),
    'editor.lineHighlightBackground': hex(theme.colors.surface),
    'editorLineNumber.foreground': hex(theme.colors.textSubtle),
    'editorLineNumber.activeForeground': hex(theme.colors.textMuted),
    'editorIndentGuide.background': hex(theme.colors.borderMuted),
    'editorIndentGuide.activeBackground': hex(theme.colors.border),
    'editorWhitespace.foreground': hex(theme.colors.border),
    'editorWidget.background': hex(theme.colors.surfaceElevated),
    'editorWidget.border': hex(theme.colors.border),
    // Diff surfaces read the semantic status roles rather than a separate scale,
    // so a diff in the editor and a diff in the conversation use one palette.
    'diffEditor.insertedTextBackground': hex(theme.colors.surface),
    'diffEditor.removedTextBackground': hex(theme.colors.surface),
    'terminal.ansiRed': hex(theme.ansi.red),
    'terminal.ansiGreen': hex(theme.ansi.green),
    'terminal.ansiYellow': hex(theme.ansi.yellow),
    'terminal.ansiBlue': hex(theme.ansi.blue),
    'terminal.ansiMagenta': hex(theme.ansi.magenta),
    'terminal.ansiCyan': hex(theme.ansi.cyan),
    'terminal.ansiWhite': hex(theme.ansi.white),
  }

  const settings: ShikiTokenSetting[] = [
    { settings: { foreground: hex(theme.colors.text), background: hex(theme.colors.background) } },
  ]

  // Everything except `operator`, which is emitted last and narrows the claim.
  for (const [role, scopes] of Object.entries(SHIKI_SCOPES) as [SyntaxRole, readonly string[]][]) {
    if (role === 'operator') continue
    settings.push({
      scope: scopes,
      settings: {
        foreground: roles[role],
        ...(role === 'comment' ? { fontStyle: 'italic' } : {}),
        ...(role === 'heading' ? { fontStyle: 'bold' } : {}),
      },
    })
  }

  settings.push({ scope: SHIKI_SCOPES.operator, settings: { foreground: roles.operator } })

  return {
    name: `adea-${theme.id}`,
    type: theme.appearance,
    colors,
    settings,
  }
}

/** Formats a colour as hex, leaving it alone if it cannot be parsed. */
function hex(value: string): string {
  const parsed = parseColor(value)
  return parsed ? oklchToHex(parsed) : value
}

/** Every theme as a registration list, ready for `createHighlighter({ themes })`. */
export function toShikiThemes(themes: readonly AdeaTheme[]): ShikiThemeRegistration[] {
  return themes.map(toShikiTheme)
}
