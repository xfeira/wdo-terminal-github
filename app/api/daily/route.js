export const dynamic = "force-dynamic";
const OPT = { headers: { "User-Agent": "Mozilla/5.0 (compatible; TerminalWDO/1.0)" }, cache: "no-store" };

async function awesome() {
  const r = await fetch("https://economia.awesomeapi.com.br/json/daily/USD-BRL/3", OPT);
  if (!r.ok) throw new Error("awesomeapi " + r.status);
  const j = await r.json();
  const p = j[1] || j[0];
  if (!p || !p.high) throw new Error("awesomeapi sem dados");
  return { h: +p.high * 1000, l: +p.low * 1000, c: +p.bid * 1000 };
}

async function yahoo() {
  const r = await fetch("https://query1.finance.yahoo.com/v8/finance/chart/BRL=X?interval=1d&range=5d", OPT);
  if (!r.ok) throw new Error("yahoo " + r.status);
  const res = (await r.json()).chart?.result?.[0];
  if (!res || !res.timestamp) throw new Error("yahoo sem dados");
  const q = res.indicators.quote[0];
  const days = [];
  for (let i = 0; i < res.timestamp.length; i++) {
    if (q.high[i] == null) continue;
    days.push({ h: q.high[i] * 1000, l: q.low[i] * 1000, c: q.close[i] * 1000 });
  }
  if (days.length < 2) throw new Error("yahoo poucos dias");
  return days[days.length - 2];
}

export async function GET() {
  try { return Response.json(await awesome()) }
  catch (e1) {
    try { return Response.json(await yahoo()) }
    catch (e2) { return Response.json({ error: `${e1.message} | ${e2.message}` }, { status: 502 }) }
  }
}