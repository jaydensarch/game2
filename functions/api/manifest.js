import {FOLD,ls,pub,configured,cfgGet} from '../../lib/cf.js';
export async function onRequestGet({env}){
  const m={guns:{},maps:[],chars:[],skins:[],optics:[],attachments:[],outfits:[],accessories:[],bodies:[],store:{}},cfg={},nm=p=>p.replace(/\.[^.]+$/,'');
  if(configured(env))try{
    for(const k in FOLD)for(const x of await ls(env,k)){const n=nm(x.name),u=pub(k+'/'+encodeURIComponent(x.name))+'?v='+(Date.parse(x.updated_at||'')||0);
      if(k==='guns')m.guns[n]=u;else if(k==='optics')m.optics.push({key:n,name:n.replace(/[-_]/g,' '),url:u});else if(k==='attachments')m.attachments.push({key:n,name:n.replace(/[-_]/g,' '),url:u});else if(k==='characters')m.chars.push(u);
      else if(k==='skins')m.skins.push({name:n.replace(/[-_]/g,' '),key:n,url:u});
      else if(k==='outfits')m.outfits.push({name:n.replace(/[-_]/g,' '),key:n,url:u});else if(k==='accessories')m.accessories.push({name:n.replace(/[-_]/g,' '),key:n,url:u});
      else if(k==='bodies')m.bodies.push({name:n.replace(/[-_]/g,' '),key:n,url:u});
      else if(x.name.toLowerCase().endsWith('.json'))cfg[n]=x.name;else m.maps.push({key:n,name:n.replace(/[-_]/g,' '),url:u})}
    for(const x of m.maps)if(cfg[x.key]){try{const o=await env.BUCKET.get('maps/'+cfg[x.key]);if(o)x.cfg=await o.json()}catch(e){}}
    for(const [k,f] of [['optics','opticCfg'],['attachments','attCfg'],['skins','skinGuns']]){const v=await cfgGet(env,k);if(v)m[f]=v}
    const s=await cfgGet(env,'store');if(s)m.store=s;
  }catch(e){m.error=e.message}
  return Response.json(m,{headers:{'Cache-Control':'no-store'}});
}
