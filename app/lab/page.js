"use client";
import { useEffect, useState } from "react";

const TZ = "America/Sao_Paulo";
const fmt$ = n => n == null ? "—" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDT = iso => iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";

export default function Lab() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    fetch("/api/lab").then(r => r.json()).then(j => j.error ? setErr(j.error) : setD(j)).catch(() => setErr("Falha ao carregar"));
  }, []);

  const HourBar = ({ clock }) => {
    const mx = Math.max(...clock.map(c => c.atr), 1);
    return (<div>
      {clock.map(c => (
        <div key={c.hora} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0", fontFamily: "var(--mono)", fontSize: 11 }}>
          <span style={{ width: 30, color: "var(--dim)" }}>{c.hora}h</span>
          <div style={{ flex: 1, height: 12, background: "var(--panel2)", borderRadius: 3, position: "relative" }}>
            <div style={{ width: `${c.atr / mx * 100}%`, height: "100%", borderRadius: 3, background: c.pctTendencia >= 40 ? "var(--up)" : "var(--amber)", opacity: .85 }} />
          </div>
          <span style={{ width: 55, textAlign: "right" }}>ATR {c.atr}</span>
          <span style={{ width: 60, textAlign: "right", color: c.pctTendencia >= 40 ? "var(--up)" : "var(--dim)" }}>{c.pctTendencia}% tend.</span>
          <span style={{ width: 40, textAlign: "right", color: "var(--dim)" }}>{c.n}×</span>
        </div>))}
    </div>);
  };

  const RegimeTable = ({ rows }) => (
    <table className="jtable"><thead><tr><th>Regime</th><th>Sinal</th><th>N</th><th>Pts/1h</th><th>% subiu</th></tr></thead>
      <tbody>{rows.map((r, i) => (
        <tr key={i}>
          <td>{r.regime}</td><td>{r.sinal}</td><td>{r.n}</td>
          <td className={r.pts1h >= 0 ? "pos" : "neg"}>{r.pts1h > 0 ? "+" : ""}{r.pts1h}</td>
          <td>{r.pctSubiu}%</td>
        </tr>))}</tbody></table>
  );

  return (<>
    <header>
      <div className="brand">LABORATÓRIO<small>hipóteses calculadas ao vivo sobre os dados coletados</small></div>
      <div className="spacer" />
      <a href="/" style={{ color: "var(--amber)", fontFamily: "var(--mono)", fontSize: 11, textDecoration: "none", border: "1px solid var(--line)", padding: "4px 10px", borderRadius: 4 }}>← terminal</a>
    </header>

    <main style={{ gridTemplateColumns: "1fr" }}>
      <div className="col">
        {err && <section className="panel"><h2>Sem dados</h2><div style={{ color: "var(--dim)", fontSize: 12 }}>{err}</div></section>}
        {!d && !err && <section className="panel"><h2>Carregando…</h2></section>}

        {d && <>
        <section className="panel">
          <h2>Saúde da coleta</h2>
          <div className="metrics">
            {[["Pregões", d.health.pregoes, "pos"],
              ["Snapshots", d.health.snapshots, "pos"],
              ["Período", `${d.health.inicio} → ${d.health.fim}`, "neu"],
              ["Análises macro", d.health.macroTotal, d.health.macroTotal > 0 ? "pos" : "neg"],
              ["Última macro", fmtDT(d.health.macroUltima), "amb"],
            ].map(([l, v, c]) => <div className="metric" key={l}><div className={"v " + c} style={{ fontSize: 13 }}>{v}</div><div className="l">{l}</div></div>)}
          </div>
          {(() => {
            const dias = d.health.macroUltima ? Math.floor((Date.now() - new Date(d.health.macroUltima).getTime()) / 86400000) : null;
            return dias != null && dias > 3 ? (
              <div className="exit-sig hot" style={{ marginTop: 10 }}>⚠ Analista Macro IA parado há {dias} dias — provável falta de crédito na Anthropic. Recarregue em console.anthropic.com para retomar essa coleta.</div>
            ) : null;
          })()}
        </section>

        <section className="panel">
          <h2>O relógio do mercado <span className="tag">ATR e % do tempo em tendência, por hora</span></h2>
          <HourBar clock={d.clock} />
          <div style={{ fontSize: 10, color: "var(--dim)", marginTop: 8 }}>Barras verdes = horas com mais tendência real (ADX≥25). Concentre operações simuladas nessas janelas.</div>
        </section>

        <section className="panel">
          <h2>Score × regime <span className="tag">movimento 1h à frente, desde {d.health.inicio < "2026-07-21" ? "21/07 (pós-correção do pivô)" : d.health.inicio}</span></h2>
          <RegimeTable rows={d.regimeTable} />
          <div style={{ fontSize: 10, color: "var(--dim)", marginTop: 8 }}>Compare "TENDÊNCIA" vs "LATERAL" na mesma linha de sinal — é aí que mora a diferença de comportamento do score.</div>
        </section>

        <section className="panel">
          <h2>Hipótese do pullback <span className="tag">só em tendência (ADX≥25)</span></h2>
          <RegimeTable rows={d.pullback.map(p => ({ regime: p.direcao, sinal: p.momentum, n: p.n, pts1h: p.pts1h, pctSubiu: p.pctSubiu }))} />
          <div style={{ fontSize: 10, color: "var(--amber)", marginTop: 8, lineHeight: 1.5 }}>
            ⚠ Cautela: o período coletado até agora foi majoritariamente uma única perna de alta. Os números do lado "BAIXA" podem estar contaminados pela tendência geral, não são uma tendência de baixa independente testada. Só tratar como validado quando o mercado passar por uma queda sustentada comparável.
          </div>
        </section>

        <section className="panel">
          <h2>Analista Macro IA <span className="tag">{d.macro.acertos + d.macro.erros > 0 ? `${d.macro.acertos}✓ / ${d.macro.erros}✗` : "sem veredictos"}</span></h2>
          <table className="jtable"><thead><tr><th>Quando</th><th>Score</th><th>Pts 2h</th><th>Veredicto</th></tr></thead>
            <tbody>{d.macro.detalhe.slice(0, 15).map((m, i) => (
              <tr key={i}>
                <td>{fmtDT(m.quando)}</td>
                <td className={m.score > 10 ? "pos" : m.score < -10 ? "neg" : "neu"}>{m.score > 0 ? "+" : ""}{m.score}</td>
                <td className={m.pts2h == null ? "neu" : m.pts2h >= 0 ? "pos" : "neg"}>{m.pts2h == null ? "—" : (m.pts2h > 0 ? "+" : "") + m.pts2h}</td>
                <td className={m.veredicto === "acerto" ? "pos" : m.veredicto === "erro" ? "neg" : "neu"}>{m.veredicto}</td>
              </tr>))}</tbody></table>
        </section>
        </>}
      </div>
    </main>
    <footer>Recalculado a cada visita, direto dos dados brutos de snapshots e macro_log. Nenhum número aqui é opinião — é o que o banco mostra até agora.</footer>
  </>);
}
