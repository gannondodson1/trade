const START_FALLBACK = 500;

function siteBase() {
  const { pathname } = window.location;
  if (pathname === "/trade" || pathname.startsWith("/trade/")) return "/trade/";
  if (pathname.endsWith("/")) return pathname;
  return pathname.replace(/[^/]+$/, "");
}

const BASE = siteBase();

function dataUrl(name) {
  return new URL(`data/${name}`, `${window.location.origin}${BASE}`).href;
}

async function loadText(name) {
  const res = await fetch(dataUrl(name), { cache: "no-store" });
  if (!res.ok) throw new Error(`Could not read data/${name}`);
  return res.text();
}

async function loadJson(name) {
  return JSON.parse(await loadText(name));
}

async function loadJsonl(name) {
  const text = await loadText(name);
  return text
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line, i) => {
      try {
        return JSON.parse(line);
      } catch {
        throw new Error(`Bad JSONL in data/${name} line ${i + 1}`);
      }
    });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function money(n, digits = 2) {
  const abs = Math.abs(Number(n));
  return abs.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
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
  return `${sign}${Math.abs(value).toFixed(2)}%`;
}

function toneClass(n) {
  if (n > 0) return "is-up";
  if (n < 0) return "is-down";
  return "";
}

function formatClock(iso) {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatTime(iso) {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function displayQty(raw) {
  return (Math.round(Number(raw) * 100) / 100).toFixed(2);
}

const NUM = String.raw`\d+(?:\.\d+)?`;

function parseFillNote(note) {
  const share = new RegExp(`Filled\\s+(${NUM})\\s+shares\\s+at\\s+\\$?(${NUM})`, "i").exec(note || "");
  if (share) {
    return { kind: "shares", qty: Number(share[1]), price: Number(share[2]) };
  }
  const call = new RegExp(`Filled\\s+(${NUM})\\s+contract[s]?\\s+at\\s+\\$?(${NUM})`, "i").exec(note || "");
  if (call) {
    return { kind: "contract", qty: Number(call[1]), price: Number(call[2]) };
  }
  return null;
}

function exactPx(n) {
  return Number(n).toFixed(2);
}

function openFills(trades) {
  const closes = new Set(
    trades
      .filter((t) => t.event === "close" || (t.event === "fill" && t.side === "sell"))
      .map((t) => t.symbol)
  );
  return trades.filter((t) => t.event === "fill" && t.side === "buy" && !closes.has(t.symbol));
}

function parseThinking(md) {
  const lines = md.split(/\r?\n/);
  const updated = (md.match(/^Updated:\s*(.+)$/m) || [])[1]?.trim() || "";
  const status = (md.match(/^Status:\s*(.+)$/m) || [])[1]?.trim() || "";
  const stance = {};
  const preamble = [];
  const waitlist = [];
  let inTriggers = false;
  const triggers = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("# ")) continue;
    if (/^Updated:/i.test(line) || /^Status:/i.test(line)) continue;
    if (/^What would make it do something/i.test(line)) {
      inTriggers = true;
      continue;
    }
    if (inTriggers) {
      if (line.startsWith("- ")) triggers.push(line.slice(2).trim());
      continue;
    }
    const symbol = /^(RKLB|CRWV|SMCI)\b[:.]?\s*(.*)$/.exec(line);
    if (symbol) {
      stance[symbol[1]] = symbol[2] || line;
      continue;
    }
    if (/^Waitlist/i.test(line)) {
      waitlist.push(line);
      continue;
    }
    preamble.push(line);
  }

  return { updated, status, preamble, stance, waitlist, triggers };
}

function parseMethodology(md) {
  const edge = /## Edge\n+([\s\S]*?)\n+## Hard limits/.exec(md);
  const limits = /## Hard limits\n+([\s\S]*?)\n+## Evidence/.exec(md);
  const evidence = /## Evidence\n+([\s\S]*)$/.exec(md);
  const lede = md
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith("#"));
  return {
    lede: lede || "",
    edge: (edge?.[1] || "").trim(),
    limits: (limits?.[1] || "").trim(),
    evidence: (evidence?.[1] || "").trim(),
  };
}

