// Shared helpers: D1 (accounts, ids, config) and R2 (game files). Bindings: env.DB (D1), env.BUCKET (R2).
export const FOLD={guns:['.glb','.obj'],optics:['.glb','.obj'],attachments:['.glb','.obj'],maps:['.glb','.obj','.json'],characters:['.glb','.obj'],skins:['.png','.jpg','.jpeg','.webp'],outfits:['.png','.jpg','.jpeg','.webp'],accessories:['.glb'],bodies:['.glb']};
export const MIME={'.glb':'model/gltf-binary','.obj':'text/plain','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp'};
const enc=new TextEncoder();

/* ---- small crypto helpers (WebCrypto, no Node needed) ---- */
export const teq=(a,b)=>{a=String(a);b=String(b);let d=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)d|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return d===0};
export const b64u=bytes=>{let s='';for(const c of bytes)s+=String.fromCharCode(c);return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')};
export const b64uStr=s=>b64u(enc.encode(s));
export const fromB64uStr=s=>{s=s.replace(/-/g,'+').replace(/_/g,'/');while(s.length%4)s+='=';return new TextDecoder().decode(Uint8Array.from(atob(s),c=>c.charCodeAt(0)))};
export const hex=u8=>[...u8].map(x=>x.toString(16).padStart(2,'0')).join('');
export const unhex=h=>Uint8Array.from(h.match(/../g)||[],x=>parseInt(x,16));
export async function hmac(secret,msg){const k=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return b64u(new Uint8Array(await crypto.subtle.sign('HMAC',k,enc.encode(msg))))}
export async function pbkdf2(pw,saltHex){const k=await crypto.subtle.importKey('raw',enc.encode(pw),'PBKDF2',false,['deriveBits']);return hex(new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:unhex(saltHex),iterations:100000},k,512)))}

/* ---- admin password / signing secret ---- */
export const ok=(env,p)=>{const w=(env.ADMIN_PASSWORD||'').trim();return !!w&&teq(String(p||'').trim(),w)};
export const secret=env=>env.SESSION_SECRET||env.ADMIN_PASSWORD||'';
export const configured=env=>!!(env.DB&&env.BUCKET);
export const bad=(m,s=400)=>Response.json({error:m},{status:s});

/* ---- D1: tables are created on first use (schema.sql has the same statements) ---- */
const SCHEMA=[
 'CREATE TABLE IF NOT EXISTS accounts (key TEXT PRIMARY KEY, id TEXT, data TEXT NOT NULL, updated_at INTEGER)',
 'CREATE INDEX IF NOT EXISTS accounts_id ON accounts(id)',
 'CREATE TABLE IF NOT EXISTS ids (id TEXT PRIMARY KEY, key TEXT NOT NULL, name TEXT)',
 'CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER)'];
let ready=null;
export const ensure=env=>ready||(ready=env.DB.batch(SCHEMA.map(s=>env.DB.prepare(s))).catch(e=>{ready=null;throw e}));

/* config JSON (optics / attachments / skins / store settings) */
export async function cfgGet(env,name){try{await ensure(env);const r=await env.DB.prepare('SELECT value FROM config WHERE key=?').bind(name).first();return r?JSON.parse(r.value):null}catch(e){return null}}
export async function cfgPut(env,name,obj){await ensure(env);await env.DB.prepare('INSERT INTO config(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').bind(name,JSON.stringify(obj),Date.now()).run()}

/* accounts + stable player ids */
export async function accGet(env,k){const r=await env.DB.prepare('SELECT data FROM accounts WHERE key=?').bind(k).first();if(!r)return null;try{return JSON.parse(r.data)}catch(e){return null}}
export async function accPut(env,k,o){await env.DB.prepare('INSERT INTO accounts(key,id,data,updated_at) VALUES(?,?,?,?) ON CONFLICT(key) DO UPDATE SET id=excluded.id,data=excluded.data,updated_at=excluded.updated_at').bind(k,o.id||null,JSON.stringify(o),Date.now()).run()}
export async function accInsert(env,k,o){try{await env.DB.prepare('INSERT INTO accounts(key,id,data,updated_at) VALUES(?,?,?,?)').bind(k,o.id||null,JSON.stringify(o),Date.now()).run();return true}catch(e){if(/UNIQUE|constraint/i.test(String(e.message)))return false;throw e}}
export async function idGet(env,id){return await env.DB.prepare('SELECT key,name FROM ids WHERE id=?').bind(id).first()}
export async function idPut(env,id,o){await env.DB.prepare('INSERT INTO ids(id,key,name) VALUES(?,?,?)').bind(id,o.key,o.name).run()}

/* ---- R2: game files, served same-origin from /files/<folder>/<name> ---- */
export const pub=p=>'/files/'+p;
export async function ls(env,folder){const out=[];let cursor;do{const r=await env.BUCKET.list({prefix:folder+'/',limit:1000,cursor});for(const o of r.objects){const name=o.key.slice(folder.length+1);if(name&&!name.includes('/')&&!name.startsWith('.'))out.push({name,size:o.size,updated_at:o.uploaded.toISOString()})}cursor=r.truncated?r.cursor:undefined}while(cursor);return out}
export const extOf=n=>(String(n).match(/\.[^.]+$/)||[''])[0].toLowerCase();
