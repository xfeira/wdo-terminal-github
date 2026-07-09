import { createClient } from "@supabase/supabase-js";
export function sb(){
  const url=process.env.SUPABASE_URL, key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key) return null;
  return createClient(url,key,{auth:{persistSession:false}});
}
