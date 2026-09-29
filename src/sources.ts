/**
 * What the catalogue contains, and where each palette came from.
 *
 * Two lists. {@link VENDORED_SOURCES} names the Base24 schemes that
 * `scripts/vendor-palettes.ts` reproduces from upstream, and {@link AUTHORED_SOURCES}
 * records Adea-owned themes that have no upstream palette to vendor. Together they
 * are the catalogue's input; `scripts/build-catalogue.ts` runs them all through the
 * normalizer and writes the committed output.
 *
 * ## Provenance is per-family, and it was checked rather than assumed
 *
 * Every licence below was read from the upstream repository, not recalled. Two
 * needed care:
 *
 * - **Gruvbox** declares MIT/X11 in its README and ships no `LICENSE` file, so
 *   GitHub's detector reports nothing. The README is the licence grant and it is
 *   recorded as MIT.
 * - **Monokai** has no permissively licensed repository of its own: the repository
 *   under the Monokai organisation carries no licence at all. The *values* in the
 *   catalogue are therefore taken from the MIT-licensed iTerm2-Color-Schemes port,
 *   which is the artefact recorded as the licence basis, and Monokai is credited
 *   as the design's origin. See NOTICE for the full reasoning.
 *
 * ## The chain of custody
 *
 * These palettes reach the catalogue through one intermediate artefact, and the
 * honest description of that is: `palettes/<id>.json` holds values reproduced from
 * a Base24 scheme in the `oklch-terminal-themes` dataset at a pinned revision,
 * which is itself derived from `iTerm2-Color-Schemes` at a pinned revision, which
 * is where the per-family values were first published as terminal schemes. Each
 * family's official project is recorded as the design's origin, and the values were
 * checked against those projects' published palettes — imported backgrounds and
 * foregrounds match their official palettes exactly. Adea's composed and authored
 * families are asserted from their own source definitions instead.
 *
 * `tests/provenance.test.ts` holds those official values as assertions, so the
 * claim "this is really Catppuccin Mocha" fails the build rather than drifting.
 */

import type { Base24Slot } from './adapters/base24.js'
import { CONTRAST_FLOORS } from './normalize.js'
import type { ShadcnThemeProjection, ThemeAppearance, ThemeProvenance } from './schema.js'

/** The dataset the Base24 schemes are reproduced from. */
export const CATALOGUE_REPOSITORY = 'https://github.com/williamzujkowski/oklch-terminal-themes'

/**
 * The pinned revision. Refreshing the catalogue starts by changing this, which is
 * what makes a palette update a reviewable diff rather than an invisible drift.
 */
export const CATALOGUE_REVISION = '9e800e7fe760081d4c10317498038ed4227341d6'

/** The upstream the dataset's per-family values were first published in. */
const ITERM2 = 'https://github.com/mbadolato/iTerm2-Color-Schemes'

/** Where Adea's own theme lives. */
export const ADEA_PROVENANCE: ThemeProvenance = Object.freeze({
  project: 'Adea',
  url: 'https://github.com/adea-ai/themes',
  license: 'Apache-2.0',
})

/**
 * A theme composed from **two** upstream palettes.
 *
 * Adea's own dark theme is not a copy of any published palette, and it is not
 * hand-authored either. It is a deliberate composition: the canvas, the greys, the
 * cursor and the selection come from a palette chosen for exactly those — Aardvark
 * Ink, whose near-black navy and muted blue-grey foreground are why it was picked —
 * and the sixteen ANSI hues come from a second palette chosen for its saturation,
 * GitHub's dark scheme.
 *
 * The split exists because the two properties are in tension inside one palette. A
 * palette tuned for a comfortable canvas mutes its hues to agree with it; a palette
 * tuned for vivid syntax colours tends to sit on a canvas that is very dark or very
 * flat. Taking one of each yields a calm ground with legible colour on it.
 *
 * ## Why it is composed rather than merged by hand
 *
 * The alternative was to read both palettes and paste the merged hex into
 * `palettes/adea-dark.json`. That works once and is wrong afterwards: nothing then
 * records which donor each value came from, so neither donor could ever be
 * refreshed. Composing in the vendor step keeps both parents named, keeps the values
 * upstream's own bytes rather than a transcription, and makes "GitHub changed its
 * blue" a one-line diff plus a rebuild.
 */
