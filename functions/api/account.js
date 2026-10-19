// Player accounts: create / log in / load profile / award XP / store / equip.
// Stored in Cloudflare D1 (tables `accounts` and `ids`). Passwords are salted + PBKDF2-hashed (old scrypt hashes still log in and are upgraded).
// Sessions are signed tokens (no extra tables needed).
import {configured,ensure,accGet,accPut,accInsert,idGet,idPut,ls,cfgGet,bad,teq,hmac,b64uStr,fromB64uStr,hex,pbkdf2,secret} from '../../lib/cf.js';

const DAYS=60,XP={kill:100,assist:50,win:500};
// Credits (the store currency) earned from playing. Keep in sync with CV in public/index.html.
const COIN={kill:10,assist:5,win:50,loss:15},DEFAULT_PRICE=100;
// Store: item ids are o:<outfit>, a:<accessory>, s:<gun camo>, b:<body skin .glb> (file name without extension). Prices live in config "store" (admin > Store).
const FOL={o:'outfits',a:'accessories',s:'skins',b:'bodies'};
const storeCfg=async env=>(await cfgGet(env,'store'))||{};
const priceOf=(cfg,id)=>{const c=cfg[id]||{};if(c.hide)return null;const p=Math.floor(+c.price);return Number.isFinite(p)&&p>=0?p:DEFAULT_PRICE};
const mkTok=async(env,u)=>{const p=b64uStr(JSON.stringify({u,e:Date.now()+DAYS*864e5}));return p+'.'+await hmac(secret(env),p)};
async function chkTok(env,t){try{const[p,s]=String(t||'').split('.');if(!p||!s)return null;if(!teq(s,await hmac(secret(env),p)))return null;const o=JSON.parse(fromB64uStr(p));return o.e>Date.now()?o.u:null}catch(e){return null}}
// Level table: level 1 starts at 0 XP, level 2 costs 5000, and every level after costs 500 more than the one before. Level 100 is the cap.
const MAXL=100,need=n=>5000+500*(n-1);
function lvl(xp){let l=1,r=Math.max(0,xp|0);while(l<MAXL&&r>=need(l)){r-=need(l);l++}return l>=MAXL?{level:MAXL,into:1,next:1,max:true}:{level:l,into:r,next:need(l)}}
// Player ID: 8 characters from an alphabet with no look-alikes. Random, unique, never changes. ids table maps the id back to the account.
const ID_CHARS='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newId=()=>{const r=crypto.getRandomValues(new Uint8Array(8));let s='';for(let i=0;i<8;i++)s+=ID_CHARS[r[i]%ID_CHARS.length];return s};
const key=n=>String(n).toLowerCase();
async function assignId(env,a){
  if(a.id)return false;
  for(let i=0;i<20;i++){const id=newId();if(await idGet(env,id))continue;try{await idPut(env,id,{name:a.name,key:key(a.name)})}catch(e){continue}a.id=id;return true}
  throw new Error('Could not create a player ID, try again');
}
const pubP=a=>{const L=lvl(a.xp);return{id:a.id||'',name:a.name,level:L.level,max:!!L.max,xpInto:L.into,xpNext:L.next,xp:a.xp,kills:a.kills,deaths:a.deaths,assists:a.assists,wins:a.wins,losses:a.losses,matches:a.wins+a.losses,created:a.created,coins:a.coins||0,owned:a.owned||[],equip:a.equip||{}}};
const clamp=(v,m)=>Math.max(0,Math.min(m,Math.floor(+v)||0));
const newSalt=()=>hex(crypto.getRandomValues(new Uint8Array(16)));
// true if the password matches; sets a.upgrade when an old scrypt hash was used so the caller can re-save it as PBKDF2
async function checkPw(a,pw){
  if(a.algo==='pbkdf2')return teq(await pbkdf2(pw,a.salt),a.hash);
  const {scryptSync,timingSafeEqual}=await import('node:crypto'); // legacy accounts imported from the old Supabase version
  const h=scryptSync(pw,a.salt,64),g=Buffer.from(a.hash,'hex');
  if(h.length!==g.length||!timingSafeEqual(h,g))return false;
  a.salt=newSalt();a.hash=await pbkdf2(pw,a.salt);a.algo='pbkdf2';return 'upgraded';
}

