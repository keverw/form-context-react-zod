# v2.0 Plan

Working checklist for the 2.0 release (Zod 4 + code splitting + tooling cleanup).
Brain-dump from 2026-06-13, organized into tracks. Check items off as we go.

**Reference template: [Unirend](https://github.com/keverw/unirend)** — mirror its tooling,
scripts (`sync-version`/`update-docs`/`check-deps`/`prepublishOnly`), config, and multi-entry
exports throughout.

## Decisions made
- **Zod: 4-only.** v4 has been out ~a year; fair to require it for a major bump.
- **React: 19-only.** Published peer `react: ^19` (going 2.0 anyway). Drop React 18.
- **Deps: match Unirend's pinned versions** (its "known-good latest"), NOT bleeding edge.
  This keeps **TypeScript `^5.9.3`** and **ESLint `^9.39.4`** — i.e. we deliberately
  skip TypeScript 6 / ESLint 10 and their breaking changes. (See version table in Track 1.)
- **Test runner: switch vitest → `bun test`** (mirror Unirend). Migrate the 3 test files + setup.
- **ESLint: lighter than Unirend's strict config**, but DO include the **jsx-a11y + React /
  react-hooks** rules (most relevant for a form lib). Skip unicorn/check-file/strict naming.
- **Code splitting like Unirend.** Multi-entry conditional exports. Core stays DOM-free;
  debug tooling and platform-specific bits are separate entries.
- **Root `package.json` = single source of truth** for version + metadata + peerDependencies.
  `build-lib` reads the root version & peers (no more hard-coded `1.2.0`). `check-deps`
  validates peers match devDependencies; `sync-version`/`update-docs` ported from Unirend.
- **Sequencing: tooling first**, then Zod 4, then code splitting / RN.
- **Bun is the tool.** Drop npm lockfile, keep `bun.lock`.

---

## 1. Tooling & packaging cleanup  *(doing first)*

- [x] Delete tracked `package-lock.json` and gitignore npm/yarn/pnpm lockfiles
      (mirrors Unirend; keep `bun.lock`).
- [x] `bun audit` + `bun outdated` reviewed. **All audit vulns are dev/transitive only**
      (eslint→ajv, testing-library→lodash, tsup/tailwind/vite/vitest→minimatch/brace-expansion,
      vite). None affect the shipped lib (zero runtime deps, zod peer only).
- [ ] **Bump deps to Unirend-pinned versions** (table below). Then bump the repo-specific
      ones Unirend doesn't have (tailwind, postcss, autoprefixer, lucide) to current latest.

      | Package | Now | Target (Unirend-pinned) |
      |---|---|---|
      | react / react-dom | 18.3.1 | `^19.2.7` |
      | @types/react / -dom | 18.x | `^19.2.x` |
      | @vitejs/plugin-react | 4.4 | `^6.0.2` |
      | vite | 5.4 | `^8.0.16` |
      | typescript | 5.8 | `^5.9.3` (NOT 6) |
      | eslint / @eslint/js | 9.12 | `^9.39.4` (NOT 10) |
      | typescript-eslint | 8.8 | `^8.61.0` |
      | tsup / prettier | 8.4 / 3.5 | `^8.5.1` / `^3.8.4` |
      | eslint-plugin-react-hooks | 5.1-rc | `^7.1.1` |
      | eslint-plugin-react-refresh | 0.4 | `^0.5.2` |

- [ ] Add ESLint plugins for the lighter-but-a11y config: `eslint-plugin-jsx-a11y` `^6.10.2`,
      `eslint-plugin-react` `^7.37.5` (keep react-hooks). Skip unicorn/check-file/naming.
- [ ] **Switch test runner to `bun test`**: remove vitest/@vitest/coverage-v8/jsdom; migrate
      `*.test.ts(x)` + `vitest.setup.ts`; pick a DOM (happy-dom or bun's) for component tests.
- [ ] Set published **React peer to `^19`**; bump `react`/`react-dom`/`@types/*` to 19.
- [ ] **Single source of truth for version + metadata.** Make the *root* `package.json` the
      real manifest (name, version, author, bugs, homepage, repository). `build-lib` reads the
      root version **and peerDependencies** instead of the hard-coded `1.2.0` / inline peers.
      Today root is still `vite-react-typescript-starter` / `0.0.0` / `private`.
- [ ] Port Unirend's scripts:
      - `sync-version` — root `package.json` version → generated `src/version.ts` (`PKG_VERSION`).
      - `update-docs` — `update-readme-version.ts` + markdown-toc-gen (kills README drift).
      - `check-deps` — validate published `peerDependencies` match what we dev/test against.
- [ ] **README drift.** Today the dev `README.md` and the build-lib.js-generated README are
      separate and diverge. Consolidate: one source, generated/synced — not two hand-maintained copies.
- [ ] Add `prepublishOnly` modeled on Unirend (audit + build + type-check + lint + test;
      **skip spellcheck** per Kevin).
- [ ] Rename `build-lib.js` → `build-lib.ts`, run via bun (we're on bun for tooling now).
- [ ] Published manifest (build-lib.js `PACKAGE_CONFIG`): add `author`, `bugs`, `homepage`
      (currently `author: ''`, no bugs/homepage).

## 2. Zod 4 upgrade (the headline / major-version reason)

[changelog](https://zod.dev/v4/changelog) · [library authors guide](https://zod.dev/library-authors)

- [ ] Bump `zod` to `^4`; set published **peer dependency** to `zod: ^4` (4-only).
- [ ] Fix `error.errors` → `error.issues` in [zod-helpers.ts:23](src/lib/zod-helpers.ts#L23)
      (`.errors` removed/deprecated in v4).
- [ ] Re-check `ZodError` / `SafeParseError` imports in [zod-helpers.ts:1](src/lib/zod-helpers.ts#L1)
      against v4 type names (`SafeParseError` shape changed).
- [ ] Verify `z.ZodType<T>` still types correctly under v4.
- [ ] Update demo examples using deprecated `z.string().email()` → `z.email()`.
- [ ] **README note**: v2 requires Zod 4; one-line migration note for Zod 3 users.

## 3. Code splitting (Unirend-style multi-entry exports)

Unirend uses conditional exports with separate entries, each emitting types/import/require.
Apply the same so the core is DOM-free and RN-friendly; debug tooling is opt-in.

- [ ] Define entry points:
      - `.` — core (`FormProvider`, hooks, zod-helpers) — **no DOM imports**.
      - `./devtools` — web `FormState` debug component (DOM).
      - `./devtools/native` — React Native debug component equivalent (see track 5).
- [ ] Update tsup config for multiple entries; update generated `package.json` `exports`/`files`.
- [ ] Move `FormState` out of the root `index.ts` barrel into the `devtools` entry.

## 4. Code review / scan

Done before Cursor had review tooling — re-run now.

- [ ] Run `/code-review high` on the working tree once changes are staged.
- [ ] Manual pass over `form-context.tsx` (1420 lines — the ref + reducer hybrid is the
      riskiest area for race conditions).
- [ ] Lint clean (`bun run lint`) and typecheck under the new Zod.

## 5. React Native support

Feasible — field binding is via hooks (render-agnostic). Only DOM hard-deps:
1. the optional `<form>` wrapper ([form-context.tsx:1412](src/lib/form-context.tsx#L1412)) —
   confirm it can be fully disabled (RN has no `<form>`).
2. `FormState` debug component (web-only) — replaced by a native equivalent via code splitting.

- [ ] Confirm `FormProvider` works with no `<form>` wrapper.
- [ ] Build a **React Native debug component** (the RN equivalent of `FormState`),
      shipped under `./devtools/native` (track 3).
- [ ] **Ship an Expo example.** For local dev, have users clone the repo and run a command
      that links the package locally (`bun link` / local file path) into the Expo app —
      no need to publish to test.
- [ ] Decide `react-native` export condition if RN needs a distinct core build.

## 6. Test coverage

Currently only 3 test files (`utils.test.ts`, `zod-helpers.test.ts`, `form-context.test.tsx`).
`form-context.tsx` is large and undertested.

- [ ] Audit current coverage report (`bun run test` already runs `--coverage`).
- [ ] Add tests for hooks: `useField`, `useArrayField`, `useFormContext` (none today).
- [ ] Add tests for submission flow: submission ID lifecycle, race/queueing path,
      server vs client error sources, root messages.
- [ ] Add `FormState` smoke test.

## 7. Hydration safety  ✅ (verified — doc task only)

Scanned the lib: **no hydration hazards found.**
- `useReducer` initial state is deterministic ([form-context.tsx:174](src/lib/form-context.tsx#L174)).
- `generateID()` (`Date.now()+Math.random()`) only runs at submit time
  ([form-context.tsx:1168](src/lib/form-context.tsx#L1168)), never during render.
- No `useId` / `window` / `document` reads during render.

- [ ] Add a short README "SSR/Hydration" note: hydration-safe as long as the caller passes
      identical `initialValues` on server and client.
- [ ] (Optional) Add an SSR render test (`renderToString`) to lock it in.

## 8. Release

- [ ] Bump root `package.json` to `2.0.0` (single source of truth; everything syncs from it).
- [ ] CHANGELOG / release notes covering the Zod 4 break.
- [ ] `bun run build:lib` and verify `dist_module/`.
- [ ] Publish.