export interface ComposedSource {
  id: string
  name: string
  family: 'adea'
  familyLabel: string
  label: string
  description: string
  appearance: ThemeAppearance
  tags: readonly string[]
  /** The two donors' slugs in the dataset, and which half each supplies. */
  donors: Readonly<Record<'structure' | 'hues', string>>
  /**
   * The Base24 slot map.
   *
   * Each entry is `[donor, key]`, where the donor is `structure` or `hues` and the
   * key is a role name in that donor's published palette — the dataset's own names,
   * so `purple` is Base24's magenta slot and `brightPurple` its bright magenta.
   */
  slots: Readonly<Partial<Record<Base24Slot, readonly ['structure' | 'hues', string]>>>
  /**
   * Slots neither donor supplies, derived from one of them.
   *
   * `slots` and `synthesise` are jointly total: between them they must cover every
   * Base24 slot, and the vendor step asserts that rather than trusting it. The two
   * are separate maps rather than one so that "this value came from a donor" and
   * "this value was computed" stay distinguishable in review.
   */
  synthesise: Readonly<
    Partial<
      Record<
        Base24Slot,
        readonly ['structure' | 'hues', string, { rotate?: number; lighten?: number }]
      >
    >
  >
  /**
   * ANSI roles pinned to the structure donor's own values.
   *
   * The greyscale ramp is normally *derived* by ranking a scheme's grey slots by
   * measured contrast, because Base24 does not name `black`, `white` or
   * `brightBlack` and light schemes invert them. That derivation is right for an
   * imported palette and wrong here: Aardvark Ink publishes a greyscale it chose,
   * the greyscale is the reason it was chosen as the structure donor, and
   * re-deriving it gives back something close but not equal. So the four roles are
   * pinned to the donor's own values instead.
   */
  ansiFromStructure: readonly ('black' | 'brightBlack' | 'white' | 'brightWhite')[]
  /**
   * Corrections to the ANSI greyscale the structure donor pinned, on the same terms
   * as {@link palette}: upstream's bytes with named, reviewed adjustments. The pins
   * keep the donor's greyscale verbatim; these keep a family-wide canvas decision
   * (a less blue, more grey ramp) from stopping at the Base24 slots.
   */
  ansiOverrides?: Partial<Record<'black' | 'brightBlack' | 'white' | 'brightWhite', string>>
  /** The role supplying the accent, when the family's identity demands one. */
  accentSlot?: 'blue' | 'magenta' | 'cyan' | 'green'
  palette?: Partial<Record<Base24Slot, string>>
  /**
   * Transpose this composition's hues onto the borrowed canvas.
   *
   * Set when a composition takes its hues from a palette authored against a different
   * kind of canvas — which is what borrowing a *dark* palette's hues for a *light*
   * canvas is. See `transposeHues` in `src/normalize.ts` for why the whole hue set
   * moves by one common step rather than each hue being repaired on its own.
   */
  hueTranspose?: { floor: number }
  /** The body-text floor; the defaults are held to AAA rather than the catalogue's AA. */
  textFloor?: number
  provenance: ThemeProvenance
}

/**
 * Adea's managed family: two appearances × three accessibility variants.
 *
 * | | canvas | hues | accent |
 * | --- | --- | --- | --- |
 * | Adea Dark | GitHub Dark Default, re-greyed | GitHub Dark Default | its violet |
 * | Adea Dark Colorblind | same re-greyed canvas | GitHub Dark Colorblind | its violet |
 * | Adea Dark High Contrast | GitHub Dark HC, re-greyed | GitHub Dark High Contrast | its violet |
 * | Adea Light | GitHub Light Default `#ffffff` | GitHub Dark Default, transposed | its violet |
 * | Adea Light Colorblind | GitHub Light Colorblind `#ffffff` | GitHub Dark Colorblind, transposed | its violet |
 * | Adea Light High Contrast | GitHub Light High Contrast | GitHub Dark High Contrast, transposed | its violet |
 *
 * The family started as GitHub's two appearances verbatim and has now taken the
 * step the composition design was waiting for: the canvas greyscale is re-tinted
 * (chroma halved, hue rotated to violet-grey) so the family's violet accent reads
 * against a neutral ground instead of GitHub's blue one, and every variant's own
 * accent is the accent slot — violet/magenta, which GitHub keeps constant across
 * all six of its palettes, colourblind and high-contrast included.
 *
 * The accessibility variants are compositions of GitHub's own accessibility
 * variants, not afterthoughts: the colorblind pair adjusts the red/green hues the
 * way GitHub's does, and the high-contrast pair takes GitHub's HC canvases and
 * hues. The light variants keep the family rule that a light theme is the dark
 * theme's hues transposed onto paper, so a red is the same red in both modes of a
 * variant and switching appearance changes lightness and nothing else about the
 * identity. All six stay compositions rather than vendored copies so that a later
 * customisation is a one-slot diff with the donors still named.
 *
 * The light themes are the reason `hueTranspose` exists: GitHub's dark hues measure
 * between 2.5:1 and 4.1:1 on a light canvas, so the whole hue set is transposed down in
 * lightness by one common step — hue and chroma intact, relative brightness ordering
 * intact — rather than repaired hue by hue, which would have collapsed every bright
 * variant onto its normal sibling.
 */
