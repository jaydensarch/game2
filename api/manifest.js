import {FOLD,ls,pub,configured,cfgGet} from './_auth.js';
export async function GET(){
  const m={guns:{},maps:[],chars:[],skins:[],optics:[],attachments:[],outfits:[],accessories:[],bodies:[],menu:[],store:{}},cfg={},nm=p=>p.replace(/\.[^.]+$/,'');
  if(configured())try{
    for(const k in FOLD)for(const x of await ls(k)){const n=nm(x.name),u=pub(k+'/'+encodeURIComponent(x.name))+'?v='+(Date.parse(x.updated_at||x.created_at||'')||0);
      if(k==='guns')m.guns[n]=u;else if(k==='optics')m.optics.push({key:n,name:n.replace(/[-_]/g,' '),url:u});else if(k==='attachments')m.attachments.push({key:n,name:n.replace(/[-_]/g,' '),url:u});else if(k==='characters')m.chars.push(u);
      else if(k==='skins')m.skins.push({name:n.replace(/[-_]/g,' '),key:n,url:u});
      else if(k==='outfits')m.outfits.push({name:n.replace(/[-_]/g,' '),key:n,url:u});else if(k==='accessories')m.accessories.push({name:n.replace(/[-_]/g,' '),key:n,url:u});
      else if(k==='bodies')m.bodies.push({name:n.replace(/[-_]/g,' '),key:n,url:u});
      else if(k==='menu')m.menu.push({name:n.replace(/[-_]/g,' '),key:n,url:u});
      else if(x.name.toLowerCase().endsWith('.json'))cfg[n]=u;else m.maps.push({key:n,name:n.replace(/[-_]/g,' '),url:u})}
    m.menu.sort((a,b)=>a.key.localeCompare(b.key,undefined,{numeric:true}));
    for(const x of m.maps)if(cfg[x.key]){try{x.cfg=await (await fetch(cfg[x.key])).json()}catch(e){}}
    for(const [k,f] of [['optics','opticCfg'],['attachments','attCfg'],['skins','skinGuns']]){try{const c=await cfgGet('config/'+k+'.json');if(c)m[f]=c}catch(e){}}
    try{const s=await cfgGet('config/store.json');if(s)m.store=s}catch(e){}
  }catch(e){m.error=e.message}
  return Response.json(m,{headers:{'Cache-Control':'no-store'}});
}
