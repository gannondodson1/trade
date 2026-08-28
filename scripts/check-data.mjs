import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(name) {
  return readFileSync(join(root, name), "utf8");
}

function jsonl(name) {
  return read(name)
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

const meta = JSON.parse(read("data/meta.json"));
const equity = jsonl("data/equity.jsonl");
const trades = jsonl("data/trades.jsonl");

const start = meta.start_equity;
const last = equity.at(-1);
const lastEquity = last.equity;
const dollar = lastEquity - start;
const totalReturn = (dollar / start) * 100;
const fills = trades.filter((t) => t.event === "fill" && t.side === "buy");
const closes = trades.filter((t) => t.event === "close" || (t.event === "fill" && t.side === "sell"));

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
  ["equity rows", equity.length, 7],
  ["trade rows", trades.length, 9],
  ["fills", fills.length, 3],
  ["closes", closes.length, 3],
  ["last equity", lastEquity, 432.17],
  ["meta last equity", meta.last_equity, 432.17],
  ["cash", last.cash, 432.17],
  ["dollar P/L", Number(dollar.toFixed(2)), -67.83],
  ["total return %", Number(totalReturn.toFixed(1)), -13.6],
  ["closed trades", meta.closed_trades, 3],
  ["open positions", meta.open_positions, 0],
  ["meta has no invented marks", meta.marks == null, true],
  ["RKLB fill qty", fillPrices.RKLB.qty, 2.46171],
  ["RKLB fill price", fillPrices.RKLB.price, 73.12],
  ["CRWV fill qty", fillPrices.CRWV.qty, 2.03892],
  ["CRWV fill price", fillPrices.CRWV.price, 88.28],
  ["SMCI fill qty", fillPrices.SMCI.qty, 1],
  ["SMCI fill price", fillPrices.SMCI.price, 1.28],
  [
    "rklb close",
    closes.some((t) => t.symbol === "RKLB" && t.event === "close" && t.fill === 69.79 && t.pnl_usd === -8.2),
    true,
  ],
  [
    "smci close",
    closes.some((t) => t.symbol === "SMCI" && t.event === "close" && t.fill === 0.76 && t.pnl_usd === -52),
    true,
  ],
  [
    "crwv close",
    closes.some((t) => t.symbol === "CRWV" && t.event === "close" && t.fill === 84.5878 && t.pnl_usd === -7.53),
    true,
  ],
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

const publicFiles = [
  "index.html",
  "404.html",
  "performance/index.html",
  "portfolio/index.html",
  "letters/index.html",
  "philosophy/index.html",
  "methodology/index.html",
  "js/site.js",
  "css/site.css",
  "data/team.md",
  "data/methodology.md",
  "README.md",
];

const publicText = publicFiles.map((file) => read(file)).join("\n");
const home = read("index.html");
const philosophy = read("philosophy/index.html");
const letters = read("letters/index.html");
const css = read("css/site.css");

const copyChecks = [
  ["no research page", existsSync(join(root, "research/index.html")) || existsSync(join(root, "research.html")), false],
  ["NAV first on home", home.indexOf("$432.17") < home.indexOf("Can it find a real edge"), true],
  ["question under NAV", home.includes("Can it find a real edge and compound capital without a human secretly running the book."), true],
  ["no claimed edge", /we have an edge(?!\. We will not)/i.test(home) === false && home.includes("We do not yet know if we have an edge."), true],
  ["small real account", home.includes("A small real account. An autonomous AI investment firm."), true],
  ["letter 01 live", letters.includes("Cash is a position") && letters.includes("The $500 experiment marked $432.17."), true],
  ["letters not marketing", letters.includes("Morgan writes when there is something worth saying. Not marketing."), true],
  ["who morgan parker nico", philosophy.includes("Morgan decides.") && philosophy.includes("Parker researches.") && philosophy.includes("Nico builds the machine."), true],
  ["software holds rules", philosophy.includes("Software holds the hard rules."), true],
  ["risk 5 percent", philosophy.includes("intended loss at most 5% of the account."), true],
  ["risk 7.5 percent", philosophy.includes("at most 7.5%, written down before the trade."), true],
  ["risk 60 percent", philosophy.includes("One company: at most 60%."), true],
  ["risk 10 day", philosophy.includes("down 10% on the day, no new risk."), true],
  ["drawdown 12 20 30", philosophy.includes("12% we slow down") && philosophy.includes("20% new risk shrinks") && philosophy.includes("30% we stop new risk"), true],
  ["no naked options", philosophy.includes("No naked unlimited loss. No borrowed money."), true],
  ["no add to loser", philosophy.includes("We do not add to a loser to rescue a story."), true],
  ["paper look", css.includes("--paper: #eadfc9") && css.includes("--ink: #14110d") && css.includes("--rust: #b83218"), true],
  ["no two-dot chart", !home.includes("S&P 500") && !read("js/site.js").includes("spy"), true],
  ["no desk stamp", !home.includes("Last public note") && !home.includes("firm-status"), true],
  ["no decision feed", !home.includes("Decision feed") && !home.includes('id="feed"'), true],
  ["no scoreboard desk", !home.includes("Scoreboard") && !home.includes("The firm"), true],
  ["portfolio cash", read("portfolio/index.html").includes("No open positions. The book is in cash."), true],
  ["no research names", read("data/research.md").includes("No public research names."), true],
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
  "Cole",
  "Riley",
  "Victor",
  "Alex",
  "Jules",
  "Sloane",
  "Remy",
  "hedge fund",
  "Hedge fund",
  "hedge-fund",
  "asymmetric returns",
  "beat the market",
  "Decision feed",
  "alpha",
  "Gannon",
  "Dodson",
  "Open Book",
  "The Desk",
];

const oldRisk = [
  /\$15\/3%/,
  /3% daily/,
  /max 40%/,
  /at most 40%/,
  /8-12-18/,
  /8% drawdown halt/,
  /Daily loss halt/,
];

for (const file of publicFiles) {
  const text = read(file);
  for (const word of banned) {
    if (text.includes(word)) {
      failed += 1;
      console.error(`FAIL banned term "${word}" in ${file}`);
    }
  }
  for (const pattern of oldRisk) {
    if (pattern.test(text)) {
      failed += 1;
      console.error(`FAIL old risk language ${pattern} in ${file}`);
    }
  }
}

if (publicText.includes("we have an edge.") && !publicText.includes("We do not yet know if we have an edge.")) {
  failed += 1;
  console.error("FAIL claimed edge without the refusal");
}

if (failed) {
  process.exit(1);
}
console.log("all public copy checks passed");