export const COMPOSED_SOURCES: readonly ComposedSource[] = Object.freeze([
  {
    id: 'adea-dark',
    name: 'Adea Dark',
    family: 'adea',
    familyLabel: 'Adea',
    label: 'Dark',
    description:
      'The default dark theme: GitHub Dark Default with the canvas re-greyed to a violet-leaning neutral and the family violet accent, kept as a composition so the default can diverge from it one slot at a time.',
    appearance: 'dark',
    tags: ['dark', 'default', 'neutral'],
    donors: { structure: 'github-dark-default', hues: 'github-dark-default' },
    slots: {
      // The structure donor. `base01` receives its `black` rather than a background
      // step: an ANSI black equal to the background is invisible as foreground text,
      // which is the defect the normalizer's ramp notes describe.
      base00: ['structure', 'background'],
      base01: ['structure', 'black'],
      base02: ['structure', 'selection'],
      base03: ['structure', 'brightBlack'],
      base04: ['structure', 'white'],
      base05: ['structure', 'foreground'],
      base06: ['structure', 'brightWhite'],
      base07: ['structure', 'brightWhite'],
      // The hue donor. Base24's bright slots run red, yellow, green, cyan, blue,
      // magenta — not the ANSI order of yellow before green.
      base08: ['hues', 'red'],
      base0A: ['hues', 'yellow'],
      base0B: ['hues', 'green'],
      base0C: ['hues', 'cyan'],
      base0D: ['hues', 'blue'],
      base0E: ['hues', 'purple'],
      base12: ['hues', 'brightRed'],
      base13: ['hues', 'brightYellow'],
      base14: ['hues', 'brightGreen'],
      base15: ['hues', 'brightCyan'],
      base16: ['hues', 'brightBlue'],
      base17: ['hues', 'brightPurple'],
    },
    synthesise: {
      // Neither donor's ANSI set has an orange or a brown, and Base24 defines both.
      // A hue rotation off red and yellow is how the export adapter fills them too,
      // so a composed scheme and an exported one are synthesised identically.
      base09: ['hues', 'red', { rotate: 26 }],
      base0F: ['hues', 'yellow', { rotate: -34 }],
      // The two rungs below the canvas, which the specification defines as "dark
      // black" and "darker than that". Lightness slices of the structure donor's own
      // canvas, so the theme keeps its hue as it darkens.
      base10: ['structure', 'background', { lighten: -0.03 }],
      base11: ['structure', 'background', { lighten: -0.06 }],
    },
    ansiFromStructure: ['black', 'brightBlack', 'white', 'brightWhite'],
    /*
     * The family canvas decision: GitHub's greyscale is cut blue (`h≈258`, chroma
     * 0.014 on the canvas), which is exactly the tint a violet accent has to fight
     * for. Halving the chroma and rotating the greyscale to violet-grey keeps every
     * lightness relationship the ladder was built on and takes the tint out of the
     * way. The hue slots are untouched — the GitHub dark palette stays GitHub's.
     */
    palette: {
      base00: '#111013',
      base01: '#4f4d53',
      base02: '#ecebef',
      base03: '#76747a',
      base04: '#bab8be',
      base05: '#ecebef',
      base10: '#0a0a0c',
      base11: '#050506',
    },
    ansiOverrides: {
      black: '#4f4d53',
      brightBlack: '#76747a',
      white: '#bab8be',
    },
    // The family accent: the donor's violet, which GitHub keeps constant across its
    // colourblind and high-contrast palettes too.
    accentSlot: 'magenta',
    // AAA rather than AA, because this is a default rather than an imported palette.
    textFloor: 7,
    provenance: {
      project: 'Adea',
      url: 'https://github.com/adea-ai/themes',
      license: 'Apache-2.0',
      bootstrappedFrom: ['GitHub Dark Default (iTerm2-Color-Schemes)'],
    },
  },
  {
    id: 'adea-light',
    name: 'Adea Light',
    family: 'adea',
    familyLabel: 'Adea',
    label: 'Light',
    description:
      "The default light theme: GitHub's own white canvas carrying the dark theme's hues, transposed to survive on paper, with the family violet accent.",
    appearance: 'light',
    tags: ['light', 'default', 'neutral'],
    donors: { structure: 'github-light-default', hues: 'github-dark-default' },
    slots: {
      // The structure donor. Same shape as the dark theme's, with one property worth
      // noting: GitHub Light's `black` (`#24292f`) is *darker* than its foreground
      // (`#1f2328`), which is what an ANSI black should be on a light canvas — the
      // darkest neutral sits below the body text, not above it.
      base00: ['structure', 'background'],
      base01: ['structure', 'black'],
      base02: ['structure', 'selection'],
      base03: ['structure', 'brightBlack'],
      base04: ['structure', 'white'],
      base05: ['structure', 'foreground'],
      base06: ['structure', 'brightWhite'],
      base07: ['structure', 'brightWhite'],
      base08: ['hues', 'red'],
      base0A: ['hues', 'yellow'],
      base0B: ['hues', 'green'],
      base0C: ['hues', 'cyan'],
      base0D: ['hues', 'blue'],
      base0E: ['hues', 'purple'],
      base12: ['hues', 'brightRed'],
      base13: ['hues', 'brightYellow'],
      base14: ['hues', 'brightGreen'],
      base15: ['hues', 'brightCyan'],
      base16: ['hues', 'brightBlue'],
      base17: ['hues', 'brightPurple'],
    },
    synthesise: {
      base09: ['hues', 'red', { rotate: 26 }],
      base0F: ['hues', 'yellow', { rotate: -34 }],
      // Beyond the canvas rather than below it, which is the convention for a light
      // scheme: these two slots are the light end of the ramp.
      base10: ['structure', 'background', { lighten: 0.03 }],
      base11: ['structure', 'background', { lighten: 0.06 }],
    },
    ansiFromStructure: ['black', 'brightBlack', 'white', 'brightWhite'],
    // The family accent on paper: the transposed violet, dark enough to carry text
    // against the white canvas. See the dark theme for the canvas decision.
    accentSlot: 'magenta',
    /*
     * GitHub's hues were drawn for a `#0d1117` canvas. On Nord Light's they measure
     * between 2.5:1 and 4.1:1, which is legible as an accent and not as terminal text.
     *
     * The target carries a margin over the floor, and the reason is specific: the step is
     * set by the worst hue, so without a margin that hue lands exactly *on* the floor —
     * and cyan, the hue that needs the largest step, is also the one whose conversion to
     * sRGB sits furthest outside the gamut. A renderer that gamut-maps it by reducing
     * chroma and one that clamps its channels disagree by about 0.3 of a ratio point
     * there, so a value on the floor measures under it in the clamping case. The margin
     * is what makes the guarantee hold for either.
     */
    hueTranspose: { floor: CONTRAST_FLOORS.status + 0.4 },
    // AAA rather than AA; see `textFloor`. The binding pair is text on a popover, since
    // a light ladder descends away from its canvas.
    textFloor: 7,
    provenance: {
      project: 'Adea',
      url: 'https://github.com/adea-ai/themes',
      license: 'Apache-2.0',
      bootstrappedFrom: [
        'GitHub Light Default (iTerm2-Color-Schemes)',
        'GitHub Dark Default (iTerm2-Color-Schemes)',
      ],
    },
  },
  {
    id: 'adea-dark-colorblind',
    name: 'Adea Dark Colorblind',
    family: 'adea',
    familyLabel: 'Adea',
    label: 'Dark Colorblind',
    description:
      "The colourblind dark variant: GitHub Dark Colorblind's hues on the family's re-greyed canvas, for deuteranopia and protanopia. The violet accent survives the adjustment untouched.",
    appearance: 'dark',
    tags: ['dark', 'default', 'colorblind'],
    donors: { structure: 'github-dark-colorblind', hues: 'github-dark-colorblind' },
    slots: {
      base00: ['structure', 'background'],
      base01: ['structure', 'black'],
      base02: ['structure', 'selection'],
      base03: ['structure', 'brightBlack'],
      base04: ['structure', 'white'],
      base05: ['structure', 'foreground'],
      base06: ['structure', 'brightWhite'],
      base07: ['structure', 'brightWhite'],
      base08: ['hues', 'red'],
      base0A: ['hues', 'yellow'],
      base0B: ['hues', 'green'],
      base0C: ['hues', 'cyan'],
      base0D: ['hues', 'blue'],
      base0E: ['hues', 'purple'],
      base12: ['hues', 'brightRed'],
      base13: ['hues', 'brightYellow'],
      base14: ['hues', 'brightGreen'],
      base15: ['hues', 'brightCyan'],
      base16: ['hues', 'brightBlue'],
      base17: ['hues', 'brightPurple'],
    },
    synthesise: {
      base09: ['hues', 'red', { rotate: 26 }],
      base0F: ['hues', 'yellow', { rotate: -34 }],
      base10: ['structure', 'background', { lighten: -0.03 }],
      base11: ['structure', 'background', { lighten: -0.06 }],
    },
    ansiFromStructure: ['black', 'brightBlack', 'white', 'brightWhite'],
    // The same canvas decision as the default dark theme; the colourblind donor's
    // greyscale is identical to the default donor's, so the corrections match.
    palette: {
      base00: '#111013',
      base01: '#4f4d53',
      base02: '#ecebef',
      base03: '#76747a',
      base04: '#bab8be',
      base05: '#ecebef',
      base10: '#0a0a0c',
      base11: '#050506',
    },
    ansiOverrides: {
      black: '#4f4d53',
      brightBlack: '#76747a',
      white: '#bab8be',
    },
    accentSlot: 'magenta',
    textFloor: 7,
    provenance: {
      project: 'Adea',
      url: 'https://github.com/adea-ai/themes',
      license: 'Apache-2.0',
      bootstrappedFrom: ['GitHub Dark Colorblind (iTerm2-Color-Schemes)'],
    },
  },
  {
    id: 'adea-dark-high-contrast',
    name: 'Adea Dark High Contrast',
    family: 'adea',
    familyLabel: 'Adea',
    label: 'Dark High Contrast',
    description:
      "The high-contrast dark variant: GitHub Dark High Contrast's near-black canvas re-greyed to the family neutral, carrying its own high-contrast hues and violet accent.",
    appearance: 'dark',
    tags: ['dark', 'default', 'high-contrast'],
    donors: { structure: 'github-dark-high-contrast', hues: 'github-dark-high-contrast' },
    slots: {
      base00: ['structure', 'background'],
      base01: ['structure', 'black'],
      base02: ['structure', 'selection'],
      base03: ['structure', 'brightBlack'],
      base04: ['structure', 'white'],
      base05: ['structure', 'foreground'],
      base06: ['structure', 'brightWhite'],
      base07: ['structure', 'brightWhite'],
      base08: ['hues', 'red'],
      base0A: ['hues', 'yellow'],
      base0B: ['hues', 'green'],
      base0C: ['hues', 'cyan'],
      base0D: ['hues', 'blue'],
      base0E: ['hues', 'purple'],
      base12: ['hues', 'brightRed'],
      base13: ['hues', 'brightYellow'],
      base14: ['hues', 'brightGreen'],
      base15: ['hues', 'brightCyan'],
      base16: ['hues', 'brightBlue'],
      base17: ['hues', 'brightPurple'],
    },
    synthesise: {
      base09: ['hues', 'red', { rotate: 26 }],
      base0F: ['hues', 'yellow', { rotate: -34 }],
      base10: ['structure', 'background', { lighten: -0.03 }],
      base11: ['structure', 'background', { lighten: -0.06 }],
    },
    ansiFromStructure: ['black', 'brightBlack', 'white', 'brightWhite'],
    // The HC canvas is already near-black, so the correction is almost entirely
    // de-tinting: the chroma was half the default's to begin with.
    palette: {
      base00: '#0c0c0e',
      base01: '#828087',
      base02: '#f3f2f4',
      base03: '#a7a5ac',
      base04: '#dedde0',
      base05: '#f3f2f4',
      base10: '#060607',
      base11: '#030303',
    },
    ansiOverrides: {
      black: '#828087',
      brightBlack: '#a7a5ac',
      white: '#dedde0',
    },
    accentSlot: 'magenta',
    provenance: {
      project: 'Adea',
      url: 'https://github.com/adea-ai/themes',
      license: 'Apache-2.0',
      bootstrappedFrom: ['GitHub Dark High Contrast (iTerm2-Color-Schemes)'],
    },
  },
  {
    id: 'adea-light-colorblind',
    name: 'Adea Light Colorblind',
    family: 'adea',
    familyLabel: 'Adea',
    label: 'Light Colorblind',
    description:
      "The colourblind light variant: GitHub's white colourblind canvas carrying the dark colourblind hues, transposed to survive on paper — the same red is the same red as the dark colourblind variant.",
    appearance: 'light',
    tags: ['light', 'default', 'colorblind'],
    donors: { structure: 'github-light-colorblind', hues: 'github-dark-colorblind' },
    slots: {
      base00: ['structure', 'background'],
      base01: ['structure', 'black'],
      base02: ['structure', 'selection'],
      base03: ['structure', 'brightBlack'],
      base04: ['structure', 'white'],
      base05: ['structure', 'foreground'],
      base06: ['structure', 'brightWhite'],
      base07: ['structure', 'brightWhite'],
      base08: ['hues', 'red'],
      base0A: ['hues', 'yellow'],
      base0B: ['hues', 'green'],
      base0C: ['hues', 'cyan'],
      base0D: ['hues', 'blue'],
      base0E: ['hues', 'purple'],
      base12: ['hues', 'brightRed'],
      base13: ['hues', 'brightYellow'],
      base14: ['hues', 'brightGreen'],
      base15: ['hues', 'brightCyan'],
      base16: ['hues', 'brightBlue'],
      base17: ['hues', 'brightPurple'],
    },
    synthesise: {
      base09: ['hues', 'red', { rotate: 26 }],
      base0F: ['hues', 'yellow', { rotate: -34 }],
      base10: ['structure', 'background', { lighten: 0.03 }],
      base11: ['structure', 'background', { lighten: 0.06 }],
    },
    ansiFromStructure: ['black', 'brightBlack', 'white', 'brightWhite'],
    accentSlot: 'magenta',
    hueTranspose: { floor: CONTRAST_FLOORS.status + 0.4 },
    textFloor: 7,
    provenance: {
      project: 'Adea',
      url: 'https://github.com/adea-ai/themes',
      license: 'Apache-2.0',
      bootstrappedFrom: [
        'GitHub Light Colorblind (iTerm2-Color-Schemes)',
        'GitHub Dark Colorblind (iTerm2-Color-Schemes)',
      ],
    },
  },
  {
    id: 'adea-light-high-contrast',
    name: 'Adea Light High Contrast',
    family: 'adea',
    familyLabel: 'Adea',
    label: 'Light High Contrast',
    description:
      "The high-contrast light variant: GitHub's white high-contrast canvas carrying the dark high-contrast hues, transposed — the paper counterpart of the dark high-contrast variant.",
    appearance: 'light',
    tags: ['light', 'default', 'high-contrast'],
    donors: { structure: 'github-light-high-contrast', hues: 'github-dark-high-contrast' },
    slots: {
      base00: ['structure', 'background'],
      base01: ['structure', 'black'],
      base02: ['structure', 'selection'],
      base03: ['structure', 'brightBlack'],
      base04: ['structure', 'white'],
      base05: ['structure', 'foreground'],
      base06: ['structure', 'brightWhite'],
      base07: ['structure', 'brightWhite'],
      base08: ['hues', 'red'],
      base0A: ['hues', 'yellow'],
      base0B: ['hues', 'green'],
      base0C: ['hues', 'cyan'],
      base0D: ['hues', 'blue'],
      base0E: ['hues', 'purple'],
      base12: ['hues', 'brightRed'],
      base13: ['hues', 'brightYellow'],
      base14: ['hues', 'brightGreen'],
      base15: ['hues', 'brightCyan'],
      base16: ['hues', 'brightBlue'],
      base17: ['hues', 'brightPurple'],
    },
    synthesise: {
      base09: ['hues', 'red', { rotate: 26 }],
      base0F: ['hues', 'yellow', { rotate: -34 }],
      base10: ['structure', 'background', { lighten: 0.03 }],
      base11: ['structure', 'background', { lighten: 0.06 }],
    },
    ansiFromStructure: ['black', 'brightBlack', 'white', 'brightWhite'],
    accentSlot: 'magenta',
    hueTranspose: { floor: CONTRAST_FLOORS.status + 0.4 },
    textFloor: 7,
    provenance: {
      project: 'Adea',
      url: 'https://github.com/adea-ai/themes',
      license: 'Apache-2.0',
      bootstrappedFrom: [
        'GitHub Light High Contrast (iTerm2-Color-Schemes)',
        'GitHub Dark High Contrast (iTerm2-Color-Schemes)',
      ],
    },
  },
])

