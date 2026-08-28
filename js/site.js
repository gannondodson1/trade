function siteBase() {
  const { pathname } = window.location;
  if (pathname === "/trade" || pathname.startsWith("/trade/")) return "/trade/";
  if (pathname.endsWith("/")) return pathname.replace(/[^/]+\/$/, "");
  return pathname.replace(/[^/]+$/, "");
}

const BASE = siteBase();

function dataUrl(name) {
  return new URL(`data/${name}`, `${window.location.origin}${BASE}`).href;
}

function money(n) {
  return Number(n).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function signedMoney(n) {
  const value = Number(n);
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${money(Math.abs(value))}`;
}

function signedPct(n) {
  const value = Number(n);
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${Math.abs(value).toFixed(1)}%`;
}

async function loadJson(name) {
  const res = await fetch(dataUrl(name), { cache: "no-store" });
  if (!res.ok) throw new Error(`Could not read data/${name}`);
  return JSON.parse(await res.text());
}

async function loadJsonl(name) {
  const res = await fetch(dataUrl(name), { cache: "no-store" });
  if (!res.ok) throw new Error(`Could not read data/${name}`);
  return (await res.text())
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function lastMark(meta, equity) {
  const start = Number(meta.start_equity ?? 500);
  const last = equity.at(-1) || {};
  const lastEquity = Number(last.equity ?? meta.last_equity);
  const cash = Number(last.cash ?? meta.cash);
  const dollar = lastEquity - start;
  const totalReturn = (dollar / start) * 100;
  const allCash = cash === lastEquity && Number(last.open_positions ?? 0) === 0;
  return { start, lastEquity, cash, dollar, totalReturn, allCash };
}

function fillNav(book) {
  for (const el of document.querySelectorAll("[data-nav]")) {
    el.textContent = money(book.lastEquity);
  }
  for (const el of document.querySelectorAll("[data-pnl]")) {
    el.textContent = `${signedMoney(book.dollar)} (${signedPct(book.totalReturn)}) since inception`;
  }
  for (const el of document.querySelectorAll("[data-start]")) {
    el.textContent = `Started ${money(book.start)}${book.allCash ? " · all cash" : ""}`;
  }
}

async function main() {
  if (window.location.pathname === "/trade") {
    window.location.replace("/trade/");
    return;
  }

  const navRoot = document.querySelector("[data-nav]");
  if (!navRoot) return;

  try {
    const [meta, equity] = await Promise.all([loadJson("meta.json"), loadJsonl("equity.jsonl")]);
    fillNav(lastMark(meta, equity));
  } catch {
    // Keep the delayed numbers already printed in the page.
  }
}

main();
