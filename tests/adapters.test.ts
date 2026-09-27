import { describe, expect, test } from 'bun:test'

import {
  editorRolesHex,
  getBase24Scheme,
  getTheme,
  primaryHover,
  primarySubtleCss,
  themes,
} from '../src'
import {
  BASE24_SLOTS,
  formatBase24Scheme,
  parseBase24Palette,
  parseBase24Scheme,
  toBase24,
} from '../src/adapters/base24'
import { toShikiTheme } from '../src/adapters/shiki'
import { toXtermTheme } from '../src/adapters/xterm'
import { catalogueCss, themeCssVariables } from '../src/adapters/css'
import { toTailwindTheme } from '../src/adapters/tailwind'
import {
  SHADCN_MAPPING,
  shadcnDestructiveProjection,
  shadcnVariables,
} from '../src/adapters/shadcn'
import { chartSeries, statusForeground, syntaxRoles, syntaxRolesHex, tint } from '../src/derive'
import { contrastRatio, formatOklch, hexToOklch, oklchToHex, parseColor } from '../src/oklch'

function compositeSrgb(foreground: string, background: string, alpha: number) {
  const foregroundHex = oklchToHex(parseColor(foreground)!)
  const backgroundHex = oklchToHex(parseColor(background)!)
  const channels = [1, 3, 5].map((offset) => {
    const front = Number.parseInt(foregroundHex.slice(offset, offset + 2), 16)
    const back = Number.parseInt(backgroundHex.slice(offset, offset + 2), 16)
    return Math.round(front * alpha + back * (1 - alpha))
      .toString(16)
      .padStart(2, '0')
  })
  return parseColor(`#${channels.join('')}`)!
}

/**
 * The adapters are the package's promise to a consumer, so each one is held to the
 * contract its target actually has rather than to "it returns something".
 */
/**
 * A complete Base24 document, with `head` replacing the default `name` line.
 *
 * The parser requires all 24 slots and a variant, so a fixture that only carries the
 * line under test is rejected before the assertion runs. Everything here except the
 * scalar lines is boilerplate that the parser insists on.
 */
function schemeWith(head: readonly string[]): string {
  const palette = BASE24_SLOTS.map(
    (slot, index) => `  ${slot}: "#${(index + 1).toString(16).padStart(2, '0')}1e2e"`
  )
  return ['system: "base24"', 'variant: "dark"', ...head, 'palette:', ...palette].join('\n')
}

describe('oklch core', () => {
  test('a hex round trip is lossless to within one step', () => {
    const samples = ['#000000', '#ffffff', '#1e1e2e', '#e06c75', '#8da101', '#0e7490', '#f92672']
    for (const hex of samples) {
      const parsed = hexToOklch(hex)
      expect(parsed, `${hex} did not parse`).toBeDefined()
      expect(oklchToHex(parsed!), `${hex} did not survive a round trip`).toBe(hex)
    }
  })

  test('the canonical form is stable under repeated formatting', () => {
    for (const theme of themes) {
      const once = formatOklch(parseColor(theme.colors.background)!)
      const twice = formatOklch(parseColor(once)!)
      expect(twice).toBe(once)
    }
  })

  test('an out-of-gamut colour is mapped rather than clipped', () => {
    // A chroma no sRGB blue can reach. Clipping would flatten the blue channel;
    // gamut mapping keeps the hue and gives up chroma.
    const vivid = { l: 0.5, c: 0.4, h: 264 }
    const mapped = parseColor(oklchToHex(vivid))!
    expect(mapped.c).toBeLessThan(vivid.c)
    expect(Math.abs(mapped.h - vivid.h)).toBeLessThan(12)
  })

  test('malformed input returns undefined instead of throwing', () => {
    for (const bad of ['', 'not-a-colour', '#12345', 'rgb(0,0,0)', 'oklch(a b c)']) {
      expect(parseColor(bad), `${bad} should not parse`).toBeUndefined()
    }
  })
})

