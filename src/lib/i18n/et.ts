import type { Messages } from "./en";

/** Estonian month names are lowercase, so one that starts a sentence needs a capital. */
const capital = (text: string) => text.charAt(0).toLocaleUpperCase("et") + text.slice(1);

/**
 * Estonian UI copy. Margus reviews every string here by hand before release.
 */
export const et = {
  meta: {
    title: "Moneta Momenta",
    description: "Vaata kuude kaupa, kas järelmaks mahub sinu tegelike kulude sisse, enne kui otsustad.",
  },
  header: {
    appName: "Moneta",
    home: "Moneta, tagasi algusesse",
    languageSwitch: "In English",
    sampleBadge: "Näidisandmed",
    startOver: "Alusta uuesti",
  },
  footer: "Moneta Momenta · Hinnang sinu enda tehingute põhjal. Ei ole finantsnõuanne ega krediidiotsus.",
  scope:
    "Mõeldud väikelaenudele ja järelmaksule kuni 5 aastaks. Ei sobi kodulaenu ega muude pikaajaliste laenude jaoks.",
  status: {
    fits: "Mahub",
    tight: "Napp",
    "no-fit": "Ei mahu",
  },
  landing: {
    title: "Vaata kuude kaupa, kas järelmaks mahub sinu eelarvesse.",
    lead: "Moneta loeb sinu varasemad tehingud, arvutab, palju sul tavaliselt üle jääb, ja näitab, kuidas uus makse igasse kuusse mahub, ka neisse, kus on suured aastamaksed.",
    trySample: "Proovi näidisandmetega",
    tryTight: "Proovi napima eelarvega",
    sampleNote: "Näidisandmed on väljamõeldud pere ühe aasta tehingud.",
    loading: "Laen näidisandmeid…",
    loadFailed: "Näidisandmed ei laadinud. Kontrolli ühendust ja proovi uuesti.",
    howTitle: "Kuidas see töötab",
    steps: {
      dataTitle: "Laadi 3–12 kuu tehingud",
      dataBody: "Arvutame su tavalise sissetuleku ja kulud ning selle, millised kuud on tavaliselt kallimad.",
      purchaseTitle: "Sisesta ost",
      purchaseBody: "Hind, sissemakse, maksete arv, intress ja võimalik kuutasu.",
      resultTitle: "Vaata maksegraafiku iga kuud",
      resultBody: "Iga kuu saab ühe kolmest vastusest ja iga numbri juures on näha, kust see tuleb.",
    },
  },
  summary: {
    step: "Samm 1/3 · Sinu raha",
    title: "Nii näeb sinu raha tavaliselt välja",
    source: (rows: string, from: string, to: string) => `Näidisandmed: ${rows} tehingut, ${from} kuni ${to}.`,
    periodLabel: "Keskmise arvutamise periood",
    periodOption: (months: number) => `${months} kuud`,
    periodHint:
      "Keskmised arvutatakse viimaste täiskuude põhjal. Iga maksekuu puhul vaatame ka, palju sama kuu eelmisel aastal maksis.",
    monthlyAverage: "Kuu keskmine",
    incomeTitle: "Sissetulek",
    incomeTotal: "Keskmine sissetulek",
    spendingTitle: "Kulud kategooriagruppide kaupa",
    spendingTotal: "Tavalised kulud",
    marginTitle: "Tavaline kuujääk",
    marginExplain: (income: string, spending: string) =>
      `${income} sissetulek − ${spending} tavalised kulud. Sellesse peab uus makse ära mahtuma.`,
    noMarginTitle: "Keskmiselt ei jää midagi üle",
    noMarginBody:
      "Kulud on sama suured kui sissetulek või suuremad, nii et ükski järelmaks nende numbritega ei mahu. Suurimad grupid on ülal nimekirja alguses.",
    continue: "Edasi ostu juurde",
  },
  purchase: {
    step: "Samm 2/3 · Ost",
    title: "Mida sa osta tahad?",
    intro: "Kasuta sulle tehtud pakkumise numbreid. Saad neid hiljem muuta.",
    price: "Hind",
    upfront: "Sissemakse",
    upfrontHint: "Makstakse ostu ajal, maksetesse ei jagata. Kui sissemakset pole, sisesta 0.",
    count: "Maksete arv",
    countHint: (min: number, max: number) =>
      `Üks makse kuus. „Muu“ alt saad sisestada mis tahes arvu vahemikus ${min}–${max}.`,
    custom: "Muu",
    customLabel: "Kuude arv",
    rate: "Intress",
    rateUnit: "% aastas",
    rateHint: "Intressivaba järelmaksu puhul sisesta 0.",
    fee: "Kuutasu",
    feeHint: "Iga maksega lisanduv püsitasu.",
    spread: "Maksetesse jagatav summa",
    spreadMeta: (price: string, upfront: string) => `${price} hind − ${upfront} sissemakse`,
    firstInstalment: "Esimene makse",
    payment: "Kuumakse",
    paymentFee: (fee: string) => `Sisaldab ${fee} kuutasu`,
    paymentLast: (last: string) => `Viimane makse on ${last}`,
    submit: "Kontrolli taskukohasust",
    back: "Tagasi",
    errors: {
      requiredPrice: "Sisesta hind.",
      requiredCount: "Sisesta kuude arv.",
      money: "Sisesta summa, näiteks 1200 või 1200,50.",
      count: "Sisesta kuude arv täisarvuna.",
      rate: "Sisesta intress kuni kahe komakohaga, näiteks 9,9.",
      priceLow: "Hind peab olema suurem kui 0.",
      priceHigh: (max: string) => `Hind võib olla kuni ${max}.`,
      upfrontHigh: "Sissemakse peab olema hinnast väiksem.",
      countLow: (min: number) => `Makseid peab olema vähemalt ${min}.`,
      countHigh: (max: number) => `Kuni ${max} makset: see kontroll on kuni 5-aastaste maksegraafikute jaoks.`,
      rateHigh: "Intress võib olla kuni 100% aastas.",
      feeHigh: (max: string) => `Kuutasu võib olla kuni ${max}.`,
    },
  },
  result: {
    step: "Samm 3/3 · Tulemus",
    title: (price: string, count: number) => `${price}, ${count} makset`,
    termsUpfront: (amount: string) => `${amount} sissemakse`,
    termsRate: (percent: string) => `${percent}% intressi aastas`,
    termsFee: (amount: string) => `${amount} kuutasu`,
    termsMonths: (from: string, to: string) => `${from} kuni ${to}`,
    verdictFits: "Maksed mahuvad igasse kuusse",
    verdictTightOne: (month: string) => `Mahub, aga ${month} on napp`,
    verdictTightMany: (count: number) => `Mahub, aga ${count} kuud on napid`,
    verdictNoFitOne: (month: string, short: string) => `${capital(month)} jääb ${short} puudu`,
    verdictNoFitMany: (count: number, month: string, short: string) =>
      `${count} kuul jääb puudu, kõige rohkem ${month} puhul: ${short}`,
    fitsBody: (buffer: string, month: string, left: string) =>
      `Igas kuus jääb pärast makset üle vähemalt ${buffer}. Kõige napim on ${month}, kui üle jääb ${left}.`,
    fitShare: (fit: number, total: number) => `Maksed mahuvad ${fit} kuusse ${total}-st.`,
    monthSum: (month: string, margin: string, instalment: string, left: string) =>
      `${capital(month)}: ${margin} kuujääk − ${instalment} makse = ${left} jääb üle.`,
    seasonal: (pastMonth: string, spent: string, average: string, planMonth: string) =>
      `Sul kulus ${pastMonth} jooksul ${spent}, rohkem kui tavaline ${average}, seega arvestame ${planMonth} puhul sellega.`,
    belowBuffer: (buffer: string) =>
      `Kuu on napp, kui üle jääb vähem kui ${buffer}: 10% sinu keskmisest sissetulekust.`,
    payment: "Kuumakse",
    months: "Kuud",
    monthsValue: (fit: number, tight: number, noFit: number) => `${fit} mahub · ${tight} napp · ${noFit} ei mahu`,
    totalPaid: "Maksad kokku",
    totalPaidMeta: (upfront: string, instalments: string) => `${upfront} sissemakse + ${instalments} maksetena`,
    creditCost: "Krediidi kulu",
    creditCostMeta: (interest: string, fees: string) => `${interest} intress + ${fees} tasud`,
    change: "Muuda ostu",
    monthsTitle: "Kuude kaupa",
    monthsIntro: (buffer: string) =>
      `Kuujääk on sinu keskmine sissetulek miinus selle kuu oodatavad kulud. Kuu mahub, kui pärast makset jääb üle ${buffer} või rohkem.`,
    colMonth: "Kuu",
    colMargin: "Kuujääk",
    colInstalment: "Makse",
    colLeft: "Jääb üle",
    colStatus: "Olek",
    basedOn: (month: string) => `Kulud: ${month}`,
    phoneMargin: "Kuujääk",
    phoneLeft: "Üle",
    tryAgain: "Proovi teisi tingimusi",
    backToMoney: "Tagasi sinu raha juurde",
  },
  unexpected: "Nende numbritega läks midagi valesti. Alusta uuesti ja proovi veel kord.",
} satisfies Messages;
