import {ok,FOLD,ls} from './_auth.js';
export async function POST(request){
  const b=await request.json().catch(()=>({}));
  if(!ok(b.password))return Response.json({error:'Wrong password'},{status:401});
  try{const out=[];for(const k in FOLD)for(const x of await ls(k))out.push({path:k+'/'+x.name,size:(x.metadata&&x.metadata.size)||0});return Response.json(out)}
  catch(e){return Response.json({error:e.message},{status:500})}
}
