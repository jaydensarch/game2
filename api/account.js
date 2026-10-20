// Player accounts: create / log in / load profile / award XP.
// Stored in Cloudflare D1 (tables accounts + ids, created automatically).
// Passwords are salted + scrypt-hashed. Sessions are signed tokens (no extra tables needed).
import {scryptSync,randomBytes,timingSafeEqual,createHmac} from 'node:crypto';
import {configured,ensure,accGet,accPut,idGet,idPut,ls,cfgGet} from './_auth.js';

const SECRET=process.env.SESSION_SECRET||process.env.ADMIN_PASSWORD||process.env.R2_SECRET_ACCESS_KEY||'';
const DAYS=60,XP={kill:100,assist:50,win:500};
// Credits (the store currency) earned from playing. Keep in sync with CV in public/index.html.
const COIN={kill:10,assist:5,win:50,loss:15},DEFAULT_PRICE=100;
// Store: item ids are o:<outfit>, a:<accessory>, s:<gun camo>, b:<body skin .glb> (file name without extension). Prices live in config/store.json (admin > Store).
const FOL={o:'outfits',a:'accessories',s:'skins',b:'bodies'};
async function storeCfg(){return (await cfgGet('config/store.json'))||{}}
const priceOf=(cfg,id)=>{const c=cfg[id]||{};if(c.hide)return null;const p=Math.floor(+c.price);return Number.isFinite(p)&&p>=0?p:DEFAULT_PRICE};
const b64=s=>Buffer.from(s).toString('base64url'),sig=s=>createHmac('sha256',SECRET).update(s).digest('base64url');
const mkTok=u=>{const p=b64(JSON.stringify({u,e:Date.now()+DAYS*864e5}));return p+'.'+sig(p)};
function chkTok(t){try{const[p,s]=String(t||'').split('.');if(!p||!s)return null;const a=Buffer.from(s),b=Buffer.from(sig(p));if(a.length!==b.length||!timingSafeEqual(a,b))return null;const o=JSON.parse(Buffer.from(p,'base64url').toString());return o.e>Date.now()?o.u:null}catch(e){return null}}
// Level table (from the R6 Level Tool sheet): level 1 starts at 0 XP, level 2 costs 5000, and every level after costs 500 more
// than the one before (L2 5000, L3 5500, ... L100 54000; 2,920,500 XP total). Level 100 is the cap.
const MAXL=100,need=n=>5000+500*(n-1);
function lvl(xp){let l=1,r=Math.max(0,xp|0);while(l<MAXL&&r>=need(l)){r-=need(l);l++}return l>=MAXL?{level:MAXL,into:1,next:1,max:true}:{level:l,into:r,next:need(l)}}
// Player ID: 8 characters from an alphabet with no look-alikes (no 0/O/1/I), e.g. "K7M2QX9A". Random, unique, never changes.
// ids/<id>.json in the private bucket maps the id back to the account, so a later feature can look a player up by id.
const ID_CHARS='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newId=()=>{const r=randomBytes(8);let s='';for(let i=0;i<8;i++)s+=ID_CHARS[r[i]%ID_CHARS.length];return s};
async function assignId(a){
  // accounts made before IDs existed get one the next time they log in; accounts that already have one are untouched
  if(a.id)return false;
  for(let i=0;i<20;i++){const id=newId();if(await idGet(id))continue;try{await idPut(id,{name:a.name,key:key(a.name)})}catch(e){continue}a.id=id;return true}
  throw new Error('Could not create a player ID, try again');
}
const pub=a=>{const L=lvl(a.xp);return{id:a.id||'',name:a.name,level:L.level,max:!!L.max,xpInto:L.into,xpNext:L.next,xp:a.xp,kills:a.kills,deaths:a.deaths,assists:a.assists,wins:a.wins,losses:a.losses,matches:a.wins+a.losses,created:a.created,coins:a.coins||0,owned:a.owned||[],equip:a.equip||{}}};
const bad=(m,s=400)=>Response.json({error:m},{status:s});
const key=n=>String(n).toLowerCase();
const clamp=(v,m)=>Math.max(0,Math.min(m,Math.floor(+v)||0));

