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

function signWord(n) {
  if (n > 0) return "plus";
  if (n < 0) return "minus";
  return "flat";
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
    if (/waitlist/i.test(line) || /^Open-book social check/i.test(line)) {
      waitlist.push(line);
      continue;
    }
    preamble.push(line);
  }

  return { updated, status, preamble, stance, waitlist, triggers };
}

function parseMethodology(md) {
  const edge = /## How it picks\n+([\s\S]*?)\n+## Hard limits/.exec(md);
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

function row(label, value, note, extra = "") {
  return `
    <div class="row ${extra}">
      <dt>${label}</dt>
      <dd>${value}</dd>
      <small>${note}</small>
    </div>
  `;
}

function renderKpis(book, meta) {
  const flag =
    book.dollar > 0 ? "up so far" : book.dollar < 0 ? "down so far" : "flat so far";

  document.getElementById("kpis").innerHTML = `
    ${row("Portfolio", `${escapeHtml(money(book.lastEquity))} <span class="sign">${flag}</span>`, `Started at ${escapeHtml(money(book.start))}. Last public snapshot.`, "row--hero")}
    ${row("Total return", `${escapeHtml(signedPct(book.totalReturn))} <span class="sign">${signWord(book.totalReturn)}</span>`, `Last equity minus ${escapeHtml(money(book.start))}, divided by ${escapeHtml(money(book.start))}. Account opened Aug 21, 2026.`)}
    ${row("Profit or loss", `${escapeHtml(signedMoney(book.dollar))} <span class="sign">${signWord(book.dollar)}</span>`, `Last equity minus the ${escapeHtml(money(book.start))} start.`)}
    ${row("Cash", escapeHtml(money(book.cash)), "What’s left after the three fills.")}
  `;

  const realizedText = book.realized === 0 ? money(0) : "—";
  const openText = book.openPnl == null ? "—" : signedMoney(book.openPnl);
  const deployedParts = book.fills
    .map((f) => money(f.notional, Number.isInteger(Number(f.notional)) ? 0 : 2))
    .join(" + ");
  const deskPct = Number(book.totalReturn.toFixed(2));
  const spyClosePct = book.spyClosePct;
  const vsSpy = spyClosePct == null ? null : Number((deskPct - spyClosePct).toFixed(2));
  document.getElementById("secondary").hidden = false;
  document.getElementById("secondary").innerHTML = `
    ${row("Realized P/L", escapeHtml(realizedText), "Nothing’s closed yet, so this is $0.")}
    ${row("Open P/L", `${escapeHtml(openText)} <span class="sign">${book.openPnl == null ? "" : signWord(book.openPnl)}</span>`, "Last equity versus start, minus realized.")}
    ${row("Capital deployed", escapeHtml(money(book.deployed)), `Filled notionals still open (${deployedParts}).`, "is-accent")}
    ${row("Closed trades", escapeHtml(String(book.closed)), "No win rate until something closes.")}
    ${
      vsSpy == null
        ? ""
        : row(
            "Vs S&P 500",
            `${escapeHtml(signedPct(vsSpy))} <span class="sign">${signWord(vsSpy)}</span>`,
            `Desk ${signedPct(deskPct)} minus SPY ${signedPct(spyClosePct)} from the Aug 20 close. That’s the only definition used here.`
          )
    }
  `;

  const stamp = meta.updated_et.replace(/^Updated:\s*/i, "");
  document.getElementById("updated-stamp").textContent = `last mark ${stamp}`;
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

function spyOfficialPoints(spy) {
  if (!spy?.baseline?.close || !spy.bars?.length) return [];
  const prior = Number(spy.baseline.close);
  const bar = spy.bars[0];
  return [
    { ts: Date.parse("2026-08-20T16:00:00-04:00"), pct: 0, label: "SPY Aug 20 close" },
    { ts: Date.parse("2026-08-21T09:30:00-04:00"), pct: (Number(bar.open) / prior - 1) * 100, label: "SPY Aug 21 open" },
    { ts: Date.parse(`${bar.date}T16:00:00-04:00`), pct: (Number(bar.close) / prior - 1) * 100, label: "SPY Aug 21 close" },
  ];
}

function renderChart(equity, start, spy) {
  const host = document.getElementById("chart");
  const caption = document.getElementById("chart-caption");
  const deskLastPct = equity.length ? ((Number(equity.at(-1).equity) - start) / start) * 100 : 0;
  const spyClosePct = Number(spy?.bars?.[0]?.change_pct);
  const vs = Number((Number(deskLastPct.toFixed(2)) - spyClosePct).toFixed(2));
  caption.textContent =
    `Desk is % from the $500 start (last point ${signedPct(deskLastPct)}). SPY is buy-and-hold from the Aug 20 close ($762.60). Official Yahoo Finance daily prints only: Aug 21 open +0.45%, Aug 21 close +0.41%. One session of data so far. Source: ${spy?.source || "Yahoo Finance SPY daily"}. Vs S&P 500 is desk ${signedPct(Number(deskLastPct.toFixed(2)))} minus SPY ${signedPct(spyClosePct)} = ${signedPct(vs)} on that definition. No intra-day SPY ticks were invented.`;

  if (!equity.length) {
    host.innerHTML = `<p class="loading">No equity snapshots yet.</p>`;
    return;
  }

  const desk = equity.map((row) => ({
    ts: Date.parse(row.ts),
    pct: ((Number(row.equity) - start) / start) * 100,
    row,
  }));
  const spyPts = spyOfficialPoints(spy);
  const times = [...desk.map((p) => p.ts), ...spyPts.map((p) => p.ts)];
  const pcts = [...desk.map((p) => p.pct), ...spyPts.map((p) => p.pct), 0];
  const t0 = Math.min(...times);
  const t1 = Math.max(...times);
  const minV = Math.min(...pcts);
  const maxV = Math.max(...pcts);
  const pad = Math.max(0.35, (maxV - minV) * 0.28);
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
  const xAt = (ts) => L + ((ts - t0) / (t1 - t0 || 1)) * innerW;
  const y = (v) => T + ((hi - v) / (hi - lo)) * innerH;

  const deskPts = desk.map((p) => ({ ...p, x: xAt(p.ts), y: y(p.pct) }));
  const spyDraw = spyPts.map((p) => ({ ...p, x: xAt(p.ts), y: y(p.pct) }));
  const deskPath = deskPts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const spyPath = spyDraw.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const ticks = yTicks(lo, hi);
  const zeroY = y(0);
  const last = deskPts.at(-1);
  const spyLast = spyDraw.at(-1);

  const grid = ticks
    .map((tick) => {
      const yy = y(tick);
      return `<line x1="${L}" y1="${yy.toFixed(1)}" x2="${W - R}" y2="${yy.toFixed(1)}" stroke="rgba(238,232,223,0.10)" />
        <text x="${L - 10}" y="${yy + 4}" fill="#8a847a" font-size="11" font-family="IBM Plex Mono, monospace" text-anchor="end">${signedPct(tick)}</text>`;
    })
    .join("");

  const xLabels = [
    ...spyDraw.map((p) => `<text x="${p.x.toFixed(1)}" y="${H - 14}" fill="#8a847a" font-size="10" font-family="IBM Plex Mono, monospace" text-anchor="middle">${escapeHtml(p.label.replace("SPY ", ""))}</text>`),
    ...deskPts
      .filter((_, i) => i === 0 || i === deskPts.length - 1)
      .map((p) => `<text x="${p.x.toFixed(1)}" y="${H - 28}" fill="#8a847a" font-size="10" font-family="IBM Plex Mono, monospace" text-anchor="middle">${escapeHtml(formatTime(p.row.ts))}</text>`),
  ].join("");

  host.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      ${grid}
      <line x1="${L}" y1="${zeroY.toFixed(1)}" x2="${W - R}" y2="${zeroY.toFixed(1)}" stroke="rgba(238,232,223,0.22)" stroke-dasharray="4 5" />
      <path d="${spyPath}" fill="none" stroke="rgba(238,232,223,0.42)" stroke-width="1.5" />
      ${spyDraw
        .map((p) => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3" fill="#0d0d0d" stroke="rgba(238,232,223,0.55)" stroke-width="1.4" />`)
        .join("")}
      <path d="${deskPath}" fill="none" stroke="#f25c12" stroke-width="2.2" />
      ${deskPts
        .map((p) => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.4" fill="#0d0d0d" stroke="#f25c12" stroke-width="1.6" />`)
        .join("")}
      <text x="${W - R + 10}" y="${last.y + 4}" fill="#eee8df" font-size="12" font-family="IBM Plex Mono, monospace">${escapeHtml(signedPct(last.pct))} desk</text>
      <text x="${W - R + 10}" y="${spyLast.y + 16}" fill="#c4bdb2" font-size="11" font-family="IBM Plex Mono, monospace">${escapeHtml(signedPct(spyClosePct))} SPY</text>
      ${xLabels}
    </svg>
    <div class="chart-tip" hidden></div>
  `;

  const svg = host.querySelector("svg");
  const tip = host.querySelector(".chart-tip");
  const bind = (p, html) => {
    const el = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    el.setAttribute("cx", p.x.toFixed(1));
    el.setAttribute("cy", p.y.toFixed(1));
    el.setAttribute("r", "14");
    el.setAttribute("fill", "transparent");
    el.style.cursor = "crosshair";
    el.addEventListener("pointerenter", (ev) => {
      tip.hidden = false;
      tip.innerHTML = html;
      const rect = host.getBoundingClientRect();
      tip.style.left = `${ev.clientX - rect.left}px`;
      tip.style.top = `${ev.clientY - rect.top}px`;
    });
    el.addEventListener("pointerleave", () => {
      tip.hidden = true;
    });
    svg.appendChild(el);
  };
  deskPts.forEach((p) => {
    bind(
      p,
      `<strong>${escapeHtml(formatClock(p.row.ts))} ET</strong><br>Desk ${escapeHtml(signedPct(p.pct))}<br>Equity ${escapeHtml(money(p.row.equity))}<br>${escapeHtml(p.row.note || "")}`
    );
  });
  spyDraw.forEach((p) => {
    bind(p, `<strong>${escapeHtml(p.label)}</strong><br>${escapeHtml(signedPct(p.pct))}<br>Yahoo Finance daily`);
  });
}

function renderMethodology(md) {
  const parsed = parseMethodology(md);
  document.getElementById("method-lede").textContent = parsed.lede;
  document.getElementById("methodology").innerHTML = `
    <div class="doctrine__col">
      <h3>How it picks</h3>
      ${mdBlocks(parsed.edge)}
    </div>
    <div class="doctrine__col">
      <h3>Hard limits</h3>
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
    <p class="hud-label">After the close</p>
    <p class="thought__status">${escapeHtml(thought.status)}</p>
    ${preamble}
  `;
}

function renderPositions(book, thought) {
  const stance = thought?.stance || {};
  const cards = book.fills.map((fill, i) => {
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
      <article class="folder ${i === 0 ? "is-open" : ""}">
        <button class="folder__tab" type="button" aria-expanded="${i === 0 ? "true" : "false"}">
          <span class="folder__name">${escapeHtml(fill.symbol)}</span>
          <span class="folder__meta">${sub}</span>
          <span class="folder__chev" aria-hidden="true">›</span>
        </button>
        <div class="folder__body">
          <p>${lastBits.join(" · ")}</p>
          ${now ? `<p>${escapeHtml(now)}</p>` : ""}
          <p class="folder__foot">software stop ${escapeHtml(stopLabel)} or target ${escapeHtml(targetLabel)}</p>
        </div>
      </article>
    `;
  });
  document.getElementById("positions").innerHTML = cards.join("") || "<p class='loading'>No open fills.</p>";
  document.querySelectorAll(".folder__tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      const folder = btn.closest(".folder");
      const open = !folder.classList.contains("is-open");
      folder.classList.toggle("is-open", open);
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    });
  });
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
        <article>
          <h3>Bought $${escapeHtml(fill.symbol)}</h3>
          <p class="record__meta">${when} · ${escapeHtml(fill.symbol)}</p>
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
  const links = [...document.querySelectorAll(".pill a")];
  const sections = links
    .map((a) => document.querySelector(a.getAttribute("href")))
    .filter(Boolean);

  const sync = () => {
    const y = window.scrollY + 140;
    let current = sections[0];
    for (const section of sections) {
      if (section.offsetTop <= y) current = section;
    }
    links.forEach((a) => a.classList.toggle("is-active", a.getAttribute("href") === `#${current.id}`));
  };

  window.addEventListener("scroll", sync, { passive: true });
  sync();
}

