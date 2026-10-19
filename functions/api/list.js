import {ok,bad,FOLD,ls} from '../../lib/cf.js';
export async function onRequestPost({request,env}){
  const b=await request.json().catch(()=>({}));
  if(!ok(env,b.password))return bad('Wrong password',401);
  try{const out=[];for(const k in FOLD)for(const x of await ls(env,k))out.push({path:k+'/'+x.name,size:x.size||0});return Response.json(out)}
  catch(e){return bad(e.message,500)}
}
