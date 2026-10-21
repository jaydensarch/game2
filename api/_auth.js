// Storage layer: Cloudflare D1 (accounts, ids, settings) over its REST API, and Cloudflare R2 (game files) over its S3-compatible API.
// Everything runs from this Vercel project; nothing else to host. See README.txt for the environment variables.
import {createHash,createHmac} from 'node:crypto';

export const ok=p=>{const w=(process.env.ADMIN_PASSWORD||'').trim();return !!w&&String(p||'').trim()===w};
export const FOLD={guns:['.glb','.obj'],optics:['.glb','.obj'],attachments:['.glb','.obj'],maps:['.glb','.obj','.json'],characters:['.glb','.obj'],skins:['.png','.jpg','.jpeg','.webp'],outfits:['.png','.jpg','.jpeg','.webp'],accessories:['.glb'],bodies:['.glb'],menu:['.png','.jpg','.jpeg','.webp','.gif']};

/* ---------------- settings ---------------- */
const E=process.env;
const NEED=['CF_ACCOUNT_ID','CF_API_TOKEN','CF_D1_ID','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','R2_BUCKET','R2_PUBLIC_URL'];
export const missing=()=>NEED.filter(k=>!(E[k]||'').trim());
export const configured=()=>missing().length===0;
const v=k=>(E[k]||'').trim();

/* ---------------- D1 (REST API) ---------------- */
export async function q(sql,params=[]){
  const r=await fetch(`https://api.cloudflare.com/client/v4/accounts/${v('CF_ACCOUNT_ID')}/d1/database/${v('CF_D1_ID')}/query`,{method:'POST',headers:{Authorization:'Bearer '+v('CF_API_TOKEN'),'Content-Type':'application/json'},body:JSON.stringify({sql,params})});
  const j=await r.json().catch(()=>({}));
  if(!r.ok||j.success===false)throw new Error('D1: '+((j.errors&&j.errors.map(e=>e.message).join('; '))||('HTTP '+r.status)));
  return (j.result&&j.result[0]&&j.result[0].results)||[];
}
const SCHEMA=[
 'CREATE TABLE IF NOT EXISTS accounts (key TEXT PRIMARY KEY, id TEXT, data TEXT NOT NULL, updated_at INTEGER)',
 'CREATE INDEX IF NOT EXISTS accounts_id ON accounts(id)',
 'CREATE TABLE IF NOT EXISTS ids (id TEXT PRIMARY KEY, key TEXT NOT NULL, name TEXT)',
 'CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER)'];
let ready=null;
export const ensure=()=>ready||(ready=(async()=>{
  const t=await q("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('accounts','ids','config')");
  if(t.length<3)for(const s of SCHEMA)await q(s);
})().catch(e=>{ready=null;throw e}));
export const ensureAcc=ensure;

