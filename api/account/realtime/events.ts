import type {IncomingMessage, ServerResponse} from 'node:http';
import WebSocket from 'ws';

export default async function handler(req: IncomingMessage, res: ServerResponse) {
 if(req.method!=='GET'){
  res.writeHead(405,{'Allow':'GET'}).end();
  return;
 }
 const controller=new AbortController();
 res.once('close',()=>controller.abort());
 try{
  const url=new URL(req.url??'/', 'https://'+req.headers.host);
  url.pathname='/api/account/realtime/ticket';
  const headers=new Headers({Origin:url.origin});
  for(const name of ['cookie','x-xeroxyt-prefer-api','x-xeroxyt-realtime-avoid']){
   const value=req.headers[name];
   if(typeof value==='string')headers.set(name,value);
  }
  const ticketResponse=await fetch(url,{headers,signal:AbortSignal.any([controller.signal,AbortSignal.timeout(18000)]),redirect:'error'});
  if(!ticketResponse.ok){
   await ticketResponse.body?.cancel();
   res.writeHead(ticketResponse.status,{'Cache-Control':'no-store'}).end();
   return;
  }
  const index=ticketResponse.headers.get('X-XeroxYT-API-Index')??'';
  const {ticket}=await ticketResponse.json();
  const upstream=new URL(ticketResponse.headers.get('X-XeroxYT-Realtime-Origin')??'');
  if(upstream.protocol!=='https:'||!upstream.hostname.endsWith('.workers.dev'))throw Error('Invalid realtime upstream');
  const socketUrl=new URL('/api/account/realtime/socket',upstream);
  socketUrl.protocol='wss:';
  if(controller.signal.aborted)return;
  await new Promise<void>(resolve=>{
   const socket=new WebSocket(socketUrl,['xerox-realtime-v1',ticket],{origin:url.origin,handshakeTimeout:8000,maxPayload:1024*1024});
   const ping=setInterval(()=>{
    if(socket.readyState===WebSocket.OPEN)socket.send('ping');
   },25000);
   const expires=setTimeout(stop,95000);
   const initialMessage=setTimeout(stop,11000);
   let stopped=false;
   function stop(){
    if(stopped)return;
    stopped=true;
    clearInterval(ping);
    clearTimeout(expires);
    clearTimeout(initialMessage);
    controller.signal.removeEventListener('abort',stop);
    socket.terminate();
    if(!res.destroyed){
     if(!res.headersSent)res.writeHead(502,{'X-XeroxYT-API-Index':index,'Cache-Control':'no-store'});
     res.end();
    }
    resolve();
   }
   controller.signal.addEventListener('abort',stop,{once:true});
   socket.on('error',stop);
   socket.once('close',stop);
   socket.on('message',raw=>{
    if(stopped)return;
    const message=raw.toString();
    if(message==='pong'){
     if(res.headersSent&&!res.writableNeedDrain)res.write(': heartbeat\n\n');
     return;
    }
    clearTimeout(initialMessage);
    if(!res.headersSent)res.writeHead(200,{
     'Content-Type':'text/event-stream; charset=utf-8',
     'Cache-Control':'private, no-store, no-transform',
     'X-XeroxYT-API-Index':index,
    });
    if(!res.write('data: '+message.replace(/[\r\n]/g,' ')+'\n\n')){
     socket.pause();
     res.once('drain',()=>{if(!stopped)socket.resume();});
    }
   });
  });
 }catch{
  if(!res.destroyed&&!res.headersSent)res.writeHead(502,{'Cache-Control':'no-store'}).end();
 }
}
