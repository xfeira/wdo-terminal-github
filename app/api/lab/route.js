import { sb } from "../../../lib/supabase";
export const dynamic = "force-dynamic";
export const maxDuration = 45;

const TZ = "America/Sao_Paulo";
const diaBR = iso => new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ });
const hourBR = iso => +new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour12: false, hour: "numeric" }).format(new Date(iso));
const CUTOFF = "2026-07-21"; // dados de antes têm o bug do pivô vazio

async function fetchAll(client, table, cols) {
  let all = [], from = 0, step = 1000;
  while (true) {
    const { data, error } = await client.from(table).select(cols).order("created_at", { ascending: true }).range(from, from + step - 1);
    if (error) throw error;
    all = all.concat(data);
    if (!data.length || data.length < step || from > 20000) break;
    from += step;
  }
  return all;
}

export async function GET() {
  const client = sb();
  if (!client) return Response.json({ error: "Supabase não configurado" }, { status: 501 });

  const [snaps, macro] = await Promise.all([
    fetchAll(client, "snapshots", "created_at,price,score,s_trend,s_momentum,s_boll,s_pivot,rsi,atr,adx"),
    fetchAll(client, "macro_log", "created_at,score,resumo,eventos"),
  ]);
  if (!snaps.length) return Response.json({ error: "sem dados ainda" });

  const health = {
    snapshots: snaps.length,
    pregoes: new Set(snaps.map(s => diaBR(s.created_at))).size,
    inicio: diaBR(snaps[0].created_at),
    fim: diaBR(snaps[snaps.length - 1].created_at),
    macroTotal: macro.length,
    macroUltima: macro.length ? macro[macro.length - 1].created_at : null,
  };

  const byDay = new Map();
  snaps.forEach(s => { const d = diaBR(s.created_at); if (!byDay.has(d)) byDay.set(d, []); byDay.get(d).push(s) });

  // relógio do mercado
  const hourAgg = {};
  snaps.forEach(s => {
    const h = hourBR(s.created_at);
    const a = hourAgg[h] || (hourAgg[h] = { atrSum: 0, adxSum: 0, trendN: 0, n: 0 });
    a.atrSum += +s.atr || 0; a.adxSum += +s.adx || 0; if (+s.adx >= 25) a.trendN++; a.n++;
  });
  const clock = Object.keys(hourAgg).map(Number).sort((a, b) => a - b).map(h => {
    const a = hourAgg[h];
    return { hora: h, atr: +(a.atrSum / a.n).toFixed(2), adx: +(a.adxSum / a.n).toFixed(1), pctTendencia: Math.round(a.trendN / a.n * 100), n: a.n };
  });

  // score x regime (1h à frente), só dados pós-correção do pivô
  const regimeBuckets = {};
  for (const [d, arr] of byDay) {
    if (d < CUTOFF) continue;
    for (let i = 0; i < arr.length; i++) {
      const a = arr[i], c = arr[i + 12];
      if (!c) continue;
      const regime = +a.adx >= 25 ? "TENDÊNCIA" : "LATERAL";
      const sinal = +a.score >= 25 ? "positivo" : (+a.score <= -25 ? "negativo" : "neutro");
      const key = regime + "|" + sinal;
      const b = regimeBuckets[key] || (regimeBuckets[key] = { n: 0, sum1h: 0, up: 0 });
      b.n++; b.sum1h += (+c.price - +a.price); if (+c.price > +a.price) b.up++;
    }
  }
  const regimeTable = Object.entries(regimeBuckets).map(([k, v]) => {
    const [regime, sinal] = k.split("|");
    return { regime, sinal, n: v.n, pts1h: +(v.sum1h / v.n).toFixed(2), pctSubiu: Math.round(v.up / v.n * 100) };
  }).sort((x, y) => (x.regime + x.sinal).localeCompare(y.regime + y.sinal));

  // hipótese do pullback (só em tendência, direção da tendência x força do momentum)
  const pbBuckets = {};
  for (const [d, arr] of byDay) {
    if (d < CUTOFF) continue;
    for (let i = 0; i < arr.length; i++) {
      const a = arr[i];
      if (+a.adx < 25) continue;
      const c = arr[i + 12];
      if (!c) continue;
      const dirT = +a.s_trend > 0 ? "ALTA" : "BAIXA";
      const mom = +a.s_momentum >= 5 ? "a favor" : (+a.s_momentum <= -5 ? "pullback" : "fraco");
      const key = dirT + "|" + mom;
      const b = pbBuckets[key] || (pbBuckets[key] = { n: 0, sum1h: 0, up: 0 });
      b.n++; b.sum1h += (+c.price - +a.price); if (+c.price > +a.price) b.up++;
    }
  }
  const pullback = Object.entries(pbBuckets).map(([k, v]) => {
    const [direcao, momentum] = k.split("|");
    return { direcao, momentum, n: v.n, pts1h: +(v.sum1h / v.n).toFixed(2), pctSubiu: Math.round(v.up / v.n * 100) };
  }).sort((x, y) => (x.direcao + x.momentum).localeCompare(y.direcao + y.momentum));

  // placar do macro IA (~2h depois de cada análise)
  let acertos = 0, erros = 0, semJanela = 0;
  const macroDetalhe = [];
  for (const m of macro) {
    const arr = byDay.get(diaBR(m.created_at));
    let idx0 = -1;
    if (arr) for (let i = 0; i < arr.length; i++) { if (arr[i].created_at <= m.created_at) idx0 = i; else break }
    const p0 = idx0 >= 0 ? arr[idx0] : null;
    const p2 = idx0 >= 0 ? arr[idx0 + 24] : null;
    if (!p0 || !p2) { semJanela++; macroDetalhe.push({ quando: m.created_at, score: m.score, resumo: m.resumo, pts2h: null, veredicto: "sem janela" }); continue }
    const moveu = +p2.price - +p0.price;
    let veredicto = "neutro";
    if (m.score > 10) veredicto = moveu > 0 ? "acerto" : "erro";
    else if (m.score < -10) veredicto = moveu < 0 ? "acerto" : "erro";
    if (veredicto === "acerto") acertos++; else if (veredicto === "erro") erros++;
    macroDetalhe.push({ quando: m.created_at, score: m.score, resumo: m.resumo, pts2h: +moveu.toFixed(1), veredicto });
  }
  macroDetalhe.reverse();

  return Response.json({ health, clock, regimeTable, pullback, macro: { acertos, erros, semJanela, detalhe: macroDetalhe } });
}
