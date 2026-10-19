// Admin-saved JSON settings (optics, attachments, skins, store). POST {password} reads, POST {password,map} saves. Stored in D1 table `config`.
import {ok,bad,cfgGet,cfgPut} from './cf.js';
export const cfgRoute=name=>async({request,env})=>{
  const b=await request.json().catch(()=>({}));
  if(!ok(env,b.password))return bad('Wrong password',401);
  try{
    if(b.map){await cfgPut(env,name,b.map);return Response.json({ok:true})}
    return Response.json((await cfgGet(env,name))||{});
  }catch(e){return bad(e.message,500)}
};
