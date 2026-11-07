#!/usr/bin/env python3
"""Generate fully synthetic YNAB-style TSV exports (12 months, Nov 2025 - Oct 2026).

Format mirrors a real YNAB export: UTF-8, tab separated, CRLF, quoted text
fields, unquoted decimal-comma amounts, DD/MM/YYYY dates, newest first.
All names and amounts are invented. Seeded, so output is reproducible.

The date range and output folder are arguments, so the same households can
be written as upload test files whose export starts or ends mid-month:

    python3 generate_ynab_sample.py --end 2026-10-12 --out-dir /tmp/out
"""
import argparse
import random
from datetime import date, timedelta
from pathlib import Path

START, END = date(2025, 11, 1), date(2026, 10, 31)
CLEARED_AFTER = date(2026, 10, 20)
OUT_DIR = Path.home() / "Desktop"
HEADER = ["Account", "Flag", "Date", "Payee", "Category Group/Category",
          "Category Group", "Category", "Memo", "Outflow", "Inflow", "Cleared"]

INFLOW = ("Inflow", "Ready to Assign")
GROCERY = ("Söök/jook", "Toidupood")
READY = ("Söök/jook", "Valmistoit")
CAFE = ("Söök/jook", "Söök")
FUEL = ("Auto", "Kütus")
CARCARE = ("Auto", "Hooldus, pesu, tarvikud")
TAXI = ("Auto", "Takso, ühistransport, tõuks")
CARINS = ("Auto", "Kindlustused")
LEASE = ("Auto", "Liising")
INSPECT = ("Auto", "Tehnoülevaatus")
SPORT = ("Olme ja meelelahutuskulud", "Sport")
GIFTS = ("Olme ja meelelahutuskulud", "Kingitused")
CLOTHES = ("Olme ja meelelahutuskulud", "Riided")
MORTGAGE = ("Kodu", "Kodulaen")
HOA = ("Kodu", "KÜ raha")
POWER = ("Kodu", "Elektri võrguteenus")
WATER = ("Kodu", "Vesi")
HOMEGOODS = ("Kodu", "Kodutarbed")
INTERNET = ("Kommunikatsioon", "Internet")
MOBILE = ("Kommunikatsioon", "Mobiil")
APPS = ("Kommunikatsioon", "Rakendused")
PHARMACY = ("Tervis", "Apteek")
DOCTOR = ("Tervis", "Arst/hambaarst")
KIDSPORT = ("Lapsed", "Laste trennid")
KINDERGARTEN = ("Lapsed", "Lasteaia kulud")
KIDSTUFF = ("Lapsed", "Laste riided ja tarvikud")
LODGING = ("Puhkus", "Majutus")
TRAVEL = ("Puhkus", "Reisimine")

PROFILES = {
    "comfortable": dict(seed=11, salary=2460, bonus=700, refund=340, mortgage=480,
                        lease=0, var_scale=1.0, lodging=520, travel=300),
    "tight": dict(seed=22, salary=2095, bonus=0, refund=180, mortgage=520,
                  lease=215, var_scale=0.95, lodging=280, travel=140),
}


EN = {
    "Söök/jook": "Food & Drink", "Toidupood": "Groceries", "Valmistoit": "Takeaway",
    "Söök": "Cafes", "Auto": "Car", "Kütus": "Fuel", "Hooldus, pesu, tarvikud": "Maintenance & supplies",
    "Takso, ühistransport, tõuks": "Taxi & public transport", "Kindlustused": "Insurance",
    "Liising": "Leasing", "Tehnoülevaatus": "Inspection",
    "Olme ja meelelahutuskulud": "Lifestyle", "Sport": "Sports", "Kingitused": "Gifts",
    "Riided": "Clothing", "Kodu": "Home", "Kodulaen": "Mortgage", "KÜ raha": "Building fee",
    "Elektri võrguteenus": "Electricity", "Vesi": "Water", "Kodutarbed": "Household goods",
    "Kommunikatsioon": "Communication", "Mobiil": "Mobile", "Rakendused": "Apps & subscriptions",
    "Tervis": "Health", "Apteek": "Pharmacy", "Arst/hambaarst": "Doctor & dentist",
    "Lapsed": "Kids", "Laste trennid": "Kids' activities", "Lasteaia kulud": "Kindergarten",
    "Laste riided ja tarvikud": "Kids' clothes & supplies", "Puhkus": "Holidays",
    "Majutus": "Accommodation", "Reisimine": "Travel",
    "Näidis Tööandja OÜ": "Your Employer Ltd", "Sotsiaalkindlustusamet": "Child Benefit Agency",
    "Maksu- ja Tolliamet": "Tax Authority", "Näidis Tee 1 KÜ": "Sample Street 1 Housing Assoc.",
    "Sõbralik Elekter AS": "Friendly Power Ltd", "Random Vesi": "Random Water",
    "Internet OÜ": "Internet Ltd", "Mobile service": "Mobile service",
    "Insurance AS": "Insurance Co", "Spordiklubi Random Veeklubi": "Random Swim Club",
    "Streaming Service": "Streaming Service", "Lasteaed Näidis": "Sample Kindergarten",
    "Liising AS": "Leasing Co", "SEB Pank": "Mortgage Bank",
    "Sõidukite Ülevaatus AS": "Vehicle Inspection Ltd", "Hambaravi OÜ": "Dental Clinic",
    "Laevaliinid AS": "Ferry Lines", "Booking Majutus": "Booking Accommodation",
    "Kaubamaja": "Department Store", "Rahva Raamat": "Bookshop", "Kingipood": "Gift Shop",
    "Coop Konsum": "Local Market", "Klaasipesuvedelik": "Washer fluid", "Teater": "Theatre",
    "Hoia Ruum": "Home Store", "Ehituse ABC": "Hardware Store",
}


