// Busca de dados de mercado (server-side) com fonte reserva
const OPT = { headers: { "User-Agent": "Mozilla/5.0 (compatible; TerminalWDO/1.0)" }, cache: "no-store" };
const CANDLE_MIN = 5;

export async function getQuote() {
  try {
    const r = await fetch("https://economia.awesomeapi.com.br/json/last/USD-BRL", OPT);
    const q = (await r.json()).USDBRL;
    if (!q?.bid) throw 0;
    return { bid: +q.bid * 1000, src: "awesomeapi" };
  } catch {
    const r = await fetch("https://query1.finance.yahoo.com/v8/finance/chart/BRL=X?interval=1m&range=1d", OPT);
    const m = (await r.json()).chart.result[0].meta;
    return { bid: m.regularMarketPrice * 1000, src: "yahoo" };
  }
}

export async function getSeries() {
  try {
    const r = await fetch("https://economia.awesomeapi.com.br/json/USD-BRL/720", OPT);
    const j = await r.json();
    if (!Array.isArray(j) || j.length < 20) throw 0;
    const pts = j.map(q => ({ t: +q.timestamp * 1000, p: +q.bid * 1000 })).sort((a, b) => a.t - b.t);
    const buckets = new Map();
    for (const { t, p } of pts) {
      const b = Math.floor(t / (CANDLE_MIN * 60000)) * CANDLE_MIN * 60000;
      const c = buckets.get(b);
      if (!c) buckets.set(b, { t: b, o: p, h: p, l: p, c: p });
      else { c.h = Math.max(c.h, p); c.l = Math.min(c.l, p); c.c = p }
    }
    const out = [...buckets.values()];
    if (out.length < 10) throw 0;
    return out;
  } catch {
    const r = await fetch("https://query1.finance.yahoo.com/v8/finance/chart/BRL=X?interval=5m&range=5d", OPT);
    const res = (await r.json()).chart.result[0], q = res.indicators.quote[0], out = [];
    for (let i = 0; i < res.timestamp.length; i++) {
      if (q.open[i] == null || q.close[i] == null) continue;
      out.push({ t: res.timestamp[i] * 1000, o: q.open[i] * 1000, h: (q.high[i] ?? q.open[i]) * 1000, l: (q.low[i] ?? q.open[i]) * 1000, c: q.close[i] * 1000 });
    }
    return out.slice(-120);
  }
}

export async function getPrevDay() {
  try {
    const r = await fetch("https://economia.awesomeapi.com.br/json/daily/USD-BRL/3", OPT);
    const p = (await r.json())[1];
    if (!p?.high) throw 0;
    return { h: +p.high * 1000, l: +p.low * 1000, c: +p.bid * 1000 };
  } catch {
    const r = await fetch("https://query1.finance.yahoo.com/v8/finance/chart/BRL=X?interval=1d&range=5d", OPT);
    const res = (await r.json()).chart.result[0], q = res.indicators.quote[0], days = [];
    for (let i = 0; i < res.timestamp.length; i++) {
      if (q.high[i] == null) continue;
      days.push({ h: q.high[i] * 1000, l: q.low[i] * 1000, c: q.close[i] * 1000 });
    }
    return days[days.length - 2];
  }
}

export function isMarketOpenBR() {
  const parts = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour12: false, weekday: "short", hour: "numeric", minute: "numeric" }).formatToParts(new Date());
  const get = t => parts.find(x => x.type === t)?.value || "";
  if (/s[áa]b|dom/i.test(get("weekday"))) return false;
  const mins = (+get("hour")) * 60 + (+get("minute"));
  return mins >= 9 * 60 && mins <= 18 * 60 + 25;
}