/**
 * Per-family provenance.
 *
 * `url` is the project's own repository — the place its palette is defined — while
 * the vendored values come through the chain described in this module's header.
 * Recording both is the point: one answers "whose palette is this", the other
 * answers "which bytes are in the file".
 */
export const FAMILY_PROVENANCE: Readonly<Record<string, ThemeProvenance>> = Object.freeze({
  adea: ADEA_PROVENANCE,
  aardvark: {
    project: 'iTerm2-Color-Schemes',
    url: ITERM2,
    license: 'MIT',
    bootstrappedFrom: [ITERM2],
  },
  /*
   * The `github` family has no catalogue entry of its own any more: GitHub Primer's
   * palettes survive as the donors of the composed Adea variants, whose provenance
   * records the bootstrapping — and Primer itself is credited here by name.
   */
  catppuccin: {
    project: 'Catppuccin',
    url: 'https://github.com/catppuccin/catppuccin',
    license: 'MIT',
    bootstrappedFrom: [ITERM2],
  },
  tokyonight: {
    project: 'Tokyo Night',
    url: 'https://github.com/folke/tokyonight.nvim',
    license: 'Apache-2.0',
    bootstrappedFrom: [ITERM2],
  },
  rosepine: {
    project: 'Rosé Pine',
    url: 'https://github.com/rose-pine/rose-pine-theme',
    license: 'MIT',
    bootstrappedFrom: [ITERM2],
  },
  gruvbox: {
    project: 'Gruvbox',
    // Gruvbox grants MIT/X11 in its README and ships no LICENSE file, so
    // repository licence detection finds nothing. The README is the grant.
    url: 'https://github.com/morhetz/gruvbox#license',
    license: 'MIT',
    bootstrappedFrom: [ITERM2],
  },
  nord: {
    project: 'Nord',
    url: 'https://github.com/nordtheme/nord',
    license: 'MIT',
    bootstrappedFrom: [ITERM2],
  },
  dracula: {
    project: 'Dracula',
    url: 'https://github.com/dracula/dracula-theme',
    license: 'MIT',
    bootstrappedFrom: [ITERM2],
  },
  onedark: {
    project: 'One Dark',
    url: 'https://github.com/atom/one-dark-syntax',
    license: 'MIT',
    bootstrappedFrom: [ITERM2],
  },
  solarized: {
    project: 'Solarized',
    url: 'https://github.com/altercation/solarized',
    license: 'MIT',
    bootstrappedFrom: [ITERM2],
  },
  everforest: {
    project: 'Everforest',
    url: 'https://github.com/sainnhe/everforest',
    license: 'MIT',
    bootstrappedFrom: [ITERM2],
  },
  ayu: {
    project: 'Ayu',
    url: 'https://github.com/ayu-theme/ayu-colors',
    license: 'MIT',
    bootstrappedFrom: [ITERM2],
  },
  kanagawa: {
    project: 'Kanagawa',
    url: 'https://github.com/rebelot/kanagawa.nvim',
    license: 'MIT',
    bootstrappedFrom: [ITERM2],
  },
  vesper: {
    project: 'Vesper',
    url: 'https://github.com/raunofreiberg/vesper',
    license: 'MIT',
    bootstrappedFrom: [ITERM2],
  },
  monokai: {
    project: 'Monokai',
    // Monokai's own repository carries no licence. The values are therefore taken
    // from the MIT port, which is the artefact the licence below attaches to;
    // Monokai is credited here as the design's origin.
    url: 'https://monokai.pro',
    license: 'MIT',
    bootstrappedFrom: [ITERM2],
  },
})

