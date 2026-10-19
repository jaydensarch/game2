import {ok,bad,FOLD,extOf,ensure,secret,hmac} from '../../lib/cf.js';
export async function onRequestPost({request,env}){
  const b=await request.json().catch(()=>({}));
  if(!ok(env,b.password))return bad('Wrong password',401);
  const fo=b.folder,fn=String(b.name||'').replace(/[^\w.\- ]/g,'_'),ext=extOf(fn);
  if(!FOLD[fo]||!FOLD[fo].includes(ext))return bad('Bad folder or file type');
  try{
    const key=fo+'/'+fn,e=Date.now()+15*60e3,s=await hmac(secret(env),'put|'+key+'|'+e);
    return Response.json({url:`/api/put?k=${encodeURIComponent(key)}&e=${e}&s=${s}`});
  }catch(e){return bad(e.message,500)}
}