export async function onRequestPost({request,env}){
  const b=await request.json().catch(()=>({}));
  if(!configured(env))return bad('Accounts need the D1 database and R2 bucket bound to this Pages project (see README), then redeploy.',503);
  if(!secret(env))return bad('Server has no secret to sign logins with. Set ADMIN_PASSWORD (or SESSION_SECRET) on the Pages project and redeploy.',503);
  try{
    await ensure(env);
    if(b.a==='register'){
      const name=String(b.name||'').trim(),pw=String(b.password||'');
      if(!/^[A-Za-z0-9_]{3,14}$/.test(name))return bad('Username must be 3-14 letters, numbers or _');
      if(pw.length<6||pw.length>100)return bad('Password must be at least 6 characters');
      if(await accGet(env,key(name)))return bad('That username is taken',409);
      const salt=newSalt(),hash=await pbkdf2(pw,salt);
      const a={id:'',name,salt,hash,algo:'pbkdf2',xp:0,kills:0,deaths:0,assists:0,wins:0,losses:0,coins:0,owned:[],equip:{},created:Date.now()};
      await assignId(env,a);
      if(!(await accInsert(env,key(name),a)))return bad('That username is taken',409);
      return Response.json({token:await mkTok(env,key(name)),profile:pubP(a)});
    }
    if(b.a==='login'){
      const a=await accGet(env,key(String(b.name||'').trim()));
      if(!a)return bad('Wrong username or password',401);
      const r=await checkPw(a,String(b.password||''));
      if(!r)return bad('Wrong username or password',401);
      const idNew=await assignId(env,a);
      if(r==='upgraded'||idNew)await accPut(env,key(a.name),a);
      return Response.json({token:await mkTok(env,key(a.name)),profile:pubP(a)});
    }
    const u=await chkTok(env,b.token);
    if(!u)return bad('Session expired, please log in again',401);
    const a=await accGet(env,u);
    if(!a)return bad('Account not found',401);
    if(await assignId(env,a))await accPut(env,u,a);
    if(b.a==='me')return Response.json({profile:pubP(a)});
    if(b.a==='lookup'){
      // find a player by ID (for friends / invites / etc. later). Only public info is returned, never hashes.
      const id=String(b.id||'').trim().toUpperCase();if(!/^[A-Z0-9]{8}$/.test(id))return bad('That is not a valid player ID');
      const r=await idGet(env,id),t=r&&await accGet(env,r.key);if(!t)return bad('No player with that ID',404);
      const L=lvl(t.xp);return Response.json({player:{id:t.id,name:t.name,level:L.level}});
    }
    if(b.a==='award'){
      // client reports a batch of events; server applies XP itself and caps each batch so a typo/bug can't mint levels
      const k=clamp(b.kills,40),as=clamp(b.assists,40),d=clamp(b.deaths,40),w=clamp(b.wins,1),l=clamp(b.losses,1);
      a.kills+=k;a.assists+=as;a.deaths+=d;a.wins+=w;a.losses+=l;
      a.xp+=k*XP.kill+as*XP.assist+w*XP.win;
      a.coins=(a.coins||0)+k*COIN.kill+as*COIN.assist+w*COIN.win+l*COIN.loss;
      await accPut(env,u,a);
      return Response.json({profile:pubP(a)});
    }
    if(b.a==='buy'){
      // price is read on the server, never trusted from the browser
      const m=/^([oasb]):([\w.\- ]{1,100})$/.exec(String(b.item||''));if(!m)return bad('Unknown item');
      const id=m[0];
      if(!(await ls(env,FOL[m[1]])).some(x=>x.name.replace(/\.[^.]+$/,'')===m[2]))return bad('That item is no longer in the store',404);
      const price=priceOf(await storeCfg(env),id);
      if(price===null)return bad('That item is not for sale',403);
      a.owned=a.owned||[];a.coins=a.coins||0;
      if(a.owned.includes(id))return bad('You already own that',409);
      if(a.coins<price)return bad('Not enough credits',402);
      a.coins-=price;a.owned.push(id);
      await accPut(env,u,a);
      return Response.json({profile:pubP(a)});
    }
    if(b.a==='equip'){
      // what the character wears: one outfit, up to 4 accessories (comma separated), one body skin plus several garments in the body list (comma separated, max 6), one free colour tint. Items must be owned (or free).
      a.owned=a.owned||[];const cfg=await storeCfg(env),has=id=>a.owned.includes(id)||priceOf(cfg,id)===0;
      const ck=v=>/^[\w.\- ]{0,100}$/.test(String(v||''))?String(v||''):null,o=ck(b.outfit),bdl=[...new Set(String(b.body||'').split(',').map(x=>x.trim()).filter(Boolean))],t=String(b.tint||''),cl=[...new Set(String(b.acc||'').split(',').map(x=>x.trim()).filter(Boolean))];
      if(o===null||bdl.length>6||bdl.some(x=>ck(x)===null)||cl.length>4||cl.some(x=>ck(x)===null)||(t&&!/^#[0-9a-fA-F]{6}$/.test(t)))return bad('Bad look');
      const cur=a.equip||{},curAcc=String(cur.acc||'').split(',').filter(Boolean),curBody=String(cur.body||'').split(',').filter(Boolean),miss=[];
      // something already worn but no longer owned (price changed, hidden...) is simply taken off, so it can't block every other change
      const chk=(p,v,old,what)=>{if(!v||has(p+v))return v;if(v===old)return '';miss.push(what+' "'+v+'"');return v};
      const oo=chk('o:',o,cur.outfit,'outfit'),cc=cl.map(v=>chk('a:',v,curAcc.includes(v)?v:'','accessory')).filter(Boolean).join(','),bb=bdl.map(v=>chk('b:',v,curBody.includes(v)?v:'','body skin')).filter(Boolean).join(',');
      if(miss.length)return bad('You do not own the '+miss.join(' and the ')+'. Buy it in the Store first.',403);
      a.equip={outfit:oo,acc:cc,tint:t.toLowerCase(),body:bb};
      await accPut(env,u,a);
      return Response.json({profile:pubP(a)});
    }
    return bad('Unknown action');
  }catch(e){return bad(e.message,500)}
}
