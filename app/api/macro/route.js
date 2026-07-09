export const dynamic="force-dynamic";
export async function POST(){
  const key=process.env.ANTHROPIC_API_KEY;
  if(!key) return Response.json({error:"Defina ANTHROPIC_API_KEY nas variáveis de ambiente do Render."},{status:501});
  const r=await fetch("https://api.anthropic.com/v1/messages",{
    method:"POST",
    headers:{"Content-Type":"application/json","x-api-key":key,"anthropic-version":"2023-06-01"},
    body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:1000,
      tools:[{type:"web_search_20250305",name:"web_search",max_uses:4}],
      messages:[{role:"user",content:
`Você é analista macro de câmbio. Busque na web as notícias de HOJE que impactam USD/BRL e o dólar futuro na B3: decisões/discursos do Fed e do Copom, dados de inflação/emprego EUA e Brasil, risco fiscal brasileiro, fluxo cambial.
Responda APENAS com JSON puro, sem markdown, no formato:
{"score": <inteiro -100 a 100, positivo = pressão de ALTA no dólar/WDO>, "resumo": "<2 frases objetivas>", "eventos": ["<evento 1>","<evento 2>","<evento 3>"]}`}]})});
  const data=await r.json();
  if(!r.ok) return Response.json({error:data?.error?.message||"Falha na API Anthropic"},{status:502});
  try{
    const txt=(data.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("\n");
    const m=txt.replace(/```json|```/g,"").match(/\{[\s\S]*\}/);
    const j=JSON.parse(m[0]);
    return Response.json({score:Math.max(-100,Math.min(100,j.score|0)),resumo:j.resumo,eventos:j.eventos||[]});
  }catch(e){return Response.json({error:"Resposta da IA não pôde ser interpretada"},{status:502})}
}
