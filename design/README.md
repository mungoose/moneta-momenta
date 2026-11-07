# Design reference

The visual design for the app, exported from a Claude Design canvas: every screen at desktop (1280 px) and phone (390 px) width, plus a tokens board and a components board. Live canvas: https://claude.ai/artifact/TyN4YadR4T9f2rJa9gm5ii (this folder is the snapshot the app is built against).

## What to take from it

- **`moneta.css` is the source of truth** for colours (light and dark), type scale, spacing, radii and component styles. Map its `--mm-*` custom properties into the app's Tailwind theme rather than copying values by hand.
- **Screens** (`Landing`, `Summary`, `Purchase`, `Result`, `Calc` = "How we calculated this", `Error`) show layout, hierarchy and copy tone. The `-390` files only render the same screen at phone width; the narrow layout comes from the `@container mm (max-width: 600px)` rules in `moneta.css`.
- **`Main`** documents the tokens and their contrast ratios; **`Components`** shows each component's states.
- Status is never colour alone: each status pairs a distinct icon (circle + check, triangle + mark, octagon + cross) with a written label.

## Where the app's rules win over the mockups

The mockups use placeholder copy and numbers. Where they disagree with the code, the code is right:

- **Accepted file:** the landing hint mentions a bank CSV with Date, Amount and Description columns. The app accepts a transactions export with `Date`, `Payee`, `Category Group`, `Category`, `Outflow` and `Inflow`; bank statements are not supported.
- **"Tight" threshold:** the tokens board says "€0 to €199.99 left". The app uses a buffer of 10% of average income, so the boundary depends on the data.
- **Dark mode:** the canvas switches themes with an `mm-dark` class on each screen. In `moneta.css` the dark palette is under `@media (prefers-color-scheme: dark)` instead, so the app follows the system setting with no toggle (a toggle would have to remember the choice, and the app stores nothing). This is the one edit to the delivered file; the values are unchanged.
- **Upfront payment:** the components board's error says "Upfront can't be more than the price". The app also rejects an upfront equal to the price, because nothing would be left to spread, so the message should say it has to be less than the price.

## Not in the mockups: who the app is for

The app is strictly for small loans and instalment purchases (*väikelaenud*, *järelmaks*), up to 5 years. It isn't for mortgages or other long-term loans, which come with their own terms and limits. The mockups never say this, so add it in three places:

- **Landing:** one line under the lead paragraph, before the user picks sample data or an upload.
- **Purchase form:** a hint under the intro, above the price field.
- **README:** in the opening paragraph.

Suggested copy (Margus reviews the Estonian):

- en: "For small loans and instalment purchases of up to 5 years. Not for mortgages or other long-term loans."
- et: "Mõeldud väikelaenudele ja järelmaksule kuni 5 aastaks. Ei sobi kodulaenu ega muude pikaajaliste laenude jaoks."

## Files

`*.dc.html` files are Claude Design component pages; they load the canvas's own runtime (`support.js`), so they don't render on their own from this folder. Open the live canvas to view them, or read them as annotated HTML.