function mdInline(text) {
  return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

function mdBlocks(text) {
  const lines = text.split(/\r?\n/);
  const out = [];
  let ul = [];
  let ol = [];

  const flushUl = () => {
    if (!ul.length) return;
    out.push(`<ul>${ul.map((item) => `<li>${mdInline(item)}</li>`).join("")}</ul>`);
    ul = [];
  };
  const flushOl = () => {
    if (!ol.length) return;
    out.push(`<ol>${ol.map((item) => `<li>${mdInline(item)}</li>`).join("")}</ol>`);
    ol = [];
  };
  const flushLists = () => {
    flushUl();
    flushOl();
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flushLists();
      continue;
    }
    if (line.startsWith("- ")) {
      flushOl();
      ul.push(line.slice(2));
      continue;
    }
    const numbered = /^(\d+)\.\s+(.+)$/.exec(line);
    if (numbered) {
      flushUl();
      ol.push(numbered[2]);
      continue;
    }
    flushLists();
    out.push(`<p>${mdInline(line)}</p>`);
  }
  flushLists();
  return out.join("");
}

function parseChangelog(md) {
  const chunks = md.split(/^## /m).map((c) => c.trim()).filter(Boolean);
  return chunks
    .filter((chunk) => !chunk.startsWith("#"))
    .map((chunk) => {
      const [title, ...rest] = chunk.split(/\r?\n/);
      return { title: title.trim(), body: rest.join("\n").trim() };
    });
}

function computeBook(meta, equity, trades) {
  const start = Number(meta.start_equity ?? START_FALLBACK);
  const last = equity.at(-1) || {};
  const lastEquity = Number(last.equity ?? meta.last_equity);
  const cash = Number(last.cash ?? meta.cash);
  const fills = openFills(trades);
  const deployed = fills.reduce((sum, t) => sum + Number(t.notional || 0), 0);
  const closed = Number(meta.closed_trades ?? 0);
  const realized = closed === 0 ? 0 : null;
  const dollar = lastEquity - start;
  const totalReturn = (dollar / start) * 100;
  const openPnl = realized === 0 ? dollar : null;
  return {
    start,
    lastEquity,
    cash,
    fills,
    deployed,
    closed,
    realized,
    dollar,
    totalReturn,
    openPnl,
    last,
  };
}

function renderKpis(book, meta) {
  const upPill =
    book.dollar > 0
      ? `<p class="pill">Portfolio is up so far</p>`
      : book.dollar < 0
        ? `<p class="pill">Portfolio is down so far</p>`
        : "";

  document.getElementById("kpis").innerHTML = `
    <article class="kpi">
      <p class="label">Portfolio value</p>
      <p class="kpi__value kpi__value--lg">${escapeHtml(money(book.lastEquity))}</p>
      ${upPill}
      <p class="kpi__note">Started at ${escapeHtml(money(book.start))}. Last snapshot from the public equity log.</p>
    </article>
    <article class="kpi">
      <p class="label">Total return</p>
      <p class="kpi__value ${toneClass(book.totalReturn)}">${escapeHtml(signedPct(book.totalReturn))}</p>
      <p class="kpi__note">(Last equity − ${escapeHtml(money(book.start))}) / ${escapeHtml(money(book.start))}. Since the account opened Aug 21, 2026.</p>
    </article>
    <article class="kpi">
      <p class="label">Profit or loss</p>
      <p class="kpi__value ${toneClass(book.dollar)}">${escapeHtml(signedMoney(book.dollar))}</p>
      <p class="kpi__note">Dollars gained or lost so far. Last equity minus the ${escapeHtml(money(book.start))} start.</p>
    </article>
    <article class="kpi">
      <p class="label">Cash</p>
      <p class="kpi__value">${escapeHtml(money(book.cash))}</p>
      <p class="kpi__note">Cash and buying power left after the three filled buys.</p>
    </article>
  `;

  const realizedText = book.realized === 0 ? money(0) : "—";
  const openText = book.openPnl == null ? "—" : signedMoney(book.openPnl);
  document.getElementById("secondary").hidden = false;
  document.getElementById("secondary").innerHTML = `
    <article class="kpi">
      <p class="label">Realized P/L</p>
      <p class="kpi__value">${escapeHtml(realizedText)}</p>
      <p class="kpi__note">No closes in the log, so realized P/L is $0.</p>
    </article>
    <article class="kpi">
      <p class="label">Open P/L</p>
      <p class="kpi__value ${book.openPnl == null ? "" : toneClass(book.openPnl)}">${escapeHtml(openText)}</p>
      <p class="kpi__note">Last equity versus start, minus realized. Implied by the book, not a broker mark.</p>
    </article>
    <article class="kpi">
      <p class="label">Capital deployed</p>
      <p class="kpi__value is-accent">${escapeHtml(money(book.deployed))}</p>
      <p class="kpi__note">Sum of filled notionals still open (${book.fills.map((f) => money(f.notional, Number.isInteger(Number(f.notional)) ? 0 : 2)).join(" + ")}).</p>
    </article>
    <article class="kpi">
      <p class="label">Closed trades</p>
      <p class="kpi__value">${escapeHtml(String(book.closed))}</p>
      <p class="kpi__note">No win rate until something closes.</p>
    </article>
  `;

  document.getElementById("updated-stamp").textContent = `Updated ${meta.updated_et}`;
}

function yTicks(min, max) {
  const span = max - min || 1;
  const raw = span / 3;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((n) => n * mag).find((n) => n >= raw) || raw;
  const start = Math.floor(min / step) * step;
  const ticks = [];
  for (let v = start; v <= max + step * 0.01; v += step) ticks.push(Number(v.toFixed(4)));
  return ticks;
}

function renderChart(equity, start) {
  const host = document.getElementById("chart");
  const caption = document.getElementById("chart-caption");
  caption.textContent =
    "Each point is a public snapshot from data/equity.jsonl. Return is (equity − $500) / $500. This log has no S&P 500 or SPY series, so none is drawn.";

  if (!equity.length) {
    host.innerHTML = `<p class="kpi__note">No equity snapshots yet.</p>`;
    return;
  }

  const values = equity.map((row) => Number(row.equity));
  const minV = Math.min(start, ...values);
  const maxV = Math.max(start, ...values);
  const pad = Math.max(1.5, (maxV - minV) * 0.28);
  const lo = minV - pad;
  const hi = maxV + pad;

  const W = 1000;
  const H = 360;
  const L = 64;
  const R = 118;
  const T = 18;
  const B = 42;
  const innerW = W - L - R;
  const innerH = H - T - B;

  const xs = equity.map((_, i) => {
    if (equity.length === 1) return L + innerW / 2;
    return L + (i / (equity.length - 1)) * innerW;
  });
  const y = (v) => T + ((hi - v) / (hi - lo)) * innerH;
  const points = equity.map((row, i) => ({ x: xs[i], y: y(Number(row.equity)), row }));
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const ticks = yTicks(lo, hi);
  const startY = y(start);
  const last = points.at(-1);

  const grid = ticks
    .map((tick) => {
      const yy = y(tick);
      return `<line x1="${L}" y1="${yy.toFixed(1)}" x2="${W - R}" y2="${yy.toFixed(1)}" stroke="rgba(238,232,223,0.10)" />
        <text x="${L - 10}" y="${yy + 4}" fill="#8a847a" font-size="12" text-anchor="end">${money(tick, tick % 1 === 0 ? 0 : 2)}</text>`;
    })
    .join("");

  const xLabels = equity
    .map((row, i) => {
      if (equity.length > 6 && i !== 0 && i !== equity.length - 1 && i % 2 === 1) return "";
      return `<text x="${xs[i].toFixed(1)}" y="${H - 14}" fill="#8a847a" font-size="12" text-anchor="middle">${escapeHtml(formatTime(row.ts))}</text>`;
    })
    .join("");

  host.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      ${grid}
      <line x1="${L}" y1="${startY.toFixed(1)}" x2="${W - R}" y2="${startY.toFixed(1)}" stroke="rgba(238,232,223,0.22)" stroke-dasharray="4 5" />
      <path d="${d}" fill="none" stroke="#f25c12" stroke-width="2.2" />
      ${points
        .map(
          (p) =>
            `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.4" fill="#0d0d0d" stroke="#f25c12" stroke-width="1.6" />`
        )
        .join("")}
      <text x="${W - R + 10}" y="${last.y + 4}" fill="#eee8df" font-size="13">${escapeHtml(signedPct(((last.row.equity - start) / start) * 100))} desk</text>
      ${xLabels}
    </svg>
    <div class="chart-tip" hidden></div>
  `;

  const svg = host.querySelector("svg");
  const tip = host.querySelector(".chart-tip");
  const hit = points.map((p) => {
    const el = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    el.setAttribute("cx", p.x.toFixed(1));
    el.setAttribute("cy", p.y.toFixed(1));
    el.setAttribute("r", "14");
    el.setAttribute("fill", "transparent");
    el.style.cursor = "crosshair";
    el.addEventListener("pointerenter", (ev) => {
      const ret = ((Number(p.row.equity) - start) / start) * 100;
      tip.hidden = false;
      tip.innerHTML = `<strong>${escapeHtml(formatClock(p.row.ts))} ET</strong><br>Equity ${escapeHtml(money(p.row.equity))} (${escapeHtml(signedPct(ret))})<br>Cash ${escapeHtml(money(p.row.cash))}<br>${escapeHtml(p.row.note || "")}`;
      const rect = host.getBoundingClientRect();
      tip.style.left = `${ev.clientX - rect.left}px`;
      tip.style.top = `${ev.clientY - rect.top}px`;
    });
    el.addEventListener("pointerleave", () => {
      tip.hidden = true;
    });
    svg.appendChild(el);
    return el;
  });
  void hit;
}

function renderMethodology(md) {
  const parsed = parseMethodology(md);
  document.getElementById("method-lede").textContent = parsed.lede;
  document.getElementById("methodology").innerHTML = `
    <div class="split__col">
      <h3>The two lenses</h3>
      ${mdBlocks(parsed.edge)}
    </div>
    <div class="split__col">
      <h3>Hard limits and evidence</h3>
      ${mdBlocks(parsed.limits)}
      <p class="split__foot">${mdInline(parsed.evidence)}</p>
    </div>
  `;
}

function renderThinking(thought) {
  const host = document.getElementById("thinking");
  if (!host) return;
  const preamble = thought.preamble.map((p) => `<p>${escapeHtml(p)}</p>`).join("");
  host.innerHTML = `
    <p class="label">After-close stance</p>
    <p class="thought__status">${escapeHtml(thought.status)}</p>
    ${preamble}
  `;
}

function renderPositions(book, thought) {
  const stance = thought?.stance || {};
  const cards = book.fills.map((fill) => {
    const parsed = parseFillNote(fill.note);
    const isOption = Boolean(fill.instrument);
    let sub;
    if (isOption) {
      sub = `holding · ${parsed ? parsed.qty : 1} ${escapeHtml(fill.instrument)}`;
    } else if (parsed) {
      sub = `holding · ${displayQty(parsed.qty)} shares`;
    } else {
      sub = `holding · ${escapeHtml(fill.horizon || "open")}`;
    }

    const price = parsed?.price;
    const lastBits = [];
    if (price != null) lastBits.push(`Bought ${isOption ? "debit " : "near "}${money(price)}`);
    if (fill.stop != null) lastBits.push(`Sell safety line ${money(fill.stop)}`);
    if (fill.target != null) lastBits.push(`Profit target ${money(fill.target)}`);

    const now = stance[fill.symbol];
    const stopLabel = fill.stop != null ? exactPx(fill.stop) : "—";
    const targetLabel = fill.target != null ? exactPx(fill.target) : "—";

    return `
      <article class="position">
        <div class="position__top">
          <div>
            <h3>${escapeHtml(fill.symbol)}</h3>
            <p class="position__sub">${sub}</p>
          </div>
        </div>
        <p class="position__detail">${lastBits.join(" · ")}</p>
        ${now ? `<p class="position__detail">${escapeHtml(now)}</p>` : ""}
        <p class="position__foot">software stop ${escapeHtml(stopLabel)} or target ${escapeHtml(targetLabel)}</p>
      </article>
    `;
  });
  document.getElementById("positions").innerHTML = cards.join("") || "<p class='kpi__note'>No open fills.</p>";
}

function renderWaitlist(thought) {
  const host = document.getElementById("waitlist");
  if (!host) return;
  if (!thought.waitlist.length) {
    host.innerHTML = "";
    return;
  }
  host.innerHTML = thought.waitlist.map((line) => `<p>${escapeHtml(line)}</p>`).join("");
}

function renderTriggers(thought) {
  const items = thought.triggers || [];
  document.getElementById("triggers").innerHTML = items.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
}

function renderTrades(fills) {
  document.getElementById("trades").innerHTML = fills
    .map((fill) => {
      const parsed = parseFillNote(fill.note);
      const when = `${formatClock(fill.ts)} ET · ${escapeHtml(fill.side)} · ${escapeHtml(money(fill.notional))}`;
      const bullets = [];
      if (fill.horizon) bullets.push(`${fill.horizon} horizon`);
      if (fill.stop != null && fill.target != null) {
        bullets.push(`Stop ${money(fill.stop)}; target ${money(fill.target)}.`);
      }
      if (fill.rr != null) bullets.push(`Logged reward-to-risk ${Number(fill.rr).toFixed(2)}.`);
      if (parsed?.kind === "shares") {
        bullets.push(`Filled ${parsed.qty} shares at ${money(parsed.price)}. Displayed as ${displayQty(parsed.qty)}.`);
      }
      if (parsed?.kind === "contract") {
        bullets.push(`Filled ${parsed.qty} contract at ${parsed.price} (${money(fill.notional)} debit).`);
      }
      return `
        <article class="log-item">
          <div class="log-item__head">
            <div>
              <h3>Bought $${escapeHtml(fill.symbol)}</h3>
              <p class="log-item__meta">${when}</p>
            </div>
            <span class="badge">${escapeHtml(fill.symbol)}</span>
          </div>
          <p>${escapeHtml(fill.thesis || "")}</p>
          ${fill.note ? `<p>${escapeHtml(fill.note)}</p>` : ""}
          ${bullets.length ? `<ul>${bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join("")}</ul>` : ""}
        </article>
      `;
    })
    .join("");
}

function renderChangelog(md) {
  const items = parseChangelog(md);
  document.getElementById("changelog").innerHTML = items
    .map(
      (item) => `
        <article>
          <h3>${escapeHtml(item.title)}</h3>
          ${mdBlocks(item.body)}
        </article>
      `
    )
    .join("");
}

function watchNav() {
  const links = [...document.querySelectorAll(".nav a")];
  const sections = links
    .map((a) => document.querySelector(a.getAttribute("href")))
    .filter(Boolean);

  const sync = () => {
    const y = window.scrollY + 120;
    let current = sections[0];
    for (const section of sections) {
      if (section.offsetTop <= y) current = section;
    }
    links.forEach((a) => a.classList.toggle("is-active", a.getAttribute("href") === `#${current.id}`));
  };

  window.addEventListener("scroll", sync, { passive: true });
  sync();
}

async function main() {
  if (window.location.pathname === "/trade") {
    window.location.replace("/trade/");
    return;
  }

  try {
    const [meta, equity, trades, methodology, thinking, changelog] = await Promise.all([
      loadJson("meta.json"),
      loadJsonl("equity.jsonl"),
      loadJsonl("trades.jsonl"),
      loadText("methodology.md"),
      loadText("thinking.md"),
      loadText("changelog.md"),
    ]);

    const book = computeBook(meta, equity, trades);
    const thought = parseThinking(thinking);
    if (thought.updated) meta.updated_et = thought.updated;
    renderKpis(book, meta);
    renderChart(equity, book.start);
    renderMethodology(methodology);
    renderThinking(thought);
    renderPositions(book, thought);
    renderWaitlist(thought);
    renderTriggers(thought);
    renderTrades(book.fills);
    renderChangelog(changelog);
    watchNav();
  } catch (err) {
    document.getElementById("kpis").innerHTML = `<p class="error">${escapeHtml(err.message)}</p>`;
  }
}

main();
