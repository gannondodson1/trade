# Open Book

Public tracker for a $500 experiment on a dedicated account. The trading bot owns the book and writes a public-safe log. This repository is the website only. The public brand is Open Book.

Live project site (after GitHub Pages is enabled):

<https://gannondodson1.github.io/trade/>

The site is a single static page. It fetches JSON and markdown from `data/` in the browser. There is no backend and no secrets.

## What you will see

Numbers come only from the public log:

- `data/meta.json` — start line, last equity, cash, last-update stamp
- `data/equity.jsonl` — snapshot history for the desk-only chart
- `data/trades.jsonl` — intents and fills (no account numbers or order IDs)
- `data/methodology.md` — how the desk tries to win
- `data/team.md` — named agents on the public page
- `data/thinking.md` — current hold / software-stop note
- `data/research.md` — waitlist and open-book social check (research, not orders)
- `data/changelog.md` — rule changes
- `data/spy.json` — official Yahoo Finance SPY daily bars only

Derived figures the page is allowed to compute:

- Total return = (last equity − $500) / $500
- Dollar P/L = last equity − $500
- Capital deployed = sum of filled notionals still open
- Realized P/L = $0 while there are no closes
- Open P/L = dollar P/L − realized
- Vs S&P 500 = desk total return % minus SPY % from the Aug 20 close (official daily print)

Do not invent intra-day SPY ticks. If a SPY comparison has no official source bar, omit it.

## Local preview

Serve the folder as a static site so `fetch()` can read `data/`:

```bash
python3 -m http.server 8080
```

Then open <http://localhost:8080/>.

Asset and data paths are relative, and also resolve when the site is hosted at the `/trade/` project-page base.

Check the seed math:

```bash
node scripts/check-data.mjs
```

## GitHub Pages

This is a **project** site. The public URL is `/trade/` on `gannondodson1.github.io`, not a user site at the domain root.

Publishing path:

1. Merge to `main`.
2. In the repo: **Settings → Pages**.
3. Set **Source** to **GitHub Actions**.
4. Run (or re-run) the **Deploy GitHub Pages** workflow in `.github/workflows/pages.yml`.

The workflow copies `index.html`, `404.html`, `favicon.svg`, `css/`, `js/`, and `data/` into a Pages artifact. It deploys from `main` only.

If the Pages source cannot be flipped from this PR (needs admin), leave it on GitHub Actions after merge. Do not point Pages at `/docs` unless you also move the site there.

### Custom domain later

The site is CNAME-ready: add a `CNAME` file at the repo root (and in the workflow `dist/` copy) with the hostname when you have one. Do not invent a domain. Until then the project URL stays `https://gannondodson1.github.io/trade/`.

After a custom domain is attached, keep the `/trade/` paths working on github.io or move to a user/org site — decide then. This README is the switch checklist, not a domain name.

## Updating the book

Replace files in `data/`. Do not hardcode the next P/L into `index.html`. Round share counts in the UI if needed; keep logged cost, stop, and target exact. Never publish account numbers, order IDs, credentials, raw prompts, or broker identifiers.
