import {ok,bad,FOLD} from '../../lib/cf.js';
export async function onRequestPost({request,env}){
  const b=await request.json().catch(()=>({}));
  if(!ok(env,b.password))return bad('Wrong password',401);
  const m=/^([a-z]+)\/[\w.\- ]+$/.exec(String(b.path||''));
  if(!m||!FOLD[m[1]])return bad('Bad path');
  try{await env.BUCKET.delete(b.path);return Response.json({ok:true})}catch(e){return bad(e.message,500)}
}
