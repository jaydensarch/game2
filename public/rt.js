/* Strike Zone realtime client. Same small API the game used from Supabase Realtime (channel / on / subscribe / track / untrack /
   presenceState / send / removeChannel), but talks to the Cloudflare relay in /worker. */
(function(){
window.SZRT=function(base){
  base=String(base).replace(/\/$/,'').replace(/^http/,'ws');
  const all=new Set();
  function channel(name,cfg){
    const key=(cfg&&cfg.config&&cfg.config.presence&&cfg.config.presence.key)||Math.random().toString(36).slice(2,10);
    const sync=[],bc={};let ws=null,st={},status=()=>{},ever=false,closed=false,tries=0,last=null,tick=0,n=0;
    const tx=o=>{if(ws&&ws.readyState===1)ws.send(JSON.stringify(o))};
    function connect(){
      let w;try{w=new WebSocket(base+'/ws?c='+encodeURIComponent(name)+'&k='+encodeURIComponent(key))}catch(e){status('CHANNEL_ERROR');return}
      ws=w;
      const to=setTimeout(()=>{if(ws===w&&w.readyState!==1){try{w.close()}catch(_){}if(!ever&&!closed)status('CHANNEL_ERROR')}},8000);
      w.onopen=()=>{clearTimeout(to);ever=true;tries=0;status('SUBSCRIBED');if(last)tx({t:'track',s:last})};
      w.onmessage=e=>{let m;try{m=JSON.parse(e.data)}catch(_){return}
        if(m.t==='ps'){st=m.st||{};sync.forEach(f=>{try{f()}catch(_){}})}
        else if(m.t==='bc')(bc[m.e]||[]).forEach(f=>{try{f({payload:m.p})}catch(_){}})};
      w.onclose=()=>{clearTimeout(to);if(ws!==w||closed)return;if(!ever){status('CHANNEL_ERROR');return}
        if(tries++<6)setTimeout(()=>{if(!closed)connect()},Math.min(4000,500*tries));else status('CLOSED')};
      w.onerror=()=>{};
    }
    const ch={
      on(type,f,cb){if(type==='presence')sync.push(cb);else if(type==='broadcast')(bc[f.event]=bc[f.event]||[]).push(cb);return ch},
      subscribe(cb){status=cb||(()=>{});connect();return ch},
      presenceState:()=>st,
      track(s){last=s;tx({t:'track',s});return Promise.resolve('ok')},
      untrack(){last=null;tx({t:'track',s:null});return Promise.resolve('ok')},
      send(m){if(m&&m.type==='broadcast'){const t=Date.now()/1000|0;if(t!==tick){tick=t;n=0}if(++n<=30)tx({t:'bc',e:m.event,p:m.payload})}return Promise.resolve('ok')},
      unsubscribe(){closed=true;all.delete(ch);try{ws&&ws.close()}catch(_){}}
    };
    all.add(ch);return ch;
  }
  return {channel,removeChannel(ch){ch.unsubscribe();return Promise.resolve('ok')}};
};
})();
