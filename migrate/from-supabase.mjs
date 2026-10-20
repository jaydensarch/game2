// One-off: copies your game files, settings, accounts and player IDs from the old Supabase project straight into Cloudflare R2 + D1.
// Run it on your own computer (Node 20+) from the project folder:   node --env-file=.env migrate/from-supabase.mjs
// .env needs: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (old project, one-time) and the same CF_* / R2_* values you put in Vercel. Safe to run again:
// files are overwritten, accounts and IDs that already exist in D1 are left alone. Nothing is deleted from Supabase.
import {q,ensure,presignPut} from '../api/_auth.js';
const need=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','CF_ACCOUNT_ID','CF_API_TOKEN','CF_D1_ID','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','R2_BUCKET'];
const miss=need.filter(k=>!(process.env[k]||'').trim());
if(miss.length){console.error('Missing from your .env file: '+miss.join(', '));process.exit(1)}
const HOST=process.env.SUPABASE_URL.trim().replace(/\/$/,''),KEY=process.env.SUPABASE_SERVICE_ROLE_KEY.trim();
const BUCKET='strike-zone',ACC='sz-accounts';
const FOLDERS=['guns','optics','attachments','maps','characters','skins','outfits','accessories','bodies'];
const H={apikey:KEY,Authorization:'Bearer '+KEY};
const list=async(b,prefix)=>{const out=[];for(let off=0;;off+=1000){const r=await fetch(`${HOST}/storage/v1/object/list/${b}`,{method:'POST',headers:{...H,'Content-Type':'application/json'},body:JSON.stringify({prefix,limit:1000,offset:off})});if(!r.ok)throw new Error(`Supabase list ${b}/${prefix}: ${r.status} ${(await r.text()).slice(0,150)}`);const j=(await r.json()).filter(x=>x.id&&!x.name.startsWith('.'));out.push(...j);if(j.length<1000)return out}};
const get=async(b,p)=>{const r=await fetch(`${HOST}/storage/v1/object/authenticated/${b}/${p.split('/').map(encodeURIComponent).join('/')}`,{headers:H});return r.ok?Buffer.from(await r.arrayBuffer()):null};
const n={files:0,config:0,accounts:0,ids:0,fail:0};
const fail=(what,e)=>{n.fail++;console.warn('  FAILED',what,'-',e.message)};
await ensure();
console.log('Files...');
for(const f of FOLDERS){let items=[];try{items=await list(BUCKET,f)}catch(e){fail(f,e);continue}
  for(const x of items){const key=`${f}/${x.name}`;try{const buf=await get(BUCKET,key);if(!buf)throw new Error('download failed');
    const r=await fetch(presignPut(key),{method:'PUT',body:buf});if(!r.ok)throw new Error('R2 '+r.status+' '+(await r.text()).slice(0,120));n.files++;console.log('  ',key)}catch(e){fail(key,e)}}}
console.log('Settings...');
for(const name of ['optics','attachments','skins','store']){try{const buf=await get(BUCKET,`config/${name}.json`);if(!buf)continue;JSON.parse(buf.toString());
  await q('INSERT OR REPLACE INTO config(key,value,updated_at) VALUES(?,?,?)',[name,buf.toString(),Date.now()]);n.config++;console.log('  ',name)}catch(e){fail('config/'+name,e)}}
console.log('Accounts...');
try{for(const x of await list(ACC,'users')){try{const buf=await get(ACC,'users/'+x.name);if(!buf)throw new Error('download failed');const o=JSON.parse(buf.toString()),k=x.name.replace(/\.json$/,'');
  await q('INSERT OR IGNORE INTO accounts(key,id,data,updated_at) VALUES(?,?,?,?)',[k,o.id||null,buf.toString(),Date.now()]);n.accounts++;console.log('  ',k)}catch(e){fail('users/'+x.name,e)}}}catch(e){fail('accounts',e)}
console.log('Player IDs...');
try{for(const x of await list(ACC,'ids')){try{const buf=await get(ACC,'ids/'+x.name);if(!buf)throw new Error('download failed');const o=JSON.parse(buf.toString()),id=x.name.replace(/\.json$/,'');
  await q('INSERT OR IGNORE INTO ids(id,key,name) VALUES(?,?,?)',[id,o.key||String(o.name||'').toLowerCase(),o.name||o.key||'']);n.ids++}catch(e){fail('ids/'+x.name,e)}}}catch(e){fail('ids',e)}
console.log(`\nDone: ${n.files} files, ${n.config} settings, ${n.accounts} accounts, ${n.ids} player IDs copied.${n.fail?` ${n.fail} FAILED (see lines above) - run it again to retry.`:''}`);
process.exit(n.fail?1:0);
