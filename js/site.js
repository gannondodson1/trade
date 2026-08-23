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
  return Math.abs(Number(n)).toLocaleString("en-US", {
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

function signTone(n) {
  if (n > 0) return "up";
  if (n < 0) return "down";
  return "flat";
}

function signedFigure(formatted, n) {
  return `<span class="signed signed--${signTone(n)}">${escapeHtml(formatted)}</span>`;
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

function formatDay(iso) {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
  });
}

function sessionCount(equity) {
  const days = new Set(
    equity.map((row) =>
      new Date(row.ts).toLocaleDateString("en-US", { timeZone: "America/New_York" })
    )
  );
  return days.size;
}

function maxDrawdown(equity) {
  if (!equity.length) return null;
  let peak = Number(equity[0].equity);
  let worst = 0;
  let worstPct = 0;
  for (const row of equity) {
    const eq = Number(row.equity);
    if (eq > peak) peak = eq;
    const dd = eq - peak;
    if (dd < worst) {
      worst = dd;
      worstPct = peak ? (dd / peak) * 100 : 0;
    }
  }
  if (worst >= 0) return null;
  return { dollar: worst, pct: worstPct };
}

function openFills(trades) {
  const closes = new Set(
    trades
      .filter((t) => t.event === "close" || (t.event === "fill" && t.side === "sell"))
      .map((t) => t.symbol)
  );
  return trades.filter((t) => t.event === "fill" && t.side === "buy" && !closes.has(t.symbol));
}

function parseTeam(md) {
  const lede = md
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith("#") && !l.startsWith("- "));
  const members = [];
  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trim();
    const match = /^- ([A-Za-z]+) - ([^.]+)\.\s*(.*)$/.exec(line);
    if (!match) continue;
    members.push({ name: match[1], role: match[2], bio: match[3] });
  }
  const closer =
    md
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#") && !l.startsWith("- ") && l !== lede)
      .at(-1) || "";
  return { lede: lede || "", members, closer };
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

