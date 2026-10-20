// Public (browser-safe) address of the realtime relay for online play (see /worker and README). Nothing secret here.
export async function GET(){
  const H={'Cache-Control':'no-store'},rt=(process.env.RT_URL||'').trim().replace(/\/$/,'');
  if(!/^(https?|wss?):\/\//.test(rt))return Response.json({error:'Online play needs RT_URL (your realtime relay address) in Vercel > Settings > Environment Variables, then Redeploy'},{headers:H});
  return Response.json({rt},{headers:H});
}
