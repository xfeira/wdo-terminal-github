export const dynamic="force-dynamic";
export async function GET(){
  const r=await fetch("https://economia.awesomeapi.com.br/json/last/USD-BRL",{cache:"no-store"});
  const j=await r.json(); const q=j.USDBRL;
  return Response.json({bid:+q.bid*1000,high:+q.high*1000,low:+q.low*1000,pct:+q.pctChange,ts:+q.timestamp*1000});
}