export async function POST(request){
  const b=await request.json().catch(()=>({}));
  if(!configured())return bad('Accounts need the Cloudflare D1 / R2 settings on Vercel (see README), then redeploy.',503);
  if(!SECRET)return bad('Server has no secret to sign logins with. Set ADMIN_PASSWORD (or SESSION_SECRET) on Vercel and redeploy.',503);
  try{
    await ensure();
    if(b.a==='register'){
      const name=String(b.name||'').trim(),pw=String(b.password||'');
      if(!/^[A-Za-z0-9_]{3,14}$/.test(name))return bad('Username must be 3-14 letters, numbers or _');
      if(pw.length<6||pw.length>100)return bad('Password must be at least 6 characters');
      if(await accGet(key(name)))return bad('That username is taken',409);
      const salt=randomBytes(16).toString('hex'),hash=scryptSync(pw,salt,64).toString('hex');
      const a={id:'',name,salt,hash,xp:0,kills:0,deaths:0,assists:0,wins:0,losses:0,coins:0,owned:[],equip:{},created:Date.now()};
      await assignId(a);
      await accPut(key(name),a);
      return Response.json({token:mkTok(key(name)),profile:pub(a)});
    }
    if(b.a==='login'){
      const a=await accGet(key(String(b.name||'').trim()));
      if(!a)return bad('Wrong username or password',401);
      const h=scryptSync(String(b.password||''),a.salt,64),g=Buffer.from(a.hash,'hex');
      if(h.length!==g.length||!timingSafeEqual(h,g))return bad('Wrong username or password',401);
      if(await assignId(a))await accPut(key(a.name),a);
      return Response.json({token:mkTok(key(a.name)),profile:pub(a)});
    }
    const u=chkTok(b.token);
    if(!u)return bad('Session expired, please log in again',401);
    const a=await accGet(u);
    if(!a)return bad('Account not found',401);
    if(await assignId(a))await accPut(u,a);
    if(b.a==='me')return Response.json({profile:pub(a)});
    if(b.a==='lookup'){
      // find a player by ID (for friends / invites / etc. later). Only public info is returned, never hashes.
      const id=String(b.id||'').trim().toUpperCase();if(!/^[A-Z0-9]{8}$/.test(id))return bad('That is not a valid player ID');
      const r=await idGet(id),t=r&&await accGet(r.key);if(!t)return bad('No player with that ID',404);
      const L=lvl(t.xp);return Response.json({player:{id:t.id,name:t.name,level:L.level}});
    }
    if(b.a==='award'){
      // client reports a batch of events; server applies XP itself and caps each batch so a typo/bug can't mint levels
      const k=clamp(b.kills,40),as=clamp(b.assists,40),d=clamp(b.deaths,40),w=clamp(b.wins,1),l=clamp(b.losses,1);
      a.kills+=k;a.assists+=as;a.deaths+=d;a.wins+=w;a.losses+=l;
      a.xp+=k*XP.kill+as*XP.assist+w*XP.win;
      a.coins=(a.coins||0)+k*COIN.kill+as*COIN.assist+w*COIN.win+l*COIN.loss;
      await accPut(u,a);
      return Response.json({profile:pub(a)});
    }
    if(b.a==='buy'){
      // price is read on the server, never trusted from the browser
      const m=/^([oasb]):([\w.\- ]{1,100})$/.exec(String(b.item||''));if(!m)return bad('Unknown item');
      const id=m[0];
      if(!(await ls(FOL[m[1]])).some(x=>x.name.replace(/\.[^.]+$/,'')===m[2]))return bad('That item is no longer in the store',404);
      const price=priceOf(await storeCfg(),id);
      if(price===null)return bad('That item is not for sale',403);
      a.owned=a.owned||[];a.coins=a.coins||0;
      if(a.owned.includes(id))return bad('You already own that',409);
      if(a.coins<price)return bad('Not enough credits',402);
      a.coins-=price;a.owned.push(id);
      await accPut(u,a);
      return Response.json({profile:pub(a)});
    }
    if(b.a==='equip'){
      // what the character wears: one outfit, up to 4 accessories (comma separated), one body skin plus several garments in the body list (comma separated, max 6), one free colour tint. Items must be owned (or free).
      a.owned=a.owned||[];const cfg=await storeCfg(),has=id=>a.owned.includes(id)||priceOf(cfg,id)===0;
      const key=v=>/^[\w.\- ]{0,100}$/.test(String(v||''))?String(v||''):null,o=key(b.outfit),bdl=[...new Set(String(b.body||'').split(',').map(x=>x.trim()).filter(Boolean))],t=String(b.tint||''),cl=[...new Set(String(b.acc||'').split(',').map(x=>x.trim()).filter(Boolean))];
      if(o===null||bdl.length>6||bdl.some(x=>key(x)===null)||cl.length>4||cl.some(x=>key(x)===null)||(t&&!/^#[0-9a-fA-F]{6}$/.test(t)))return bad('Bad look');
      const cur=a.equip||{},curAcc=String(cur.acc||'').split(',').filter(Boolean),curBody=String(cur.body||'').split(',').filter(Boolean),miss=[];
      // something that was already worn but is no longer owned (price changed, hidden...) is simply taken off, so it can't block every other change
      const chk=(p,v,old,what)=>{if(!v||has(p+v))return v;if(v===old)return '';miss.push(what+' \"'+v+'\"');return v};
      const oo=chk('o:',o,cur.outfit,'outfit'),cc=cl.map(v=>chk('a:',v,curAcc.includes(v)?v:'','accessory')).filter(Boolean).join(','),bb=bdl.map(v=>chk('b:',v,curBody.includes(v)?v:'','body skin')).filter(Boolean).join(',');
      if(miss.length)return bad('You do not own the '+miss.join(' and the ')+'. Buy it in the Store first.',403);
      a.equip={outfit:oo,acc:cc,tint:t.toLowerCase(),body:bb};
      await accPut(u,a);
      return Response.json({profile:pub(a)});
    }
    return bad('Unknown action');
  }catch(e){return bad(e.message,500)}
}
