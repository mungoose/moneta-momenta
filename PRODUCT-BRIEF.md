# Product brief: Moneta Momenta (instalment affordability check)

> **For Claude Code:** this is a product brief, not a tech plan. Your first job is to read it, inspect the existing repo and a real YNAB export, then write a tech plan (see "First task"). Don't write feature code until Margus has approved the plan. Batch any questions into one message.

## Name

**Moneta Momenta.** Use the full name in the README, the page title and the landing page. Use **Moneta** in the app header and the URL/slug.

The name is two Latin nouns side by side, not a Latin phrase, so don't present it as a translation. README footnote:

- *Moneta* was a title of the Roman goddess Juno. Her temple housed Rome's mint, which is where "money" and "mint" come from. The name is traditionally linked to *monere*, "to warn".
- *Momenta* is the plural of *momentum*, originally the small weight that tips a balance.

Together: the app warns you which months tip an instalment plan from "fits" to "doesn't fit".

Keep the branding generic otherwise: no logos or colours borrowed from real finance brands.

## The problem (draft two sentences)

People decide to pay for something in instalments without seeing how the monthly payments stack on top of what they really spend. This app takes your budget history and shows, month by month, whether an instalment plan fits before you commit.

Origin: Margus's laptop died, he knew what he needed, but wasn't sure he could afford it on instalments. This is the tool he wanted then.

## Users and the flow

**Primary user:** someone who already tracks spending in YNAB and is weighing an instalment purchase.

**Demo reviewer:** has no YNAB file, so the app must be fully usable with built-in sample data in under a minute, with no sign-up.