def fmt_money(cents, sep=","):
    return f"{cents // 100}{sep}{cents % 100:02d}"


def generate(p, start=START, end=END):
    rng = random.Random(p["seed"])
    rows = []
    card_pending = 0

    def add(account, d, payee, cat, out=0, inc=0, memo=""):
        cleared = "Cleared" if d > CLEARED_AFTER else "Reconciled"
        group, category = cat if cat else ("", "")
        gc = f"{group}: {category}" if cat else ""
        rows.append([account, "", d, payee, gc, group, category, memo, out, inc, cleared])

    def spend(d, payee, cat, amount, memo="", card_ok=True):
        nonlocal card_pending
        cents = round(amount * p["var_scale"] * 100)
        if card_ok and rng.random() < 0.3:
            card_pending += cents
            add("SEB Credit", d, payee, cat, out=cents, memo=memo)
        else:
            add("SEB", d, payee, cat, out=cents, memo=memo)

    def amt(lo, hi):
        return lo + (hi - lo) * rng.betavariate(2, 3)

    def fixed(d, payee, cat, euros):
        add("SEB", d, payee, cat, out=round(euros * 100))

    d = start
    while d <= end:
        m, day = d.month, d.day

        if day == 3:
            net = p["salary"] + rng.uniform(-12, 12)
            add("SEB", d, "Näidis Tööandja OÜ", INFLOW, inc=round(net * 100))
        if day == 4:
            fixed(d, "Näidis Tee 1 KÜ", HOA, 50)
            power = {12: 92, 1: 98, 2: 88, 3: 70, 11: 75}.get(m, 38)
            fixed(d, "Sõbralik Elekter AS", POWER, round(power * rng.uniform(0.92, 1.08), 2))
            fixed(d, "Random Vesi", WATER, round(rng.uniform(30, 38), 2))
            fixed(d, "Internet OÜ", INTERNET, 31)
            fixed(d, "Mobile service", MOBILE, 14.24)
            fixed(d, "Insurance AS", CARINS, 38.5)
            fixed(d, "Spordiklubi Random Veeklubi", KIDSPORT, 75)
            fixed(d, "Spordiklubi Random Veeklubi", KIDSPORT, 50)
            fixed(d, "FitnessCenter", SPORT, 39)
            fixed(d, "Streaming Service", APPS, 13.99)
            fixed(d, "Cloud Storage", APPS, 2.99)
        if day == 5:
            fixed(d, "SEB Pank", MORTGAGE, p["mortgage"])
        if day == 10:
            fixed(d, "Lasteaed Näidis", KINDERGARTEN, 90)
            add("SEB", d, "Sotsiaalkindlustusamet", INFLOW, inc=8000)
        if day == 15 and p["lease"]:
            fixed(d, "Liising AS", LEASE, p["lease"])

        if m == 12 and day == 18 and p["bonus"]:
            add("SEB", d, "Näidis Tööandja OÜ", INFLOW, inc=round(p["bonus"] * 100))
        if m == 3 and day == 12:
            fixed(d, "Sõidukite Ülevaatus AS", INSPECT, 36)
        if m == 4 and day == 18:
            add("SEB", d, "Maksu- ja Tolliamet", INFLOW, inc=round(p["refund"] * 100))
        if m == 6 and day == 14:
            spend(d, "Hambaravi OÜ", DOCTOR, rng.uniform(85, 130), card_ok=False)
        if m == 9 and day == 5:
            spend(d, "Kids Store", KIDSTUFF, rng.uniform(95, 125))
        if m == 7 and day == 6:
            spend(d, "Laevaliinid AS", TRAVEL, p["travel"], card_ok=False)
        if m == 7 and day == 8:
            spend(d, "Booking Majutus", LODGING, p["lodging"], card_ok=False)
        if m == 12 and 5 <= day <= 23 and rng.random() < 0.3:
            spend(d, rng.choice(["Kaubamaja", "Rahva Raamat", "Toyshop", "Kingipood"]),
                  GIFTS, amt(15, 70))
        if m == 12 and day in (22, 23):
            spend(d, rng.choice(["Rimi", "Selver"]), GROCERY, amt(80, 150))

        if rng.random() < 0.36:
            store = rng.choice(["Rimi", "Selver", "Maxima X", "Coop Konsum"])
            total = amt(8, 95)
            if rng.random() < 0.1:
                first = round(total * rng.uniform(0.6, 0.75), 2)
                spend(d, store, GROCERY, first, memo="Split (1/2) ", card_ok=False)
                spend(d, store, HOMEGOODS, total - first, memo="Split (2/2) ", card_ok=False)
            else:
                spend(d, store, GROCERY, total)
        if rng.random() < 0.085:
            spend(d, rng.choice(["Circle K", "Olerex", "Neste"]), FUEL, amt(45, 90))
        if rng.random() < 0.01:
            spend(d, "Circle K", CARCARE, amt(5, 12), memo="Klaasipesuvedelik")
        if rng.random() < 0.12:
            spend(d, rng.choice(["Burger Joint", "Sushi Place", "Pizza Corner"]), READY, amt(7, 32))
        if rng.random() < 0.1:
            spend(d, rng.choice(["Delice", "Coffee Corner", "Bakery"]), CAFE, amt(3, 9))
        if rng.random() < 0.06:
            spend(d, rng.choice(["Bolt", "Rent a car or scooter"]), TAXI, amt(2.5, 12))
        if rng.random() < 0.05:
            spend(d, rng.choice(["Apotheka", "Benu Apteek"]), PHARMACY, amt(6, 35))
        if rng.random() < 0.025:
            spend(d, rng.choice(["H&M", "Zara", "Sportland", "Lindex"]), CLOTHES, amt(20, 90))
        if rng.random() < 0.04:
            spend(d, "Kids Store", KIDSTUFF, amt(8, 40))
        if rng.random() < 0.04:
            spend(d, rng.choice(["Ehituse ABC", "Jysk", "Hoia Ruum"]), HOMEGOODS, amt(8, 45))
        if rng.random() < 0.03:
            spend(d, "Cash", KINDERGARTEN, amt(5, 30), memo="Teater", card_ok=False)

        if day == 28 and card_pending:
            add("SEB", d, "Transfer : SEB Credit", None, out=card_pending)
            add("SEB Credit", d, "Transfer : SEB", None, inc=card_pending)
            card_pending = 0

        d += timedelta(days=1)

    rows.sort(key=lambda r: r[2], reverse=True)
    return rows


