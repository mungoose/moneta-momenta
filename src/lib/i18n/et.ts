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
    upload: "Laadi üles tehingute fail",
    uploadHint: (columns: string) =>
      `CSV- või TSV-fail veergudega ${columns}. Fail loetakse selles brauseris ega lahku sinu seadmest.`,
    loading: "Laen näidisandmeid…",
    reading: (file: string) => `Loen faili ${file}…`,
    uploadGone: "Faili ei säilitata, kui leht uuesti laaditakse või keel vahetub. Jätkamiseks laadi see uuesti üles.",
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
  uploadError: {
    step: "Üleslaadimine",
    readTitle: "Me ei saanud seda faili lugeda",
    useTitle: "Seda faili ei saa veel kasutada",
    foundTitle: "Mida leidsime",
    requiredColumns: "Nõutud veerud",
    found: "Olemas",
    missing: "Puudu",
    fixTitle: "Kuidas parandada",
    fixUpload: "Laadi uus fail üles. Sellest katsest ei jäänud midagi alles.",
    template: "Laadi alla CSV näidisfail",
    again: "Laadi üles teine fail",
    sample: "Proovi näidisandmetega",
    tooLarge: {
      title: "See fail on liiga suur",
      body: (file: string, max: string) => `${file} on suurem kui ${max}. Aasta tehingud mahuvad tavaliselt alla 1 MB.`,
      fix: ["Kontrolli, et valisid tehingute ekspordi, mitte foto või arhiivi."],
    },
    notText: {
      title: "See ei ole tekstifail",
      body: (file: string) => `${file} ei ole CSV- ega TSV-fail. Tabelarvutuse faile, PDF-e ja pilte ei saa lugeda.`,
      fix: [
        "Ekspordi oma tehingud CSV- või TSV-failina.",
        "Kui fail on tabelarvutuses avatud, salvesta see CSV UTF-8 vormingus.",
      ],
    },
    empty: {
      title: "Failis pole tehinguid",
      body: (file: string) => `${file} failis pole veerunimede all ühtegi rida.`,
      fix: ["Kontrolli ekspordi kuupäevavahemikku ja ekspordi uuesti."],
    },
    missingColumns: {
      title: "Nõutud veerud puuduvad",
      body: (file: string, missing: string, count: number, required: string) =>
        `${file} failis ${count === 1 ? "puudub veerg" : "puuduvad veerud"} ${missing}. Failis peavad olema veerud ${required}.`,
      fix: [
        "Kui andmed on olemas teise nime all, nimeta see veerg ülaltoodud nimega ümber.",
        "Muul juhul ekspordi uuesti nii, et need veerud oleksid kaasas.",
      ],
    },
    malformed: {
      title: (line: string) => `Rida ${line} ei vasta veergudele`,
      body: "Sellel on päisereast erinev arv väärtusi või sulgemata jutumärk.",
      fix: [
        "Ava fail tekstiredaktoris ja vaata seda rida.",
        "Kui muutsid faili tabelarvutuses, ekspordi see uuesti CSV-na.",
      ],
    },
    badDate: {
      title: (line: string) => `Real ${line} on kuupäev, mida me ei saa lugeda`,
      body: (value: string) => `„${value}“ ei ole kuupäev kujul PP/KK/AAAA.`,
      fix: ["Kuupäevas peab olema enne päev, siis kuu ja aasta, näiteks 31/10/2026."],
    },
    badAmount: {
      title: (line: string) => `Real ${line} on summa, mida me ei saa lugeda`,
      body: (value: string, column: string) => `„${value}“ veerus ${column} ei ole summa.`,
      fix: ["Summal peab olema kaks komakohta ja ei tohi olla miinusmärki, näiteks 12,50 või 1 250,00. €-märk sobib."],
    },
    tooLittleData: {
      title: (found: number, min: number) =>
        `Leidsime ${found} ${found === 1 ? "täiskuu" : "täiskuud"}, vaja on vähemalt ${min}`,
      body: "Jooksvat kuud ei arvestata, sest see pole veel läbi.",
      leftOut: (months: string) => `Lõpetamata kuuna jäi välja: ${months}.`,
      fix: ["Ekspordi pikem kuupäevavahemik. Mida rohkem täiskuid, seda kindlamad on keskmised."],
    },
    noIncome: {
      title: "Sissetulekut ei leitud",
      body: "Viimastel kuudel pole sissetulekut. Sissetuleku ridade kategooriagrupp peab olema Inflow.",
      fix: ["Pane eelarves palk ja muu sissetulek kategooriagruppi Inflow ja ekspordi uuesti."],
    },
    unexpected: {
      title: "Faili lugemisel läks midagi valesti",
      body: (file: string) => `${file} läbis kõik kontrollid, kuid seda ei saanud ikkagi kasutada.`,
      fix: ["Proovi uuesti või ekspordi fail uuesti."],
    },
  },
  summary: {
    step: "Samm 1/3 · Sinu raha",
    title: "Nii näeb sinu raha tavaliselt välja",
    source: (rows: string, from: string, to: string) => `Näidisandmed: ${rows} tehingut, ${from} kuni ${to}.`,
    sourceUpload: (file: string, rows: string, from: string, to: string) =>
      `${file}: ${rows} tehingut, ${from} kuni ${to}.`,
    startsLateTitle: (day: string) => `Sinu tehingud algavad ${day}`,
    endsEarlyTitle: (day: string) => `Sinu tehingud lõpevad ${day}`,
    incompleteBody: (month: string) =>
      `Kui osa kuu ${month} kuludest on puudu, paistavad su tavalised kulud väiksemad, kui need on, ja maksed tunduvad kergemini jõukohased.`,
    outdatedTitle: (month: string) => `Sinu tehingud lõpevad kuuga ${month}`,
    outdatedBody: "Hilisemaid kuid failis pole, nii et keskmised ei pruugi vastata sinu tänasele olukorrale.",
    noIncomeMonthsTitle: (months: string) => `Sissetulekuta kuud: ${months}`,
    noIncomeMonthsBody:
      "Neid kuid arvestatakse nullise sissetulekuga, mis vähendab keskmist. Kui sissetulek on failist puudu, kontrolli, et selle kategooriagrupp oleks Inflow.",
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
    incomplete:
      "Faili esimesest või viimasest kuust võib tehinguid puududa, nii et tulemus võib paista parem, kui see on.",
    tryAgain: "Proovi teisi tingimusi",
    backToMoney: "Tagasi sinu raha juurde",
  },
  explanation: {
    title: "Kuidas me selle arvutasime",
    close: "Sulge",
    intro: "Iga arv tuleb sinu tehingutest ja sisestatud ostust. Neli sammu:",
    marginTitle: "Sinu tavaline kuujääk",
    marginFormula: (income: string, spending: string) =>
      `${income} keskmine sissetulek − ${spending} tavalised kulud =`,
    marginNote: (count: number, from: string, to: string) =>
      `Kuu keskmised ${count} täiskuu põhjal, ${from} kuni ${to}.`,
    instalmentTitle: "Sinu kuumakse",
    financedFormula: (price: string, upfront: string) => `${price} hind − ${upfront} sissemakse =`,
    toSpread: "jagada maksete peale",
    toSpreadNoUpfront: "jagada maksete peale, sissemakseta",
    plusInterest: (interest: string) => `+ ${interest} intress`,
    plusFees: (fees: string, count: number, fee: string) => `+ ${fees} tasud (${count} × ${fee})`,
    aMonth: "kuus",
    lastDiffers: (last: string) => `Viimane makse on ${last}: see sisaldab sente, mis ei jagunenud võrdselt.`,
    rateNote: (percent: string) =>
      `Intress ${percent}% aastas on arvutatud võrdse kuumakse järgi, nagu järelmaksu pakkumistes tavaks.`,
    seasonalTitle: "Kuud, mis eelmisel korral läksid rohkem maksma",
    seasonalRule:
      "Iga maksekuu puhul vaatame sinu failist sama kuud kuni aasta tagasi. Kui kulutasid siis tavalisest rohkem, arvestame selle kuu puhul sellega. Odavam kuu ei muuda plaani kunagi paremaks.",
    spentIn: (month: string) => `Kulud: ${month}`,
    seasonalNone: (usual: string) =>
      `Ükski maksekuu ei läinud eelmisel korral tavalisest rohkem maksma, seega arvestame igas kuus sinu tavaliste kuludega ${usual}.`,
    seasonalOthers: (usual: string) => `Ülejäänud kuudel arvestame sinu tavaliste kuludega ${usual}.`,
    leftoverTitle: "Mis igas kuus üle jääb",
    leftoverFormula: "Keskmine sissetulek − selle kuu kulud − makse = jääb üle",
    leftoverExample: (month: string, income: string, spending: string, instalment: string) =>
      `${capital(month)}: ${income} − ${spending} − ${instalment} =`,
    criticalNote: "Selles kuus jääb kõige vähem üle, nii et see otsustab tulemuse.",
    fitsRange: (buffer: string) => `Üle jääb ${buffer} või rohkem`,
    tightRange: (from: string, to: string) => `Üle jääb ${from} kuni ${to}`,
    noFitRange: (zero: string) => `Üle jääb vähem kui ${zero}`,
    bufferNote: (buffer: string, percent: string) =>
      `${buffer} puhver on ${percent}% sinu keskmisest sissetulekust ettearvamatute kulude jaoks, nagu remont või arsti arve.`,
    limitsTitle: "Mida see ei tea",
    limitsBody:
      "Muutusi, mida pole veel juhtunud, nagu uus töö, üüri tõus või uus tellimus. Kui sinu sissetulek või kulud on muutumas, pea seda ligikaudseks juhiseks.",
  },
  unexpectedTitle: "Midagi läks valesti",
  unexpected: "Nende numbritega läks midagi valesti. Alusta uuesti ja proovi veel kord.",
} satisfies Messages;
