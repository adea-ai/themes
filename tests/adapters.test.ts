import { describe, expect, test } from 'bun:test'

import { getBase24Scheme, getTheme, themes } from '../src'
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
import { shadcnVariables } from '../src/adapters/shadcn'
import { chartSeries, statusForeground, syntaxRoles, tint } from '../src/derive'
import { contrastRatio, formatOklch, hexToOklch, oklchToHex, parseColor } from '../src/oklch'

/**
 * The adapters are the package's promise to a consumer, so each one is held to the
 * contract its target actually has rather than to "it returns something".
 */
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
  test('every theme exports a complete scheme', () => {
    for (const theme of themes) {
      const scheme = toBase24(theme)
      expect(scheme.variant).toBe(theme.appearance)
      for (const slot of BASE24_SLOTS) {
        expect(scheme.palette[slot], `${theme.id} leaves ${slot} empty`).toBeTruthy()
        expect(parseColor(scheme.palette[slot]!), `${theme.id} ${slot} is unparseable`).toBeDefined()
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
    const incomplete = 'system: "base24"\nname: "x"\nvariant: "dark"\npalette:\n  base00: "#000000"\n'
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
        expect(ratio, `${theme.id} ${name} measures ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(floor)
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
      expect(chartSeries(theme), `${theme.id} has ${chartSeries(theme).length} series`).toHaveLength(6)
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
      const ratio = contrastRatio(
        parseColor(roles.comment)!,
        parseColor(theme.colors.background)!
      )
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
})
