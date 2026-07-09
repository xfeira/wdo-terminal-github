import { sb } from "../../../lib/supabase";
export const dynamic="force-dynamic";
export async function POST(req){
  const c=sb(); if(!c) return Response.json({ok:false});
  const b=await req.json();
  await c.from("scores").insert({score:b.score,price:b.price});
  return Response.json({ok:true});
}
export async function GET(){
  const c=sb(); if(!c) return Response.json([]);
  const {data}=await c.from("scores").select("*").order("created_at",{ascending:false}).limit(500);
  return Response.json(data||[]);
}
