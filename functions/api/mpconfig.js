// Online play still uses Supabase Realtime (D1/R2 can't do live broadcast). Returns only the browser-safe URL + anon key.
export async function onRequestGet({env}){
  const H={'Cache-Control':'no-store'};
  const url=(env.SUPABASE_URL||'').replace(/\/$/,'');
  const key=env.SUPABASE_ANON_KEY||env.SUPABASE_PUBLISHABLE_KEY||'';
  if(!url.startsWith('http'))return Response.json({error:'SUPABASE_URL is not set (online play only: add it as a variable on the Cloudflare Pages project)'},{headers:H});
  if(!key)return Response.json({error:'Online play needs SUPABASE_ANON_KEY (the public anon / publishable key) as a variable on the Cloudflare Pages project, then redeploy'},{headers:H});
  return Response.json({url,key},{headers:H});
}
