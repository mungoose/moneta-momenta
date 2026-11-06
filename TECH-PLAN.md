# Moneta Momenta: tech plan

Status: **draft for approval, revision 2**. Nothing is built yet. Decisions Margus has made are marked ✅. The remaining open points are in [§15](#15-open-points).

---

## 1. Starting point

- ✅ **Start fresh.** There's no existing app repo to reuse. `moneta-momenta/` holds only `PRODUCT-BRIEF.md` and `sample-dataset/`.
- The folder isn't a git repo yet. The first build step is `git init`, then a public GitHub repo, so reviewers can read the code and its history.

## 2. Input: one transaction CSV, described by its format

✅ **One file, one format.** The app accepts a single delimited text file of transactions. It doesn't accept zips or a separate budget/plan file: a Plan file adds nothing that the transactions don't already give, so supporting it would be redundant logic.

✅ **The code doesn't treat any product as "the" source.** It describes the *format* it accepts. A YNAB export (Accounts/expenses view, any timeframe) is one example that already matches, and only the README mentions it. Error messages never name a product.

The format lives in one place, `src/lib/import/format-spec.ts`. That single object drives:
- the parser's header check
- the "missing columns" error
- the "What file can I use?" help text in the UI
- the format table in the README

so the four can't drift apart.

### Required format

| Column (exact header) | Type | Rules |
|---|---|---|
| `Date` | date | `DD/MM/YYYY` (✅ fixed, see below) |
| `Payee` | text | May be empty. Payees starting with `Transfer : ` are transfers between your own accounts. |
| `Category Group` | text | `Inflow` = income (exact wording, compared case-insensitively). `Credit Card Payments` = card payoff. Empty = not budgeted. |
| `Category` | text | The spending category inside the group |
| `Outflow` | amount | ≥ 0 |
| `Inflow` | amount | ≥ 0 |

- **Other columns** (`Account`, `Memo`, `Flag`, `Cleared`, `Category Group/Category` …) are allowed and ignored. Required columns are matched by header name, in any order.
- **File:** UTF-8 (a BOM is fine). Tab- or comma-separated, detected from the header line. Fields may be double-quoted. CRLF or LF line endings.
- **Amounts:** exactly 2 decimals, with a decimal comma or dot (detected once for the whole file). An optional `€` and thousands separators are allowed: `2465,87`, `2465.87`, `€2,465.87` and `2 465,87 €` all parse to `246587` cents.
- **Income wording.** Income has to sit in a category group literally called `Inflow`. Real data usually has only a handful of income categories, so renaming them before upload is a small manual step. The help text says this plainly.
- **✅ Date format is fixed to `DD/MM/YYYY`.** The parser has a single comment where variation would go: `// Date format is fixed to DD/MM/YYYY for this demo. For real users: let them pick the format, or infer it from the file (a part > 12 settles DMY vs MDY), here.` A date in any other format is a line-numbered error.

### Checked against the sample files

Checked against `sample-dataset/*.tsv`, which Margus confirms mirror a real export:
- Tab-separated, UTF-8 without a BOM, CRLF line endings, every text field quoted.
- Amounts are unquoted, have no currency symbol and no thousands separator. The decimal separator is a comma in the `et` files and a dot in the `en` files.
- Dates are `DD/MM/YYYY`, newest first.
- **Split transactions** are already separate rows, one per category, with memo `Split (1/2) …` (26 in the sample). They need no special handling. The parser never de-duplicates by date + payee + amount.
- **Transfers:** payee `Transfer : <account>` with empty categories, one row on each side. The monthly credit card payoff (`SEB` → `SEB Credit`) is exactly this, so it's excluded.
- **Card spending** is categorised normally, so it counts as spending when it happens. That's correct.
- **Income:** `Inflow / Ready to Assign` (salary, child benefit, Dec bonus, Apr tax refund).
- **Not in the sample:** refunds, `Starting Balance` rows and rows with empty categories. These are covered by hand-written fixtures (§11).

### Classification of each row

| Row | Counted as |
|---|---|
| Payee starts with `Transfer : ` | excluded: `transfer` |
| Payee is `Starting Balance` | excluded: `opening-balance`. It's an account balance, not income, even if filed under Inflow. Required by the brief. |
| Category Group `Credit Card Payments` | excluded: `card-payment` |
| Category Group `Inflow` | **income**: `inflow − outflow` |
| Category Group empty | excluded: `uncategorised` (tracking/off-budget rows) |
| anything else | **spending**: `outflow − inflow` per category. A refund lowers it, and it can go below 0 within one month. |

Excluded rows are counted and totalled per reason, and the explanation view shows those totals.

**Sample numbers.** These were computed independently with awk from the TSVs, and they're used as golden test values:

| | last 6 full months (May–Oct 2026) | July 2026 |
|---|---|---|
| Comfortable: avg income / spend / margin | €2,537.13 / €2,023.19 / **€513.94** | spend €2,443.62 (holiday) |
| Tight: avg margin | **≈ €5** | margin −€234.08 |

## 3. Stack

| Concern | Choice | Why |
|---|---|---|
| Framework | **Next.js 16, App Router, TypeScript strict** with `noUncheckedIndexedAccess` (version confirmed at scaffold time) | Required. Almost all of it runs client-side; the only server code is the optional LLM route. |
| Package manager | pnpm | Fast and deterministic on Vercel |
| CSS | **Tailwind CSS v4** | The most widely used CSS framework right now, and the `create-next-app` default. Tokens live in one `@theme` block. |
| Components | **shadcn/ui** (Radix primitives, copied into `src/components/ui`) | Accessible inputs, segmented controls and dialogs. Only the ~8 components needed are added. |
| CSV parsing | **PapaParse** | A battle-tested RFC-4180 parser with delimiter detection. Hand-rolled CSV parsing is where the quoting bugs come from. ~7 kB gz. |
| Unit tests | **Vitest** | Fast and TS-native |
| Mutation tests | **StrykerJS** (`@stryker-mutator/core` + `vitest-runner`) | ✅ Requested. Proves the tests actually catch wrong maths, not just execute it. See §11. |
| E2E | **Playwright** | Smoke flow, plus the real-browser check at desktop and phone width |
| i18n | **No library.** Typed dictionaries (`et.ts` uses `satisfies Messages`) + `Intl` | ~100 strings and 2 locales. The compiler catches missing Estonian keys. |
| Charts | None; CSS/SVG month strip | One bar per month doesn't justify a library |
| LLM (Could) | `@anthropic-ai/sdk`, Claude Haiku 5.5 (`claude-haiku-5-5`), `zod` for validating the output | Cheap and fast for a short structured answer. Check limits and pricing at build time. |

No state library, no form library, no database, no zip library.

## 4. Architecture

```
Browser (transaction data stays here)                Vercel
┌───────────────────────────────────────────┐       ┌───────────────────────────┐
│ File / sample TSV                         │       │ Static pages /en /et      │
│   → lib/import  read → parse → classify   │       │                           │
│   → lib/budget  months → summary          │       │ POST /api/suggest (Could) │
│   → lib/plan    schedule → affordability  │──────▶│   category totals only    │
│   → UI (React state + URL query params)   │ only  │   rate limited, key here  │
│   → lib/telemetry (anonymous events)      │totals └───────────────────────────┘
└───────────────────────────────────────────┘
```

- **Pure core.** `src/lib` has no React and no DOM. All the money logic lives there, and that's what the unit and mutation tests target.
- **Privacy is enforced.** A CSP of `connect-src 'self'` means an uploaded file can't be sent anywhere else, which is why the README can say "your file never leaves your browser". Transactions are never stored in `localStorage` and never logged.
- **State.** One client page per locale, with a `useReducer` flow: `landing → summary → purchase → result`.
  - With sample data, purchase inputs are mirrored into the URL (`?sample=comfortable&price=1200&n=12`), so the README can deep-link a reviewer straight to a result.
  - Uploaded data is never put in the URL. A reload returns to landing with a short note.

### Module layout

```
src/
  app/[locale]/layout.tsx, page.tsx      # en | et
  app/page.tsx                           # redirect / → /en
  app/api/suggest/route.ts               # Could
  lib/
    money/cents.ts         # Cents type, divRound, parseAmount, sum
    money/format.ts        # Intl display formatting
    import/format-spec.ts  # required columns, conventions, help text source
    import/read-file.ts    # File → string (size/binary checks, BOM)
    import/parse.ts        # string → Row[] | ImportError (with line numbers)
    import/classify.ts     # Row → income | spending | excluded(reason)
    budget/months.ts       # derive months from dates, full vs partial, period
    budget/summary.ts      # averages, per group/category, irregular
    plan/schedule.ts       # instalments: exact-sum rule, interest, fee
    plan/affordability.ts  # per plan month rows, status, verdict
    telemetry.ts           # typed anonymous events → sink (console for the demo)
    constants.ts           # every product threshold, named and commented
    i18n/{en,et}.ts
  components/              # Landing, DataSummary, PurchaseForm, Result, Explanation, ErrorState, ui/*
public/samples/            # the 4 TSVs (go through the real parser, like an upload)
tests/fixtures/            # tiny hand-written edge-case files
tests/unit/
e2e/
```

### Code documentation

✅ **Every exported function, type and constant gets JSDoc**: a one-line summary, `@param`/`@returns`, `@throws` where it applies, and an `@example` for the money and parsing helpers. Comments explain the *why* (e.g. why the remainder goes on the last instalment) and don't restate the code. Internal helpers get a JSDoc line when their name doesn't say it all. This is a convention in `CLAUDE.md`.

```ts
/**
 * Splits a plan total into whole-cent instalments that sum exactly to the total.
 * Leftover cents go on the last instalment, so the earlier ones stay equal.
 * @param total  Amount to repay in cents (financed amount + interest + fees). Must be ≥ 0.
 * @param count  Number of instalments, 2–60.
 * @returns      Array of `count` instalments in cents.
 * @example splitInstalments(cents(100_00), 3) // [33_33, 33_33, 33_34]
 */
```

## 5. Data model

```ts
type Cents = number & { readonly __brand: 'Cents' }   // integer; Number.isSafeInteger checked at the boundary
type YearMonth = string                                // 'YYYY-MM'

interface Row { line: number; date: string /* ISO */; payee: string; group: string; category: string;
                outflow: Cents; inflow: Cents }

type ExcludedReason = 'transfer' | 'opening-balance' | 'card-payment' | 'uncategorised'
type Classified =
  | { kind: 'income';   row: Row; amount: Cents }
  | { kind: 'spending'; row: Row; group: string; category: string; net: Cents }
  | { kind: 'excluded'; row: Row; reason: ExcludedReason }

interface MonthTotals { month: YearMonth; income: Cents; spending: Cents; byCategory: Record<string, Cents> }

interface DataSummary {
  fullMonths: YearMonth[]; droppedMonths: { month: YearMonth; why: 'current' | 'starts-mid-month' }[];
  period: YearMonth[]; avgIncome: Cents; avgSpending: Cents; margin: Cents;
  byGroup: { group: string; avg: Cents; categories: { category: string; avg: Cents }[] }[];
  irregular: { name: string; kind: 'income' | 'spending'; avg: Cents; median: Cents; peakMonth: YearMonth; peak: Cents }[];
  excluded: Record<ExcludedReason, { count: number; total: Cents }>;
  decimal: ',' | '.';
}

interface PlanInput { price: Cents; upfront: Cents; count: number; annualRateBps: number; monthlyFee: Cents }
interface PlanMonth { month: YearMonth; expectedSpending: Cents; spendingSource: 'average' | 'seasonal';
                      margin: Cents; instalment: Cents; leftover: Cents; status: 'fits' | 'tight' | 'no-fit' }
```

Every row keeps its `line` number, so errors can say exactly where the problem is (for example, "line 214: '12,3' isn't a valid amount").

## 6. Calculation rules (as built)

**Integer cents everywhere.** The only dividing helper is `divRound(a, b)`: integer division, rounding half away from zero, corrected by the remainder so it stays exact for any safe integer.

**Months: ✅ derived only from transaction dates.** The file has no month-start or month-end markers, and the app doesn't need any.
- Each row's month is taken from its `Date`. The months in range run from the earliest to the latest transaction month, with no gaps. A month inside that range with no rows counts as a real zero, which is the "month with no income" case. It shows a warning.
- **Last month.** Any month ≥ the *reference month* is unfinished and dropped. The reference month is today's month for uploads and a fixed `2026-11` for the sample, so the sample never goes stale for a reviewer who opens it later.
- **First month.** The export's timeframe may start mid-month. The earliest month counts as full only if its first transaction falls on or before day `FIRST_MONTH_MAX_START_DAY = 7`. Otherwise it's dropped with a note: "Your file starts on 18 March, so March is left out." This is a heuristic based only on dates. Day 7 works because most households have several transactions in any given week. The constant is named so the rule is easy to change.
- ✅ **Minimum: `MIN_FULL_MONTHS = 3`.** Fewer gives the "too little data" error. Three months gives the average a better chance of absorbing one-off oddities.
- **Period options:** last 3 / 6 / 12 full months. Options longer than the data are disabled. The default is 6, or all of them when only 3–5 exist, with a visible note.

**Averages.** `avgIncome = divRound(Σ income over period, n)`, and `avgSpending` the same way. `margin = avgIncome − avgSpending`. If `margin ≤ 0`, the summary explains why and no plan can pass.

**Instalments** (`schedule.ts`).
- `financed = price − upfront`. Validation: `0 < price ≤ €1,000,000`, `0 ≤ upfront < price`, `2 ≤ count ≤ 60`.
- **Interest.** An annual rate turns into a total interest amount through the standard annuity formula, the usual way hire-purchase is quoted. `Math.pow` is unavoidable there, and its result is rounded to cents once, at that boundary.
- **Fee.** A monthly fee adds `fee × count`.
- **Splitting.** `total = financed + interest + fees`. Each instalment is `floor(total / count)`, and the remainder goes on the last one.

**Plan months: ✅ seasonal, conservative.**
- The first instalment is due the month after the reference month.
- For a plan month that falls in calendar month *M*:
  - `expectedSpending = max(avgSpending, actual spending in M)`. "Actual spending in M" means M's most recent occurrence within the last 12 full months; if M isn't in the data, the average is used.
  - `margin_i = avgIncome − expectedSpending`
  - `leftover_i = margin_i − instalment_i`
- A known expensive month can make a plan month worse; a cheap one never makes it look better. Income stays at the average.
- The seasonal lookup uses up to 12 months even when the selected period is shorter. The UI says so: "Last July you spent €2,444, so July 2027 uses that."

**Status** (named constants). The buffer is 10% of average income: `buffer = divRound(avgIncome × 1000, 10000)`.
- `leftover ≥ buffer` → **fits**
- `0 ≤ leftover < buffer` → **tight**
- `leftover < 0` → **doesn't fit**

The **verdict** is the worst month's status. It's always shown next to its inputs.

**Irregular items (Should).** A category, or an income payee, counts as irregular when its peak month is more than `2 × median` and at least €50. Showing irregular *income* too (the December bonus, the April tax refund) tells the user how much of the average income they shouldn't count on.

## 7. Errors (each one says what to do next, none names a product)

| Case | Detection | Message direction |
|---|---|---|
| Wrong file | binary content, `.xlsx`/`.pdf`/image, > 5 MB | "This isn't a text (CSV/TSV) file." plus a link to the format help |
| Missing columns | required headers absent | "Missing required columns: `Category Group`, `Inflow`. The file needs: Date, Payee, Category Group, Category, Outflow, Inflow." |
| Empty file / header only | 0 data rows | "The file has no transactions." |
| Bad value | unparseable amount or date | "Line 214: '31-10-2026' isn't a date in DD/MM/YYYY format." |
| Too little data | full months < 3 | "Found 2 full months; at least 3 are needed. The current month is left out because it isn't finished." |
| No income found | Σ income over period = 0 | "No income found. Income rows need the category group **Inflow**." plus a rename tip |
| Zero or negative margin | `margin ≤ 0` | Shows the numbers, says no instalment plan fits them, and points to the largest categories |
| Month without income | income 0 in some month | A warning, not a blocker |
| Invalid purchase input | form validation | An inline message on the field |
| LLM down / no key / invalid answer | | The deterministic suggestions are shown instead, without an error banner |

## 8. Anonymous product telemetry

✅ **Requested.** A real company would want to know whether the feature gets used, without collecting anyone's finances. `lib/telemetry.ts` does that:

- **Typed event union.** Only these events exist, and their properties are enums or coarse buckets, never free values:

  | Event | Properties |
  |---|---|
  | `flow_started` | `source: 'sample' \| 'upload'` |
  | `import_failed` | `reason: ImportErrorCode` |
  | `period_changed` | `months: 3 \| 6 \| 12` |
  | `plan_checked` | `verdict`, `instalments: '3' \| '6' \| '12' \| 'custom'`, `priceBucket: '<300' \| '300–1000' \| '1000–3000' \| '>3000'`, `hasInterest: boolean` |
  | `explanation_opened` | (none) |
  | `suggestions_shown` | `source: 'ai' \| 'fallback'` |

- **What's never sent:** amounts, categories, payees, dates, IDs, cookies or fingerprints. Each event carries only a per-page-load random session ID, so a funnel can be counted without tracking a person across visits.
- **Sink:** in the demo, `console.info('[telemetry]', event)`. A comment at the sink says: *"In production, point this at a collector endpoint, e.g. a small API route shipping to Loki/Grafana or a product-analytics tool. The CSP `connect-src` would then allow that one origin."*
- **Tests** check that an event with a non-whitelisted field doesn't compile. A unit test asserts that the payloads are made up only of whitelisted fields.
- These events back the README's "how success would be measured" section: funnel conversion from `flow_started` → `plan_checked` → `explanation_opened`, the sample vs upload share, the import-failure reasons (to see which formats confuse people), and the verdict distribution.

## 9. Layout and design

✅ **Desktop first, one layout everywhere.** Recruiters will mostly open the link on a laptop, but the layout shouldn't change shape at breakpoints.

- **One centred content column**, `max-width ≈ 760px`. On a desktop it has generous whitespace around it. On a tablet or phone the same column just fills the width with a 16px gutter. There are no sidebars or multi-column rearrangement, and the components keep the same order at every width.
- **Only one responsive adjustment:** the month-by-month table. At ≥ 640px it shows the columns *Month · Margin · Instalment · Left over · Status*. Below that, each row becomes two lines (month + status on top; left over, then margin − instalment, underneath). It's the same component with the same data.
- Type and spacing scale down slightly via `clamp()`, not via separate layouts.
- The quality bar is checked in a real browser at **1280 px (primary)** and **390 px**.

✅ **The visuals come from a separate Claude Design conversation** (a Design artifact in claude.ai), running in parallel with the Day 1 core work, which doesn't depend on it. Paste this brief:

> Design a calm, trustworthy web app called **Moneta** (full name "Moneta Momenta"), an instalment affordability check. Generic branding: no colours or styles borrowed from real banks or BNPL brands. **Desktop first (1280 px)**, with a single centred content column (~760 px) that simply narrows on tablet and phone (390 px); avoid layouts that rearrange between breakpoints. Produce:
> 1. Tokens: colour (light + dark), including 3 status colours *fits / tight / doesn't fit* that meet WCAG AA and are always paired with an icon + label; type scale (one UI sans, tabular figures for money); spacing; radius.
> 2. Screens, each at 1280 and 390: Landing (one-line value prop, primary "Try with sample data", secondary "Upload a transactions file"); Data summary (period selector 3/6/12, income, spending by category group, margin, irregular items note); Purchase form (price, upfront, instalments 3/6/12/custom, interest rate, monthly fee); Result (verdict card + month-by-month table, where July doesn't fit); "How we calculated this" detail; one error state ("Missing required columns").
> 3. Components: button, segmented control, money input, stat row, month row (table row on desktop, two-line row on phone), verdict card, callout, drawer.

**Handed back to Claude Code:** the token values plus screenshots or exported HTML. I map the tokens into Tailwind's `@theme` and shadcn variants. The goal is consistency, not pixel-perfect reproduction. If the design isn't ready when the UI work starts, I use shadcn defaults with a neutral palette and swap the tokens in later.

## 10. i18n

- Routes are `/en` and `/et`; `/` redirects to `/en`. The language switcher keeps the query parameters.
- Money uses `Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' })`, and month names use `Intl.DateTimeFormat`.
- The Estonian UI loads the `et` sample and the English UI loads `en`. Uploads work in either UI language.
- Margus reviews all Estonian copy by hand, and the README says so.

## 11. Testing

### Approach: ✅ test-first for the core, conventional for the UI

Test-first suits `src/lib`: the brief already specifies the behaviour (calculation rules, edge-case list), the functions are pure, and the tests have to be written anyway. Writing them first costs about the same tokens. The extra cost is a few red-run cycles, and it stops the implementation from quietly redefining the spec. For each module:
1. Write the tests from §6 and §11, plus the fixtures. Run them and watch them fail for the right reason.
2. Implement until they pass, without editing a test to make it pass. If a test turns out to be wrong, change it deliberately and note why in the commit.
3. Run Stryker on that module and kill the surviving mutants, or justify each one in a comment.

The UI is built conventionally, then covered by Playwright. Writing E2E tests against screens that don't exist yet would cost more than it's worth.

### Unit fixtures (Vitest)

Fixtures in `tests/fixtures/` are 5–30 rows each, and each is named after its case:

| Fixture | Asserts |
|---|---|
| `splits.tsv` (incl. one split line that's a transfer) | each split line goes to its own category; the transfer leg is excluded |
| `transfers.tsv`, `card-payment.tsv`, `opening-balance.tsv` | excluded from income and spending, and counted per reason |
| `refund.tsv` | category net = outflow − inflow; a negative net is allowed |
| `no-income-month.tsv` | the gap month exists with income 0; warning raised |
| `three-months.tsv` / `two-months.tsv` | 3 → works, with a "fewer than 6" note; 2 → too-little-data error |
| `partial-current.tsv`, `starts-mid-month.tsv` | reference month dropped; first month dropped when it starts after day 7 |
| `empty.tsv`, `header-only.tsv` | empty error |
| `other-bank.csv` (a statement-style CSV) | missing-columns error listing exactly the missing ones |
| `dot-decimal.csv` (comma-delimited, `€1,234.56`), `utf8-bom.tsv`, `lf-endings.tsv` | parse to the same cents as the base fixture |
| `large-amounts.tsv` (`9 999 999,99 €`) | exact cents; amounts beyond safe integers are rejected |
| `bad-date.tsv` (`2026-10-31`) | line-numbered date error |

The unit tests also cover:
- `parseAmount` and `divRound` with table tests: negative values, exact `.5` cases.
- A property test that instalments always sum exactly to the total.
- The annuity against a known schedule.
- Status at `buffer`, `buffer − 1`, `0` and `−1`.
- Telemetry payloads contain only whitelisted fields.

A **golden test** checks that both samples reproduce the §2 monthly totals. Those numbers come from an independent awk calculation, not from the code under test.

### Mutation testing (StrykerJS)

- **Scope:** `src/lib/**` except the i18n dictionaries. UI code is excluded, because mutating JSX produces noise rather than useful signal.
- **Thresholds:** `high: 90, low: 80, break: 80`. The `money/` and `plan/` modules should reach ~100%, since that's where a surviving mutant means a wrong verdict could ship unnoticed.
- **Cost control:** run per module with `--mutate` while developing, use `--incremental` (only changed code is re-mutated), and report with `clear-text` + `html`. Claude reads only the survived-mutant list, never the full log.
- **CI:** a separate job on every PR and on `main`, so a score below `break` blocks the merge. The core is small, so a full run should take minutes. The README shows the mutation score next to the test count. It's a stronger quality claim than line coverage.

### E2E (Playwright)

Desktop 1280 × 800 is the primary project. The same specs also run at 390 × 844.
1. `/en` → Try sample → summary shows 6 months → €1,200 × 12 → verdict *doesn't fit*, July marked → open the explanation; the numbers are visible.
2. Upload `other-bank.csv` → missing-columns error.
3. `/et`: Estonian copy, and `1200` is formatted as `1200,00 €` (Estonian doesn't group 4-digit numbers; `1234567,89` → `1 234 567,89 €`, with no-break spaces).

### CI and deploy

- A GitHub Action runs typecheck, lint, `vitest run`, Playwright and Stryker on every PR and on pushes to `main`. All changes reach `main` through PRs that Margus merges.
- Vercel's Git integration deploys `main` and gives each branch a preview URL.

## 12. LLM suggestions (Could, last)

1. Code computes the gap: what the worst month needs to reach "fits" (or "tight").
2. Code builds a **menu** of cut options for each discretionary category, at 10/25/50% of its average, each with an exact `frees` value in cents. A small explicit list marks fixed costs (mortgage, leasing, kindergarten, insurance) as non-discretionary. For uploaded data, the model may flag a category as fixed, and code double-checks that.
3. `POST /api/suggest` receives only `{ gap, menu[] }`: category names and totals. No transactions, payees or memos. The body must be under 4 kB.
4. The model returns structured output, `{ picks: [{ optionId, reason }] }`. It chooses from the menu and doesn't produce numbers.
5. **Validation:**
   - every `optionId` exists
   - the picks free up at least the gap
   - `reason` contains no digits
   - the UI renders every number from code

   On any failure, the app shows the deterministic fallback: the largest discretionary categories.
6. **Limits:** an in-memory per-IP token bucket, a `max_tokens` cap, and a monthly spend cap in the Anthropic console. The token bucket is best effort only on serverless, and the README says so; the spend cap is the real guarantee.
7. The suggestions are labelled "AI-generated suggestion". The app works the same without `ANTHROPIC_API_KEY`.

## 13. Deployment

- Public GitHub repo, linked to Vercel. The URL is `moneta-<suffix>.vercel.app`, because `moneta` itself is almost certainly taken.
- Environment variables: only `ANTHROPIC_API_KEY`, and only if the Could item is built.
- Security headers (CSP, `Referrer-Policy`, `X-Content-Type-Options`) are set in `next.config.ts`.

## 14. Build order

Days are working sessions, not calendar days. Each session ends with `/handoff` and the next starts with `/pickup`.

**Day 0: plan (this session)**
- ✅ Inspect the data and write this plan.
- On approval, write `CLAUDE.md`, then `git init`.
- Scaffold Next.js + Tailwind + shadcn + Vitest + Stryker, and set up the GitHub repo and the Vercel link.
- **First deploy of the empty shell.**

**Day 1: the core, test-first, then the sample flow**
1. Margus starts the Claude Design conversation in parallel.
2. `money/`: tests → code → mutants
3. `import/` (format spec, parse, classify) + fixtures: tests → code → mutants
4. `budget/` + the golden test: tests → code → mutants
5. `plan/`: tests → code → mutants. The whole core is green before any UI.
6. UI flow with sample data, using the design tokens if they're ready → deploy

**Day 2: make it complete**
1. Upload path and every error state in §7
2. Telemetry events wired in
3. Real-browser pass at 1280 and 390, plus accessibility basics (labels, focus order, contrast)
4. Should items: Estonian copy, irregular items, explanation view, Playwright → deploy

**Day 3: present it, then extras**
1. README (format table, screenshot, decisions, success metrics) + screen recording
2. Margus's own check: upload his real export into the *local* dev app (it never leaves the browser and is never committed) and compare the monthly totals with his budgeting tool's own income vs expense report.
3. Could items, only if everything above is done: LLM → plan comparison → cash buffer

If time is short, Days 2 and 3 can merge. Nothing in Day 3 step 3 is required.

## 15. Open points

These are my recommendations; change any you disagree with.

1. **First instalment:** due the month after purchase. Some products charge at checkout; that could be a toggle later.
2. **Interest:** an annual rate via the annuity formula, plus a separate monthly fee. No APR is shown, because it's a regulated disclosure and claiming one edges toward financial advice.
3. **Irregular income:** keep the brief's average for income, but list irregular income next to irregular spending so the user sees how much of the average is a one-off. Using the median would be safer but harder to explain.
4. **Upfront payment** isn't checked against anything. That needs a cash balance, which is the Could "cash buffer" item.
5. **Tight sample profile:** its 6-month margin is about €5, so every plan comes out "doesn't fit". It works well as a second demo ("Try a tighter budget"). To show "tight", use a ~€600 × 12 purchase on the comfortable profile with a 3-month period: July should land in "tight". I'll confirm the exact example once the code runs.
6. **Starting Balance exclusion** is kept because the brief lists it. It's one rule and one fixture. If you'd rather keep the format spec minimal, it can go, and the help text would instead say "don't include opening balances in Inflow".