describe('base24 adapter', () => {
  /**
   * The comment strip is a scan, not `replace(/\s+#.*$/, '')`.
   *
   * That pattern is a quantified `\s+` followed by `.*`, which is quadratic on a line
   * with many spaces and no `#` — CodeQL's `js/polynomial-redos`. These pin the
   * behaviour so the rewrite is verifiably equivalent rather than hopefully so.
   */
  test('a trailing comment is stripped, and a leading # is not a comment', () => {
    const scheme = parseBase24Scheme(
      schemeWith(['name: Test # this is a trailing comment', '# a full-line comment'])
    )
    expect(scheme.name).toBe('Test')
    expect(scheme.palette.base00).toBe('#011e2e')
  })

  test('a long run of whitespace with no comment parses', () => {
    // The pathological input the old pattern backtracked over. It only has to
    // terminate and produce the right value; a timing assertion would be flaky.
    const scheme = parseBase24Scheme(schemeWith([`name:${' '.repeat(20_000)}Test`]))
    expect(scheme.name).toBe('Test')
  })

  test('a # not preceded by whitespace is left alone', () => {
    const scheme = parseBase24Scheme(schemeWith(['name: "a#b"']))
    expect(scheme.name).toBe('a#b')
  })

  test('every theme exports a complete scheme', () => {
    for (const theme of themes) {
      const scheme = toBase24(theme)
      expect(scheme.variant).toBe(theme.appearance)
      for (const slot of BASE24_SLOTS) {
        expect(scheme.palette[slot], `${theme.id} leaves ${slot} empty`).toBeTruthy()
        expect(
          parseColor(scheme.palette[slot]!),
          `${theme.id} ${slot} is unparseable`
        ).toBeDefined()
      }
    }
  })

  test('an exported scheme parses back into the same roles', () => {
    // The roles Adea models must survive a full round trip. Two slots are
    // deliberately not claimed — see the adapter's header — so this asserts the
    // roles that are, which is what a consumer actually relies on.
    for (const theme of themes) {
      const reparsed = parseBase24Scheme(formatBase24Scheme(toBase24(theme)))
      const palette = parseBase24Palette(reparsed.palette)

      expect(oklchToHex(palette.base00), `${theme.id} background`).toBe(
        oklchToHex(parseColor(theme.colors.background)!)
      )
      expect(oklchToHex(palette.base08), `${theme.id} red`).toBe(
        oklchToHex(parseColor(theme.ansi.red)!)
      )
      expect(oklchToHex(palette.base0D), `${theme.id} blue`).toBe(
        oklchToHex(parseColor(theme.ansi.blue)!)
      )
      expect(oklchToHex(palette.base0E), `${theme.id} magenta`).toBe(
        oklchToHex(parseColor(theme.ansi.magenta)!)
      )
      expect(oklchToHex(palette.base12), `${theme.id} bright red`).toBe(
        oklchToHex(parseColor(theme.ansi.brightRed)!)
      )
      expect(oklchToHex(palette.base17), `${theme.id} bright magenta`).toBe(
        oklchToHex(parseColor(theme.ansi.brightMagenta)!)
      )
    }
  })

  test('the vendored scheme is returned untouched', () => {
    const scheme = getBase24Scheme('catppuccin-mocha')
    expect(scheme).toBeDefined()
    expect(scheme!.name).toBe('Catppuccin Mocha')
    expect(scheme!.palette.base00.toLowerCase()).toBe('#1e1e2e')
    expect(scheme!.palette.base0D.toLowerCase()).toBe('#89b4fa')
  })

  test('a malformed scheme is rejected with the offending slot named', () => {
    const incomplete =
      'system: "base24"\nname: "x"\nvariant: "dark"\npalette:\n  base00: "#000000"\n'
    expect(() => parseBase24Scheme(incomplete)).toThrow(/base01/)
  })

  test('a scheme with an unknown variant is rejected', () => {
    const wrong = BASE24_SLOTS.map((slot) => `  ${slot}: "#000000"`).join('\n')
    const source = `system: "base24"\nname: "x"\nvariant: "sepia"\npalette:\n${wrong}\n`
    expect(() => parseBase24Scheme(source)).toThrow(/dark or light/)
  })
})

