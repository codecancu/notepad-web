# Contributing

Thanks for helping! By contributing you agree to license your work under GPL-3.0-or-later.

## DCO

All commits must be signed off (Developer Certificate of Origin):

```bash
git commit -s -m "feat: ..."
```

The sign-off certifies that you wrote the contribution or have the right to submit it
under the project license. See <https://developercertificate.org/> for the full text.

## Workflow

1. Fork + branch from `main`.
2. `npm install`, then keep `npm test`, `npm run lint`, `npm run typecheck` green.
3. Add/extend tests for any behavior change (TDD preferred).
4. Open a PR using the template; CI must pass.

## Code style

TypeScript strict, ESLint + Prettier. Every source file begins with
`// SPDX-License-Identifier: GPL-3.0-or-later`. Access `chrome.*` only via
`src/services/chrome-adapter.ts`.
