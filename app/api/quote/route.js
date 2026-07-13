export const dynamic = "force-dynamic";
const OPT = { headers: { "User-Agent": "Mozilla/5.0 (compatible; TerminalWDO/1.0)" }, cache: "no-store" };

async function awesome() {
  const r = await fetch("https://economia.awesomeapi.com.br/json/last/USD-BRL", OPT);
  if (!r.ok) throw new Error("awesomeapi " + r.status);
  const q = (await r.json()).USDBRL;
  if (!q || !q.bid) throw new Error("awesomeapi sem dados");
  return { bid: +q.bid * 1000, high: +q.high * 1000, low: +q.low * 1000, pct: +q.pctChange, ts: +q.timestamp * 1000, src: "awesomeapi" };
}

async function yahoo() {
  const r = await fetch("https://query1.finance.yahoo.com/v8/finance/chart/BRL=X?interval=1m&range=1d", OPT);
  if (!r.ok) throw new Error("yahoo " + r.status);
  const res = (await r.json()).chart?.result?.[0];
  if (!res) throw new Error("yahoo sem dados");
  const m = res.meta, q = res.indicators.quote[0];
  const closes = (q.close || []).filter(x => x != null);
  const highs = (q.high || []).filter(x => x != null);
  const lows = (q.low || []).filter(x => x != null);
  const bid = (m.regularMarketPrice ?? closes[closes.length - 1]) * 1000;
  const prev = (m.chartPreviousClose || 0) * 1000;
  return { bid, high: (highs.length ? Math.max(...highs) : bid / 1000) * 1000, low: (lows.length ? Math.min(...lows) : bid / 1000) * 1000, pct: prev ? (bid - prev) / prev * 100 : 0, ts: Date.now(), src: "yahoo" };
}

async function cmeFuture() {
  const r = await fetch("https://query1.finance.yahoo.com/v8/finance/chart/6L=F?interval=1m&range=1d", OPT);
  const m = (await r.json()).chart?.result?.[0]?.meta;
  if (!m?.regularMarketPrice) throw new Error("6L sem dados");
  return 1000 / m.regularMarketPrice; // USD por BRL -> pontos de WDO
}

export async function GET() {
  let base;
  try { base = await awesome() }
  catch (e1) {
    try { base = await yahoo() }
    catch (e2) { return Response.json({ error: `${e1.message} | ${e2.message}` }, { status: 502 }) }
  }
  // deslocamento automático via futuro do CME (gêmeo de arbitragem do WDO)
  try {
    const f = await cmeFuture();
    const off = f - base.bid;
    if (isFinite(off) && Math.abs(off) < 120) { base.future = +f.toFixed(1); base.off = +off.toFixed(1) }
  } catch {}
  return Response.json(base);
}
