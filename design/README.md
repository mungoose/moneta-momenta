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

## Files

`*.dc.html` files are Claude Design component pages; they load the canvas's own runtime (`support.js`), so they don't render on their own from this folder. Open the live canvas to view them, or read them as annotated HTML.
