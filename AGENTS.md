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

<!-- code-foundry-managed: config-aware-policy -->

These instructions are the repository-level operating contract for coding agents, including Hermes, OpenCode, and other automation.

They complement `CONTRIBUTING.md`. More specific instructions in nested `AGENTS.md` files and project documentation take precedence for their directory.

<!-- /code-foundry-managed: config-aware-policy -->

<!-- code-foundry-managed: mission -->

## Mission

- Keep formatting, linting, type checking, builds, tests, and coverage reproducible locally and in CI.
- Prefer the repository's configured toolchain; `toolchain: auto` uses native
  tools unless an existing `.mise.toml` is present.
- Do not commit secrets, generated credentials, local environment files, or machine-specific paths.
- Add tests for behavior changes and keep coverage thresholds explicit in the project configuration.
- Make the smallest complete, well-tested change that solves the requested problem without disturbing unrelated work.

This repository may contain TypeScript, Rust, Python, or any combination of them. Detect the active stack from the files present; do not assume every check applies.

<!-- /code-foundry-managed: mission -->

<!-- code-foundry-managed: contributing-back -->

## Contributing back

Consumers are encouraged to help improve this open-source project. Open a small,
focused pull request for bug fixes, performance improvements, documentation, or
other narrowly scoped changes. For larger feature requests or architectural
changes, create an issue first so the proposal can be discussed and scoped.
Contributions should help make the tool as performant, reliable, and helpful as
possible for everyone.

<!-- /code-foundry-managed: contributing-back -->

<!-- code-foundry-managed: read-before-acting -->

## Read before acting

Before editing:

1. Read this file and `.github/CONTRIBUTING.md`.
2. Find and read any nested `AGENTS.md` that covers the files you will touch.
3. Read the nearest README, package manifest, build configuration, and relevant tests.
4. Inspect the current branch, worktree, remotes, and recent history:

   ```sh
   git status --short --branch
   git remote -v
   git log -5 --oneline
   ```

5. Identify the repository's package manager, lockfile, runtime versions, test commands, deployment assumptions, and generated files.

If the worktree is dirty, preserve existing changes and avoid overlapping edits until their ownership is clear.

<!-- /code-foundry-managed: read-before-acting -->

<!-- code-foundry-managed: priorities -->

## Priorities

When instructions conflict, use this order:

1. System and user instructions
2. This repository's instructions and explicit task scope
3. Nested directory instructions
4. Existing project conventions
5. General best practices

Ask for clarification when a missing decision would materially change the implementation. Otherwise make the smallest reasonable assumption and document it.

<!-- /code-foundry-managed: priorities -->

<!-- code-foundry-managed: safety-boundaries -->

## Safety boundaries

- Do not discard, reset, overwrite, or rewrite user-owned changes.
- Do not expose or commit secrets, credentials, tokens, private keys, local environment files, or personal machine paths.
- Do not modify production resources, repository settings, branch protections, secrets, deployments, or external systems unless explicitly requested.
- Do not add organization- or product-specific details to this reusable baseline.
- Do not change dependency managers or lockfiles unnecessarily.
- Do not bypass hooks, tests, review requirements, or required checks to hide a failure.
- Do not claim completion while required validation, review, deployment, or user decisions remain pending.
- Publishing, committing, or opening a pull request requires explicit task scope or user authorization.

<!-- /code-foundry-managed: safety-boundaries -->

<!-- code-foundry-managed: standard-workflow -->

## Standard workflow

1. Restate the desired outcome and identify the files or systems in scope.
2. Inspect before editing; preserve unrelated work.
3. Plan the smallest coherent change.
4. Implement with existing project patterns.
5. Run `npx code-foundry init` for a new checkout, or `npx code-foundry doctor` to diagnose setup drift.
6. Run focused checks while iterating.
7. Inspect the final diff for accidental changes, secrets, formatting, and generated files.
8. Run the broadest applicable validation available.
9. Report what changed, exact checks and results, skipped checks with reasons, risks, and remaining work.

For normal feature work, branch from `main` and target pull requests at `main`. Treat `main` as the protected release branch. Follow `.github/CONTRIBUTING.md` for the complete internal and external contribution flow.

<!-- /code-foundry-managed: standard-workflow -->

<!-- code-foundry-managed: git-workflow-and-merging -->

## Git workflow and merging

This repository uses the `direct` workflow: topic branches **squash** directly into `main`, and the Release Please version PR **squashes** into `main` (`release_merge_strategy: squash`). Feature and release PRs land on `main` with squash merges. No integration branch exists; all pull requests target `main`.

Merge only with the repository's canonical method. Never merge with `--admin`, never default or auto-select a merge method, and never use a method the branch ruleset does not allow. When in doubt, prefer the merge button's configured method and verify the ruleset after merging. Check `.github/CONTRIBUTING.md` for the complete flow and merge table.

### Branch and commit policy

Branch rulesets enforce deletions, force-pushes, required status checks, pull
requests, conversation resolution, and linear history where the repository's
plan supports them. Mirror those rules even where the plan cannot enforce
them:

- Branch from the default branch using
  `feat/*`, `fix/*`, `chore/*`, `refactor/*`, `docs/*`, or `test/*` names.
