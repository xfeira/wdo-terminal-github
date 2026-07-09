export const dynamic="force-dynamic";
const CANDLE_MIN=5;
export async function GET(){
  const r=await fetch("https://economia.awesomeapi.com.br/json/USD-BRL/720",{cache:"no-store"});
  const j=await r.json();
  const pts=j.map(q=>({t:+q.timestamp*1000,p:+q.bid*1000})).sort((a,b)=>a.t-b.t);
  const buckets=new Map();
  for(const{t,p}of pts){const b=Math.floor(t/(CANDLE_MIN*60000))*CANDLE_MIN*60000;
    const c=buckets.get(b);
    if(!c)buckets.set(b,{t:b,o:p,h:p,l:p,c:p});
    else{c.h=Math.max(c.h,p);c.l=Math.min(c.l,p);c.c=p}}
  return Response.json([...buckets.values()]);
}
