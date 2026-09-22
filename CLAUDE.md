# Pansari

A point of sale for a Pakistani karyana (grocery) shop. React 19 + Vite +
TypeScript on the front, a zero-dependency Node HTTP server on the back, JSON
file on disk. It runs on one laptop behind the counter, offline, all day.

Sibling product to **Dawakhana**, the pharmacy till: same architecture and the
same standards, but a separate product with its own repo, its own data and its
own releases. A fix made in one does not reach the other by itself.

## Standing decisions

These came from the shop owner and hold until they say otherwise. Do not
relitigate them.

**Never bundle Node.** It is installed on the shop computer once, separately.
`npm run package` produces a ~270 KB zip and that is the only package we ship.
No `--with-node` flag, no downloader, no `runtime/` directory.

**Loose goods are first-class.** A karyana shop sells atta, rice, sugar, daal
and vegetables by weight, and that is most of what it sells. Quantities are
fractional, weighed items are priced per kilo or per litre, and anything that
touches a quantity has to hold up under both that and whole packets.

**Pakistan, not India.** Rupees (`Rs`, `PKR`), a single federal sales tax
back-calculated from tax-inclusive prices — never CGST/SGST. Tender types are
cash, card, digital (EasyPaisa / JazzCash / QR) and udhaar. Rates move with each
Finance Act, so the rate and the presets are configurable and default to 0%.

**A shop's own data is never invented.** A fresh install gets the starter
catalogue, priced, with one empty lot per item, and nothing else — no customers,
no bills, no takings. Shop identity fields (address, phone, NTN/STRN) start
blank and the receipt omits blanks rather than printing something made up. The
invented shop lives behind `npm run seed:demo` and never goes to a shop.

## The unit model, which is where the bodies are buried

`server/domain.mjs` owns it. `UNITS` says whether a unit is weighed, what the
+/- step is, and what the one-tap keys offer. Everything else reads from there.

Four rules that exist because breaking them caused real bugs:

1. **Round every quantity through `roundQty(qty, unit)`** — grams for weighed,
   whole numbers for counted. Repeatedly subtracting 0.1 from a sack otherwise
   drifts into `4.699999999999999`.
2. **Compare stock with `exceedsStock`, not `>`.** A customer asking for exactly
   the last 500 g must not be refused over floating-point dust.
3. **A blank expiry means no expiry, never an expired one.** Most grocery stock
   has no date at all. A plain `expiry >= today` reads `''` as older than today
   and hides every loose item in the shop — this shipped as a bug once already.
   `lotExpired()` in `src/lib/store.tsx` and `isExpired()` in `domain.mjs` are
   the only two places allowed to decide it.
4. **Batch number, expiry and MRP are all optional.** A sack has none of them.
   Requiring any one teaches the shopkeeper to type something untrue.

The **frontend keeps no copy of the unit table.** The server sends it in the
bootstrap payload and `src/lib/units.ts` installs it before anything renders.
Do not reintroduce a local copy — it would be free to drift from the table the
server validates against, and the symptom is a shop whose screen and whose
records disagree about how much daal it sold.

## Layout

```
server/     zero-dependency Node: index.mjs (routing, auth, static),
            api.mjs (routes), db.mjs (atomic JSON store), auth.mjs (users,
            sessions), backup.mjs, seed.mjs, domain.mjs (money, units, stock),
            domain.test.mjs
src/        React app — pages/, components/, lib/store.tsx, lib/units.ts
install/    setup + launcher per platform, icons
scripts/    package.mjs builds pansari-shop/ and the zip
```

## Working rules

- The server imports only `node:` built-ins. Keep it that way — it is why the
  shop needs no `node_modules`.
- Money is computed server-side on every path. A client never decides a bill.
- Roles are enforced route by route on the server, not just hidden in the UI.
  Staff cannot void, delete, see reports, edit prices or tax, or open Settings.
- Bills carry denormalised `soldBy`/`soldById` so history does not change when a
  user is renamed or removed.
- Anything touching the shop's data folder or a backup target must be
  time-boxed. An unplugged USB stick makes `fs` calls hang rather than fail, and
  a hung call freezes the till.
- Urdu names are a search aid, never printed on a bill. Have a native speaker
  read the catalogue before it reaches a shop.
- Never show a single total across mixed units. 0.75 kg of atta plus 2 packets
  of biscuits is not 2.75 of anything.

## Verifying

Reproduce before fixing, and prove the failure path, not just the happy one.

- `npm test` runs the unit, money and stock maths (`node:test`, no dependencies).
- `npm run build` typechecks and builds.
- `POS_DATA_DIR=<tmp> POS_AUTH=off PORT=<n> node server/index.mjs` runs a
  throwaway instance; use it rather than touching real data.
- Chromium for browser testing lives at `/opt/pw-browsers/`; PowerShell 7 is at
  `/opt/pwsh/pwsh` for checking the Windows setup script.
- `install/Pansari.vbs` cannot be executed here. Review it, say so plainly, and
  let the shop confirm on Windows.
