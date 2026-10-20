// Admin-saved JSON settings (optics, attachments, skins, store), kept in D1. POST {password} reads, POST {password,map} saves.
import {ok,cfgGet,cfgPut} from './_auth.js';
export const cfgRoute=name=>async request=>{
  const b=await request.json().catch(()=>({}));
  if(!ok(b.password))return Response.json({error:'Wrong password'},{status:401});
  try{
    if(b.map){await cfgPut(name,b.map);return Response.json({ok:true})}
    return Response.json((await cfgGet(name))||{});
  }catch(e){return Response.json({error:e.message},{status:500})}
};
