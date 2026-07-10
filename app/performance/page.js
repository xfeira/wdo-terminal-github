"use client";
import { useEffect, useRef, useState } from "react";

const TZ = "America/Sao_Paulo";
const fmt$ = n => n == null || isNaN(n) ? "—" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = n => (n * 100).toFixed(0) + "%";

export default function Performance() {
  const [trades, setTrades] = useState(null);
  const eqR = useRef(null);

  useEffect(() => {
    fetch("/api/trades").then(r => r.json()).then(d => setTrades(Array.isArray(d) ? d : [])).catch(() => setTrades([]));
  }, []);

  /* ---------- KPIs ---------- */
  let k = null, byDow = [], byHour = [], bySetup = [], equity = [];
  if (trades && trades.length) {
    const t = trades.map(x => ({ ...x, brl: +x.brl, r: +x.r, d: new Date(x.created_at) }));
    const wins = t.filter(x => x.brl > 0), loss = t.filter(x => x.brl < 0);
    const gw = wins.reduce((a, x) => a + x.brl, 0), gl = Math.abs(loss.reduce((a, x) => a + x.brl, 0));
    const wr = wins.length / t.length;
    const aw = wins.length ? gw / wins.length : 0, al = loss.length ? gl / loss.length : 0;
    // curva de capital + drawdown
    let acc = 0, peak = 0, maxDD = 0;
    equity = t.map(x => { acc += x.brl; peak = Math.max(peak, acc); maxDD = Math.max(maxDD, peak - acc); return acc });
    // sequências
    let curW = 0, curL = 0, maxW = 0, maxL = 0;
    t.forEach(x => { if (x.brl > 0) { curW++; curL = 0 } else if (x.brl < 0) { curL++; curW = 0 } maxW = Math.max(maxW, curW); maxL = Math.max(maxL, curL) });
    // disciplina
    const lWS = loss.filter(x => x.stop);
    const disc = lWS.length ? lWS.filter(x => x.r >= -1.1).length / lWS.length : 1;
    // trades por dia
    const days = new Set(t.map(x => x.d.toLocaleDateString("pt-BR", { timeZone: TZ })));
    k = {
      n: t.length, total: acc, wr, payoff: al ? aw / al : 0, pf: gl ? gw / gl : (gw > 0 ? 99 : 0),
      exp: wr * aw - (1 - wr) * al, maxDD, maxW, maxL, disc,
      perDay: t.length / days.size, rMed: t.reduce((a, x) => a + x.r, 0) / t.length,
      best: Math.max(...t.map(x => x.brl)), worst: Math.min(...t.map(x => x.brl)),
    };
    // por dia da semana
    const dows = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
    const dowMap = {};
    t.forEach(x => { const w = x.d.toLocaleDateString("pt-BR", { timeZone: TZ, weekday: "short" }).slice(0, 3); (dowMap[w] = dowMap[w] || []).push(x.brl) });
    byDow = ["seg", "ter", "qua", "qui", "sex"].filter(w => dowMap[w] || dowMap[w + "."]).map(w => {
      const arr = dowMap[w] || dowMap[w + "."]; return { l: w, v: arr.reduce((a, b) => a + b, 0), n: arr.length };
    });
    // por hora
    const hMap = {};
    t.forEach(x => { const h = +x.d.toLocaleTimeString("pt-BR", { timeZone: TZ, hour: "numeric", hour12: false }); (hMap[h] = hMap[h] || []).push(x.brl) });
    byHour = Object.keys(hMap).map(Number).sort((a, b) => a - b).map(h => ({ l: h + "h", v: hMap[h].reduce((a, b) => a + b, 0), n: hMap[h].length }));
    // por setup
    const sMap = {};
    t.forEach(x => { const s = (x.setup || "sem setup").toLowerCase().trim(); (sMap[s] = sMap[s] || []).push(x) });
    bySetup = Object.entries(sMap).map(([s, arr]) => ({
      s, n: arr.length, tot: arr.reduce((a, x) => a + x.brl, 0),
      wr: arr.filter(x => x.brl > 0).length / arr.length,
    })).sort((a, b) => b.tot - a.tot);
  }

  /* ---------- curva de capital (canvas) ---------- */
  useEffect(() => {
    const cv = eqR.current;
    if (!cv || !equity.length || !cv.parentElement) return;
    const box = cv.parentElement.getBoundingClientRect();
    const w = Math.floor(box.width), h = Math.floor(box.height);
    if (w < 40) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = w * dpr; cv.height = h * dpr;
    const g = cv.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const lo = Math.min(0, ...equity), hi = Math.max(0, ...equity);
    const X = i => 8 + (w - 60) * i / Math.max(1, equity.length - 1);
    const Y = v => 8 + (h - 24) * (1 - (v - lo) / (hi - lo || 1));
    g.clearRect(0, 0, w, h);
    g.strokeStyle = "#16233B"; g.beginPath(); g.moveTo(8, Y(0)); g.lineTo(w - 52, Y(0)); g.stroke();
    g.font = "9px monospace"; g.fillStyle = "#5A6A85";
    g.fillText(fmt$(hi), w - 50, Y(hi) + 8); g.fillText(fmt$(lo), w - 50, Y(lo));
    g.strokeStyle = "#F5B942"; g.lineWidth = 1.6; g.beginPath();
    equity.forEach((v, i) => i ? g.lineTo(X(i), Y(v)) : g.moveTo(X(i), Y(v))); g.stroke();
    g.fillStyle = equity[equity.length - 1] >= 0 ? "#2FBF71" : "#E5484D";
    g.beginPath(); g.arc(X(equity.length - 1), Y(equity[equity.length - 1]), 3, 0, 7); g.fill();
  });

  const Bar = ({ data }) => {
    const mx = Math.max(...data.map(d => Math.abs(d.v)), 1);
    return (<div>
      {data.map(d => (
        <div key={d.l} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0", fontFamily: "var(--mono)", fontSize: 11 }}>
          <span style={{ width: 34, color: "var(--dim)" }}>{d.l}</span>
          <div style={{ flex: 1, height: 12, position: "relative", background: "var(--panel2)", borderRadius: 3 }}>
            <div style={{ position: "absolute", left: d.v >= 0 ? "50%" : `${50 - Math.abs(d.v) / mx * 48}%`, width: `${Math.abs(d.v) / mx * 48}%`, height: "100%", borderRadius: 3, background: d.v >= 0 ? "var(--up)" : "var(--down)", opacity: .85 }} />
          </div>
          <span style={{ width: 90, textAlign: "right" }} className={d.v >= 0 ? "pos" : "neg"}>{fmt$(d.v)}</span>
          <span style={{ width: 30, textAlign: "right", color: "var(--dim)" }}>{d.n}×</span>
        </div>))}
    </div>);
  };

  return (<>
    <header>
      <div className="brand">PERFORMANCE<small>análise do diário de trades · horário de Brasília</small></div>
      <div className="spacer" />
      <a href="/" style={{ color: "var(--amber)", fontFamily: "var(--mono)", fontSize: 11, textDecoration: "none", border: "1px solid var(--line)", padding: "4px 10px", borderRadius: 4 }}>← terminal</a>
    </header>

    <main style={{ gridTemplateColumns: "1fr" }}>
      <div className="col">
        {trades === null && <section className="panel"><h2>Carregando…</h2></section>}
        {trades !== null && !trades.length && <section className="panel"><h2>Sem trades ainda</h2>
          <div style={{ fontSize: 12, color: "var(--dim)" }}>Registre operações no diário do terminal e os KPIs aparecem aqui automaticamente.</div></section>}

        {k && <>
        <section className="panel">
          <h2>Curva de capital <span className="tag">{k.n} trades</span></h2>
          <div className="cwrap" style={{ height: 180 }}><canvas ref={eqR} /></div>
        </section>

        <section className="panel">
          <h2>KPIs vitais</h2>
          <div className="metrics">
            {[["Resultado total", fmt$(k.total), k.total >= 0 ? "pos" : "neg"],
              ["Expectância/trade", fmt$(k.exp), k.exp >= 0 ? "pos" : "neg"],
              ["Profit factor", k.pf.toFixed(2), k.pf >= 1.5 ? "pos" : k.pf >= 1 ? "amb" : "neg"],
              ["Taxa de acerto", pct(k.wr), k.wr >= .4 ? "pos" : "amb"],
              ["Payoff", k.payoff.toFixed(2), k.payoff >= 1.5 ? "pos" : "amb"],
              ["Drawdown máx.", fmt$(-k.maxDD), k.maxDD === 0 ? "pos" : "neg"],
              ["Disciplina de stop", pct(k.disc), k.disc >= .8 ? "pos" : "neg"],
              ["R múltiplo médio", k.rMed.toFixed(2), k.rMed >= 0 ? "pos" : "neg"],
            ].map(([l, v, c]) => <div className="metric" key={l}><div className={"v " + c}>{v}</div><div className="l">{l}</div></div>)}
          </div>
        </section>

        <section className="panel">
          <h2>Comportamento</h2>
          <div className="metrics">
            {[["Trades por dia", k.perDay.toFixed(1), k.perDay <= 5 ? "pos" : "amb"],
              ["Maior seq. de ganhos", k.maxW + "×", "pos"],
              ["Maior seq. de perdas", k.maxL + "×", k.maxL <= 3 ? "neu" : "neg"],
              ["Melhor trade", fmt$(k.best), "pos"],
              ["Pior trade", fmt$(k.worst), "neg"],
            ].map(([l, v, c]) => <div className="metric" key={l}><div className={"v " + c}>{v}</div><div className="l">{l}</div></div>)}
          </div>
          <div style={{ fontSize: 10, color: "var(--dim)", marginTop: 8, lineHeight: 1.5 }}>
            Mais de 5 trades/dia costuma indicar overtrading. Sequência de 3+ perdas: pare e revise antes de continuar.
          </div>
        </section>

        <section className="panel">
          <h2>Resultado por dia da semana</h2>
          {byDow.length ? <Bar data={byDow} /> : <div style={{ color: "var(--dim)", fontSize: 12 }}>—</div>}
        </section>

        <section className="panel">
          <h2>Resultado por horário</h2>
          {byHour.length ? <Bar data={byHour} /> : <div style={{ color: "var(--dim)", fontSize: 12 }}>—</div>}
          <div style={{ fontSize: 10, color: "var(--dim)", marginTop: 8 }}>Se um horário é consistentemente vermelho, simplesmente pare de operar nele — é o KPI mais fácil de transformar em dinheiro.</div>
        </section>

        <section className="panel">
          <h2>Resultado por setup</h2>
          <table className="jtable"><thead><tr><th>Setup</th><th>Trades</th><th>Acerto</th><th>Total</th></tr></thead>
            <tbody>{bySetup.map(s => (
              <tr key={s.s}><td>{s.s}</td><td>{s.n}</td><td>{pct(s.wr)}</td>
                <td className={s.tot >= 0 ? "pos" : "neg"}>{fmt$(s.tot)}</td></tr>))}</tbody></table>
          <div style={{ fontSize: 10, color: "var(--dim)", marginTop: 8 }}>Setups com 10+ trades e total negativo: elimine. Concentre-se no que comprovadamente funciona pra VOCÊ.</div>
        </section>
        </>}
      </div>
    </main>
    <footer>Os KPIs são calculados sobre todos os trades registrados no diário, em horário de Brasília.</footer>
  </>);
}
