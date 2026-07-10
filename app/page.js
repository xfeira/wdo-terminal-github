"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { ema, rsi, atr, macd, boll, adx, pivots } from "../lib/indicators";

const PT_VAL = 10, TICK = 0.5, POLL_MS = 30000, SERIES_MS = 60000, CANDLE_MIN = 5;
const fmt = n => n == null || isNaN(n) ? "—" : n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fmt$ = n => n == null || isNaN(n) ? "—" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const roundTick = p => Math.round(p / TICK) * TICK;
const TZ = "America/Sao_Paulo";
const brDay = d => new Date(d).toLocaleDateString("pt-BR", { timeZone: TZ });
const isMarketOpen = () => {
  const parts = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, hour12: false, weekday: "short", hour: "numeric", minute: "numeric" }).formatToParts(new Date());
  const get = t => parts.find(x => x.type === t)?.value || "";
  if (/s[áa]b|dom/i.test(get("weekday"))) return false;
  const mins = (+get("hour")) * 60 + (+get("minute"));
  return mins >= 9 * 60 && mins <= 18 * 60 + 25; // pregão WDO: 9h às 18h25 (Brasília)
};
const ls = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d } catch { return d } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)) } catch {} }
};

export default function Terminal() {
  // dados de mercado
  const candlesR = useRef([]); const liveR = useRef(null); const prevDayR = useRef(null);
  const [, force] = useState(0); const rerender = () => force(x => x + 1);
  const [conn, setConn] = useState("CONECTANDO…");
  const [cd, setCd] = useState(POLL_MS / 1000);
  // configurações
  const [cfg, setCfg] = useState({ cap: 20000, pct: 1, day: 3, mg: 150 });
  const [fg, setFg] = useState({ now: "", prev: "" });
  // posição / macro / diário
  const [position, setPosition] = useState(null);
  const [macroA, setMacroA] = useState(null);
  const [macroBusy, setMacroBusy] = useState(false);
  const [journal, setJournal] = useState([]);
  const [jf, setJf] = useState({ dir: "C", qty: 1, entry: "", stop: "", exit: "", setup: "" });
  const [jSaving, setJSaving] = useState(false);
  const [jMsg, setJMsg] = useState("");
  const flash = (m, ms = 4000) => { setJMsg(m); setTimeout(() => setJMsg(""), ms) };
  const chartR = useRef(null), macdR = useRef(null), rsiR = useRef(null);
  const lastScoreLog = useRef(0);
  // alertas sonoros + tela sempre ligada
  const audioR = useRef(null), zoneR = useRef(0), sigR = useRef("");
  const [alerts, setAlerts] = useState(false);
  const [wl, setWl] = useState(false);
  const wlR = useRef(null);
  const beep = (f = 880, d = .15, n = 1) => {
    try {
      const ctx = audioR.current || (audioR.current = new (window.AudioContext || window.webkitAudioContext)());
      let t = ctx.currentTime;
      for (let i = 0; i < n; i++) {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.frequency.value = f; o.connect(g); g.connect(ctx.destination);
        g.gain.setValueAtTime(.15, t); g.gain.exponentialRampToValueAtTime(.001, t + d);
        o.start(t); o.stop(t + d); t += d + .1;
      }
    } catch {}
    if (navigator.vibrate) navigator.vibrate(Array(n).fill(120));
  };
  const toggleAlerts = () => { setAlerts(a => { ls.set("wdo_alerts", !a); if (!a) beep(880, .1, 1); return !a }) };
  const toggleWl = async () => {
    try {
      if (wl) { await wlR.current?.release(); wlR.current = null; setWl(false) }
      else { wlR.current = await navigator.wakeLock.request("screen"); setWl(true) }
    } catch { alert("Manter tela ligada não é suportado neste navegador.") }
  };

  /* ---------- boot ---------- */
  useEffect(() => {
    setCfg(ls.get("wdo_cfg", { cap: 20000, pct: 1, day: 3, mg: 150 }));
    const f = ls.get("wdo_fg", null);
    if (f && f.d === brDay(Date.now())) setFg({ now: f.now, prev: f.prev });
    setPosition(ls.get("wdo_pos", null));
    setAlerts(!!ls.get("wdo_alerts", false));
    fetch("/api/trades").then(r => r.json()).then(d => Array.isArray(d) && setJournal(d)).catch(() => {});
    const load = async (full) => {
      try {
        const [q, s, p] = await Promise.all([
          fetch("/api/quote").then(r => r.json()),
          full ? fetch("/api/series").then(r => r.json()) : null,
          full ? fetch("/api/daily").then(r => r.json()) : null,
        ]);
        liveR.current = q;
        if (s) candlesR.current = s;
        if (p) prevDayR.current = p;
        if (!full && candlesR.current.length) {
          const b = Math.floor(q.ts / (CANDLE_MIN * 60000)) * CANDLE_MIN * 60000;
          const cs = candlesR.current, lc = cs[cs.length - 1];
          if (lc && lc.t === b) { lc.h = Math.max(lc.h, q.bid); lc.l = Math.min(lc.l, q.bid); lc.c = q.bid }
          else cs.push({ t: b, o: q.bid, h: q.bid, l: q.bid, c: q.bid });
        }
        setConn("● AO VIVO"); rerender();
      } catch { setConn("SEM CONEXÃO") }
    };
    load(true);
    const a = setInterval(() => load(false), POLL_MS);
    const b = setInterval(() => load(true), SERIES_MS);
    const t = setInterval(() => setCd(x => x <= 1 ? POLL_MS / 1000 : x - 1), 1000);
    return () => { clearInterval(a); clearInterval(b); clearInterval(t) };
  }, []);

  /* ---------- engine ---------- */
  const candles = candlesR.current, live = liveR.current, prevDay = prevDayR.current;
  const ready = candles.length >= 5;
  let ind = null, cf = null, re = null, lvls = [];
  if (ready) {
    const c = candles.map(x => x.c), h = candles.map(x => x.h), l = candles.map(x => x.l);
    ind = { e9: ema(c, 9), e21: ema(c, 21), e50: ema(c, 50), r: rsi(c), a: atr(h, l, c), mac: macd(c), bb: boll(c), dmi: adx(h, l, c) };
    if (prevDay) {
      lvls = pivots(prevDay);
      const hs = Math.max(...h), lo2 = Math.min(...l);
      lvls.push(["Fibo 50%", hs - (hs - lo2) * .5, "p"], ["Fibo 61,8%", hs - (hs - lo2) * .618, "s"], ["Fibo 38,2%", hs - (hs - lo2) * .382, "r"]);
      lvls.sort((a, b) => b[1] - a[1]);
    }
    cf = confluence(ind);
    re = riskEngine(ind);
  }

  function playersAdj() {
    if (fg.now === "" || fg.now == null) return { adj: 0, txt: "não informado" };
    const now = +fg.now, prev = +fg.prev, delta = fg.prev !== "" ? now - prev : 0;
    let adj = 0;
    if (now > 0) adj += 5; if (now < 0) adj -= 5;
    if (delta > 2000) adj += 5; if (delta < -2000) adj -= 5;
    return { adj, txt: `${now > 0 ? "comprado" : "vendido"} ${Math.abs(now).toLocaleString("pt-BR")} ct${fg.prev !== "" ? ` · fluxo ${delta >= 0 ? "+" : ""}${delta.toLocaleString("pt-BR")}` : ""}` };
  }
  function macroAdj() {
    if (!macroA) return { adj: 0, txt: "sem análise" };
    const age = (Date.now() - macroA.t) / 60000;
    if (age > 120) return { adj: 0, txt: "análise expirada (>2h)" };
    return { adj: Math.round(macroA.score * .2), txt: `${macroA.score > 0 ? "+" : ""}${macroA.score} · há ${age.toFixed(0)} min` };
  }
  function confluence(ind) {
    const i = candles.length - 1, c = candles[i].c, bd = []; let raw = 0;
    let t = 0;
    t += ind.e9[i] > ind.e21[i] ? 15 : -15;
    t += ind.e21[i] > ind.e50[i] ? 10 : -10;
    t += c > ind.e50[i] ? 15 : -15;
    bd.push(["Tendência (EMAs 9/21/50)", t, 40]); raw += t;
    let m = 0; const hst = ind.mac.hist;
    m += hst[i] > 0 ? 10 : -10;
    m += hst[i] > hst[i - 1] ? 5 : -5;
    m += Math.max(-15, Math.min(15, (ind.r[i] - 50) * .6));
    bd.push(["Momentum (MACD + RSI)", Math.round(m), 30]); raw += m;
    let b = c > ind.bb.mid[i] ? 8 : -8;
    if (c > ind.bb.up[i]) b -= 7; if (c < ind.bb.dn[i]) b += 7;
    bd.push(["Posição (Bollinger)", b, 15]); raw += b;
    let s = 0;
    if (prevDay) { const pp = (prevDay.h + prevDay.l + prevDay.c) / 3; s = c > pp ? 15 : -15 }
    bd.push(["Estrutura (lado do pivô)", s, 15]); raw += s;
    const a = ind.dmi.adx[i]; let mult = 1, note = "ADX " + a.toFixed(0);
    if (a < 20) { mult = .45; note += " — lateral (amortecido)" }
    else if (a > 40) { mult = 1.1; note += " — tendência forte" }
    const pa = playersAdj(), ma = macroAdj();
    bd.push(["Players (estrangeiro)", pa.adj, 10]);
    bd.push(["Macro IA", ma.adj, 20]);
    const score = Math.max(-100, Math.min(100, Math.round(raw * mult + pa.adj + ma.adj)));
    return { score, bd, note };
  }
  function riskEngine(ind) {
    const i = candles.length - 1, atrNow = ind.a[i];
    const stop = roundTick(Math.max(TICK, 1.5 * atrNow));
    const risk$ = cfg.cap * cfg.pct / 100;
    const qty = Math.max(0, Math.min(Math.floor(risk$ / (stop * PT_VAL)), Math.floor(cfg.cap / cfg.mg)));
    return { stop, risk$, qty, dayLim: cfg.cap * cfg.day / 100, target: 2 * stop, atrNow };
  }

  /* ---------- score history p/ backtesting ---------- */
  useEffect(() => {
    if (!cf || !live) return;
    if (!isMarketOpen()) return; // fora do pregão, não grava histórico
    if (Date.now() - lastScoreLog.current > 5 * 60000) {
      lastScoreLog.current = Date.now();
      fetch("/api/scores", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ score: cf.score, price: live.bid }) }).catch(() => {});
    }
  });

  /* ---------- alertas ---------- */
  useEffect(() => {
    if (!cf || !alerts) return;
    const z = cf.score >= 60 ? 1 : cf.score <= -60 ? -1 : 0;
    if (z !== 0 && z !== zoneR.current) beep(z > 0 ? 880 : 440, .15, 2);
    zoneR.current = z;
  });

  /* ---------- posição ---------- */
  const openPos = dir => {
    const entry = roundTick(+document.getElementById("pIn").value || live?.bid || candles[candles.length - 1].c);
    const p = { dir, entry, qty: +document.getElementById("pQty").value || 1, stop0: roundTick(dir === "C" ? entry - re.stop : entry + re.stop), hiSince: entry, loSince: entry, t: Date.now() };
    setPosition(p); ls.set("wdo_pos", p);
  };
  function trailingStop(p, a) {
    const risk = Math.abs(p.entry - p.stop0);
    if (p.dir === "C") { let s = p.stop0; if (p.hiSince - p.entry >= risk) s = Math.max(s, p.entry + TICK); return Math.max(s, roundTick(p.hiSince - a)) }
    let s = p.stop0; if (p.entry - p.loSince >= risk) s = Math.min(s, p.entry - TICK); return Math.min(s, roundTick(p.loSince + a));
  }
  let posView = null;
  if (position && ready) {
    const i = candles.length - 1, px = live ? live.bid : candles[i].c, p = { ...position };
    p.hiSince = Math.max(p.hiSince, px); p.loSince = Math.min(p.loSince, px);
    if (p.hiSince !== position.hiSince || p.loSince !== position.loSince) { ls.set("wdo_pos", p); if (JSON.stringify(p) !== JSON.stringify(position)) setTimeout(() => setPosition(p), 0) }
    const pts = p.dir === "C" ? px - p.entry : p.entry - px;
    const risk = Math.abs(p.entry - p.stop0), r = risk ? pts / risk : 0;
    const trail = trailingStop(p, ind.a[i]);
    const tgt = p.dir === "C" ? p.entry + 2 * risk : p.entry - 2 * risk;
    const sigs = [];
    const stopHit = p.dir === "C" ? px <= trail : px >= trail;
    const tgtHit = p.dir === "C" ? px >= tgt : px <= tgt;
    const scoreFlip = p.dir === "C" ? cf.score <= -25 : cf.score >= 25;
    const emaCross = p.dir === "C" ? px < ind.e9[i] : px > ind.e9[i];
    const nearLvl = lvls.find(([n, v, c]) => Math.abs(px - v) <= ind.a[i] * .5 && (p.dir === "C" ? c === "r" : c === "s"));
    if (stopHit) sigs.push(["hot", "⛔ STOP/TRAILING VIOLADO — SAIA AGORA"]);
    else if (tgtHit) sigs.push(["hot", "🎯 ALVO 2R ATINGIDO — realize (total ou parcial)"]);
    else {
      if (scoreFlip) sigs.push(["hot", "⚠ CONFLUÊNCIA INVERTEU CONTRA A POSIÇÃO — saída recomendada"]);
      if (nearLvl) sigs.push(["warn", `⚠ Zona de ${p.dir === "C" ? "resistência" : "suporte"} (${nearLvl[0]}) — considere parcial`]);
      if (emaCross) sigs.push(["warn", "Preço cruzou a EMA9 contra a posição — atenção"]);
      if (!sigs.length) sigs.push(["ok", `✅ MANTER — trailing protege em ${fmt(trail)}`]);
    }
    posView = { p, px, pts, r, trail, tgt, sigs };
  }
  useEffect(() => {
    if (!alerts) { sigR.current = ""; return }
    const s = posView && posView.sigs[0][0] === "hot" ? posView.sigs[0][1] : "";
    if (s && s !== sigR.current) beep(660, .2, 3);
    sigR.current = s;
  });
  const closePos = async () => {
    if (!posView) return;
    const { p, px, pts } = posView;
    const risk = Math.abs(p.entry - p.stop0);
    await addTrade({ dir: p.dir, qty: p.qty, entry: p.entry, stop: p.stop0, exit: roundTick(px), pts, brl: pts * PT_VAL * p.qty - p.qty * 2, r: risk ? pts / risk : 0, setup: "via gestão de posição" });
    setPosition(null); ls.set("wdo_pos", null);
  };

  /* ---------- diário (Supabase) ---------- */
  async function addTrade(t) {
    setJSaving(true); setJMsg("⏳ Enviando para a nuvem…");
    try {
      const r = await fetch("/api/trades", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(t) });
      const d = await r.json();
      if (d && d.id) { setJournal(j => [...j, d]); flash("✅ Trade salvo na nuvem!"); setJSaving(false); return true }
      flash("❌ " + (d.error || "Falha ao salvar — tente de novo")); setJSaving(false); return false;
    } catch { flash("❌ Sem conexão — trade NÃO foi salvo"); setJSaving(false); return false }
  }
  const submitJ = async () => {
    const pin = +jf.entry, pout = +jf.exit, pstop = +jf.stop;
    if (!pin || !pout) return;
    const pts = jf.dir === "C" ? pout - pin : pin - pout;
    const risk = pstop ? Math.abs(pin - pstop) : 0;
    await addTrade({ dir: jf.dir, qty: +jf.qty || 1, entry: pin, stop: pstop || null, exit: pout, pts, brl: pts * PT_VAL * (+jf.qty || 1) - (+jf.qty || 1) * 2, r: risk ? pts / risk : 0, setup: jf.setup });
    setJf({ ...jf, entry: "", stop: "", exit: "", setup: "" });
  };
  const delTrade = async id => {
    await fetch(`/api/trades?id=${id}`, { method: "DELETE" });
    setJournal(j => j.filter(t => t.id !== id));
  };
  const hoje = brDay(Date.now());
  const dailyPnL = journal.filter(t => brDay(t.created_at) === hoje).reduce((a, t) => a + +t.brl, 0);
  const rateTrade = t => {
    const r = +t.r;
    if (!t.stop || r === 0) return ["—", "neu"];
    if (r >= 2) return ["🎯 ≥2R", "pos"];
    if (r > 0) return ["✓ ganho", "pos"];
    if (r >= -1.1) return ["stop ok", "neu"];
    return ["⚠ estourou stop", "neg"];
  };
  const lossesWithStop = journal.filter(t => +t.brl < 0 && t.stop);
  const disciplined = lossesWithStop.filter(t => +t.r >= -1.1).length;
  const discipline = lossesWithStop.length ? disciplined / lossesWithStop.length : 1;
  const wins = journal.filter(t => +t.brl > 0), loss = journal.filter(t => +t.brl < 0);
  const wr = journal.length ? wins.length / journal.length : 0;
  const aw = wins.length ? wins.reduce((a, t) => a + +t.brl, 0) / wins.length : 0;
  const al = loss.length ? Math.abs(loss.reduce((a, t) => a + +t.brl, 0) / loss.length) : 0;

  /* ---------- macro IA ---------- */
  const runMacro = async () => {
    setMacroBusy(true);
    try {
      const r = await fetch("/api/macro", { method: "POST" });
      const j = await r.json();
      if (j.error) alert(j.error);
      else setMacroA({ ...j, t: Date.now() });
    } catch { alert("Falha ao consultar o analista de IA.") }
    setMacroBusy(false);
  };

  /* ---------- canvas ---------- */
  const draw = useCallback(() => {
    if (!ready) return;
    const N = Math.min(candles.length, 80), cs = candles.slice(-N);
    const setup = cv => {
      if (!cv || !cv.parentElement) return null;
      const box = cv.parentElement.getBoundingClientRect();
      const w = Math.floor(box.width), h = Math.floor(box.height);
      if (w < 40 || h < 40) return null;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = w * dpr; cv.height = h * dpr;
      const g = cv.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { g, w, h };
    };
    { const cv = chartR.current; const S = cv && setup(cv); if (S) {
      const { g, w, h } = S;
      const pad = { l: 6, r: 52, t: 8, b: 8 };
      const lo = Math.min(...cs.map(x => x.l), ...ind.bb.dn.slice(-N)), hiV = Math.max(...cs.map(x => x.h), ...ind.bb.up.slice(-N));
      const X = i => pad.l + (w - pad.l - pad.r) * (i + .5) / N, Y = v => pad.t + (h - pad.t - pad.b) * (1 - (v - lo) / (hiV - lo || 1));
      g.clearRect(0, 0, w, h); g.font = "9px monospace"; g.fillStyle = "#5A6A85"; g.strokeStyle = "#16233B";
      for (let k = 0; k <= 4; k++) { const v = lo + (hiV - lo) * k / 4, y = Y(v); g.beginPath(); g.moveTo(pad.l, y); g.lineTo(w - pad.r, y); g.stroke(); g.fillText(fmt(v), w - pad.r + 4, y + 3) }
      g.setLineDash([3, 3]);
      [["up", "#33507A"], ["dn", "#33507A"]].forEach(([k, c]) => { g.strokeStyle = c; g.beginPath(); ind.bb[k].slice(-N).forEach((v, i) => i ? g.lineTo(X(i), Y(v)) : g.moveTo(X(i), Y(v))); g.stroke() });
      g.setLineDash([]);
      for (const [, v, cls] of lvls) { if (v < lo || v > hiV) continue; g.strokeStyle = cls === "p" ? "rgba(245,185,66,.5)" : cls === "r" ? "rgba(229,72,77,.35)" : "rgba(47,191,113,.35)"; g.setLineDash([6, 4]); g.beginPath(); g.moveTo(pad.l, Y(v)); g.lineTo(w - pad.r, Y(v)); g.stroke(); g.setLineDash([]) }
      const cw = Math.max(2, (w - pad.l - pad.r) / N * .6);
      cs.forEach((cd, i) => { const up = cd.c >= cd.o; g.strokeStyle = g.fillStyle = up ? "#2FBF71" : "#E5484D"; g.beginPath(); g.moveTo(X(i), Y(cd.h)); g.lineTo(X(i), Y(cd.l)); g.stroke(); g.fillRect(X(i) - cw / 2, Y(Math.max(cd.o, cd.c)), cw, Math.max(1, Math.abs(Y(cd.o) - Y(cd.c)))) });
      [["e9", "#F5B942"], ["e21", "#7AA2F7"], ["e50", "#B48EAD"]].forEach(([k, c]) => { g.strokeStyle = c; g.lineWidth = 1.4; g.beginPath(); ind[k].slice(-N).forEach((v, i) => i ? g.lineTo(X(i), Y(v)) : g.moveTo(X(i), Y(v))); g.stroke(); g.lineWidth = 1 });
    }}
    { const cv = macdR.current; const S = cv && setup(cv); if (S) {
      const { g, w, h } = S;
      const hist = ind.mac.hist.slice(-N), m = ind.mac.m.slice(-N), s = ind.mac.sig.slice(-N);
      const mx = Math.max(...hist.map(Math.abs), ...m.map(Math.abs), ...s.map(Math.abs), .1);
      const X = i => 4 + (w - 8) * (i + .5) / N, Y = v => h / 2 - (v / mx) * (h / 2 - 8);
      g.clearRect(0, 0, w, h); g.strokeStyle = "#16233B"; g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();
      const bw = Math.max(1, (w - 8) / N * .5);
      hist.forEach((v, i) => { g.fillStyle = v >= 0 ? "rgba(47,191,113,.7)" : "rgba(229,72,77,.7)"; g.fillRect(X(i) - bw / 2, Math.min(Y(0), Y(v)), bw, Math.abs(Y(v) - Y(0))) });
      [[m, "#F5B942"], [s, "#7AA2F7"]].forEach(([a, c]) => { g.strokeStyle = c; g.beginPath(); a.forEach((v, i) => i ? g.lineTo(X(i), Y(v)) : g.moveTo(X(i), Y(v))); g.stroke() });
    }}
    { const cv = rsiR.current; const S = cv && setup(cv); if (S) {
      const { g, w, h } = S;
      const r = ind.r.slice(-N);
      const X = i => 4 + (w - 8) * (i + .5) / N, Y = v => h - (v / 100) * (h - 10) - 5;
      g.clearRect(0, 0, w, h);
      g.fillStyle = "rgba(229,72,77,.08)"; g.fillRect(0, Y(100), w, Y(70) - Y(100));
      g.fillStyle = "rgba(47,191,113,.08)"; g.fillRect(0, Y(30), w, Y(0) - Y(30));
      g.strokeStyle = "#16233B"; [30, 50, 70].forEach(v => { g.beginPath(); g.moveTo(0, Y(v)); g.lineTo(w, Y(v)); g.stroke() });
      g.strokeStyle = "#F5B942"; g.beginPath(); r.forEach((v, i) => i ? g.lineTo(X(i), Y(v)) : g.moveTo(X(i), Y(v))); g.stroke();
    }}
  }, [ready, candles, ind, lvls]);
  useEffect(() => { draw(); const f = () => draw(); window.addEventListener("resize", f); return () => window.removeEventListener("resize", f) });

  /* ---------- render ---------- */
  const i = ready ? candles.length - 1 : 0;
  const s = cf ? cf.score : 0;
  const scoreCls = s >= 25 ? "pos" : s <= -25 ? "neg" : "neu";
  const dir = s >= 25 ? "C" : s <= -25 ? "V" : null;
  const entry = ready ? (live ? live.bid : candles[i].c) : 0;
  const stStop = dailyPnL <= -(re?.dayLim ?? Infinity);
  const pa = ready ? playersAdj() : { adj: 0, txt: "" };
  const ma = macroAdj();

  return (<>
    <header>
      <div className="brand">TERMINAL&nbsp;WDO<small>USD/BRL ×1000 · proxy do mini dólar · nuvem</small></div>
      <div className="price-block">
        <div id="px">{live ? fmt(live.bid) : "—"}</div>
        <div className={live && live.pct >= 0 ? "pos" : "neg"} id="pxvar">{live ? (live.pct >= 0 ? "▲ +" : "▼ ") + live.pct.toFixed(2) + "%" : "—"}</div>
      </div>
      <div className="meta">
        <div>Máx {live ? fmt(live.high) : "—"} · Mín {live ? fmt(live.low) : "—"}</div>
        <div>Atualizado {live ? new Date(live.ts).toLocaleTimeString("pt-BR", { timeZone: TZ }) : "—"} · próximo em {cd}s</div>
      </div>
      <div className="spacer" />
      <a href="/performance" className="ghost" style={{ textDecoration: "none", background: "transparent", border: "1px solid var(--line)", color: "var(--dim)", padding: "4px 8px", fontSize: 10, borderRadius: 4, fontFamily: "var(--mono)" }}>📊 performance</a>
      <button className="ghost" onClick={toggleAlerts}>{alerts ? "🔔 alertas ON" : "🔕 alertas off"}</button>
      <button className="ghost" onClick={toggleWl}>{wl ? "☀ tela fixa ON" : "☾ tela fixa off"}</button>
      <span className={"pill " + (conn.includes("VIVO") ? "live" : "demo")}>{conn}</span>
    </header>

    <main>
      <div className="col">
        <section className="panel">
          <h2>Gráfico 5 min <span className="tag">{ready ? `O ${fmt(candles[i].o)} H ${fmt(candles[i].h)} L ${fmt(candles[i].l)} C ${fmt(candles[i].c)}` : "carregando…"}</span></h2>
          <div className="cwrap cwrap-lg"><canvas ref={chartR} /></div>
        </section>
        <section className="panel"><h2>MACD (12,26,9)</h2><div className="cwrap cwrap-sm"><canvas ref={macdR} /></div></section>
        <section className="panel">
          <h2>RSI 14 <span className="tag">{ready ? ind.r[i].toFixed(0) + (ind.r[i] > 70 ? " sobrecomprado" : ind.r[i] < 30 ? " sobrevendido" : "") : "—"}</span></h2>
          <div className="cwrap cwrap-sm"><canvas ref={rsiR} /></div>
        </section>
        <section className="panel">
          <h2>Diário de trades <span className="tag">{journal.length} trades · nuvem</span></h2>
          <div className="jform">
            <div><label>Direção</label><select value={jf.dir} onChange={e => setJf({ ...jf, dir: e.target.value })}><option value="C">Compra</option><option value="V">Venda</option></select></div>
            <div><label>Contratos</label><input type="number" min="1" value={jf.qty} onChange={e => setJf({ ...jf, qty: e.target.value })} /></div>
            <div><label>Entrada <a onClick={() => live && setJf({ ...jf, entry: roundTick(live.bid) })} style={{ color: "var(--amber)", cursor: "pointer" }}>⚡agora</a></label><input type="number" step="0.5" value={jf.entry} onChange={e => setJf({ ...jf, entry: e.target.value })} /></div>
            <div><label>Stop <a onClick={() => { if (!re) return; const base = +jf.entry || (live && live.bid); if (!base) return; setJf({ ...jf, stop: roundTick(jf.dir === "C" ? base - re.stop : base + re.stop) }) }} style={{ color: "var(--amber)", cursor: "pointer" }}>⚡1,5×ATR</a></label><input type="number" step="0.5" value={jf.stop} onChange={e => setJf({ ...jf, stop: e.target.value })} /></div>
            <div><label>Saída <a onClick={() => live && setJf({ ...jf, exit: roundTick(live.bid) })} style={{ color: "var(--amber)", cursor: "pointer" }}>⚡agora</a> <a onClick={() => { const e = +jf.entry, s = +jf.stop; if (!e || !s) { flash("Preencha entrada e stop primeiro"); return } const r = Math.abs(e - s); setJf({ ...jf, exit: roundTick(jf.dir === "C" ? e + 2 * r : e - 2 * r) }) }} style={{ color: "var(--amber)", cursor: "pointer" }}>⚡alvo 2R</a></label><input type="number" step="0.5" value={jf.exit} onChange={e => setJf({ ...jf, exit: e.target.value })} /></div>
            <div><label>Setup</label><input value={jf.setup} onChange={e => setJf({ ...jf, setup: e.target.value })} placeholder="ex.: pullback S1" /></div>
            <button onClick={submitJ} disabled={jSaving}>{jSaving ? "⏳ Salvando…" : "Registrar"}</button>
          </div>
          {jMsg && <div style={{ marginTop: 8, fontFamily: "var(--mono)", fontSize: 12, color: jMsg.startsWith("✅") ? "var(--up)" : jMsg.startsWith("❌") ? "var(--down)" : "var(--amber)" }}>{jMsg}</div>}
          <table className="jtable"><thead><tr><th>Data</th><th>Dir</th><th>Qtd</th><th>Entrada</th><th>Saída</th><th>Pts</th><th>R$</th><th>R</th><th>Aval.</th><th>Setup</th><th></th></tr></thead>
            <tbody>{journal.slice(-12).reverse().map(t => (
              <tr key={t.id}>
                <td>{new Date(t.created_at).toLocaleString("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</td>
                <td className={t.dir === "C" ? "pos" : "neg"}>{t.dir}</td><td>{t.qty}</td>
                <td>{fmt(+t.entry)}</td><td>{fmt(+t.exit)}</td>
                <td className={+t.pts >= 0 ? "pos" : "neg"}>{+t.pts > 0 ? "+" : ""}{fmt(+t.pts)}</td>
                <td className={+t.brl >= 0 ? "pos" : "neg"}>{fmt$(+t.brl)}</td>
                <td>{(+t.r).toFixed(2)}</td>
                <td className={rateTrade(t)[1]}>{rateTrade(t)[0]}</td>
                <td>{t.setup || ""}</td>
                <td><button className="ghost" onClick={() => delTrade(t.id)}>×</button></td>
              </tr>))}</tbody></table>
          <div className="metrics">
            {[["Taxa de acerto", (wr * 100).toFixed(0) + "%", wr >= .4 ? "pos" : "neg"],
              ["Payoff", al ? (aw / al).toFixed(2) : "—", aw / al >= 1.5 ? "pos" : "amb"],
              ["Expectância/trade", fmt$(wr * aw - (1 - wr) * al), wr * aw - (1 - wr) * al >= 0 ? "pos" : "neg"],
              ["Disciplina de stop", (discipline * 100).toFixed(0) + "%", discipline >= .8 ? "pos" : "neg"],
              ["Hoje", fmt$(dailyPnL), dailyPnL >= 0 ? "pos" : "neg"],
              ["Acumulado", fmt$(journal.reduce((a, t) => a + +t.brl, 0)), journal.reduce((a, t) => a + +t.brl, 0) >= 0 ? "pos" : "neg"]
            ].map(([l, v, c]) => <div className="metric" key={l}><div className={"v " + c}>{v}</div><div className="l">{l}</div></div>)}
          </div>
        </section>
      </div>

      <div className="col">
        <section className="panel">
          <h2>Score de confluência <span className="tag">-100 … +100</span></h2>
          <div className="score-wrap">
            <div id="scoreNum" className={scoreCls}>{cf ? (s > 0 ? "+" : "") + s : "—"}</div>
            <div id="scoreLabel" className={scoreCls}>{cf ? (s >= 60 ? "COMPRA FORTE" : s >= 25 ? "VIÉS COMPRADOR" : s <= -60 ? "VENDA FORTE" : s <= -25 ? "VIÉS VENDEDOR" : "SEM CONFLUÊNCIA — FIQUE DE FORA") : "CALCULANDO"}</div>
            <div className="bar"><div className="tick" style={{ left: (50 + s / 2) + "%" }} /></div>
            <div className="bar-scale"><span>-100 venda</span><span>0</span><span>+100 compra</span></div>
          </div>
          {cf && <div className="breakdown">
            {cf.bd.map(([n, v, w]) => <div className="row" key={n}><span>{n} <span style={{ color: "var(--dim)" }}>/{w}</span></span><span className={v > 0 ? "pos" : v < 0 ? "neg" : "neu"}>{v > 0 ? "+" : ""}{v}</span></div>)}
            <div className="row"><span>Força</span><span className="amb">{cf.note}</span></div>
          </div>}
        </section>

        <section className="panel">
          <h2>Posição aberta <span className="tag">gestão de saída</span></h2>
          {!posView ? <div>
            <div className="inputs">
              <div><label>Preço de entrada</label><input id="pIn" type="number" step="0.5" placeholder="vazio = cotação atual" /></div>
              <div><label>Contratos</label><input id="pQty" type="number" defaultValue="1" min="1" /></div>
            </div>
            <div className="btnrow">
              <button className="buy" onClick={() => openPos("C")} disabled={!ready}>ENTREI COMPRADO</button>
              <button className="sell" onClick={() => openPos("V")} disabled={!ready}>ENTREI VENDIDO</button>
            </div>
          </div> : <div>
            <div className="kv">
              {[["Posição", `${posView.p.dir === "C" ? "COMPRADO" : "VENDIDO"} ${posView.p.qty} ct @ ${fmt(posView.p.entry)}`],
                ["Resultado flutuante", <span key="f" className={posView.pts >= 0 ? "pos" : "neg"}>{posView.pts > 0 ? "+" : ""}{fmt(posView.pts)} pts · {fmt$(posView.pts * PT_VAL * posView.p.qty)}</span>],
                ["Múltiplo R", <span key="r" className={posView.r >= 0 ? "pos" : "neg"}>{posView.r.toFixed(2)}R</span>],
                ["Stop atual (trailing)", fmt(posView.trail)],
                ["Alvo 2R", fmt(posView.tgt)]
              ].map(([k, v]) => <div className="row" key={k}><span>{k}</span><span>{v}</span></div>)}
            </div>
            <div className={"exit-sig" + (posView.sigs[0][0] === "hot" ? " hot" : "")}>{posView.sigs.map(x => <div key={x[1]}>{x[1]}</div>)}</div>
            <div className="btnrow"><button className="flat" onClick={closePos}>ENCERREI A POSIÇÃO (registrar no diário)</button></div>
          </div>}
        </section>

        <section className="panel">
          <h2>Plano de trade</h2>
          <div className="kv">
            {ready && [["Direção autorizada", dir === "C" ? "COMPRA" : dir === "V" ? "VENDA" : "NENHUMA — aguardar confluência"],
              ["Referência de entrada", dir ? fmt(roundTick(entry)) : "—"],
              ["Stop (1,5 × ATR)", dir ? `${fmt(roundTick(dir === "C" ? entry - re.stop : entry + re.stop))} (${fmt(re.stop)} pts)` : fmt(re.stop) + " pts"],
              ["Alvo mínimo 2R", dir ? `${fmt(roundTick(dir === "C" ? entry + re.target : entry - re.target))} (${fmt(re.target)} pts)` : fmt(re.target) + " pts"],
              ["Risco por contrato", fmt$(re.stop * PT_VAL)],
              ["Contratos autorizados", re.qty + " ct"]
            ].map(([k, v]) => <div className="row" key={k}><span>{k}</span><span>{v}</span></div>)}
          </div>
        </section>

        <section className="panel">
          <h2>Gestão de risco <span className="tag">circuit breaker</span></h2>
          <div className="inputs">
            {[["cap", "Capital (R$)"], ["pct", "Risco por trade (%)"], ["day", "Perda diária máx (%)"], ["mg", "Margem/contrato (R$)"]].map(([k, l]) => (
              <div key={k}><label>{l}</label><input type="number" value={cfg[k]} onChange={e => { const c = { ...cfg, [k]: +e.target.value }; setCfg(c); ls.set("wdo_cfg", c) }} /></div>))}
          </div>
          {ready && <div className="kv" style={{ marginTop: 10 }}>
            {[["ATR 14 (5 min)", fmt(re.atrNow) + " pts"], ["Risco máx / trade", fmt$(re.risk$)], ["Limite de perda diário", fmt$(re.dayLim)], ["Resultado de hoje", fmt$(dailyPnL)]]
              .map(([k, v]) => <div className="row" key={k}><span>{k}</span><span>{v}</span></div>)}
          </div>}
          <div className={"status " + (stStop ? "stop" : dailyPnL < 0 ? "warn" : "ok")}>
            {stStop ? "⛔ LIMITE ATINGIDO — PARE DE OPERAR HOJE" : dailyPnL < 0 ? `⚠ NO NEGATIVO — restam ${fmt$((re?.dayLim ?? 0) + dailyPnL)}` : "✅ LIBERADO PARA OPERAR"}
          </div>
        </section>

        <section className="panel">
          <h2>Níveis do dia <span className="tag">pivôs + camarilla + fibo</span></h2>
          <table className="lv-table"><tbody>
            {lvls.map(([name, v, cls]) => {
              const near = live && re && Math.abs(live.bid - v) <= re.atrNow * .6;
              return <tr key={name} className={near ? "near" : ""}><td className={"lv-" + cls}>{name}{near ? " ◄" : ""}</td><td>{fmt(v)}</td></tr>;
            })}
          </tbody></table>
        </section>

        <section className="panel">
          <h2>Players — dólar futuro <span className="tag">B3, D+1</span></h2>
          <div className="inputs">
            <div><label>Estrangeiro líq. hoje (contratos)</label><input type="number" value={fg.now} onChange={e => { const f = { ...fg, now: e.target.value }; setFg(f); ls.set("wdo_fg", { ...f, d: brDay(Date.now()) }) }} placeholder="ex.: -45000" /></div>
            <div><label>Estrangeiro líq. ontem</label><input type="number" value={fg.prev} onChange={e => { const f = { ...fg, prev: e.target.value }; setFg(f); ls.set("wdo_fg", { ...f, d: brDay(Date.now()) }) }} placeholder="ex.: -52000" /></div>
          </div>
          <div className="kv" style={{ marginTop: 8 }}>
            <div className="row"><span>Leitura</span><span className={pa.adj > 0 ? "pos" : pa.adj < 0 ? "neg" : "neu"}>{pa.txt}</span></div>
            <div className="row"><span>Efeito no score</span><span>{pa.adj > 0 ? "+" : ""}{pa.adj}</span></div>
          </div>
        </section>

        <section className="panel">
          <h2>Analista macro IA <span className={"tag " + (macroA ? (macroA.score > 10 ? "pos" : macroA.score < -10 ? "neg" : "neu") : "")}>{macroA ? (macroA.score > 0 ? "+" : "") + macroA.score : "—"}</span></h2>
          <button style={{ width: "100%" }} onClick={runMacro} disabled={macroBusy}>{macroBusy ? "ANALISANDO… (~30 s)" : "ANALISAR NOTÍCIAS AGORA"}</button>
          {macroA && <>
            <div className="kv" style={{ marginTop: 8 }}>{macroA.eventos.map(e => <div className="row" key={e}><span style={{ color: "var(--ink)" }}>{e}</span></div>)}
              <div className="row"><span>Efeito no score</span><span>{ma.txt}</span></div></div>
            <div className="macro-sum">{macroA.resumo}</div>
          </>}
        </section>
      </div>
    </main>

    <footer>
      Dados: AwesomeAPI via servidor próprio · Diário e histórico de scores: Supabase · Analista macro: Claude API.<br />
      Ferramenta de leitura técnica e disciplina — não é recomendação de investimento. Derivativos alavancados podem gerar perdas superiores ao capital.
    </footer>
  </>);
}
