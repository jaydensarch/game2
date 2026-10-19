import {ok,bad,configured,ensure,ls} from '../../lib/cf.js';
export async function onRequestGet({env}){
  let storage='ok',error='';
  if(!configured(env))storage='missing';else{try{await ensure(env);await ls(env,'guns')}catch(e){storage='error';error=e.message}}
  return Response.json({passwordSet:!!(env.ADMIN_PASSWORD||'').trim(),storage,error});
}
export async function onRequestPost({request,env}){
  if(!(env.ADMIN_PASSWORD||'').trim())return bad('ADMIN_PASSWORD is not set. Add it as a secret on your Cloudflare Pages project, then redeploy.',500);
  const b=await request.json().catch(()=>({}));
  if(!ok(env,b.password))return bad('Wrong password',401);
  return Response.json({ok:true});
}