/** A theme that is normalized from a vendored Base24 scheme. */
export interface VendoredSource {
  id: string
  /** The scheme's slug in the dataset. */
  slug: string
  family: keyof typeof FAMILY_PROVENANCE
  familyLabel: string
  label: string
  name: string
  description: string
  appearance: ThemeAppearance
  tags: readonly string[]
  /** Declared when the family's identity is not in its blue slot. */
  accentSlot?: 'blue' | 'magenta' | 'cyan' | 'green'
  /**
   * Corrections to the vendored scheme, applied before normalization.
   *
   * One entry uses this, and it is worth reading as the example of when it is
   * legitimate: iTerm2's One Dark port deliberately darkens the canvas to `#21252b`
   * so a terminal reads as a distinct surface, but Atom's own editor palette — the
   * thing "One Dark" means — is `hsl(220, 13%, 18%)` = `#282c34`, with comments at
   * `#5c6370` rather than the port's `#767676`. Adea themes an application, so the
   * project's value is the correct one. Every correction is reported as a finding
   * and appears in the catalogue's build log.
   */
  palette?: Partial<Record<Base24Slot, string>>
}

/** Convenience for the one source that corrects its palette. */
const ONE_DARK_OFFICIAL = Object.freeze({
  base00: '#282c34',
  base03: '#5c6370',
  base04: '#818896',
})