def write_tsv(rows, path, english=False):
    def q(s):
        return f'"{s}"'
    tr = (lambda x: EN.get(x, x)) if english else (lambda x: x)
    sep = "." if english else ","
    lines = ["\t".join(q(h) for h in HEADER)]
    for a, flag, d, payee, gc, group, cat, memo, out, inc, cleared in rows:
        group, cat = tr(group), tr(cat)
        gc = gc if group == "Inflow" or not gc else f"{group}: {cat}"
        lines.append("\t".join([q(a), q(flag), q(d.strftime("%d/%m/%Y")), q(tr(payee)), q(gc),
                                q(group), q(cat), q(tr(memo)), fmt_money(out, sep),
                                fmt_money(inc, sep), q(cleared)]))
    path.write_bytes("\r\n".join(lines).encode("utf-8"))


def summarise(name, rows, start=START, end=END):
    print(f"\n{name}: {len(rows)} rows")
    print("month    income  expenses  surplus")
    surplus_total = 0
    months = 0
    y, m = start.year, start.month
    while (y, m) <= (end.year, end.month):
        inc = sum(r[9] for r in rows if (r[2].year, r[2].month) == (y, m) and r[4] == "Inflow: Ready to Assign")
        exp = sum(r[8] for r in rows if (r[2].year, r[2].month) == (y, m) and r[4] != "")
        surplus_total += inc - exp
        months += 1
        print(f"{y}-{m:02d} {inc/100:8.0f} {exp/100:9.0f} {(inc-exp)/100:8.0f}")
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    print(f"average monthly surplus: {surplus_total / months / 100:.0f}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--start", type=date.fromisoformat, default=START, help="first day, YYYY-MM-DD")
    parser.add_argument("--end", type=date.fromisoformat, default=END, help="last day, YYYY-MM-DD")
    parser.add_argument("--out-dir", type=Path, default=OUT_DIR, help="folder to write the files to")
    args = parser.parse_args()
    for name, params in PROFILES.items():
        data = generate(params, args.start, args.end)
        write_tsv(data, args.out_dir / f"ynab_sample_{name}.tsv")
        write_tsv(data, args.out_dir / f"ynab_sample_en_{name}.tsv", english=True)
        summarise(name, data, args.start, args.end)
