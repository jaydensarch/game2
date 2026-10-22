// One function for all admin-saved settings (attachments, optics, skins, store, guns), kept in D1.
// POST {password,name} reads, POST {password,name,map} saves. (Merged into a single file because Vercel's Hobby plan allows at most 12 functions.)
// Store: { "o:OutfitName": {price:200}, "a:HatName": {price:500,slot,scale,lift,fwd,flip}, "s:CamoName": {price:0}, ... }  price 0 = free.
import {cfgRoute} from './_cfgmap.js';
const NAMES=['attachments','optics','skins','store','guns'];
export async function POST(request){
  const b=await request.clone().json().catch(()=>({}));
  if(!NAMES.includes(b.name))return Response.json({error:'Bad settings name'},{status:400});
  return cfgRoute(b.name)(request);
}