/**
 * The vendored catalogue.
 *
 * Ordered family by family, and within a family light-to-dark or by the order the
 * project itself lists its flavours. The order is the order a picker shows, so it
 * is deliberate rather than alphabetical.
 */
export const VENDORED_SOURCES: readonly VendoredSource[] = Object.freeze([
  /* --- Aardvark: the house canvases, from iTerm2-Color-Schemes ----------- */
  {
    id: 'aardvark-ink',
    slug: 'aardvark-ink',
    family: 'aardvark',
    familyLabel: 'Aardvark',
    label: 'Ink',
    name: 'Aardvark Ink',
    description:
      'Near-black navy with muted blue-grey text — the canvas the original Adea Dark was drawn on.',
    appearance: 'dark',
    tags: ['dark', 'ink', 'muted'],
  },
  {
    id: 'aardvark-blue',
    slug: 'aardvark-blue',
    family: 'aardvark',
    familyLabel: 'Aardvark',
    label: 'Blue',
    name: 'Aardvark Blue',
    description: "Ink's louder sibling: a deep blue ground under bright, cool text.",
    appearance: 'dark',
    tags: ['dark', 'blue', 'vivid'],
  },

  /* --- Catppuccin: four flavours, lightest first ------------------------- */
  {
    id: 'catppuccin-latte',
    slug: 'catppuccin-latte',
    family: 'catppuccin',
    familyLabel: 'Catppuccin',
    label: 'Latte',
    name: 'Catppuccin Latte',
    description: 'The light flavour. Warm and low-contrast, built for long sessions.',
    appearance: 'light',
    tags: ['light', 'warm', 'muted'],
  },
  {
    id: 'catppuccin-frappe',
    slug: 'catppuccin-frappe',
    family: 'catppuccin',
    familyLabel: 'Catppuccin',
    label: 'Frappé',
    name: 'Catppuccin Frappé',
    description: 'The first dark flavour: soft, desaturated, easy on the eyes.',
    appearance: 'dark',
    tags: ['dark', 'muted', 'soft'],
  },
  {
    id: 'catppuccin-macchiato',
    slug: 'catppuccin-macchiato',
    family: 'catppuccin',
    familyLabel: 'Catppuccin',
    label: 'Macchiato',
    name: 'Catppuccin Macchiato',
    description: 'The middle dark flavour, a shade deeper than Frappé.',
    appearance: 'dark',
    tags: ['dark', 'muted'],
  },
  {
    id: 'catppuccin-mocha',
    slug: 'catppuccin-mocha',
    family: 'catppuccin',
    familyLabel: 'Catppuccin',
    label: 'Mocha',
    name: 'Catppuccin Mocha',
    description: 'The deepest flavour, and the most used of the four.',
    appearance: 'dark',
    tags: ['dark', 'muted', 'popular'],
  },

  /* --- Tokyo Night ------------------------------------------------------- */
  {
    id: 'tokyonight-day',
    slug: 'tokyonight-day',
    family: 'tokyonight',
    familyLabel: 'Tokyo Night',
    label: 'Day',
    name: 'Tokyo Night Day',
    description: 'The daylight variant: cool paper rather than warm.',
    appearance: 'light',
    tags: ['light', 'cool'],
  },
  {
    id: 'tokyonight-storm',
    slug: 'tokyonight-storm',
    family: 'tokyonight',
    familyLabel: 'Tokyo Night',
    label: 'Storm',
    name: 'Tokyo Night Storm',
    description: 'A lifted dark canvas, a touch brighter than Night.',
    appearance: 'dark',
    tags: ['dark', 'cool'],
  },
  {
    id: 'tokyonight-night',
    slug: 'tokyonight-night',
    family: 'tokyonight',
    familyLabel: 'Tokyo Night',
    label: 'Night',
    name: 'Tokyo Night',
    description: 'The original: deep blue-black with neon-adjacent hues.',
    appearance: 'dark',
    tags: ['dark', 'cool', 'popular'],
  },

  /* --- Rosé Pine: the family's accent is iris, not blue ------------------ */
  {
    id: 'rosepine-dawn',
    slug: 'rose-pine-dawn',
    family: 'rosepine',
    familyLabel: 'Rosé Pine',
    label: 'Dawn',
    name: 'Rosé Pine Dawn',
    description: 'The light variant: a warm paper ground with muted rose ink.',
    appearance: 'light',
    tags: ['light', 'warm'],
    accentSlot: 'magenta',
  },
  {
    id: 'rosepine-moon',
    slug: 'rose-pine-moon',
    family: 'rosepine',
    familyLabel: 'Rosé Pine',
    label: 'Moon',
    name: 'Rosé Pine Moon',
    description: 'The lifted dark variant, greyer than Main.',
    appearance: 'dark',
    tags: ['dark', 'muted'],
    accentSlot: 'magenta',
  },
  {
    id: 'rosepine',
    slug: 'rose-pine',
    family: 'rosepine',
    familyLabel: 'Rosé Pine',
    label: 'Main',
    name: 'Rosé Pine',
    description: 'The original: deep plum ground, iris and foam accents.',
    appearance: 'dark',
    tags: ['dark', 'muted', 'popular'],
    accentSlot: 'magenta',
  },

  /* --- Gruvbox ----------------------------------------------------------- */
  {
    id: 'gruvbox-light',
    slug: 'gruvbox-light',
    family: 'gruvbox',
    familyLabel: 'Gruvbox',
    label: 'Light',
    name: 'Gruvbox Light',
    description: 'Retro warm cream and burnt orange.',
    appearance: 'light',
    tags: ['light', 'warm', 'retro'],
  },
  {
    id: 'gruvbox-dark',
    slug: 'gruvbox-dark',
    family: 'gruvbox',
    familyLabel: 'Gruvbox',
    label: 'Dark',
    name: 'Gruvbox Dark',
    description: 'The classic: warm brown-black with high-chroma retro accents.',
    appearance: 'dark',
    tags: ['dark', 'warm', 'retro', 'popular'],
  },

  /* --- Single-variant families ------------------------------------------ */
  {
    id: 'nord',
    slug: 'nord',
    family: 'nord',
    familyLabel: 'Nord',
    label: 'Nord',
    name: 'Nord',
    description: 'Arctic blue-grey, all cool and all low-contrast by design.',
    appearance: 'dark',
    tags: ['dark', 'cool', 'muted', 'popular'],
  },
  {
    id: 'nord-light',
    slug: 'nord-light',
    family: 'nord',
    familyLabel: 'Nord',
    label: 'Light',
    name: 'Nord Light',
    description: "Nord's snow variant: the same cool palette for a light canvas.",
    appearance: 'light',
    tags: ['light', 'cool', 'muted'],
  },
  {
    id: 'dracula',
    slug: 'dracula',
    family: 'dracula',
    familyLabel: 'Dracula',
    label: 'Dracula',
    name: 'Dracula',
    description: 'Deep grey-purple with a violet accent and vivid hues.',
    appearance: 'dark',
    tags: ['dark', 'purple', 'vivid', 'popular'],
  },
  {
    id: 'one-dark',
    slug: 'atom-one-dark',
    family: 'onedark',
    familyLabel: 'One Dark',
    label: 'One Dark',
    name: 'One Dark',
    description: "Atom's editor palette: cool grey ground, one blue accent.",
    appearance: 'dark',
    tags: ['dark', 'cool', 'editor'],
    palette: ONE_DARK_OFFICIAL,
  },
  {
    id: 'kanagawa',
    slug: 'kanagawa-wave',
    family: 'kanagawa',
    familyLabel: 'Kanagawa',
    label: 'Wave',
    name: 'Kanagawa',
    description: 'Sumi ink and indigo, after the Great Wave.',
    appearance: 'dark',
    tags: ['dark', 'ink', 'muted', 'popular'],
  },
  {
    id: 'vesper',
    slug: 'vesper',
    family: 'vesper',
    familyLabel: 'Vesper',
    label: 'Vesper',
    name: 'Vesper',
    description: 'Near-black with a single warm amber accent. Very high contrast.',
    appearance: 'dark',
    tags: ['dark', 'high-contrast', 'minimal'],
  },
  {
    id: 'monokai',
    slug: 'monokai-classic',
    family: 'monokai',
    familyLabel: 'Monokai',
    label: 'Classic',
    name: 'Monokai',
    description: 'The original 2006 palette: olive ground, pink and acid green.',
    appearance: 'dark',
    tags: ['dark', 'vivid', 'retro', 'popular'],
    // Monokai's blue slot is orange in the terminal port, which would read as a
    // warning colour. The family's own accent is its magenta.
    accentSlot: 'magenta',
  },

  /*
   * The GitHub interface palettes are not vendored as themes: Adea's six managed
   * variants are compositions *of* them (see the composed sources above), so a
   * standalone GitHub entry would be the default wearing another name. The donor
   * palettes stay in the dataset and the composed outputs in `palettes/`.
   */

  /* --- Solarized: one palette, two appearances --------------------------- */
  {
    id: 'solarized-light',
    slug: 'iterm2-solarized-light',
    family: 'solarized',
    familyLabel: 'Solarized',
    label: 'Light',
    name: 'Solarized Light',
    description: "Ethan Schoonover's paper variant, on the same eight accents.",
    appearance: 'light',
    tags: ['light', 'warm', 'precision'],
  },
  {
    id: 'solarized-dark',
    slug: 'iterm2-solarized-dark',
    family: 'solarized',
    familyLabel: 'Solarized',
    label: 'Dark',
    name: 'Solarized Dark',
    description: 'The base16 teal ground, with deliberately equalised contrast.',
    appearance: 'dark',
    tags: ['dark', 'precision', 'popular'],
  },

  /* --- Everforest: the accent is its green ----------------------------- */
  {
    id: 'everforest-light',
    slug: 'everforest-light-med',
    family: 'everforest',
    familyLabel: 'Everforest',
    label: 'Light',
    name: 'Everforest Light',
    description: 'A soft light green-grey, medium contrast.',
    appearance: 'light',
    tags: ['light', 'green', 'soft'],
    accentSlot: 'green',
  },
  {
    id: 'everforest-dark',
    slug: 'everforest-dark-med',
    family: 'everforest',
    familyLabel: 'Everforest',
    label: 'Dark',
    name: 'Everforest Dark',
    description: "Forest green ground with the family's signature green accent.",
    appearance: 'dark',
    tags: ['dark', 'green', 'soft', 'popular'],
    accentSlot: 'green',
  },

  /* --- Ayu: three variants --------------------------------------------- */
  {
    id: 'ayu-light',
    slug: 'ayu-light',
    family: 'ayu',
    familyLabel: 'Ayu',
    label: 'Light',
    name: 'Ayu Light',
    description: 'Clean white paper with an orange accent.',
    appearance: 'light',
    tags: ['light', 'warm'],
  },
  {
    id: 'ayu-mirage',
    slug: 'ayu-mirage',
    family: 'ayu',
    familyLabel: 'Ayu',
    label: 'Mirage',
    name: 'Ayu Mirage',
    description: 'The mid-dark variant: blue-grey rather than black.',
    appearance: 'dark',
    tags: ['dark', 'cool'],
  },
  {
    id: 'ayu',
    slug: 'ayu',
    family: 'ayu',
    familyLabel: 'Ayu',
    label: 'Dark',
    name: 'Ayu Dark',
    description: 'The original: near-black with orange and blue.',
    appearance: 'dark',
    tags: ['dark', 'popular'],
  },
])

