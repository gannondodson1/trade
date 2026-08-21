import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(name) {
  return readFileSync(join(root, "data", name), "utf8");
}

function jsonl(name) {
  return read(name)
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

const meta = JSON.parse(read("meta.json"));
const equity = jsonl("equity.jsonl");
const trades = jsonl("trades.jsonl");

const start = meta.start_equity;
const last = equity.at(-1);
const lastEquity = last.equity;
const dollar = lastEquity - start;
const totalReturn = (dollar / start) * 100;
const fills = trades.filter((t) => t.event === "fill" && t.side === "buy");
const closes = trades.filter((t) => t.event === "close" || (t.event === "fill" && t.side === "sell"));
const deployed = fills.reduce((sum, t) => sum + Number(t.notional), 0);

const checks = [
  ["equity rows", equity.length, 6],
  ["trade rows", trades.length, 6],
  ["fills", fills.length, 3],
  ["closes", closes.length, 0],
  ["last equity", lastEquity, 505.4],
  ["meta last equity", meta.last_equity, 505.4],
  ["cash", last.cash, 11.96],
  ["dollar P/L", Number(dollar.toFixed(2)), 5.4],
  ["total return %", Number(totalReturn.toFixed(2)), 1.08],
  ["capital deployed", deployed, 488],
  ["closed trades", meta.closed_trades, 0],
  ["updated stamp", meta.updated_et, "Aug 21, 2026, 3:46 PM ET"],
];

let failed = 0;
for (const [name, got, want] of checks) {
  const ok = Object.is(got, want) || got === want;
  if (!ok) {
    failed += 1;
    console.error(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  } else {
    console.log(`ok   ${name}: ${JSON.stringify(got)}`);
  }
}

const banned = ["Tradey", "Claudey", "farzad.money", "Tradey proposes"];
for (const file of [
  "index.html",
  "js/site.js",
  "README.md",
  "data/methodology.md",
  "data/thinking.md",
  "data/changelog.md",
]) {
  const text = readFileSync(join(root, file), "utf8");
  for (const word of banned) {
    if (text.includes(word)) {
      failed += 1;
      console.error(`FAIL banned term "${word}" in ${file}`);
    }
  }
}

if (failed) {
  process.exit(1);
}
console.log("all data checks passed");