describe('xterm adapter', () => {
  test('every value is hex, because xterm cannot evaluate oklch()', () => {
    for (const theme of themes) {
      const xterm = toXtermTheme(theme)
      for (const [key, value] of Object.entries(xterm)) {
        expect(/^#[0-9a-f]{6}$/.test(value), `${theme.id} ${key} is not hex: ${value}`).toBe(true)
      }
    }
  })

  test('cursor and selection carry a legible foreground', () => {
    // Two floors, matching the adapter. Selected text is \*text\* and takes the body
    // floor; a cursor glyph is a UI affordance and takes WCAG's non-text floor, which is
    // the only thing a mid-tone cursor can meet — Nord's light cursor is a cyan, and
    // nothing in that palette reaches 4.5:1 against it.
    for (const theme of themes) {
      const xterm = toXtermTheme(theme)
      const cases = [
        ['cursorAccent', xterm.cursor, xterm.cursorAccent, 2.9],
        ['selectionForeground', xterm.selectionBackground, xterm.selectionForeground, 4.4],
      ] as const
      for (const [name, background, foreground, floor] of cases) {
        const ratio = contrastRatio(parseColor(foreground)!, parseColor(background)!)
        expect(ratio, `${theme.id} ${name} measures ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(
          floor
        )
      }
    }
  })
})

describe('css and tailwind adapters', () => {
  test('every role becomes a custom property', () => {
    for (const theme of themes) {
      const variables = themeCssVariables(theme)
      for (const role of [
        'background',
        'foreground',
        'surface',
        'surface-elevated',
        'border',
        'text-muted',
        'accent',
        'accent-foreground',
      ]) {
        expect(variables[`--adea-${role}`], `${theme.id} is missing --adea-${role}`).toBeTruthy()
      }
      // 17 roles + cursor/selection + 16 ansi + 6 chart + 4 status pairs + sunken.
      expect(Object.keys(variables).length).toBeGreaterThanOrEqual(50)
    }
  })

  test('the catalogue stylesheet emits one rule per theme', () => {
    const css = catalogueCss(themes)
    for (const theme of themes) {
      expect(css, `${theme.id} has no rule`).toContain(`[data-theme='${theme.id}']`)
    }
    expect(css.split('\n}').length - 1).toBe(themes.length)
  })

  test('tailwind resolves every utility through a variable, not a literal', () => {
    const block = toTailwindTheme()
    expect(block.startsWith('@theme inline {')).toBe(true)
    // `inline` plus a var() reference is what lets one stylesheet serve every theme.
    expect(block).toContain('--color-background: var(--adea-background);')
    expect(block).toContain('--color-chart-6: var(--adea-chart-6);')
  })
})

describe('shadcn bridge', () => {
  test('the interactive colour lands on primary, not on accent', () => {
    // shadcn's `--accent` is a hover wash and its `--primary` is the action colour.
    // Mapping Adea's accent to the wrong one turns every primary button grey.
    const theme = getTheme('catppuccin-mocha')!
    const variables = shadcnVariables(theme)
    expect(variables['--primary']).toBe(theme.colors.accent)
    expect(variables['--primary-foreground']).toBe(theme.colors.accentForeground)
    expect(variables['--accent']).toBe(theme.colors.surfaceHover)
  })

  test('every canonical role has a destination', () => {
    const theme = getTheme('nord')!
    const variables = shadcnVariables(theme)
    const required = [
      '--background',
      '--foreground',
      '--card',
      '--card-foreground',
      '--popover',
      '--popover-foreground',
      '--primary',
      '--primary-foreground',
      '--primary-hover',
      '--primary-subtle',
      '--secondary',
      '--muted',
      '--muted-foreground',
      '--accent',
      '--accent-foreground',
      '--border',
      '--input',
      '--ring',
      '--destructive',
      '--success',
      '--warning',
      '--info',
      '--sidebar',
      '--sidebar-foreground',
      '--sidebar-accent',
      '--sidebar-border',
      '--sidebar-ring',
    ]
    for (const name of required) {
      expect(variables[name], `${name} is unmapped`).toBeTruthy()
    }
  })

  test('primary state tokens use the canonical appearance-aware derivation for every theme', () => {
    for (const theme of themes) {
      const variables = shadcnVariables(theme)
      const hover = variables['--primary-hover']
      const primaryForeground = variables['--primary-foreground']
      const hoverForeground = parseColor(primaryForeground ?? '')
      const hoverFill = parseColor(hover ?? '')

      expect(variables['--primary'], `${theme.id} primary`).toBe(theme.colors.accent)
      expect(primaryForeground, `${theme.id} primary foreground`).toBe(
        theme.colors.accentForeground
      )
      expect(hover, `${theme.id} primary hover`).toBe(
        primaryHover(theme.colors.accent, theme.appearance)
      )
      expect(variables['--primary-subtle'], `${theme.id} primary subtle`).toBe(
        primarySubtleCss(theme.appearance)
      )
      expect(hoverForeground, `${theme.id} primary foreground is invalid`).toBeDefined()
      expect(hoverFill, `${theme.id} primary hover is invalid`).toBeDefined()

      const ratio = contrastRatio(hoverForeground!, hoverFill!)
      expect(
        ratio,
        `${theme.id} primary foreground on hover is ${ratio.toFixed(2)}:1`
      ).toBeGreaterThanOrEqual(4.5)
    }
  })

  test('status aliases are opaque and keep the small-text pairing readable in every theme', () => {
    for (const theme of themes) {
      const variables = shadcnVariables(theme)

      for (const role of ['success', 'warning', 'error', 'info'] as const) {
        const shadcnRole = SHADCN_MAPPING[role]
        const fill = variables[`--${shadcnRole}-subtle`]
        const foreground = parseColor(theme.colors.text)

        expect(fill, `${theme.id} is missing --${shadcnRole}-subtle`).toBeDefined()
        const parsedFill = parseColor(fill ?? '')
        expect(parsedFill, `${theme.id} --${shadcnRole}-subtle is not opaque OKLCH`).toBeDefined()
        expect(fill).toBe(tint(theme.colors[role], theme.colors.background))
        expect(variables[`--${shadcnRole}-foreground`]).toBe(
          role === 'error'
            ? shadcnDestructiveProjection(theme).foreground
            : statusForeground(theme, role)
        )

        const ratio = contrastRatio(foreground!, parsedFill!)
        expect(
          ratio,
          `${theme.id} foreground on ${shadcnRole}-subtle is ${ratio.toFixed(2)}:1`
        ).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  test('the destructive solid pair stays readable through the shared 90% hover composition', () => {
    for (const theme of themes) {
      const sourceError = theme.colors.error
      const sourceAnsi = { ...theme.ansi }
      const sourceSyntax = syntaxRoles(theme)
      const projection = shadcnDestructiveProjection(theme)
      const variables = shadcnVariables(theme)
      const fill = parseColor(projection.fill)!
      const foreground = parseColor(projection.foreground)!
      const source = parseColor(sourceError)!

      expect(variables['--destructive']).toBe(projection.fill)
      expect(variables['--destructive-foreground']).toBe(projection.foreground)
      expect(variables['--destructive-subtle']).toBe(tint(sourceError, theme.colors.background))
      expect(theme.colors.error).toBe(sourceError)
      expect(theme.ansi).toEqual(sourceAnsi)
      expect(syntaxRoles(theme)).toEqual(sourceSyntax)
      expect(Math.abs(fill.h - source.h), `${theme.id} destructive hue drifted`).toBeLessThan(0.01)
      expect(
        Math.abs(fill.l - source.l),
        `${theme.id} destructive lightness moved too far`
      ).toBeLessThanOrEqual(0.08)

      const renderedForeground = parseColor(oklchToHex(foreground))!
      const surfaces = [
        theme.colors.background,
        theme.colors.surface,
        theme.colors.surfaceElevated,
        theme.shadcn?.card ?? theme.colors.surface,
        theme.shadcn?.popover ?? theme.colors.surfaceElevated,
      ]
      const solidRatio = contrastRatio(renderedForeground, parseColor(oklchToHex(fill))!)
      expect(
        solidRatio,
        `${theme.id} solid destructive text is ${solidRatio.toFixed(2)}:1`
      ).toBeGreaterThanOrEqual(5)

      for (const surface of surfaces) {
        const hoverBackground = compositeSrgb(projection.fill, surface, 0.9)
        const hoverRatio = contrastRatio(renderedForeground, hoverBackground)
        expect(
          hoverRatio,
          `${theme.id} destructive text on 90% fill over ${surface} is ${hoverRatio.toFixed(2)}:1`
        ).toBeGreaterThanOrEqual(5)
      }
    }
  })

  test('the destructive hover floor includes owner-authored card and popover surfaces', () => {
    const source = getTheme('catppuccin-frappe')!
    const theme = {
      ...source,
      shadcn: { ...source.shadcn, card: '#000000', popover: '#000000' },
    }
    const projection = shadcnDestructiveProjection(theme)
    const variables = shadcnVariables(theme)
    const foreground = parseColor(oklchToHex(parseColor(projection.foreground)!))!

    for (const surface of [theme.shadcn.card, theme.shadcn.popover]) {
      const hoverBackground = compositeSrgb(projection.fill, surface, 0.9)
      const ratio = contrastRatio(foreground, hoverBackground)
      expect(ratio, `owner-authored surface hover is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(
        5
      )
    }
    expect(variables['--destructive']).toBe(projection.fill)
    expect(variables['--destructive-foreground']).toBe(projection.foreground)
  })

  test('legacy Slate and High Contrast records preserve their exact shadcn-only roles', () => {
    const expected = {
      'slate-light': {
        background: '#f8fafc',
        foreground: '#0f172a',
        card: '#ffffff',
        'card-foreground': '#0f172a',
        popover: '#ffffff',
        'popover-foreground': '#0f172a',
        primary: '#0f172a',
        'primary-foreground': '#f8fafc',
        secondary: '#e2e8f0',
        'secondary-foreground': '#0f172a',
        muted: '#e2e8f0',
        'muted-foreground': '#475569',
        accent: '#e2e8f0',
        'accent-foreground': '#0f172a',
        destructive: '#b91c1c',
        success: '#15803d',
        border: '#cbd5e1',
        input: '#cbd5e1',
        ring: '#64748b',
      },
      'slate-dark': {
        background: '#0f172a',
        foreground: '#f1f5f9',
        card: '#1e293b',
        'card-foreground': '#f1f5f9',
        popover: '#1e293b',
        'popover-foreground': '#f1f5f9',
        primary: '#e2e8f0',
        'primary-foreground': '#0f172a',
        secondary: '#334155',
        'secondary-foreground': '#f1f5f9',
        muted: '#334155',
        'muted-foreground': '#9eadc2',
        accent: '#334155',
        'accent-foreground': '#f1f5f9',
        destructive: '#f87171',
        success: '#4ade80',
        border: 'rgba(148, 163, 184, 0.2)',
        input: 'rgba(148, 163, 184, 0.25)',
        ring: '#64748b',
      },
      'contrast-light': {
        background: '#ffffff',
        foreground: '#000000',
        card: '#ffffff',
        'card-foreground': '#000000',
        popover: '#ffffff',
        'popover-foreground': '#000000',
        primary: '#143d8f',
        'primary-foreground': '#ffffff',
        secondary: '#f0f0f0',
        'secondary-foreground': '#000000',
        muted: '#f0f0f0',
        'muted-foreground': '#333333',
        accent: '#f0f0f0',
        'accent-foreground': '#000000',
        destructive: '#b91c1c',
        success: '#14532d',
        border: '#767676',
        input: '#767676',
        ring: '#000000',
      },
      'contrast-dark': {
        background: '#000000',
        foreground: '#ffffff',
        card: '#0a0a0a',
        'card-foreground': '#ffffff',
        popover: '#0a0a0a',
        'popover-foreground': '#ffffff',
        primary: '#8ab4ff',
        'primary-foreground': '#000000',
        secondary: '#1a1a1a',
        'secondary-foreground': '#ffffff',
        muted: '#1a1a1a',
        'muted-foreground': '#e5e5e5',
        accent: '#1a1a1a',
        'accent-foreground': '#ffffff',
        destructive: '#ff6b6b',
        success: '#4ade80',
        border: '#8f8f8f',
        input: '#8f8f8f',
        ring: '#ffffff',
      },
    } as const

    for (const [id, roles] of Object.entries(expected)) {
      const theme = getTheme(id)
      expect(theme, `${id} is not in the shared catalogue`).toBeDefined()
      if (!theme) continue

      const variables = shadcnVariables(theme)
      for (const [role, value] of Object.entries(roles)) {
        const actual = variables[`--${role}`]
        expect(actual, `${id} --${role}`).toBeDefined()
        const exact = actual?.startsWith('rgba(') ? actual : oklchToHex(parseColor(actual ?? '')!)
        expect(exact, `${id} --${role}`).toBe(value)
      }

      if (id === 'slate-dark') {
        expect(oklchToHex(parseColor(theme.colors.textMuted)!)).toBe('#94a3b8')
      }

      // The consumer-facing foreground pairs are checked after projection, not
      // inferred from canonical colors that a source-specific override may replace.
      const foregroundPairs = [
        ['--foreground', '--background', 4.5],
        ['--card-foreground', '--card', 4.5],
        ['--popover-foreground', '--popover', 4.5],
        ['--primary-foreground', '--primary', 4.5],
        ['--secondary-foreground', '--secondary', 4.5],
        ['--muted-foreground', '--muted', 4.5],
        ['--accent-foreground', '--accent', 4.5],
        ['--ring', '--background', 3],
      ] as const
      for (const [foregroundName, backgroundName, minimum] of foregroundPairs) {
        const foreground = parseColor(variables[foregroundName] ?? '')
        const background = parseColor(variables[backgroundName] ?? '')
        expect(foreground, `${id} ${foregroundName} is not parseable`).toBeDefined()
        expect(background, `${id} ${backgroundName} is not parseable`).toBeDefined()
        const ratio = contrastRatio(foreground!, background!)
        expect(
          ratio,
          `${id} ${foregroundName} on ${backgroundName} is ${ratio.toFixed(2)}:1`
        ).toBeGreaterThanOrEqual(minimum)
      }
    }
  })
})

describe('shiki adapter', () => {
  test('every colour is hex and every syntax role is present', () => {
    for (const theme of themes) {
      const shiki = toShikiTheme(theme)
      expect(shiki.name).toBe(`adea-${theme.id}`)
      expect(shiki.type).toBe(theme.appearance)
      for (const [key, value] of Object.entries(shiki.colors)) {
        expect(/^#[0-9a-f]{6}$/.test(value), `${theme.id} ${key} is not hex: ${value}`).toBe(true)
      }
      // A registration with only a default rule renders an entire file in one
      // colour, which is the failure this catches.
      expect(shiki.settings.length).toBeGreaterThan(10)
      const roles = syntaxRoles(theme)
      expect(Object.keys(roles).length).toBeGreaterThanOrEqual(18)
    }
  })

  test('the operator scope is claimed last, so its narrower rule wins', () => {
    const shiki = toShikiTheme(getTheme('dracula')!)
    const last = shiki.settings.at(-1)
    expect(last).toBeDefined()
    expect([...(last!.scope as readonly string[])]).toContain('keyword.operator')
  })
})

describe('derived colours', () => {
  test('the chart series is the same six slots in every theme', () => {
    for (const theme of themes) {
      expect(
        chartSeries(theme),
        `${theme.id} has ${chartSeries(theme).length} series`
      ).toHaveLength(6)
    }
    // Same role, different value per theme: series 1 is always the palette's blue.
    const mocha = chartSeries(getTheme('catppuccin-mocha')!)
    expect(mocha[0]).toBe(getTheme('catppuccin-mocha')!.ansi.blue)
  })

  test('a status fill is opaque, so its text pairing can be measured', () => {
    const theme = getTheme('gruvbox-dark')!
    const fill = tint(theme.colors.success, theme.colors.background)
    expect(fill).not.toContain('transparent')
    expect(fill).not.toContain('/')
    expect(parseColor(fill)).toBeDefined()
  })

  test('the status label clears the floor on its own fill, in every theme', () => {
    // This is the pairing a filled chip actually renders, and the reason the
    // foreground is derived rather than taken from the theme's body text.
    for (const theme of themes) {
      for (const role of ['success', 'warning', 'error', 'info'] as const) {
        const ratio = contrastRatio(
          parseColor(statusForeground(theme, role))!,
          parseColor(theme.colors[role])!
        )
        expect(
          ratio,
          `${theme.id} ${role}-foreground measures ${ratio.toFixed(2)}:1 on the fill`
        ).toBeGreaterThanOrEqual(4.4)
      }
    }
  })

  test('syntax comment is visible on the canvas in every theme', () => {
    // Visibility, not legibility: a comment is meant to be the faintest thing on
    // screen and every palette defines it that way. The floor is the same one
    // `syntaxRoles` documents — see its note on why a text floor would invert the
    // role rather than improve it.
    for (const theme of themes) {
      const roles = syntaxRoles(theme)
      const ratio = contrastRatio(parseColor(roles.comment)!, parseColor(theme.colors.background)!)
      expect(ratio, `${theme.id} comment is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(1.95)
    }
  })

  test('syntax comment is unmistakably quieter than body text', () => {
    // The property that actually matters, and the one a naive "make comments
    // readable" change would break: a comment must never compete with code.
    for (const theme of themes) {
      const roles = syntaxRoles(theme)
      const comment = contrastRatio(
        parseColor(roles.comment)!,
        parseColor(theme.colors.background)!
      )
      const text = contrastRatio(
        parseColor(theme.colors.text)!,
        parseColor(theme.colors.background)!
      )
      expect(
        comment,
        `${theme.id} comment (${comment.toFixed(2)}:1) is not quieter than text (${text.toFixed(2)}:1)`
      ).toBeLessThan(text)
    }
  })

  test('the canonical editor projection meets its contrast floor after hex rounding', () => {
    const theme = getTheme('contrast-dark')!
    const canonical = syntaxRolesHex(theme)
    const projected = editorRolesHex(theme)

    expect(oklchToHex(parseColor(theme.ansi.brightBlack)!)).toBe('#57606a')
    expect(canonical.comment).toBe('#57606a')
    expect(projected.comment).toBe('#6c7680')
    for (const [role, value] of Object.entries(projected)) {
      const ratio = contrastRatio(parseColor(value)!, parseColor(theme.colors.background)!)
      expect(ratio, `${role} is ${ratio.toFixed(5)}:1 after hex rounding`).toBeGreaterThanOrEqual(
        4.5
      )
    }
  })

  test('the six first-party editor palettes clear 4.5:1 in their rendered hex roles', () => {
    for (const id of [
      'adea-light',
      'adea-dark',
      'slate-light',
      'slate-dark',
      'contrast-light',
      'contrast-dark',
    ]) {
      const theme = getTheme(id)!
      const roles = editorRolesHex(theme)
      expect(Object.keys(roles)).toHaveLength(16)
      for (const [role, value] of Object.entries(roles)) {
        const ratio = contrastRatio(parseColor(value)!, parseColor(theme.colors.background)!)
        expect(ratio, `${id} editor.${role} is ${ratio.toFixed(5)}:1`).toBeGreaterThanOrEqual(4.5)
      }
    }
  })
})
