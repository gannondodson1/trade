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
  ["sell intents pending", trades.filter((t) => t.event === "intent" && t.side === "sell").length, 0],
  ["no sell fills", trades.filter((t) => t.event === "fill" && t.side === "sell").length, 0],
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
const research = read("research.md");
const team = read("team.md");
const page = readFileSync(join(root, "index.html"), "utf8");
const rklbThesis = fills.find((t) => t.symbol === "RKLB").thesis;
const teamNames = [
  "Morgan",
  "Alex",
  "Parker",
  "Jules",
  "Sloane",
  "Remy",
  "Victor",
  "Riley",
  "Cole",
  "Nico",
];
const pipeline = JSON.parse(read("pipeline.json"));
const copyChecks = [
  ["methodology mission", methodology.includes("Mission: To test how far autonomous AI can take a real portfolio"), true],
  ["methodology philosophy", methodology.includes("Philosophy: Seek asymmetric returns."), true],
  ["methodology beat the market", methodology.includes("whether it can beat the market"), true],
  ["methodology two lenses inputs", methodology.includes("They are inputs. They are not the org chart."), true],
  ["methodology morgan operates", methodology.includes("Morgan operates the firm."), true],
  ["methodology cole only order", methodology.includes("Cole executes. That is the only order."), true],
  ["methodology riley three calls", methodology.includes("PASS, SIZE DOWN, or HARD NO"), true],
  ["methodology cadence 8:30", methodology.includes("8:30 ET"), true],
  ["methodology no 7:45", methodology.includes("7:45"), false],
  ["methodology ugly news", methodology.includes("only ugly news interrupts"), true],
  ["methodology no max 200", /\$200/.test(methodology), false],
  ["methodology no daily 15", /\$15/.test(methodology), false],
  ["methodology no drawdown 8", methodology.includes("8%"), false],
  ["methodology risk book internal", methodology.includes("The risk book is internal."), true],
  ["page method mission", page.includes("Mission: To test how far autonomous AI can take a real portfolio"), true],
  ["page method philosophy", page.includes("Philosophy: Seek asymmetric returns."), true],
  ["page method has 8:30", page.includes("8:30 ET"), true],
  ["page method has no 7:45", page.includes("7:45"), false],
  ["page method morgan operates", page.includes("Morgan operates the firm."), true],
  ["page method riley calls", page.includes("PASS, SIZE DOWN, or HARD"), true],
  ["changelog loop item is original", changelog.includes("15-minute regular-hours checks, software stops"), true],
  ["changelog research feed item", changelog.includes("Two-lens desk + Research feed"), true],
  ["changelog loop heading", changelog.includes("15-minute loop"), true],
  ["changelog name-off item", changelog.includes("Name off the public page"), true],
  ["changelog named team item", changelog.includes("Named team + COS"), true],
  ["changelog philosophy item", changelog.includes("Philosophy updated"), true],
  ["changelog fathom item", changelog.includes("The company is Fathom."), true],
  ["changelog no extra risk warning", changelog.includes("Risk warning on the live book"), false],
  ["changelog no hard-risk book", changelog.includes("hard-risk") || changelog.includes("Daily Brief"), false],
  ["changelog ends after Fathom", changelog.includes("The company is Fathom."), true],
  ["changelog no Aug 22 kill cards", /Aug 22, 2026/.test(changelog), false],
  ["changelog no monday flatten", changelog.includes("Monday flatten") || changelog.includes("queued"), false],
  [
    "changelog heading count",
    changelog.split(/^## /m).filter((c) => c.trim() && !c.trim().startsWith("#")).length,
    9,
  ],
  ["team all ten names", teamNames.every((name) => team.includes(`- ${name} -`)), true],
  ["team has no Dana", team.includes("Dana"), false],
  ["team has no Tate", team.includes("Tate"), false],
  ["team closer", team.includes("Morgan operates. Cole executes. Riley binds risk."), true],
  ["team morgan operator", team.includes("COS / operator"), true],
  ["team riley binds", team.includes("Binds risk"), true],
  ["scoreboard section", page.includes('id="scoreboard"') && page.includes("Scoreboard"), true],
  ["firm section", page.includes('id="firm"') && page.includes("The firm"), true],
  ["decision section", page.includes('id="decision"') && page.includes("Decision feed"), true],
  ["journal section", page.includes('id="journal"') && page.includes("Experiment journal"), true],
  ["portfolio section", page.includes('id="portfolio"') && page.includes("Portfolio"), true],
  ["track record section", page.includes('id="record"') && page.includes("Track record"), true],
  ["method section", page.includes('id="method"') && page.includes("How it works"), true],
  ["old 01 numbers ia gone", page.includes("01 Numbers") || page.includes("NUMBERS"), false],
  ["old 08 what changed ia gone", page.includes("08 What changed") || page.includes("WHAT CHANGED"), false],
  [
    "pipeline public stages",
    JSON.stringify(pipeline.flow) ===
      JSON.stringify([
        "Discovery",
        "Research",
        "High Conviction",
        "Red Team",
        "Risk",
        "Trade Ready",
      ]),
    true,
  ],
  ["pipeline has no idea names", !["ELF", "DKNG", "SOFI"].some((n) => JSON.stringify(pipeline).includes(n)), true],
  ["pipeline rklb delayed open", JSON.stringify(pipeline.owned).includes('"name":"RKLB","state":"delayed open"'), true],
  ["pipeline smci delayed open", JSON.stringify(pipeline.owned).includes('"name":"SMCI Sep 4 40 call","state":"delayed open"'), true],
  ["pipeline crwv delayed open", JSON.stringify(pipeline.owned).includes('"name":"CRWV","state":"delayed open"'), true],
  ["pipeline rejected empty", Array.isArray(pipeline.rejected) && pipeline.rejected.length === 0, true],
  ["pipeline no monday queued", /monday|queued|flatten|hold to/i.test(JSON.stringify(pipeline)), false],
  ["holdings not three unchanged holds", page.includes("The three names we still hold"), false],
  ["holdings delayed opens", page.includes("Three delayed opens: RKLB, SMCI Sep 4 40 call, CRWV."), true],
  ["page no monday flatten", /Monday|queued flatten|queued close/i.test(page), false],
  ["page no live stop math", /69\.50|35\.50|83\.70/.test(page), false],
  ["thinking no owner-brief", thinking.includes("hard-risk") || thinking.includes("Daily Brief"), false],
  ["thinking delayed stamp", thinking.includes("Updated: Aug 22, 2026 (delayed)"), true],
  ["thinking delayed opens", thinking.includes("All three are delayed opens from Aug 21."), true],
  ["thinking no monday flatten", /Monday|FLATTEN|queued|HOLD CRWV/.test(thinking), false],
  ["thinking no live stop math", /69\.50|35\.50|83\.70/.test(thinking), false],
  ["thinking no live friday rklb mark", thinking.includes("~72.57") || thinking.includes("$72.57"), false],
  ["thinking no live friday smci mark", thinking.includes("~37.24") || thinking.includes("~1.30"), false],
  ["research no public names", research.includes("No public research names."), true],
  ["research no waitlist names", /ELF|DKNG|SOFI|UBER|PATH|IONQ|ZETA|HOOD|ULTA|SONY|CMCSA/.test(research), false],
  ["open research chapter gone", page.includes("OPEN RESEARCH"), false],
  ["holdings has no waitlist wall", page.includes('id="waitlist"'), false],
  ["thinking does not invent option mark", thinking.includes("134") === false, true],
  ["logged RKLB thesis unchanged", rklbThesis.includes("$123M to $234M"), true],
  ["disclaimer in hero", readFileSync(join(root, "index.html"), "utf8").includes("not a recommendation to buy or sell"), true],
  ["disclaimer in footer", page.includes("Not trading advice. This site is a public log"), true],
  ["fathom mark", page.includes('class="fathom"'), true],
  ["fathom lockup", page.includes('class="lockup"') && page.includes("Fathom"), true],
  ["no human owner name", !page.includes("Gannon") && !page.includes("Dodson"), true],
  ["disclaimer rail", readFileSync(join(root, "index.html"), "utf8").includes("Personal $500 log"), true],
  ["page title is Fathom", page.includes("<title>Fathom</title>"), true],
  ["wordmark is Fathom", page.includes('<h1 class="wordmark">Fathom</h1>'), true],
  ["footer is Fathom", page.includes('<p class="foot__brand">Fathom</p>'), true],
  ["no Open Book brand", !page.includes("Open Book"), true],
  [
    "signed P/L colors exist",
    readFileSync(join(root, "css/site.css"), "utf8").includes("--up:") &&
      readFileSync(join(root, "css/site.css"), "utf8").includes("--down:"),
    true,
  ],
  [
    "portfolio value is not a signed figure",
    /row\("Portfolio".*signedFigure/.test(readFileSync(join(root, "js/site.js"), "utf8")),
    false,
  ],
  [
    "no portfolio-up pill",
    readFileSync(join(root, "js/site.js"), "utf8").includes("PORTFOLIO IS UP"),
    false,
  ],
  [
    "total return is a signed figure",
    readFileSync(join(root, "js/site.js"), "utf8").includes("signedFigure(signedPct(book.totalReturn)"),
    true,
  ],
  [
    "profit or loss is a signed figure",
    readFileSync(join(root, "js/site.js"), "utf8").includes("signedFigure(signedMoney(book.dollar)"),
    true,
  ],
  [
    "drawdown from logged equity",
    readFileSync(join(root, "js/site.js"), "utf8").includes("maxDrawdown") &&
      readFileSync(join(root, "js/site.js"), "utf8").includes("equity.jsonl"),
    true,
  ],
  [
    "no pending tickets as fills",
    /event === "intent"/.test(readFileSync(join(root, "js/site.js"), "utf8")) === false &&
      readFileSync(join(root, "js/site.js"), "utf8").includes('t.event === "fill" && t.side === "buy"'),
    true,
  ],
  [
    "decision feed fill qty at price",
    readFileSync(join(root, "js/site.js"), "utf8").includes("publicFillBody") &&
      readFileSync(join(root, "js/site.js"), "utf8").includes(" at $"),
    true,
  ],
  [
    "decision feed no kill cards",
    readFileSync(join(root, "js/site.js"), "utf8").includes("red-team kill"),
    false,
  ],
  [
    "js no live stop math",
    /69\.50|35\.50|83\.70/.test(readFileSync(join(root, "js/site.js"), "utf8")),
    false,
  ],
  [
    "no live-stop leakage",
    readFileSync(join(root, "js/site.js"), "utf8").includes("fill.stop") === false &&
      page.includes("software stop") === false,
    true,
  ],
  ["no old log chapters", page.includes('class="chapter"') || page.includes("chapter__no"), false],
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
  "Trading ops",
  "The Desk",
  "Open Book",
  "Gannon Dodson",
  "Gannon",
];
const oldBrand = ["AGEN", "TIC"].join("");
const oldNames = [
  ["Gannon", "\u2019s ", "Agen", "tic Trader"].join(""),
  ["Gannon", "'s ", "Agen", "tic Trader"].join(""),
];
for (const file of [
  "index.html",
  "js/site.js",
  "404.html",
  "README.md",
  "data/methodology.md",
  "data/thinking.md",
  "data/changelog.md",
  "data/team.md",
  "data/research.md",
  "data/pipeline.json",
  "css/site.css",
]) {
  const text = readFileSync(join(root, file), "utf8");
  if (text.includes(oldBrand) || oldNames.some((name) => text.includes(name))) {
    failed += 1;
    console.error(`FAIL old brand string in ${file}`);
  }
}
for (const file of [
  "index.html",
  "js/site.js",
  "404.html",
  "README.md",
  "data/methodology.md",
  "data/thinking.md",
  "data/changelog.md",
  "data/team.md",
  "data/research.md",
  "data/pipeline.json",
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