/* settings JSON (optics / attachments / skins / store). cfgGet takes the old path form, e.g. 'config/store.json' */
const cname=p=>String(p).replace(/^config\//,'').replace(/\.json$/,'');
export async function cfgGet(path){try{await ensure();const r=await q('SELECT value FROM config WHERE key=?',[cname(path)]);return r[0]?JSON.parse(r[0].value):null}catch(e){return null}}
export async function cfgPut(path,obj){await ensure();await q('INSERT INTO config(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at',[cname(path),JSON.stringify(obj),Date.now()])}

/* player accounts + stable player ids */
export async function accGet(name){const r=await q('SELECT data FROM accounts WHERE key=?',[name]);if(!r[0])return null;try{return JSON.parse(r[0].data)}catch(e){return null}}
export async function accPut(name,o){await q('INSERT INTO accounts(key,id,data,updated_at) VALUES(?,?,?,?) ON CONFLICT(key) DO UPDATE SET id=excluded.id,data=excluded.data,updated_at=excluded.updated_at',[name,o.id||null,JSON.stringify(o),Date.now()])}
export async function idGet(id){const r=await q('SELECT key,name FROM ids WHERE id=?',[id]);return r[0]||null}
export async function idPut(id,o){await q('INSERT INTO ids(id,key,name) VALUES(?,?,?)',[id,o.key,o.name])}

/* ---------------- R2 (S3 API, AWS Signature V4) ---------------- */
const sha=s=>createHash('sha256').update(s).digest('hex');
const hm=(k,s)=>createHmac('sha256',k).update(s).digest();
export const enc=s=>encodeURIComponent(s).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
const stamp=(d=new Date())=>d.toISOString().replace(/[:-]|\.\d{3}/g,'');
const skey=(sk,day,region,service)=>hm(hm(hm(hm('AWS4'+sk,day),region),service),'aws4_request');
const cq=query=>Object.keys(query).sort().map(k=>enc(k)+'='+enc(query[k])).join('&');
/* signs a request; with presign>0 returns a ready-to-use URL (query-string auth), otherwise returns {url,headers} */
export function sigV4({method,host,path,query={},headers={},payload='',ak,sk,region='auto',service='s3',date,presign=0}){
  const amz=stamp(date),day=amz.slice(0,8),scope=`${day}/${region}/${service}/aws4_request`;
  const H={host,...headers};
  if(presign){
    const names=Object.keys(H).map(x=>x.toLowerCase()).sort().join(';');
    const Q={...query,'X-Amz-Algorithm':'AWS4-HMAC-SHA256','X-Amz-Credential':`${ak}/${scope}`,'X-Amz-Date':amz,'X-Amz-Expires':String(presign),'X-Amz-SignedHeaders':names};
    const ch=Object.keys(H).map(x=>x.toLowerCase()).sort().map(x=>x+':'+String(H[Object.keys(H).find(y=>y.toLowerCase()===x)]).trim()+'\n').join('');
    const cr=[method,path,cq(Q),ch,names,'UNSIGNED-PAYLOAD'].join('\n');
    const sig=createHmac('sha256',skey(sk,day,region,service)).update(['AWS4-HMAC-SHA256',amz,scope,sha(cr)].join('\n')).digest('hex');
    return `https://${host}${path}?${cq(Q)}&X-Amz-Signature=${sig}`;
  }
  const ph=sha(payload);H['x-amz-content-sha256']=ph;H['x-amz-date']=amz;
  const low=Object.keys(H).map(x=>[x.toLowerCase(),String(H[x]).trim()]).sort((a,b)=>a[0]<b[0]?-1:1);
  const names=low.map(x=>x[0]).join(';'),cr=[method,path,cq(query),low.map(x=>x[0]+':'+x[1]+'\n').join(''),names,ph].join('\n');
  const sig=createHmac('sha256',skey(sk,day,region,service)).update(['AWS4-HMAC-SHA256',amz,scope,sha(cr)].join('\n')).digest('hex');
  const out={...H};delete out.host;out.Authorization=`AWS4-HMAC-SHA256 Credential=${ak}/${scope}, SignedHeaders=${names}, Signature=${sig}`;
  return {url:`https://${host}${path}${Object.keys(query).length?'?'+cq(query):''}`,headers:out};
}
const r2host=()=>`${v('CF_ACCOUNT_ID')}.r2.cloudflarestorage.com`;
const r2path=key=>'/'+v('R2_BUCKET')+(key?'/'+key.split('/').map(enc).join('/'):'');
const r2sign=(method,key,query,presign)=>sigV4({method,host:r2host(),path:r2path(key),query,ak:v('R2_ACCESS_KEY_ID'),sk:v('R2_SECRET_ACCESS_KEY'),presign});
const un=s=>s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&');

/* public link for a file (the bucket's public URL, see README) */
export const pub=p=>v('R2_PUBLIC_URL').replace(/\/$/,'')+'/'+p;
export const full=u=>u;
/* list one folder: [{name,id,metadata:{size},updated_at}] */
export async function ls(folder){
  const out=[];let token='';
  do{
    const query={'list-type':'2',prefix:folder+'/','max-keys':'1000'};if(token)query['continuation-token']=token;
    const s=r2sign('GET','',query,0),r=await fetch(s.url,{headers:s.headers}),x=await r.text();
    if(!r.ok)throw new Error('R2 list failed ('+r.status+'): '+x.slice(0,200));
    for(const m of x.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)){
      const k=/<Key>([\s\S]*?)<\/Key>/.exec(m[1]),n=k&&un(k[1]).slice(folder.length+1);if(!n||n.includes('/')||n.startsWith('.'))continue;
      const sz=/<Size>(\d+)<\/Size>/.exec(m[1]),lm=/<LastModified>([\s\S]*?)<\/LastModified>/.exec(m[1]);
      out.push({name:n,id:folder+'/'+n,metadata:{size:sz?+sz[1]:0},updated_at:lm?lm[1]:''});
    }
    const t=/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/.exec(x);token=/<IsTruncated>true/.test(x)&&t?un(t[1]):'';
  }while(token);
  return out;
}
/* browser uploads straight to R2 through this one-time link (15 minutes) */
export const presignPut=key=>r2sign('PUT',key,{},900);
export async function del(key){const s=r2sign('DELETE',key,{},0),r=await fetch(s.url,{method:'DELETE',headers:s.headers});if(!r.ok&&r.status!==404)throw new Error('R2 delete failed ('+r.status+'): '+(await r.text()).slice(0,200))}
export async function getText(key){const s=r2sign('GET',key,{},0),r=await fetch(s.url,{headers:s.headers});return r.ok?await r.text():null}