/**
 * Adea-authored themes whose exact semantic values have no external palette to vendor.
 *
 * The default pair is composed above because its donors can be named and refreshed.
 * Slate and High Contrast are retained from the product's own appearance registry:
 * these hand-maintained semantic roles are the source, not a transcription of a
 * third-party palette. Their optional shadcn projection keeps distinctions (including
 * source-authored alpha) that the canonical opaque roles cannot represent.
 */
export interface AuthoredSource {
  id: string
  family: string
  familyLabel: string
  label: string
  name: string
  description: string
  /** Palette ownership plus any per-appearance lineage for retained ANSI roles. */
  provenance?: ThemeProvenance
  appearance: ThemeAppearance
  tags: readonly string[]
  /**
   * The greyscale ramp the theme is built from, darkest first.
   *
   * Authored as hex rather than OKLCH because that is how the design system's
   * values were originally specified and reviewed; the normalizer converts, and the
   * committed catalogue is OKLCH.
   */
  ramp: {
    background: string
    foreground: string
    surface: string
    surfaceElevated: string
    surfaceHover: string
    surfaceActive: string
    border: string
    borderMuted: string
    textMuted: string
    textSubtle: string
  }
  accent: string
  accentForeground: string
  /** Exact shadcn values for authored distinctions outside the canonical schema. */
  shadcn?: ShadcnThemeProjection
  status: {
    success: string
    warning: string
    error: string
    info: string
  }
  /**
   * The terminal palette.
   *
   * Adea ships a terminal, so its own theme has to answer the sixteen ANSI
   * questions the same way an imported theme does. These are the values the product
   * already runs: the light set is GitHub's light scheme and the dark set GitHub's
   * dark, which is what the embedded terminal was drawn against.
   */
  ansi: {
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
  cursor: string
  selection: string
}

export const AUTHORED_SOURCES: readonly AuthoredSource[] = Object.freeze([
  // Empty today. A theme lands here when Adea owns a palette that has no upstream
  // scheme to vendor; the Slate and High Contrast themes that filled this list were
  // dropped in favour of GitHub's own High Contrast pair, which serve the same
  // accessibility rung without first-party maintenance.
])
