export const dynamic="force-dynamic";
export async function GET(){
  const r=await fetch("https://economia.awesomeapi.com.br/json/daily/USD-BRL/3",{cache:"no-store"});
  const j=await r.json(); const p=j[1]||j[0];
  return Response.json({h:+p.high*1000,l:+p.low*1000,c:+p.bid*1000});
}
