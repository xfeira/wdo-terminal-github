import { sb } from "../../../lib/supabase";
export const dynamic="force-dynamic";
export async function GET(){
  const c=sb(); if(!c) return Response.json([]);
  const {data,error}=await c.from("trades").select("*").order("created_at",{ascending:true}).limit(500);
  if(error) return Response.json({error:error.message},{status:500});
  return Response.json(data);
}
export async function POST(req){
  const c=sb(); if(!c) return Response.json({error:"Supabase não configurado"},{status:501});
  const b=await req.json();
  const {data,error}=await c.from("trades").insert({
    dir:b.dir,qty:b.qty,entry:b.entry,stop:b.stop??null,exit:b.exit,
    pts:b.pts,brl:b.brl,r:b.r??0,setup:b.setup??null}).select().single();
  if(error) return Response.json({error:error.message},{status:500});
  return Response.json(data);
}
export async function DELETE(req){
  const c=sb(); if(!c) return Response.json({error:"Supabase não configurado"},{status:501});
  const {searchParams}=new URL(req.url);
  const {error}=await c.from("trades").delete().eq("id",searchParams.get("id"));
  if(error) return Response.json({error:error.message},{status:500});
  return Response.json({ok:true});
}
