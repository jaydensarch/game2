// Strike Zone realtime relay (Cloudflare Worker + Durable Objects). Replaces Supabase Realtime.
// One Durable Object per channel name ("sz-lobby", "sz-room-ABCD"). It keeps each connection's presence state and relays broadcasts.
export default{
  async fetch(req,env){
    const u=new URL(req.url);
    if(u.pathname!=='/ws')return new Response('Strike Zone realtime relay',{status:200});
    const o=req.headers.get('Origin'),allow=(env.ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean);
    if(allow.length&&o&&!allow.includes(o))return new Response('forbidden',{status:403});
    const c=u.searchParams.get('c')||'';
    if(!/^[\w-]{1,64}$/.test(c))return new Response('bad channel',{status:400});
    if(req.headers.get('Upgrade')!=='websocket')return new Response('expected websocket',{status:426});
    return env.ROOM.get(env.ROOM.idFromName(c)).fetch(req);
  }
};
const MAXSOCK=200,MAXMSG=16384,MAXSTATE=1500;
export class Room{
  constructor(ctx,env){this.ctx=ctx;this.env=env}
  async fetch(req){
    if(this.ctx.getWebSockets().length>=MAXSOCK)return new Response('room full',{status:503});
    const k=(new URL(req.url).searchParams.get('k')||'').slice(0,64);
    const [client,server]=Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);          // hibernation API: idle rooms cost nothing
    server.serializeAttachment({k,s:null});     // presence state lives on the socket and survives hibernation
    return new Response(null,{status:101,webSocket:client});
  }
  presence(skip){const st={};for(const w of this.ctx.getWebSockets()){if(w===skip)continue;let a;try{a=w.deserializeAttachment()}catch(e){}if(a&&a.s)(st[a.k]=st[a.k]||[]).push(a.s)}return st}
  pushPresence(skip){const m=JSON.stringify({t:'ps',st:this.presence(skip)});for(const w of this.ctx.getWebSockets()){if(w===skip)continue;try{w.send(m)}catch(e){}}}
  webSocketMessage(ws,msg){
    if(typeof msg!=='string'||msg.length>MAXMSG)return;
    let d;try{d=JSON.parse(msg)}catch(e){return}
    if(d.t==='track'){
      if(d.s!==null&&(typeof d.s!=='object'||JSON.stringify(d.s).length>MAXSTATE))return;
      const a=ws.deserializeAttachment()||{};a.s=d.s;ws.serializeAttachment(a);this.pushPresence();
    }else if(d.t==='bc'&&typeof d.e==='string'&&d.e.length<32){
      const m=JSON.stringify({t:'bc',e:d.e,p:d.p});
      for(const w of this.ctx.getWebSockets()){if(w===ws)continue;try{w.send(m)}catch(e){}}
    }
  }
  webSocketClose(ws,code,reason){try{ws.close(code>=1000&&code<5000&&code!==1005&&code!==1006?code:1000,reason)}catch(e){}this.pushPresence(ws)}
  webSocketError(ws){this.pushPresence(ws)}
}
