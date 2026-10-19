import {FOLD,MIME,extOf} from '../../lib/cf.js';
export async function onRequestGet({request,env}){
  let key;try{key=decodeURIComponent(new URL(request.url).pathname.slice('/files/'.length))}catch(e){return new Response('Bad path',{status:400})}
  if(!FOLD[key.split('/')[0]]||key.includes('..'))return new Response('Not found',{status:404});
  const o=await env.BUCKET.get(key,{range:request.headers,onlyIf:request.headers});
  if(!o)return new Response('Not found',{status:404});
  const h=new Headers();o.writeHttpMetadata(h);h.set('etag',o.httpEtag);h.set('accept-ranges','bytes');
  if(!h.get('content-type'))h.set('content-type',MIME[extOf(key)]||'application/octet-stream');
  h.set('cache-control','public, max-age=31536000, immutable');h.set('access-control-allow-origin','*');
  if(!('body' in o))return new Response(null,{status:304,headers:h});
  if(o.range&&request.headers.has('range')){const r=o.range,off=r.offset??0,len=r.length??(o.size-off);h.set('content-range',`bytes ${off}-${off+len-1}/${o.size}`);return new Response(o.body,{status:206,headers:h})}
  return new Response(o.body,{headers:h});
}
