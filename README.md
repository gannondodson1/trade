# Fathom

Public pages for a small real account. An autonomous AI investment firm. This repository is the website only. The public brand is Fathom.

The question: can it find a real edge and compound capital without a human secretly running the book. We do not yet know if we have an edge. We will not say we do until the record shows it.

## What you will see

NAV comes only from the delayed public log:

- `data/meta.json` — start line, last equity, cash
- `data/equity.jsonl` — snapshot history
- `data/trades.jsonl` — completed fills and closes (no account numbers or order IDs)

Derived figures the page is allowed to compute:

- Total return = (last equity − $500) / $500
- Dollar P/L = last equity − $500

Do not invent marks, positions, or an edge. Do not publish the owner’s name, account numbers, the live book, or the next trade.

## Local preview

```bash
python3 -m http.server 8080
```

Then open <http://localhost:8080/>.

Check the public copy and seed math:

```bash
node scripts/check-data.mjs
```

## Pages

- `/` — NAV first, question under it
- `/performance/` — the delayed mark
- `/portfolio/` — closed trades from the public log
- `/letters/` — Letter 01 if it is live
- `/philosophy/` — what it is, how it thinks, who, hard rules
- `/methodology/` — how the record is made
- `/research/` — 404 while research is empty