function cursorTrail() {
  const canvas = document.querySelector(".trail");
  if (!canvas) return;
  if (window.matchMedia("(pointer: coarse)").matches) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const ctx = canvas.getContext("2d");
  const pts = [];
  const resize = () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  };
  resize();
  window.addEventListener("resize", resize);
  const coords = document.getElementById("coords");
  window.addEventListener(
    "pointermove",
    (e) => {
      pts.push({ x: e.clientX, y: e.clientY });
      if (pts.length > 16) pts.shift();
      if (coords) {
        const nx = ((e.clientX / window.innerWidth) * 100).toFixed(2);
        const ny = ((e.clientY / window.innerHeight) * 100).toFixed(2);
        coords.innerHTML = `X ${nx}&nbsp;&nbsp;Y ${ny}`;
      }
    },
    { passive: true }
  );

  const tick = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (pts.length > 1) {
      ctx.beginPath();
      ctx.strokeStyle = "rgba(242, 92, 18, 0.38)";
      ctx.lineWidth = 1;
      pts.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.stroke();
    }
    requestAnimationFrame(tick);
  };
  tick();
}

async function main() {
  if (window.location.pathname === "/trade") {
    window.location.replace("/trade/");
    return;
  }

  try {
    const [meta, equity, trades, methodology, thinking, changelog, spy] = await Promise.all([
      loadJson("meta.json"),
      loadJsonl("equity.jsonl"),
      loadJsonl("trades.jsonl"),
      loadText("methodology.md"),
      loadText("thinking.md"),
      loadText("changelog.md"),
      loadJson("spy.json"),
    ]);

    const book = computeBook(meta, equity, trades);
    book.spyClosePct = Number(spy?.bars?.[0]?.change_pct);
    const thought = parseThinking(thinking);
    if (thought.updated) meta.updated_et = thought.updated;
    renderKpis(book, meta);
    renderChart(equity, book.start, spy);
    renderMethodology(methodology);
    renderThinking(thought);
    renderPositions(book, thought);
    renderWaitlist(thought);
    renderTriggers(thought);
    renderTrades(book.fills);
    renderChangelog(changelog);
    watchNav();
    cursorTrail();
  } catch (err) {
    document.getElementById("kpis").innerHTML = `<p class="error">${escapeHtml(err.message)}</p>`;
  }
}

main();
