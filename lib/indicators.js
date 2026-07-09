// Motor de análise técnica — funções puras (validadas)
export const ema=(a,p)=>{const k=2/(p+1),o=[];a.forEach((v,i)=>o.push(i?v*k+o[i-1]*(1-k):v));return o};
export function rsi(c,p=14){const g=[0],l=[0];for(let i=1;i<c.length;i++){g.push(Math.max(c[i]-c[i-1],0));l.push(Math.max(c[i-1]-c[i],0))}
  const ag=[g[0]],al=[l[0]],out=[50];
  for(let i=1;i<c.length;i++){ag.push((ag[i-1]*(p-1)+g[i])/p);al.push((al[i-1]*(p-1)+l[i])/p);
    out.push(al[i]===0?100:100-100/(1+ag[i]/al[i]))}return out}
export function atr(h,l,c,p=14){const tr=[h[0]-l[0]],out=[tr[0]];
  for(let i=1;i<c.length;i++){tr.push(Math.max(h[i]-l[i],Math.abs(h[i]-c[i-1]),Math.abs(l[i]-c[i-1])));
    out.push((out[i-1]*(p-1)+tr[i])/p)}return out}
export function macd(c){const f=ema(c,12),s=ema(c,26),m=f.map((v,i)=>v-s[i]),sig=ema(m,9);
  return{m,sig,hist:m.map((v,i)=>v-sig[i])}}
export function boll(c,p=20,mult=2){const mid=[],up=[],dn=[];
  for(let i=0;i<c.length;i++){const w=c.slice(Math.max(0,i-p+1),i+1),mu=w.reduce((a,b)=>a+b,0)/w.length;
    const sd=Math.sqrt(w.reduce((a,b)=>a+(b-mu)**2,0)/w.length);
    mid.push(mu);up.push(mu+mult*sd);dn.push(mu-mult*sd)}return{mid,up,dn}}
export function adx(h,l,c,p=14){const n=c.length;if(n<2)return{adx:[0],diP:[0],diM:[0]};
  const trA=[h[0]-l[0]],pdm=[0],mdm=[0];
  for(let i=1;i<n;i++){const up=h[i]-h[i-1],dn=l[i-1]-l[i];
    pdm.push(up>dn&&up>0?up:0);mdm.push(dn>up&&dn>0?dn:0);
    trA.push(Math.max(h[i]-l[i],Math.abs(h[i]-c[i-1]),Math.abs(l[i]-c[i-1])))}
  const sm=a=>{const o=[a[0]];for(let i=1;i<a.length;i++)o.push((o[i-1]*(p-1)+a[i])/p);return o};
  const trS=sm(trA),pS=sm(pdm),mS=sm(mdm);
  const diP=pS.map((v,i)=>trS[i]?100*v/trS[i]:0),diM=mS.map((v,i)=>trS[i]?100*v/trS[i]:0);
  const dx=diP.map((v,i)=>{const s=v+diM[i];return s?100*Math.abs(v-diM[i])/s:0});
  return{adx:sm(dx),diP,diM}}
export function pivots(prev){const{h,l,c}=prev,pp=(h+l+c)/3,rg=h-l,cam=x=>c+rg*1.1*x;
  return[["R3",h+2*(pp-l),"r"],["R2",pp+rg,"r"],["R1",2*pp-l,"r"],["PP",pp,"p"],
    ["S1",2*pp-h,"s"],["S2",pp-rg,"s"],["S3",l-2*(h-pp),"s"],
    ["Cama H4",cam(1/2),"r"],["Cama H3",cam(1/4),"r"],["Cama L3",cam(-1/4),"s"],["Cama L4",cam(-1/2),"s"]]}
