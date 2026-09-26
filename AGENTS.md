# Agent instructions

This is the repository-level operating contract for coding agents working in
`adea-ai/themes`. It complements [CONTRIBUTING.md](CONTRIBUTING.md) and the root
organisation contract.

## Mission

Be the **only** place in the Adea organisation where a colour is decided. Adea,
Cortana and the design system consume this package; none of them keeps a palette.

That mission has one consequence that governs every change here, and it is the thing
to internalise before touching anything:

> **Adea owns the schema and the transformation. It does not own the colours.**

The palettes belong to the projects that maintain them — Catppuccin, Nord, Gruvbox
and the rest — and they are reproduced rather than authored. This repository's value
is the _normalizer_: the one place a terminal palette becomes an application theme,
measured against contrast floors, for every consumer at once.

So when a theme looks wrong, the fix is almost never a literal in a source file. It
is a change to how the palette is interpreted, and it lands in `normalize.ts` where
thirty themes benefit.

## Read before acting

1. This file and `CONTRIBUTING.md`.
2. `src/schema.ts` — the contract. Nothing may add a role that is not declared here.
3. `src/normalize.ts` — the transformation, and the header comment that explains why
   each step is not the obvious one. Most "why is this colour like that" questions
   are answered there.
4. `src/validate.ts` and `CONTRAST_FLOORS` — what the catalogue guarantees.
5. The theme you are about to touch, in the six places it appears: `palettes/`,
   `src/sources.ts`, `src/generated/themes.ts`, the fidelity assertions in
   `tests/provenance.test.ts`, the palette galleries, and `NOTICE` if its family's
   licence or provenance is not yet recorded.

## The invariants

Each is enforced by a test, a lint rule or the build. Breaking one is a failing
check rather than a review comment.

| Invariant                                                               | Enforced by                |
| ----------------------------------------------------------------------- | -------------------------- |
| Every theme clears every contrast floor                                 | `tests/catalogue.test.ts`  |
| `src/generated` matches `palettes/` and `src/sources.ts`                | `catalogue:check`          |
| Every theme's background and foreground match its upstream project      | `tests/provenance.test.ts` |
| A contrast repair moves lightness, never hue                            | `tests/provenance.test.ts` |
| Every theme records a project, a URL and an SPDX licence                | `tests/provenance.test.ts` |
| Only permissively licensed families are present                         | `tests/provenance.test.ts` |
| Every value that leaves an adapter is valid for that adapter            | `tests/adapters.test.ts`   |
| No theme is added without a fidelity assertion                          | `tests/provenance.test.ts` |
| Every published symbol is a `oklch()` string or an adapter's own format | `tests/adapters.test.ts`   |
| The package has no runtime dependencies                                 | `package.json`, and review |

## Working rules

**Never hand-edit `src/generated`.** Run `bun run catalogue:build`. The generated
files are committed on purpose — so that a palette change is a reviewable diff — and
`catalogue:check` fails when they disagree with their inputs.

**Never hand-edit `palettes/`.** Run `bun run vendor`. The files are reproduced from a
pinned revision so that every value can be traced; an edit there destroys the audit
trail. If a vendored value is _wrong_ — a port that has drifted from the project's own
palette — the correction is a `palette` block in `src/sources.ts`, which is reported
as a finding on every build. One Dark is the worked example.

**Repair by lightness, then by blending, and always report it.** A contrast repair
moves one axis. If a colour cannot be repaired within budget, the build fails and a
human decides — either the palette cannot express that role, or the floor is wrong.
Do not widen a floor to make a theme pass. `CONTRAST_FLOORS` carries the reasoning
for each value it holds, including the two that are deliberately two-tier.

**Never invent a colour.** Every value in the catalogue is a value from the palette it
is attributed to, viewed at a different brightness. A blend is reported on the entry
and named in the build log.

**A test that asserts nothing is worse than no test.** The provenance suite asserts
upstream values rather than internal consistency, because "this is really Catppuccin
Mocha" is the claim the catalogue makes and the only one worth checking.

**Comment the decision, not the code.** In this repository that means saying why a
step is _not_ the obvious thing: why the surface ladder's direction is measured
rather than declared, why `base01` is a ramp candidate on dark themes only, why
Everforest Light's status colours are deepened. A comment that restates the next line
will be asked for in review.

## Commands

```sh
bun install
bun run verify            # typecheck, lint, catalogue freshness, tests, build
bun run catalogue:build   # regenerate the committed catalogue
bun run catalogue:check   # fail if it is stale
bun run vendor            # refresh palettes/ from the pinned revision
bun run test              # the suite
bun run build             # dist/ plus declarations
```

`bun run verify` is the gate. CI runs the same commands through Code Foundry.

## What not to do

- Do not add a runtime dependency. The package is pure data and pure functions, and
  its consumers include a desktop shell. A YAML parser, a colour library and a JSON
  reader have all been considered and rejected; the hand-written base24 reader in
  `src/adapters/base24.ts` is what that looks like.
- Do not add a role to `AdeaTheme` without changing `schema.ts`, the mapping table in
  `adapters/shadcn.ts`, the CSS and Tailwind adapters, and both test suites. The
  compiler will find most of them and the tests will find the rest.
- Do not add a theme to the catalogue by copying values out of a screenshot, a blog
  post or another theme package. Either vendor it from a pinned upstream revision or
  author it as Adea's own.
- Do not commit generated output other than `src/generated`. `dist/` is built by the
  release workflow.
- Do not commit secrets, credentials or machine-specific paths.

## Pull requests

Branch from `main` with `feat/*`, `fix/*`, `chore/*`, `docs/*`, `refactor/*` or
`test/*`. Use Conventional Commit subjects — Release Please derives versions from
them, and this repository publishes to npm, so a `feat` is a minor release and a
`fix` is a patch. Open the pull request as a **draft** and mark it ready only once
`bun run verify` is clean.

A change to what a role _means_ lands in the same commit as the schema, the
normalizer, the adapters, the affected themes, and the tests.

<!-- code-foundry-managed: pull-request-policy -->

## Code Foundry workflow policy (mandatory)

This repository uses the `direct` workflow. Topic pull requests target `main`.

- Open every ordinary pull request as a draft. Use `gh pr create --draft` or
  set `draft: true` in the GitHub API; never create a ready ordinary pull
  request as a shortcut.
- Keep ordinary pull requests in draft while preparing them. The generated
  Draft Guard converts ready ordinary pull requests to draft when they are
  opened or reopened, and runner-heavy validation starts only after an
  explicit `ready_for_review` transition unless `draft_protection: false` is
  configured for generated callers. That opt-out does not disable Draft Guard
  or draft-PR automation. Cloudflare reusable callers use
  `draft-protection: false`.
- Run local validation and finish review preparation before marking an ordinary
  pull request ready. Ready pull requests stay ready when new commits arrive,
  and validation reruns for the current head; draft updates allocate no
  validation runner until the pull request is ready.
- This contract is mandatory for every agent scope. Nested `AGENTS.md` files
  may add stricter rules but must not weaken or replace it.
- Release Please version pull requests are managed by the Code Foundry release
  workflow; do not manually change their draft state unless the workflow asks.

<!-- /code-foundry-managed: pull-request-policy -->