- Never push directly to protected branches; open a pull request.
- Use Conventional Commit subjects (`feat:`, `fix:`, `chore:`, …); Release
  Please depends on them to version releases.
- Keep pull requests focused; merge with the canonical method only after
  required checks pass.

<!-- /code-foundry-managed: git-workflow-and-merging -->

<!-- code-foundry-managed: toolchain-and-dependencies -->

## Toolchain and dependencies

- Follow `toolchain: auto` in `.github/code-foundry.yml`; use native tools by
  default and reuse mise only when the repository already has `.mise.toml`.
- If `toolchain: mise` is selected, run `mise install` before validation.
- Use the package manager indicated by the existing lockfile:
  - `bun.lock` or `bun.lockb` → Bun
  - `pnpm-lock.yaml` → pnpm
  - `yarn.lock` → Yarn
  - `package-lock.json` → npm
- Use the existing Python environment and dependency manifest. Prefer a project-managed virtual environment.
- Use Cargo commands and the committed Cargo lockfile for Rust projects.
- Do not mix package managers or regenerate lockfiles as a side effect.
- Keep dependency additions narrowly scoped and explain security, licensing, and runtime impact.

<!-- /code-foundry-managed: toolchain-and-dependencies -->

<!-- code-foundry-managed: validation -->

## Validation

Use the shared scripts when present. They detect supported tools and skip inapplicable checks:

```sh
node src/runtime.mjs ci format
node src/runtime.mjs ci lint
node src/runtime.mjs ci type_check
node src/runtime.mjs ci build
node src/runtime.mjs ci unit
node src/runtime.mjs ci integration
node src/runtime.mjs ci e2e
node src/runtime.mjs ci smoke
node src/runtime.mjs ci eval
node src/runtime.mjs ci performance
Security and dependency audits run through the GitHub Security workflow.
```

Run focused tests first, then the complete applicable set for release, security, workflow, dependency, and configuration changes.

At minimum:

- TypeScript/JavaScript: Oxfmt formatting, Oxlint linting, type-check, build, and Bun's native test runner for unit/integration tests; use the project's native browser runner for E2E tests. Repositories using a different linter or formatter keep full control through their own `lint`/`format` scripts, which the runtime honors.
- Do not add Vitest. Preserve specialized native runners such as Matchstick for The Graph and Hardhat for smart contracts.
- Rust: default rustfmt, Clippy with warnings treated as errors, check, unit/integration tests, and dependency audit
- Python: Ruff formatting and linting, compile or type checks, pytest, coverage, and dependency audit
- Mixed projects: validate each active ecosystem and its integration boundaries

If a check cannot run, state the exact reason. A skipped check is not a passing check.

<!-- /code-foundry-managed: validation -->

<!-- code-foundry-managed: tests-and-coverage -->

## Tests and coverage

- Add or update tests for behavior changes and regressions.
- Keep unit, performance, integration, E2E, and smoke coverage in the suite where each applies.
- Preserve project-specific coverage thresholds; do not lower them to make CI green.
- Keep test data deterministic and remove secrets from logs and fixtures.
- Use the narrowest test command while iterating, then run the affected package or workspace suite.

<!-- /code-foundry-managed: tests-and-coverage -->

<!-- code-foundry-managed: github-workflows-and-configuration -->

## GitHub workflows and configuration

- Keep workflows concise, independently runnable, and safe to re-run.
- Use `push` for `main` and `pull_request` for `main` unless a workflow has a documented event-specific reason.
- Give workflows clear names and jobs concise names; avoid repeating the workflow name in the job name.
- Use per-workflow concurrency groups that cancel superseded runs while allowing independent workflows to run in parallel.
- Keep setup language-aware and cache dependency downloads by lockfile; do not cache secrets, `node_modules`, virtual environments, or broad build output without a measured reason.
- Use least-privilege permissions and pin action versions consistently with the template.
- Keep CI, Test, Security, CodeQL, Draft Guard, Draft PR, Release PR, and Release concerns separated.
- Security and CodeQL may skip when repository visibility or GitHub plan support does not permit them. Do not make an unavailable check required.
- Optional Turborepo Remote Caching uses `TURBO_TOKEN` and `TURBO_TEAM`; do not add Vercel deployment behavior just to enable caching.
- Update branch protection when adding or renaming required job checks; verify the actual GitHub status context.

<!-- /code-foundry-managed: github-workflows-and-configuration -->

<!-- code-foundry-managed: documentation-and-generated-files -->

## Documentation and generated files

- Update documentation when behavior, setup, configuration, commands, or operational procedures change.
- Keep `.env.example` limited to variable names and safe placeholders.
- Do not commit build output, caches, coverage output, dependency directories, generated credentials, or temporary files.
- Preserve formatting and line-ending conventions from `.editorconfig` and `.gitattributes`.

<!-- /code-foundry-managed: documentation-and-generated-files -->

<!-- code-foundry-managed: completion-report -->

## Completion report

End every agent task with:

```text
Summary:
Files changed:
Validation:
Skipped checks:
Risks or follow-up:
Branch/PR:
```

Use exact command names and outcomes. Mention external changes separately from local changes, and distinguish completed work from recommendations.

<!-- /code-foundry-managed: completion-report -->
