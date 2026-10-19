import {bad,FOLD,MIME,extOf,secret,hmac,teq} from '../../lib/cf.js';
export async function onRequestPut({request,env}){
  const u=new URL(request.url),key=u.searchParams.get('k')||'',e=+u.searchParams.get('e'),s=u.searchParams.get('s')||'';
  if(!secret(env)||!(e>Date.now())||!teq(s,await hmac(secret(env),'put|'+key+'|'+e)))return bad('Upload link expired, try again',403);
  const m=/^([a-z]+)\/[\w.\- ]+$/.exec(key);if(!m||!FOLD[m[1]]||!FOLD[m[1]].includes(extOf(key)))return bad('Bad path');
  try{
    const len=request.headers.get('content-length');
    const body=len?request.body:await request.arrayBuffer();
    await env.BUCKET.put(key,body,{httpMetadata:{contentType:MIME[extOf(key)]||'application/octet-stream'}});
    return Response.json({ok:true});
  }catch(err){return bad(err.message,500)}
}
