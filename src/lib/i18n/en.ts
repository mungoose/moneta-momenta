/**
 * English UI copy. This is the reference dictionary: every other locale must
 * provide exactly the same keys (enforced with `satisfies Messages`).
 * Entries that need values are functions; the caller passes values already
 * formatted for the locale (money, months, counts).
 */
export const en = {
  meta: {
    title: "Moneta Momenta",
    description: "See month by month whether an instalment plan fits your real spending, before you commit.",
  },
  /** Browser tab titles, each followed by " – " and the app name. The landing has the app name alone. */
  titles: {
    summary: "Your money – Step 1 of 3",
    purchase: "The purchase – Step 2 of 3",
    result: (status: string) => `Result: ${status} – Step 3 of 3`,
  },
  header: {
    appName: "Moneta Momenta",
    home: "Moneta Momenta, back to the start",
    languageSwitch: "Eesti keeles",
    sampleBadge: "Sample data",
    sampleBadgeShort: "Sample",
    startOver: "Start over",
  },
  footer: "Moneta Momenta · An estimate based on your own transactions. Not financial advice or a credit decision.",
  footerPrivacy:
    "Your transactions never leave this browser. The app counts only anonymous steps, never amounts, categories, payees or dates.",
  scope: "For small loans and instalment purchases of up to 5 years. Not for mortgages or other long-term loans.",
  status: {
    fits: "Fits",
    tight: "Tight",
    "no-fit": "Doesn't fit",
  },
  /** The one definition of the three answers, shown under the month table and in the explanation. */
  statusRules: {
    fits: (buffer: string) => `${buffer} or more left over.`,
    tight: (zero: string, belowBuffer: string) =>
      `${zero} to ${belowBuffer} left over, or below ${zero} when savings from earlier months cover the gap.`,
    tightNoBuffer: (zero: string) => `Below ${zero} left over, but savings from earlier months cover the gap.`,
    noFit: (zero: string) => `Below ${zero} left over, and savings from earlier months don't cover the gap.`,
    verdict:
      "The result is the worst month's answer, with one exception: when a single month doesn't fit and every other month fits, the result is Tight. One month like that is something you can plan for.",
  },
  landing: {
    title: "Check if an instalment plan fits your budget, month by month.",
    lead: "Moneta Momenta reads your past transactions, works out what you usually have left, and shows how a new instalment lands in each month, including the ones with big yearly bills.",
    upload: "Choose a transactions file",
    uploadHint: (columns: string) => `A CSV or TSV file with the columns ${columns}.`,
    source:
      "It's the kind of export a budgeting app that sorts your spending into categories gives you. A bank statement won't work if it has no categories.",
    privacy: "Your file stays on this device. This page reads it and sends nothing.",
    privacyMore: "How your file is handled",
    privacyDetails:
      "This browser tab reads your file. Its contents are never sent to a server, logged, or saved in browser storage or the page address, and they're gone when you reload or close the page. The app counts only anonymous steps, such as that a result was shown and its rough price range, never amounts, categories, payees or dates.",
    sampleIntro: "No file to hand? Try it with sample data, a made-up household's year of transactions.",
    sampleComfortable: "Comfortable budget sample",
    sampleTight: "Tight budget sample",
    loading: "Loading the sample…",
    reading: (file: string) => `Reading ${file}…`,
    uploadGone: "Your file isn't kept when the page reloads or changes language. Choose it again to continue.",
    loadFailed: "The sample data didn't load. Check your connection and try again.",
    howTitle: "How it works",
    steps: {
      dataTitle: "Load 3 to 12 months of transactions",
      dataBody: "We work out your usual income and spending, and which months usually cost more.",
      purchaseTitle: "Enter the purchase",
      purchaseBody: "Price, upfront payment, number of instalments, interest rate and any monthly fee.",
      resultTitle: "See every month of the plan",
      resultBody: "Each month gets one of three answers, and every number shows where it comes from.",
    },
  },
  uploadError: {
    step: "Step 1 of 3 · Your money",
    readTitle: "We couldn't read this file",
    useTitle: "We can't use this file yet",
    foundTitle: "What we found",
    requiredColumns: "Required columns",
    found: "Found",
    missing: "Missing",
    fixTitle: "How to fix it",
    fixUpload: "Choose the new file. Nothing from this attempt was kept.",
    template: "Download a template CSV (under 1 KB)",
    again: "Choose another file",
    yourColumns: (columns: string) => `Your file has: ${columns}.`,
    tooLarge: {
      title: "This file is too large",
      body: (file: string, max: string) =>
        `${file} is larger than ${max}. A year of transactions is usually well under 1 MB.`,
      fix: ["Check that you picked the transactions export, not a photo or an archive."],
    },
    notText: {
      title: "This isn't a text file",
      body: (file: string) => `${file} isn't a CSV or TSV file. Spreadsheets, PDFs and images can't be read.`,
      fix: ["Export your transactions as CSV or TSV.", "If the file is open in a spreadsheet, save it as CSV UTF-8."],
    },
    empty: {
      title: "The file has no transactions",
      body: (file: string) => `${file} has no rows below the column names.`,
      fix: ["Check the date range of the export and export again."],
    },
    missingColumns: {
      title: "Missing required columns",
      body: (file: string, missing: string, count: number) =>
        `${file} has no ${missing} ${count === 1 ? "column" : "columns"}.`,
      fix: [
        "If the data is there under another name, rename that column header to the required name.",
        "If your file has no categories at all, it's probably a bank statement. Export from a budgeting app that sorts your spending into categories instead.",
      ],
    },
    malformed: {
      title: (line: string) => `Line ${line} doesn't match the columns`,
      body: "It has a different number of values than the header row, or a quote mark that isn't closed.",
      fix: [
        "Open the file in a text editor and look at that line.",
        "If you edited the file in a spreadsheet, export it again as CSV.",
      ],
    },
    badDate: {
      title: (line: string) => `Line ${line} has a date we can't read`,
      body: (value: string) => `“${value}” isn't a date in the DD/MM/YYYY format.`,
      fix: ["Dates need the day first, then the month and the year, like 31/10/2026."],
    },
    badAmount: {
      title: (line: string) => `Line ${line} has an amount we can't read`,
      body: (value: string, column: string) => `“${value}” in the ${column} column isn't an amount.`,
      fix: ["Amounts need two decimals and no minus sign, like 12.50 or 1,250.00. A € sign is fine."],
    },
    tooLittleData: {
      title: (found: number, min: number) =>
        `Found ${found} full ${found === 1 ? "month" : "months"}; at least ${min} are needed`,
      body: "The current month isn't counted, because it isn't finished yet.",
      leftOut: (months: string) => `Left out as unfinished: ${months}.`,
      fix: ["Export a longer date range. The more full months, the steadier the averages."],
    },
    noIncome: {
      title: "No income found",
      body: "There's no income in the most recent months. Income rows need the category group Inflow.",
      fix: ["In your budget, put salary and other income in the Inflow category group, then export again."],
    },
    unexpected: {
      title: "Something went wrong reading this file",
      body: (file: string) => `${file} passed every check but still couldn't be used.`,
      fix: ["Try again, or export the file again."],
    },
  },
  summary: {
    step: "Step 1 of 3 · Your money",
    title: "Here's what your money usually looks like",
    source: (rows: string, from: string, to: string) => `Sample data: ${rows} transactions, ${from} to ${to}.`,
    sourceUpload: (file: string, rows: string, from: string, to: string) =>
      `${file}: ${rows} transactions, ${from} to ${to}.`,
    startsLateTitle: (day: string) => `Your transactions start on ${day}`,
    endsEarlyTitle: (day: string) => `Your transactions stop on ${day}`,
    incompleteBody: (month: string) =>
      `If some of the spending in ${month} is missing, your usual spending looks lower than it is, and plans look easier to afford.`,
    outdatedTitle: (month: string) => `Your transactions end in ${month}`,
    outdatedBody: "The months since then aren't in the file, so the averages may not match your money today.",
    noIncomeMonthsTitle: (months: string) => `No income in ${months}`,
    noIncomeMonthsBody:
      "Those months count as zero income, which lowers the average. If income is missing from the file, check that its category group is Inflow.",
    periodLabel: "Period to average over",
    periodOption: (months: number) => `${months} months`,
    periodHint:
      "Choose how many of your most recent full months the averages use. More months even out unusual ones; fewer follow recent changes, like a new job or a new rent. Whatever you pick, each plan month also checks what the same month cost last year.",
    monthlyAverage: "Monthly average",
    incomeTitle: "Income",
    incomeTotal: "Average income",
    spendingTitle: "Spending by category group",
    spendingTotal: "Usual spending",
    marginTitle: "Usually left over each month",
    marginExplain: (income: string, spending: string) =>
      `${income} income − ${spending} usual spending. A new instalment has to come out of this.`,
    irregularTitle: (count: number) => (count === 1 ? "One amount stood out" : `${count} amounts stood out`),
    irregularBody: "Each had one month far above its usual amount. They're included in the averages above.",
    irregularSpending: "If a plan reaches the same month of the year, that month counts on what it cost then.",
    irregularIncome:
      "One-off income raises the average income. If it won't come again, you have less left over than shown.",
    irregularItem: (name: string, month: string) => `${name} · ${month}`,
    irregularIncomeItem: (payee: string, month: string) => `${payee} (income) · ${month}`,
    irregularUsually: (amount: string) => `, usually ${amount}`,
    noMarginTitle: "Nothing is left over on average",
    noMarginBody:
      "Spending is as high as income or higher, so no instalment plan fits these numbers. The largest spending groups are at the top of the list below.",
    continue: "Continue to the purchase",
  },
  purchase: {
    step: "Step 2 of 3 · The purchase",
    title: "What would you like to buy?",
    intro: "Use the figures from the offer you've been given. You can change them later.",
    price: "Price",
    upfront: "Upfront payment",
    upfrontHint: "Paid at purchase, not spread over the plan. Enter 0 if there isn't one.",
    count: "Number of instalments",
    countHint: (min: number, max: number) =>
      `One payment a month. Custom lets you type any number from ${min} to ${max}.`,
    custom: "Custom",
    customLabel: "Number of months",
    rate: "Interest rate",
    rateUnit: "% per year",
    rateHint:
      "Use the yearly interest rate from the offer, not the APR, which already includes fees. Enter 0 if it's interest-free.",
    fee: "Monthly fee",
    feeHint: "Any fixed fee charged with each instalment.",
    spread: "Amount to spread",
    spreadMeta: (price: string, upfront: string) => `${price} price − ${upfront} upfront`,
    firstInstalment: "First instalment",
    payment: "Monthly payment",
    paymentFee: (fee: string) => `Includes the ${fee} fee`,
    paymentLast: (last: string) => `The last one is ${last}`,
    submit: "Check affordability",
    back: "Back to your money",
    errors: {
      requiredPrice: "Enter the price.",
      requiredCount: "Enter the number of months.",
      money: "Enter an amount, like 1200 or 1200.50.",
      count: "Enter a whole number of months.",
      rate: "Enter a rate with up to two decimals, like 9.9.",
      priceLow: "The price has to be more than 0.",
      priceHigh: (max: string) => `The price can be at most ${max}.`,
      upfrontHigh: "The upfront payment has to be less than the price.",
      countLow: (min: number) => `The plan needs at least ${min} instalments.`,
      countHigh: (max: number) => `At most ${max} instalments: this check is for plans of up to 5 years.`,
      rateHigh: "The rate can be at most 100% a year.",
      feeHigh: (max: string) => `The fee can be at most ${max} a month.`,
    },
  },
  result: {
    step: "Step 3 of 3 · Result",
    title: (price: string, count: number) => `${price} over ${count} instalments`,
    termsUpfront: (amount: string) => `${amount} upfront`,
    termsRate: (percent: string) => `${percent}% interest a year`,
    termsInterestFree: "Interest-free",
    termsFee: (amount: string) => `${amount} monthly fee`,
    termsMonths: (from: string, to: string) => `${from} to ${to}`,
    verdictFits: "The plan fits every month",
    verdictTightOne: (month: string) => `It fits, but ${month} is tight`,
    verdictTightMany: (count: number) => `It fits, but ${count} months are tight`,
    verdictCovered: (month: string, short: string) => `It fits, but ${month} needs ${short} from savings`,
    verdictOneShort: (month: string, short: string) => `Only ${month} comes up short, by ${short}`,
    verdictNoFitOne: (month: string, short: string) => `${month} comes up ${short} short`,
    verdictNoFitMany: (count: number, month: string, short: string) =>
      `${count} months come up short. The most is ${short}, in ${month}`,
    verdictNoRoom: (margin: string, buffer: string) =>
      `You usually have ${margin} left a month, less than the ${buffer} buffer`,
    noRoomBody:
      "So no instalment fits every month right now, whatever the price or the terms. The buffer is 10% of your average income, kept for costs nobody can predict.",
    fittingPayment: (payment: string) => `A monthly payment of up to ${payment} would fit every month.`,
    fitsBody: (buffer: string, month: string, left: string) =>
      `Every month leaves at least ${buffer} after the instalment. The closest is ${month}, with ${left} left.`,
    fitShare: (fit: number, total: number) => `The plan fits in ${fit} of ${total} months.`,
    monthSum: (month: string, margin: string, instalment: string, left: string) =>
      `${month}: ${margin} before the instalment − ${instalment} instalment = ${left} left over.`,
    seasonal: (pastMonth: string, spent: string, average: string, planMonth: string) =>
      `In ${pastMonth} you spent ${spent}, more than the usual ${average}, so we expect ${planMonth} to cost that much too.`,
    belowBuffer: (buffer: string) => `A month is tight when less than ${buffer} is left: 10% of your average income.`,
    coveredBody: (saved: string, buffer: string) =>
      `The months before it leave ${saved} on top of the ${buffer} buffer. Put that aside and it covers the gap.`,
    oneShortBody: "Every other month fits, so this is one month to plan for: set money aside before it.",
    payment: "Monthly payment",
    months: "Months",
    monthsValue: (fit: number, tight: number, noFit: number) =>
      `${fit} fit · ${tight} tight · ${noFit} ${noFit === 1 ? "doesn't" : "don't"} fit`,
    totalPaid: "Total you pay",
    totalPaidMeta: (upfront: string, instalments: string) => `${upfront} upfront + ${instalments} in instalments`,
    creditCost: "Cost of credit",
    creditCostMeta: (interest: string, fees: string) => `${interest} interest + ${fees} fees`,
    change: "Change the purchase",
    monthsTitle: "Month by month",
    monthsIntro: (buffer: string) =>
      `Before instalment is your average income minus what that month is expected to cost. Months that fit save what they leave over the ${buffer} buffer, for later months that come up short. Each month gets one of three answers:`,
    colMonth: "Month",
    colMargin: "Before instalment",
    colInstalment: "Instalment",
    colLeft: "Left over",
    colStatus: "Status",
    basedOn: (month: string) => `Uses ${month} costs`,
    phoneMargin: "Before",
    phoneLeft: "Left",
    fromSavings: "From savings",
    incomplete:
      "Your file's first or last month may be missing transactions, so this result may look better than it is.",
    backToMoney: "Back to your money",
  },
  explanation: {
    title: "How we calculated this",
    close: "Close",
    intro: "Every figure comes from your transactions and the purchase you entered. Four steps:",
    marginTitle: "What you usually have left",
    marginFormula: (income: string, spending: string) => `${income} average income − ${spending} usual spending =`,
    marginNote: (count: number, from: string, to: string) =>
      `Monthly averages over ${count} full months, ${from} to ${to}.`,
    instalmentTitle: "Your monthly instalment",
    financedFormula: (price: string, upfront: string) => `${price} price − ${upfront} upfront =`,
    toSpread: "to spread",
    toSpreadNoUpfront: "to spread, with nothing paid upfront",
    plusInterest: (interest: string) => `+ ${interest} interest`,
    plusFees: (fees: string, count: number, fee: string) => `+ ${fees} fees (${count} × ${fee})`,
    aMonth: "a month",
    lastDiffers: (last: string) => `The last instalment is ${last}: it takes the cents that don't divide evenly.`,
    rateNote: (percent: string) =>
      `The interest at ${percent}% a year comes from a fixed monthly repayment, the way instalment offers are usually quoted.`,
    seasonalTitle: "Months that cost more last time",
    seasonalRule:
      "For each plan month we look up the same month in your file, up to a year back. If you spent more then than usual, that month counts on what you spent. A cheaper month never makes the plan look better.",
    spentIn: (month: string) => `What you spent in ${month}`,
    irregularNote: (items: string) =>
      `One-off costs, such as ${items}, are part of your usual spending and of the month they fell in.`,
    irregularNoteItem: (category: string, month: string) => `${category} (${month})`,
    seasonalNone: (usual: string) =>
      `No plan month cost more than usual last time, so every month counts on your usual spending of ${usual}.`,
    seasonalOthers: (usual: string) => `Every other month counts on your usual spending of ${usual}.`,
    leftoverTitle: "What's left each month",
    leftoverFormula: "Average income − that month's spending − instalment = left over",
    leftoverExample: (month: string, income: string, spending: string, instalment: string) =>
      `${month}: ${income} − ${spending} − ${instalment} =`,
    criticalNote: "That's the month that decides the verdict.",
    bufferNote: (buffer: string, percent: string) =>
      `The ${buffer} buffer is ${percent}% of your average income, kept for costs nobody can predict, like a repair or a doctor's bill.`,
    savingsNote: (buffer: string) =>
      `Months aren't judged alone. Each month that fits saves what it leaves over ${buffer}, and a later month that comes up short can draw on those savings. Each month gets one of three answers:`,
    limitsTitle: "What this can't know",
    limitsBody:
      "Changes that haven't happened yet, like a new job, a rent increase or a new subscription. If your income or costs are about to change, treat this as a rough guide.",
  },
  unexpectedTitle: "Something went wrong",
  unexpected: "Something went wrong with these numbers. Start over and try again.",
};

/** Shape every locale dictionary must match. */
export type Messages = typeof en;
