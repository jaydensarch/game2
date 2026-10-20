// Gives the admin page a one-time link (15 min). The browser then sends the file straight to R2, so it never passes through Vercel (no 4.5 MB body limit).
import {ok,FOLD,presignPut} from './_auth.js';
export async function POST(request){
  const b=await request.json().catch(()=>({}));
  if(!ok(b.password))return Response.json({error:'Wrong password'},{status:401});
  const fo=b.folder,fn=String(b.name||'').replace(/[^\w.\- ]/g,'_'),ext=(fn.match(/\.[^.]+$/)||[''])[0].toLowerCase();
  if(!FOLD[fo]||!FOLD[fo].includes(ext))return Response.json({error:'Bad folder or file type'},{status:400});
  try{return Response.json({url:presignPut(fo+'/'+fn)})}
  catch(e){return Response.json({error:e.message},{status:500})}
}