function parseMethodology(md) {
  const lines = md
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
  return {
    lede: lines[0] || "",
    lenses: lines.find((l) => /two lenses/i.test(l)) || "",
    morgan: lines.find((l) => /Morgan operates/i.test(l)) || "",
    cole: lines.find((l) => /Cole executes/i.test(l)) || "",
    riley: lines.find((l) => /PASS/.test(l) && /HARD NO/.test(l)) || "",
    cadence: lines.find((l) => /8:30/.test(l)) || "",
    rules: lines.find((l) => /risk book is internal/i.test(l)) || "",
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

function computeBook(meta, equity, trades) {
  const start = Number(meta.start_equity ?? START_FALLBACK);
  const last = equity.at(-1) || {};
  const lastEquity = Number(last.equity ?? meta.last_equity);
  const cash = Number(last.cash ?? meta.cash);
  const fills = openFills(trades);
  const closed = Number(meta.closed_trades ?? 0);
  const dollar = lastEquity - start;
  const totalReturn = (dollar / start) * 100;
  return {
    start,
    lastEquity,
    cash,
    fills,
    closed,
    dollar,
    totalReturn,
    sessions: sessionCount(equity),
    drawdown: maxDrawdown(equity),
    last,
  };
}

function renderScoreboard(book, meta, spy) {
  const from = document.querySelector(".hero__from");
  const now = document.querySelector(".hero__now");
  if (from) from.textContent = money(book.start);
  if (now) now.textContent = money(book.lastEquity);

  const deskPct = Number(book.totalReturn.toFixed(2));
  const spyClosePct = book.spyClosePct;
  const vsSpy = spyClosePct == null ? null : Number((deskPct - spyClosePct).toFixed(2));
  const dd = book.drawdown;
  const days = book.sessions === 1 ? "1 session" : `${book.sessions} sessions`;

  const cells = [
    ["Dollar P/L", signedFigure(signedMoney(book.dollar), book.dollar), `Last equity minus ${money(book.start)}.`],
    ["Total return", signedFigure(signedPct(book.totalReturn), book.totalReturn), `From the ${money(book.start)} start.`],
    vsSpy == null
      ? null
      : [
          "Vs S&P 500",
          signedFigure(signedPct(vsSpy), vsSpy),
          `Desk ${signedPct(deskPct)} minus SPY ${signedPct(spyClosePct)} from the Aug 20 close.`,
        ],
    dd
      ? [
          "Max drawdown",
          signedFigure(signedPct(dd.pct), dd.pct),
          `${signedMoney(dd.dollar)} from a logged peak. equity.jsonl only.`,
        ]
      : null,
    ["Day count", escapeHtml(days), "Unique dates in the equity log."],
  ].filter(Boolean);

  document.getElementById("kpis").innerHTML = cells
    .map(
      ([label, value, note]) => `
        <li class="stat">
          <dt>${escapeHtml(label)}</dt>
          <dd>${value}</dd>
          <small>${escapeHtml(note)}</small>
        </li>
      `
    )
    .join("");
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

  const W = 1100;
  const H = 400;
  const L = 72;
  const R = 108;
  const T = 22;
  const B = 46;
  const innerW = W - L - R;
  const innerH = H - T - B;
  const xAt = (ts) => L + ((ts - t0) / (t1 - t0 || 1)) * innerW;
  const y = (v) => T + ((hi - v) / (hi - lo)) * innerH;

  const deskPts = desk.map((p) => ({ ...p, x: xAt(p.ts), y: y(p.pct) }));
  const spyDraw = spyPts.map((p) => ({ ...p, x: xAt(p.ts), y: y(p.pct) }));
  const deskPath = deskPts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const area = `${deskPath} L${deskPts.at(-1).x.toFixed(1)},${y(0).toFixed(1)} L${deskPts[0].x.toFixed(1)},${y(0).toFixed(1)} Z`;
  const spyPath = spyDraw.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const ticks = yTicks(lo, hi);
  const zeroY = y(0);
  const last = deskPts.at(-1);
  const spyLast = spyDraw.at(-1);

  const grid = ticks
    .map((tick) => {
      const yy = y(tick);
      return `<line x1="${L}" y1="${yy.toFixed(1)}" x2="${W - R}" y2="${yy.toFixed(1)}" stroke="rgba(238,232,223,0.08)" />
        <text x="${L - 12}" y="${yy + 4}" fill="#8a847a" font-size="11" font-family="IBM Plex Mono, monospace" text-anchor="end">${signedPct(tick)}</text>`;
    })
    .join("");

  const xLabels = [
    ...spyDraw.map(
      (p) =>
        `<text x="${p.x.toFixed(1)}" y="${H - 14}" fill="#8a847a" font-size="10" font-family="IBM Plex Mono, monospace" text-anchor="middle">${escapeHtml(p.label.replace("SPY ", ""))}</text>`
    ),
    ...deskPts
      .filter((_, i) => i === 0 || i === deskPts.length - 1)
      .map(
        (p) =>
          `<text x="${p.x.toFixed(1)}" y="${H - 30}" fill="#8a847a" font-size="10" font-family="IBM Plex Mono, monospace" text-anchor="middle">${escapeHtml(formatTime(p.row.ts))}</text>`
      ),
  ].join("");

  host.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      ${grid}
      <line x1="${L}" y1="${zeroY.toFixed(1)}" x2="${W - R}" y2="${zeroY.toFixed(1)}" stroke="rgba(238,232,223,0.2)" stroke-dasharray="3 6" />
      <path d="${area}" fill="rgba(242,92,18,0.08)" />
      <path d="${spyPath}" fill="none" stroke="rgba(238,232,223,0.38)" stroke-width="1.4" />
      <path d="${deskPath}" fill="none" stroke="#f25c12" stroke-width="2.3" />
      ${deskPts
        .map((p) => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.2" fill="#0c0c0c" stroke="#f25c12" stroke-width="1.5" />`)
        .join("")}
      <text x="${W - R + 10}" y="${last.y + 4}" fill="#eee8df" font-size="12" font-family="IBM Plex Mono, monospace">${escapeHtml(signedPct(last.pct))} desk</text>
      <text x="${W - R + 10}" y="${spyLast.y + 16}" fill="#c8c1b6" font-size="11" font-family="IBM Plex Mono, monospace">${escapeHtml(signedPct(spyClosePct))} SPY</text>
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
      `<strong>${escapeHtml(formatClock(p.row.ts))} ET</strong><br>Desk ${escapeHtml(signedPct(p.pct))}<br>Equity ${escapeHtml(money(p.row.equity))}`
    );
  });
  spyDraw.forEach((p) => {
    bind(p, `<strong>${escapeHtml(p.label)}</strong><br>${escapeHtml(signedPct(p.pct))}<br>Yahoo Finance daily`);
  });
}

