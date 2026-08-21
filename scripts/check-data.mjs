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
const spy = JSON.parse(read("spy.json"));
const spyClosePct = Number(spy.bars[0].change_pct);
const vsSpy = Number((Number(totalReturn.toFixed(2)) - spyClosePct).toFixed(2));
const spyOpenPct = Number(((spy.bars[0].open / spy.baseline.close - 1) * 100).toFixed(4));

const NUM = String.raw`\d+(?:\.\d+)?`;
function parseFillNote(note) {
  const share = new RegExp(`Filled\\s+(${NUM})\\s+shares\\s+at\\s+\\$?(${NUM})`, "i").exec(note || "");
  if (share) return { qty: Number(share[1]), price: Number(share[2]) };
  const call = new RegExp(`Filled\\s+(${NUM})\\s+contract[s]?\\s+at\\s+\\$?(${NUM})`, "i").exec(note || "");
  if (call) return { qty: Number(call[1]), price: Number(call[2]) };
  return null;
}

const fillPrices = {
  RKLB: parseFillNote(fills.find((t) => t.symbol === "RKLB").note),
  CRWV: parseFillNote(fills.find((t) => t.symbol === "CRWV").note),
  SMCI: parseFillNote(fills.find((t) => t.symbol === "SMCI").note),
};

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
  ["updated stamp", meta.updated_et, "Aug 21, 2026, 5:49 PM ET"],
  ["meta has no invented marks", meta.marks == null, true],
  ["SPY prior close", spy.baseline.close, 762.6],
  ["SPY Aug 21 close", spy.bars[0].close, 765.72],
  ["SPY official change %", spyClosePct, 0.41],
  ["SPY open % from prior close", spyOpenPct, 0.4524],
  ["vs S&P 500 (1.08 - 0.41)", vsSpy, 0.67],
  ["SPY source note", spy.source, "Yahoo Finance SPY daily, retrieved Aug 21, 2026."],
  ["RKLB fill qty", fillPrices.RKLB.qty, 2.46171],
  ["RKLB fill price", fillPrices.RKLB.price, 73.12],
  ["CRWV fill qty", fillPrices.CRWV.qty, 2.03892],
  ["CRWV fill price", fillPrices.CRWV.price, 88.28],
  ["SMCI fill qty", fillPrices.SMCI.qty, 1],
  ["SMCI fill price", fillPrices.SMCI.price, 1.28],
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

const methodology = read("methodology.md");
const changelog = read("changelog.md");
const thinking = read("thinking.md");
const rklbThesis = fills.find((t) => t.symbol === "RKLB").thesis;
const copyChecks = [
  ["methodology how it picks", methodology.includes("## How it picks"), true],
  ["methodology social-arb math limit", methodology.includes("A social-arb idea still has to clear the same math"), true],
  ["changelog loop item is original", changelog.includes("15-minute regular-hours checks, software stops"), true],
  ["changelog research feed item", changelog.includes("Two-lens desk + Research feed"), true],
  ["changelog loop heading", changelog.includes("15-minute loop"), true],
  ["changelog name-off item", changelog.includes("Name off the public page"), true],
  [
    "changelog heading count",
    changelog.split(/^## /m).filter((c) => c.trim() && !c.trim().startsWith("#")).length,
    6,
  ],
  ["thinking after close", thinking.includes("5:49 PM ET (after close)"), true],
  ["thinking Monday triggers", thinking.includes("What would make it do something Monday"), true],
  ["thinking Friday close", thinking.includes("$72.57"), true],
  ["thinking social-arb waitlist", thinking.includes("ELF first"), true],
  ["thinking open-book social check", thinking.includes("Open-book social check"), true],
  ["thinking does not invent option mark", thinking.includes("134") === false, true],
  ["logged RKLB thesis unchanged", rklbThesis.includes("$123M to $234M"), true],
  ["disclaimer in hero", readFileSync(join(root, "index.html"), "utf8").includes("not a recommendation to buy or sell"), true],
  ["disclaimer in footer", readFileSync(join(root, "index.html"), "utf8").includes("Not trading advice. This site is Gannon"), true],
  ["disclaimer rail", readFileSync(join(root, "index.html"), "utf8").includes("Personal $500 log"), true],
  ["page title retitled", readFileSync(join(root, "index.html"), "utf8").includes("<title>Gannon’s Agentic Trader</title>"), true],
  ["wordmark AGENTIC", readFileSync(join(root, "index.html"), "utf8").includes("AGENTIC"), true],
];
for (const [name, got, want] of copyChecks) {
  if (got !== want) {
    failed += 1;
    console.error(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  } else {
    console.log(`ok   ${name}: ${JSON.stringify(got)}`);
  }
}

const banned = [
  "Tradey",
  "Claudey",
  "farzad.money",
  "Tradey proposes",
  "Gannon’s public desk",
  "Gannon's public desk",
  "Chris Camillo",
  "Camillo",
  "Camillo-style",
  "Doctrine",
  "the department is the book",
  "two lenses, one decision",
  "does not grade its own homework",
];
for (const file of [
  "index.html",
  "js/site.js",
  "404.html",
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
