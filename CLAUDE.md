# Moneta Momenta

Instalment affordability check: upload a transactions CSV (or use the sample), enter a purchase, see month by month whether the instalments fit. A demo, so **small, polished and complete beats big and unfinished**.

- Product brief: `PRODUCT-BRIEF.md`. Tech plan (the source of truth for design decisions): `TECH-PLAN.md`.
- Next.js-specific agent rules: @AGENTS.md. This Next.js (16.4) differs from training data, so read `node_modules/next/dist/docs/` before using an unfamiliar API.

## Stack

- Next.js 16 (App Router, Cache Components on) + React 19 + TypeScript strict (`noUncheckedIndexedAccess`)
- Tailwind CSS v4 + the design's own CSS (`design/moneta.css`) on native elements; no component library
- Vitest (unit, Node env), StrykerJS (mutation), Playwright (E2E, desktop 1280 + phone 390)
- npm (no pnpm on this machine), Node 26 (`.nvmrc`; `nvm use`), deployed on Vercel via GitHub integration

## Commands

```bash
npm run dev            # local dev server
npm run check          # typecheck + lint + format check + unit tests: run before saying anything works
npm run format         # Prettier: rewrites files in place; never format by hand
npm test               # unit tests once
npm run test:mutation  # Stryker on src/lib (incremental); single module: npx stryker run --mutate src/lib/money/**
npm run test:e2e       # Playwright against a production build
npm run build
```

When reading Stryker output, look only at the `[Survived]` mutants and the score table, not the full log.

## Design

- The visual design is in `design/` (start with `design/README.md`). Build every UI screen from it: `design/moneta.css` defines the tokens and components. Where its placeholder copy or numbers disagree with the code's rules, the code wins; the README lists the known differences.

## Layout

- `src/lib/`: the pure core (no React, no DOM). `money/`, `import/`, `budget/`, `plan/`, `telemetry.ts`, `constants.ts`, `i18n/`.
- `src/app/[locale]/`: pages for `en` and `et`. `/` redirects to `/en` (`next.config.ts`).
- `src/components/`: UI.
- `public/samples/`: sample TSVs served to the browser. These are copies of `sample-dataset/` (the generator's output); the files are renamed without a product name.
- `tests/unit/`, `tests/fixtures/` (tiny hand-written edge-case files), `e2e/`

## Conventions

- **Money is integer cents** (`Cents` branded type). No floats in the maths. Divide only with `divRound`. Format only for display, through `Intl`.
- **JSDoc on every exported function, type and constant**: a one-line summary, then `@param`/`@returns`/`@throws`, plus an `@example` for money and parsing helpers. Comments explain *why*, not *what*.
- **No product names in code or UI.** The app accepts a CSV *format* (see `src/lib/import/format-spec.ts` and TECH-PLAN §2). YNAB is mentioned only in the README, as an example source. Error messages list the required or missing columns.
- **Product thresholds are named constants** in `src/lib/constants.ts`, each with a comment saying why it has that value.
- The date format is fixed to `DD/MM/YYYY`. The comment in the date parser marks where format choice or inference would go.
- **Privacy:** transactions never leave the browser and are never logged or put in storage or the URL. Telemetry sends only the typed, whitelisted events (TECH-PLAN §8). The CSP `connect-src 'self'` in `next.config.ts` must stay.
- **UI copy:** short and plain, no finance jargon. Every string lives in `src/lib/i18n/en.ts`, and `et.ts` must match its keys (the compiler and a unit test enforce this). Margus reviews the Estonian copy.
- **Layout:** one centred column (`max-w-[760px]`, `px-4`), desktop first. The only responsive change is the month table.
- **Accessibility:** labels on every input, keyboard navigation, AA contrast, status never shown by colour alone.

## Scope

- **Must:** sample data; CSV upload parsed in the browser; 3/6/12-month period (minimum 3 full months, current month excluded); affordability calculation with the month-by-month seasonal model; every error state in TECH-PLAN §7; desktop + phone; unit + mutation tests on the core; live on Vercel; reviewer README.
- **Should:** Estonian UI; irregular income/spending; Playwright smoke; "how we calculated this" view; anonymous telemetry.
- **Could (only after Should):** LLM category suggestions (TECH-PLAN §12); comparing two plans; cash buffer.
- **Won't:** bank statement import, zip/Plan files, LV/LT translations, accounts, databases, server-side storage of transactions, credit decisions or financial advice.

## Working rules

- **Core modules are test-first:** write the tests and fixtures from TECH-PLAN §6/§11, see them fail, implement, then run Stryker on the module. Never edit a test just to make it pass. If a test is wrong, change it deliberately and say why in the commit.
- Smallest change that does the job. No abstractions "for later".
- Don't add dependencies without saying why.
- Run the tests (`npm run check`) before saying something works. Check UI changes in a real browser at 1280 and 390.
- When unsure about the data, check the fixture or the sample instead of assuming.
- Remove `allowEmpty` from `stryker.config.json` once the first `src/lib` module exists. It only exists so CI passes while `src/lib` has no core modules.
- **Never push to `main`.** Work on a branch, push it and open a PR. Margus reviews and merges every PR; don't merge or enable auto-merge.
- End each session with `/handoff` and start the next with `/pickup`.
