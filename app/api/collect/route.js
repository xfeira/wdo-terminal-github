import { sb } from "../../../lib/supabase";
import { ema, rsi, atr, macd, boll, adx } from "../../../lib/indicators";
import { getQuote, getSeries, getPrevDay, isMarketOpenBR } from "../../../lib/marketdata";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  // segurança: só coleta com a chave certa
  if (searchParams.get("key") !== process.env.COLLECT_KEY)
    return Response.json({ error: "chave inválida" }, { status: 401 });
  const force = searchParams.get("force") === "1";
  if (!force && !isMarketOpenBR())
    return Response.json({ ok: true, skipped: "mercado fechado" });

  const client = sb();
  if (!client) return Response.json({ error: "Supabase não configurado" }, { status: 501 });

  // ---- dados + indicadores (mesmo motor do terminal) ----
  const [quote, candles, prev] = await Promise.all([getQuote(), getSeries(), getPrevDay()]);
  const c = candles.map(x => x.c), h = candles.map(x => x.h), l = candles.map(x => x.l);
  const i = c.length - 1;
  const e9 = ema(c, 9), e21 = ema(c, 21), e50 = ema(c, 50);
  const r = rsi(c), a = atr(h, l, c), m = macd(c), bb = boll(c), dmi = adx(h, l, c);

  // ---- score técnico (idêntico ao painel, sem players/macro: variável limpa p/ pesquisa) ----
  let sT = 0;
  sT += e9[i] > e21[i] ? 15 : -15;
  sT += e21[i] > e50[i] ? 10 : -10;
  sT += c[i] > e50[i] ? 15 : -15;
  let sM = (m.hist[i] > 0 ? 10 : -10) + (m.hist[i] > m.hist[i - 1] ? 5 : -5) + Math.max(-15, Math.min(15, (r[i] - 50) * .6));
  let sB = (c[i] > bb.mid[i] ? 8 : -8) + (c[i] > bb.up[i] ? -7 : 0) + (c[i] < bb.dn[i] ? 7 : 0);
  const pp = (prev.h + prev.l + prev.c) / 3;
  const sP = c[i] > pp ? 15 : -15;
  const adxNow = dmi.adx[i];
  const mult = adxNow < 20 ? .45 : adxNow > 40 ? 1.1 : 1;
  const score = Math.max(-100, Math.min(100, Math.round((sT + sM + sB + sP) * mult)));

  // ---- snapshot completo ----
  const snap = {
    price: quote.bid, score,
    s_trend: sT, s_momentum: Math.round(sM), s_boll: sB, s_pivot: sP,
    rsi: +r[i].toFixed(1), atr: +a[i].toFixed(2), adx: +adxNow.toFixed(1),
    macd_hist: +m.hist[i].toFixed(3),
    ema9: +e9[i].toFixed(1), ema21: +e21[i].toFixed(1), ema50: +e50[i].toFixed(1),
    dist_pivot: +(quote.bid - pp).toFixed(1),
    src: quote.src,
  };
  const { error } = await client.from("snapshots").insert(snap);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // ---- análise macro IA (opcional, só quando ?macro=1) ----
  let macroSaved = false;
  if (searchParams.get("macro") === "1" && process.env.ANTHROPIC_API_KEY) {
    try {
      const ai = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6", max_tokens: 1000,
          tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 4 }],
          messages: [{ role: "user", content: `Você é analista macro de câmbio. Busque na web as notícias de HOJE que impactam USD/BRL e o dólar futuro na B3: Fed, Copom, inflação/emprego EUA e Brasil, risco fiscal, fluxo cambial.\nResponda APENAS com JSON puro: {"score": <inteiro -100 a 100, positivo = pressão de ALTA no dólar>, "resumo": "<2 frases>", "eventos": ["...","...","..."]}` }]
        })
      });
      const data = await ai.json();
      const txt = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("\n");
      const j = JSON.parse(txt.replace(/```json|```/g, "").match(/\{[\s\S]*\}/)[0]);
      await client.from("macro_log").insert({ score: Math.max(-100, Math.min(100, j.score | 0)), resumo: j.resumo, eventos: j.eventos || [] });
      macroSaved = true;
    } catch {}
  }

  return Response.json({ ok: true, snapshot: snap, macro: macroSaved });
}
