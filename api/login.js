import {ok,configured,missing,ensure,ls} from './_auth.js';
export async function GET(){
  let storage='ok',error='';
  if(!configured()){storage='missing';error=missing().join(', ')}else{try{await ensure();await ls('guns')}catch(e){storage='error';error=e.message}}
  return Response.json({passwordSet:!!(process.env.ADMIN_PASSWORD||'').trim(),storage,error});
}
export async function POST(request){
  if(!(process.env.ADMIN_PASSWORD||'').trim())return Response.json({error:'ADMIN_PASSWORD is not set on Vercel. Add it under Settings > Environment Variables, then redeploy.'},{status:500});
  const b=await request.json().catch(()=>({}));
  if(!ok(b.password))return Response.json({error:'Wrong password'},{status:401});
  return Response.json({ok:true});
}
