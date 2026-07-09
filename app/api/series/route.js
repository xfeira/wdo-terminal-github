export const dynamic = "force-dynamic";
const OPT = { headers: { "User-Agent": "Mozilla/5.0 (compatible; TerminalWDO/1.0)" }, cache: "no-store" };
const CANDLE_MIN = 5;

async function awesome() {
  const r = await fetch("https://economia.awesomeapi.com.br/json/USD-BRL/720", OPT);
  if (!r.ok) throw new Error("awesomeapi " + r.status);
  const j = await r.json();
  if (!Array.isArray(j) || j.length < 20) throw new Error("awesomeapi vazio");
  const pts = j.map(q => ({ t: +q.timestamp * 1000, p: +q.bid * 1000 })).sort((a, b) => a.t - b.t);
  const buckets = new Map();
  for (const { t, p } of pts) {
    const b = Math.floor(t / (CANDLE_MIN * 60000)) * CANDLE_MIN * 60000;
    const c = buckets.get(b);
    if (!c) buckets.set(b, { t: b, o: p, h: p, l: p, c: p });
    else { c.h = Math.max(c.h, p); c.l = Math.min(c.l, p); c.c = p }
  }
  const out = [...buckets.values()];
  if (out.length < 10) throw new Error("awesomeapi poucos candles");
  return out;
}

async function yahoo() {
  const r = await fetch("https://query1.finance.yahoo.com/v8/finance/chart/BRL=X?interval=5m&range=5d", OPT);
  if (!r.ok) throw new Error("yahoo " + r.status);
  const res = (await r.json()).chart?.result?.[0];
  if (!res || !res.timestamp) throw new Error("yahoo sem dados");
  const q = res.indicators.quote[0];
  const out = [];
  for (let i = 0; i < res.timestamp.length; i++) {
    if (q.open[i] == null || q.close[i] == null) continue;
    out.push({
      t: res.timestamp[i] * 1000,
      o: q.open[i] * 1000, h: (q.high[i] ?? q.open[i]) * 1000,
      l: (q.low[i] ??  q.open[i]) * 1000, c: q.close[i] * 1000
    });
  }
  if (out.length < 10) throw new Error("yahoo poucos candles");
  return out.slice(-120);
}

export async function GET() {
  try { return Response.json(await awesome()) }
  catch (e1) {
    try { return Response.json(await yahoo()) }
    catch (e2) { return Response.json({ error: `${e1.message} | ${e2.message}` }, { status: 502 }) }
  }
}