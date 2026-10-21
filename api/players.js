// Admin: look up and edit player accounts by player ID (or username). Uses the same admin password as the rest of the panel.
// POST JSON, always with {password, a}:
//   list                                  -> every player (summary, newest activity first, max 2000)
//   get     {k | id}                      -> one player in full (k = account key, id = player ID or username)
//   update  {k, set?, add?, grant?, revoke?, resetEquip?}
//             set/add: any of xp, level (set only), kills, deaths, assists, wins, losses, coins
//             grant/revoke: arrays of item ids like "o:Name", "a:Name", "b:Name", "s:Name"
//   ban     {k, reason}    unban {k}
//   password {k, newPassword}
//   delete  {k, confirm}                  -> confirm must equal the username
// Password hashes / salts are never sent to the browser.
import {scryptSync,randomBytes} from 'node:crypto';
import {ok,configured,ensure,q,accGet,accPut,idGet} from './_auth.js';

// Level table - keep in sync with api/account.js (level 1 = 0 XP, level 2 costs 5000, every level after costs 500 more, cap 100).
const MAXL=100,need=n=>5000+500*(n-1);
const xpFor=L=>{L=Math.max(1,Math.min(MAXL,Math.floor(+L)||1));return 5000*(L-1)+250*(L-1)*(L-2)};
function lvl(xp){let l=1,r=Math.max(0,xp|0);while(l<MAXL&&r>=need(l)){r-=need(l);l++}return l>=MAXL?{level:MAXL,into:0,next:0,max:true}:{level:l,into:r,next:need(l)}}

const NUM=['xp','kills','deaths','assists','wins','losses','coins'];
const cn=v=>Math.max(0,Math.min(1e9,Math.floor(+v)||0));
const itemOk=x=>/^[oasb]:[\w.\- ]{1,100}$/.test(String(x));
const bad=(m,s=400)=>Response.json({error:m},{status:s});

const sum=(k,a,upd)=>{const L=lvl(a.xp||0);return{key:k,id:a.id||'',name:a.name,level:L.level,xp:a.xp||0,kills:a.kills||0,deaths:a.deaths||0,assists:a.assists||0,wins:a.wins||0,losses:a.losses||0,coins:a.coins||0,items:(a.owned||[]).length,created:a.created||0,updated:upd||0,banned:!!a.banned}};
const full=(k,a)=>{const L=lvl(a.xp||0);return{...sum(k,a,0),xpInto:L.into,xpNext:L.next,max:!!L.max,owned:a.owned||[],equip:a.equip||{},banned:a.banned||null}};

// find by account key (exact), else by 8-character player ID, else by username
async function find(b){
  if(b.k){const k=String(b.k).toLowerCase(),a=await accGet(k);return a?[k,a]:null}
  const raw=String(b.id||b.name||'').trim();if(!raw)return null;
  const id=raw.toUpperCase();
  if(/^[A-Z0-9]{8}$/.test(id)){const r=await idGet(id),a=r&&await accGet(r.key);if(a)return[r.key,a]}
  const k=raw.toLowerCase(),a=await accGet(k);
  return a?[k,a]:null;
}

export async function POST(request){
  const b=await request.json().catch(()=>({}));
  if(!ok(b.password))return bad('Wrong password',401);
  if(!configured())return bad('Cloudflare D1 / R2 are not set up on Vercel yet.',503);
  try{
    await ensure();
    if(b.a==='list'){
      const rows=await q('SELECT key,data,updated_at FROM accounts ORDER BY updated_at DESC LIMIT 2000');
      const total=+((await q('SELECT COUNT(*) AS c FROM accounts'))[0]||{}).c||rows.length;
      const players=[];for(const r of rows){try{players.push(sum(r.key,JSON.parse(r.data),r.updated_at))}catch(e){}}
      return Response.json({total,players});
    }
    const f=await find(b);
    if(!f)return bad('No player with that ID or username',404);
    const [k,a]=f;
    if(b.a==='get')return Response.json({player:full(k,a)});

    if(b.a==='update'){
      const s=b.set||{},ad=b.add||{};
      for(const n of NUM){
        if(s[n]!==undefined)a[n]=cn(s[n]);
        if(ad[n]!==undefined)a[n]=cn((a[n]||0)+(Math.floor(+ad[n])||0));
      }
      if(s.level!==undefined&&s.xp===undefined)a.xp=xpFor(s.level);
      a.owned=Array.isArray(a.owned)?a.owned:[];
      if(Array.isArray(b.grant))for(const x of b.grant.slice(0,500))if(itemOk(x)&&!a.owned.includes(String(x)))a.owned.push(String(x));
      if(Array.isArray(b.revoke)){
        const rv=b.revoke.filter(itemOk).map(String);
        a.owned=a.owned.filter(x=>!rv.includes(x));
        // anything taken away is also taken off the character
        const e=a.equip||{};
        for(const x of rv){const n=x.slice(2);
          if(x[0]==='o'&&e.outfit===n)e.outfit='';
          if(x[0]==='a')e.acc=String(e.acc||'').split(',').filter(y=>y&&y!==n).join(',');
          if(x[0]==='b')e.body=String(e.body||'').split(',').filter(y=>y&&y!==n).join(',');
        }
        a.equip=e;
      }
      if(b.resetEquip)a.equip={};
      await accPut(k,a);
      return Response.json({player:full(k,a)});
    }
    if(b.a==='ban'){a.banned={reason:String(b.reason||'').trim().slice(0,200),at:Date.now()};await accPut(k,a);return Response.json({player:full(k,a)})}
    if(b.a==='unban'){delete a.banned;await accPut(k,a);return Response.json({player:full(k,a)})}
    if(b.a==='password'){
      const pw=String(b.newPassword||'');
      if(pw.length<6||pw.length>100)return bad('Password must be at least 6 characters');
      a.salt=randomBytes(16).toString('hex');a.hash=scryptSync(pw,a.salt,64).toString('hex');
      await accPut(k,a);
      return Response.json({player:full(k,a)});
    }
    if(b.a==='delete'){
      if(String(b.confirm||'').trim().toLowerCase()!==k)return bad('Type the username to confirm');
      await q('DELETE FROM accounts WHERE key=?',[k]);
      if(a.id)await q('DELETE FROM ids WHERE id=?',[a.id]);
      return Response.json({ok:true});
    }
    return bad('Unknown action');
  }catch(e){return bad(e.message,500)}
}
