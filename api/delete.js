import {ok,FOLD,del} from './_auth.js';
export async function POST(request){
  const b=await request.json().catch(()=>({}));
  if(!ok(b.password))return Response.json({error:'Wrong password'},{status:401});
  const m=/^([a-z]+)\/[\w.\- ]+$/.exec(String(b.path||''));
  if(!m||!FOLD[m[1]])return Response.json({error:'Bad path'},{status:400});
  try{await del(b.path);return Response.json({ok:true})}
  catch(e){return Response.json({error:e.message},{status:500})}
}
