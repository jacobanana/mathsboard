# Contributing to Maths Board

Thanks for your interest in improving Maths Board! Contributions of all kinds
are welcome — bug reports, fixes, new maths tools, and docs.

By contributing, you agree that your contributions are licensed under the
project's [AGPL-3.0](LICENSE) license. Please also read our
[Code of Conduct](CODE_OF_CONDUCT.md).

## Getting set up

The [Development & self-hosting guide](DEVELOPMENT.md) covers local setup,
architecture, and how the pieces fit together. In short:

```bash
npm install
npm run dev        # Vite dev server
npm test           # unit tests (Vitest, headless)
npm run typecheck  # tsc -b
```

The app runs fully solo with no backend, so you can develop most things without
Docker. Collaboration and image upload need the local stack — see
[DEVELOPMENT.md → Test the whole stack locally](DEVELOPMENT.md#test-the-whole-stack-locally).

## Before you open a pull request

- **Tests pass.** `npm test` and `npm run typecheck` are the fast gate CI runs
  first. Add or update tests for behaviour you change — the suite drives the
  same store / interaction / shortcut seams the real UI does and asserts on
  observable outcomes.
- **Keep changes focused** and match the surrounding code's style and patterns.
- **Respect the single-source-of-truth conventions** — design tokens live in
  `src/styles/theme.ts`, the shortcut catalog drives its own handlers/help, etc.
  Don't hardcode what a constant already owns.
- For anything with a runtime surface, check it in the running app, not just in
  tests.

## Adding a new maths tool

New tools are self-contained and cheap to add — one folder, one registration
line. The full recipe is in
[DEVELOPMENT.md → Adding a new tool](DEVELOPMENT.md#adding-a-new-tool); copy
`src/tools/numberline` (canvas + dialog) as a template. Every tool automatically
gets baseline checks from the registry sweep in `src/tools/registry.test.ts`.

## Scope

Maths Board has a deliberate scope: a maths teaching surface for the
"demonstrate a method to a learner" loop, not a general whiteboard. For anything
larger than a fix, skim the [feature roadmap](docs/feature-roadmap.md) and open
an issue to discuss before building.

## Reporting bugs & security issues

- **Bugs / feature ideas:** open a
  [GitHub issue](https://github.com/jacobanana/mathsboard/issues).
- **Security vulnerabilities:** please don't use public issues — follow
  [SECURITY.md](SECURITY.md).