**Flow:**
1. **Landing.** One-line explanation, then two choices: "Try with sample data" (primary) or "Upload your YNAB export".
2. **Data summary.** Which months are used, average monthly income, average monthly spending by category group, and the resulting monthly margin. The user can change the period.
3. **Purchase.** Price, optional upfront payment, number of instalments (3 / 6 / 12, plus a custom value), and an optional interest rate or monthly fee (defaults to 0).
4. **Result.**
   - A month-by-month view for the plan's length: margin, instalment, what's left, and a status (fits / tight / doesn't fit).
   - A clear overall verdict.
   - A plain-language explanation of how it was calculated.
5. **(Could)** "How could I make this fit?": category-level suggestions (see the LLM section).

## Scope

### Must (the demo isn't shippable without these)
- Built-in sample dataset in YNAB export format: about 12 months, realistic Estonian household, euro amounts. It must include a few irregular expenses, at least one split transaction and at least one transfer between accounts.
- Upload and parse a real YNAB export, entirely in the browser.
- Period selection: the last 3, 6 or 12 full months. The current partial month is always excluded. Default to 6 full months, or fewer if that's all the data has, with a visible note.
- Affordability calculation and month-by-month result, as defined under "Calculation rules".
- Clear error states:
  - wrong file
  - not a YNAB export
  - too little data
  - zero or negative margin
  - no income found
- Works well on a phone. Most instalment decisions happen at checkout on mobile.
- Unit tests for parsing and all money maths, using fixtures that cover each edge case listed below.
- Deployed and publicly reachable (Vercel), no login.
- README written for the reviewer (see "Deliverables").

### Should (do if Must is solid)
- Estonian UI translation next to English, with locale-aware number, currency and date formatting.
- Irregular-expense handling: show categories whose monthly spending varies a lot, and say how they affect the average.
- Playwright smoke test: sample data → purchase → verdict.
- "Explain this verdict" detail view showing the exact numbers used.

### Could (only after Should)
- LLM suggestions for which spending categories to reduce (rules below).
- Comparing two plans side by side (e.g. 3 vs 12 instalments).
- Accounting for an existing cash buffer.

### Won't (on purpose, mention in README as next steps)
- Bank statement CSV import. Payee text is truncated and uncategorised, which is why YNAB data is used instead.
- Latvian and Lithuanian translations. Margus can't verify their quality, and shipping unverified copy contradicts "nothing goes live half-done".
- Accounts, a database or server-side storage of transactions.
- Real credit decisions, credit scores or any claim of being financial advice.

## Calculation rules

- **Money is stored as integer cents** everywhere. No floats in the maths, and format only for display.
- **Instalment splitting:** (price − upfront) plus total interest/fees, divided by the number of instalments, in whole cents. Leftover cents go on the last instalment. The instalments must sum exactly to the total.
- **Monthly income** = average of inflows categorised as income over the selected full months.
- **Monthly spending** = average of categorised outflows over the same months.
- **Excluded from both:**
  - transfers between the user's own accounts
  - credit card payments
  - starting balances
  - anything YNAB marks as a transfer
- **Monthly margin** = monthly income − monthly spending.
- **Per plan month:** left over = margin − instalment.
- **Status per month** (defaults are product decisions; keep them as named constants):
  - *fits:* left over is at least 10% of monthly income
  - *tight:* left over is between 0 and that buffer
  - *doesn't fit:* left over is below 0
- **Overall verdict** = the worst month's status.
- Show the numbers behind every verdict. Never show a verdict without its inputs.

## YNAB export: what to verify, not assume

Margus will put an anonymised real export into the repo as a fixture. Before planning the parser, inspect that file and confirm:

- **Structure:** what's actually in the zip (expected: a transaction register CSV and a budget/plan CSV), and the exact column names in this export. Decide whether the plan file or the register is the better source for monthly totals, and say why in the tech plan.
- **Formats:** how amounts are formatted (currency symbol, thousands and decimal separators depend on YNAB locale settings) and the date format.
- **Special rows:** how split transactions appear, how transfers are marked (payee or category), and how income is categorised ("Ready to Assign" or similar).
- **File details:** encoding and BOM, and the delimiter.

**Edge-case fixtures the tests must cover:**
- split transactions
- transfers
- credit card payments
- refunds (inflow in a spending category)
- a month with no income
- only 1–2 full months of data
- a partial current month
- an empty file
- a non-YNAB CSV
- a different locale's number format
- very large amounts

## LLM feature (Could, last)

**Purpose:** when the verdict is "tight" or "doesn't fit", suggest which spending categories could be reduced, and by how much, to make the plan fit.

**Rules:**
- Code computes all numbers first: category averages, the monthly gap and what a given cut would free up.
- Only category-level totals go to the model. Never send transactions, payees or memos.
- The model chooses and explains. Code then checks that every number in the response matches the computed data. If anything doesn't match, show the deterministic fallback (largest discretionary categories) instead.
- The API key lives server-side only, in a single API route with rate limiting and a hard monthly spend cap on the account.
- The app must work fully without this feature, including when the API is down or the key is missing.
- Label the suggestions as AI-generated.

## Quality bar

- Every number shown can be traced to the data, and the explanation view proves it.
- No unhandled error states. Every failure tells the user what to do next.
- Copy is short and plain, with no finance jargon a regular person wouldn't use.
- Before calling anything done, check it in a real browser at phone width.
- Use accessible basics: labels on inputs, keyboard navigation and sufficient contrast.

## Deliverables

1. **Live URL** on Vercel.
2. **README** for the reviewer:
   - the two-sentence problem
   - a screenshot
   - why YNAB data instead of bank exports
   - key product decisions (status thresholds, what's excluded and why)
   - how it was built with Claude Code and what Margus checked by hand
   - what's deliberately not built and what would come next, including how success would be measured if this were a real feature
3. **A 1–2 minute screen recording** walking through the sample-data flow and one edge case.

## Timeline (Fri evening to Sun night)

- **Fri evening:**
  - repo assessment and the reuse-or-fresh decision
  - inspect the YNAB export and create the fixtures
  - write the tech plan and get it approved
- **Sat:**
  - parser and calculation with tests
  - core flow working end to end with sample data
  - first deploy (deploy early, then keep deploying)
- **Sun:**
  - edge cases and error states
  - mobile polish and Should items
  - README and recording
  - LLM feature only if everything above is done

Claude Code usage is limited on this plan, so keep sessions focused. End each session with /handoff and start the next with /pickup.

## First task for Claude Code

1. **Assess the existing repo.** Inspect the existing Next.js expense-tracking repo and report:
   - what's solid
   - what's half-finished
   - what you'd delete
   - whether to build on it or start fresh and port specific modules

   Base the recommendation on code quality and fit with this brief, not on effort already spent.
2. **Inspect the export.** Look at the YNAB export fixture and answer the questions in "YNAB export: what to verify".
3. **Write TECH-PLAN.md.** Cover the stack and libraries (prefer what's already in the repo), module structure, data model, parsing approach, calculation module, i18n approach, test plan, deployment, and the build order mapped to the timeline. Flag every place where this brief is ambiguous or where you'd recommend a different product decision.
4. **Write CLAUDE.md.** Cover the stack, conventions, commands, the Must/Should/Could/Won't scope and the working rules below.

**Working rules:**
- Smallest change that does the job. No abstractions "for later".
- Don't add dependencies without saying why.
- Run the tests before saying something works.
- When unsure about the data, check the fixture rather than assume.
