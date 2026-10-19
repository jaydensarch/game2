// One-off: copies everything out of your old Supabase project into ./migrate/out, ready to push to R2 + D1.
//   SUPABASE_URL=https://xxxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=... node migrate/from-supabase.mjs
// Then run:  sh migrate/out/upload-r2.sh   and   npx wrangler d1 execute strike-zone --remote --file=migrate/out/import.sql
import {mkdirSync,writeFileSync} from 'node:fs';
import {dirname} from 'node:path';
const HOST=(process.env.SUPABASE_URL||'').replace(/\/$/,''),KEY=process.env.SUPABASE_SERVICE_ROLE_KEY||'';
if(!HOST||!KEY){console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');process.exit(1)}
const BUCKET='strike-zone',ACC='sz-accounts',R2='strike-zone';
const FOLDERS=['guns','optics','attachments','maps','characters','skins','outfits','accessories','bodies'];
const H={apikey:KEY,Authorization:'Bearer '+KEY};
const list=async(b,prefix)=>{const out=[];for(let off=0;;off+=1000){const r=await fetch(`${HOST}/storage/v1/object/list/${b}`,{method:'POST',headers:{...H,'Content-Type':'application/json'},body:JSON.stringify({prefix,limit:1000,offset:off})});if(!r.ok)throw new Error(prefix+': '+await r.text());const j=(await r.json()).filter(x=>x.id&&!x.name.startsWith('.'));out.push(...j);if(j.length<1000)return out}};
const get=async(b,p)=>{const r=await fetch(`${HOST}/storage/v1/object/authenticated/${b}/${p.split('/').map(encodeURIComponent).join('/')}`,{headers:H});if(!r.ok)return null;return Buffer.from(await r.arrayBuffer())};
const save=(p,buf)=>{mkdirSync(dirname(p),{recursive:true});writeFileSync(p,buf)};
const q=s=>"'"+String(s).replace(/'/g,"''")+"'";
const sh=[],sql=[];const now=Date.now();
for(const f of FOLDERS)for(const x of await list(BUCKET,f)){const p=`${f}/${x.name}`,buf=await get(BUCKET,p);if(!buf){console.warn('skip',p);continue}save('migrate/out/files/'+p,buf);sh.push(`npx wrangler r2 object put "${R2}/${p}" --file="migrate/out/files/${p}" --remote`);console.log('file',p)}
for(const [file,name] of [['optics','optics'],['attachments','attachments'],['skins','skins'],['store','store']]){const buf=await get(BUCKET,`config/${file}.json`);if(buf){sql.push(`INSERT OR REPLACE INTO config(key,value,updated_at) VALUES(${q(name)},${q(buf.toString())},${now});`);console.log('config',name)}}
for(const x of await list(ACC,'users')){const buf=await get(ACC,'users/'+x.name);if(!buf)continue;const o=JSON.parse(buf.toString()),k=x.name.replace(/\.json$/,'');sql.push(`INSERT OR REPLACE INTO accounts(key,id,data,updated_at) VALUES(${q(k)},${q(o.id||'')},${q(buf.toString())},${now});`);console.log('account',k)}
for(const x of await list(ACC,'ids')){const buf=await get(ACC,'ids/'+x.name);if(!buf)continue;const o=JSON.parse(buf.toString()),id=x.name.replace(/\.json$/,'');sql.push(`INSERT OR REPLACE INTO ids(id,key,name) VALUES(${q(id)},${q(o.key)},${q(o.name)});`);console.log('id',id)}
save('migrate/out/upload-r2.sh',sh.join('\n')+'\n');save('migrate/out/import.sql',sql.join('\n')+'\n');
console.log(`\nDone: ${sh.length} files, ${sql.length} database rows.`);