function renderFirm(team, thought, meta) {
  const parsed = parseTeam(team);
  const triad = ["Morgan", "Cole", "Riley"]
    .map((name) => parsed.members.find((m) => m.name === name))
    .filter(Boolean);
  const others = parsed.members.filter((m) => !["Morgan", "Cole", "Riley"].includes(m.name));
  const lede = document.getElementById("firm-lede");
  if (lede) lede.textContent = parsed.lede;
  document.getElementById("triad").innerHTML = triad
    .map(
      (seat) => `
        <article class="seat">
          <p class="seat__role">${escapeHtml(seat.role)}</p>
          <h3 class="seat__name">${escapeHtml(seat.name)}</h3>
          <p class="seat__bio">${escapeHtml(seat.bio)}</p>
        </article>
      `
    )
    .join("");
  document.getElementById("specialists").textContent = others.length
    ? `Specialists: ${others.map((s) => s.name).join(", ")}.`
    : "";
  document.getElementById("firm-foot").textContent = parsed.closer;
  const stamp = thought.updated || meta.updated_et;
  document.getElementById("firm-status").textContent = [
    thought.status || "Delayed public status.",
    stamp ? `Last public note ${stamp}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function parseThinking(md) {
  return {
    updated: (md.match(/^Updated:\s*(.+)$/m) || [])[1]?.trim() || "",
    status: (md.match(/^Status:\s*(.+)$/m) || [])[1]?.trim() || "",
  };
}

function renderDecision(trades, changelog) {
  const fills = trades.filter((t) => t.event === "fill" && t.side === "buy");
  const rejects = parseChangelog(changelog).filter((item) => /red-team kill/i.test(item.title));
  const items = [
    ...fills.map((fill) => ({
      ts: fill.ts,
      kind: "fill",
      kindLabel: "Filled buy",
      title: fill.instrument || fill.symbol,
      body: fill.thesis || "",
    })),
    ...rejects.map((item) => ({
      ts: item.title,
      kind: "reject",
      kindLabel: "Finished reject",
      title: item.title.replace(/^[^—]+—\s*/, ""),
      body: "Completed red-team cycle. Original buy records were not rewritten.",
    })),
  ];

  const host = document.getElementById("feed");
  if (!items.length) {
    host.innerHTML = `<li><p>No completed cycles in the public log.</p></li>`;
    return;
  }

  host.innerHTML = items
    .map((item) => {
      const when = item.ts.includes("T") ? formatDay(item.ts) : item.ts.split(" — ")[0] || item.ts;
      return `
        <li>
          <time>${escapeHtml(when)}</time>
          <p class="feed__kind feed__kind--${item.kind}">${escapeHtml(item.kindLabel)}</p>
          <div>
            <h3>${escapeHtml(item.title)}</h3>
            <p>${escapeHtml(item.body)}</p>
          </div>
        </li>
      `;
    })
    .join("");
}

function renderPortfolio(pipeline) {
  const owned = pipeline?.owned || [];
  const host = document.getElementById("positions");
  if (!owned.length) {
    host.innerHTML = `<p class="quiet">No open names in the public book.</p>`;
    return;
  }
  host.innerHTML = owned
    .map(
      (row) => `
        <article class="holding">
          <h3 class="holding__name">${escapeHtml(row.name)}</h3>
          <p class="holding__state">${escapeHtml(row.state)}</p>
        </article>
      `
    )
    .join("");
}

function renderRecord(book) {
  const host = document.getElementById("closes");
  if (book.closed === 0) {
    host.innerHTML = `<p>No closes yet. Track record stays empty.</p>`;
    return;
  }
  host.innerHTML = `<p>${escapeHtml(String(book.closed))} closes on the public log.</p>`;
}

function renderJournal(md) {
  const items = parseChangelog(md);
  document.getElementById("journal-list").innerHTML = items
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

function renderMethod(md) {
  const parsed = parseMethodology(md);
  const title = document.getElementById("method-title");
  const lede = document.getElementById("method-lede");
  if (title) title.textContent = "A $500 experiment. Can it beat the market.";
  if (lede) lede.textContent = parsed.lenses || parsed.lede;
  document.getElementById("methodology").innerHTML = `
    <div>
      <h3>Who decides</h3>
      <p>${mdInline(parsed.morgan)}</p>
      <p>${mdInline(parsed.cole)}</p>
      <p>${mdInline(parsed.riley)}</p>
    </div>
    <div>
      <h3>Cadence</h3>
      <p>${mdInline(parsed.cadence)}</p>
      <p>${mdInline(parsed.rules)}</p>
    </div>
  `;
}

function watchNav() {
  const links = [...document.querySelectorAll(".toc a")];
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

async function main() {
  if (window.location.pathname === "/trade") {
    window.location.replace("/trade/");
    return;
  }

  try {
    const [meta, equity, trades, methodology, team, thinking, changelog, spy, pipeline] = await Promise.all([
      loadJson("meta.json"),
      loadJsonl("equity.jsonl"),
      loadJsonl("trades.jsonl"),
      loadText("methodology.md"),
      loadText("team.md"),
      loadText("thinking.md"),
      loadText("changelog.md"),
      loadJson("spy.json"),
      loadJson("pipeline.json"),
    ]);

    const book = computeBook(meta, equity, trades);
    book.spyClosePct = Number(spy?.bars?.[0]?.change_pct);
    const thought = parseThinking(thinking);
    renderScoreboard(book, meta, spy);
    renderChart(equity, book.start, spy);
    renderFirm(team, thought, meta);
    renderDecision(trades, changelog);
    renderPortfolio(pipeline);
    renderRecord(book);
    renderJournal(changelog);
    renderMethod(methodology);
    watchNav();
  } catch (err) {
    document.getElementById("kpis").innerHTML = `<li class="error">${escapeHtml(err.message)}</li>`;
  }
}

main();
