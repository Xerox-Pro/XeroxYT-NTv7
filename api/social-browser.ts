import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {Sandbox} from '@vercel/sandbox';
import browserTemplate from '../server/browser-template.mjs';
import {timingSafeEqual,randomUUID} from 'node:crypto';
export const config={maxDuration:60};
const ROOT='/vercel/sandbox';
function authorized(value:string){const expected=process.env.API_SHARED_SECRET;if(!expected)return false;const a=Buffer.from(value||''),b=Buffer.from('Bearer '+expected);return a.length===b.length&&timingSafeEqual(a,b);}
export default async function handler(req:any,res:any){
 res.setHeader('Cache-Control','private, no-store');res.setHeader('Referrer-Policy','no-referrer');
 if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
 if(!authorized(req.headers.authorization))return res.status(403).json({error:'Server authorization required'});
 let body:any;try{body=typeof req.body==='string'?JSON.parse(req.body):req.body||{};if(!body||typeof body!=='object'||JSON.stringify(body).length>8192)throw Error();}catch{return res.status(400).json({error:'Invalid request'});}
 let sandbox:any,stage="request";
 try{
  if(body.operation==='create'){
   if(!browserTemplate.snapshotId)return res.status(503).json({error:'VERCEL_BROWSER_NOT_CONFIGURED'});
   stage="sandbox_create";sandbox=await Sandbox.create({source:{type:'snapshot',snapshotId:browserTemplate.snapshotId},name:'social-login-'+randomUUID(),persistent:false,timeout:600000,resources:{vcpus:1},ports:[]});
   stage='chromium_launch';await sandbox.runCommand({cmd:'node',args:[ROOT+'/launch.mjs'],cwd:ROOT,detached:true});
   // The template has dependencies preinstalled; wait briefly for Chromium.
   let ready=false;
   for(let i=0;i<32;i++){const file=await sandbox.readFileToBuffer({path:ROOT+'/browser-connection.json'});if(file){ready=true;break;}await new Promise(resolve=>setTimeout(resolve,250));}
   if(!ready)throw Error('launch');stage='navigate';
   // Navigate only to a fixed service login URL, never to a caller-supplied URL.
   const urls={instagram:'https://www.instagram.com/accounts/login/',tiktok:'https://www.tiktok.com/login'};
   if(!(body.service in urls))throw Error('service');
   const data=JSON.stringify({url:urls[body.service as keyof typeof urls]});
   await sandbox.writeFiles([{path:ROOT+'/navigate.json',content:Buffer.from(data)}]);
   await sandbox.runCommand({cmd:'node',args:[ROOT+'/navigate.mjs'],detached:true,cwd:ROOT});
   return res.json({sessionId:sandbox.name,targetId:'page',provider:'vercel'});
  }
  if(typeof body.sessionId!=='string'||!/^social-login-[a-f0-9-]{36}$/.test(body.sessionId))return res.status(400).json({error:'Invalid session'});
  sandbox=await Sandbox.get({name:body.sessionId,resume:false});
  if(body.operation==='close'){await sandbox.stop();return res.json({success:true});}
  if(body.operation!=='command')return res.status(400).json({error:'Invalid operation'});
  const id=randomUUID(),input=ROOT+'/input-'+id+'.json',output=ROOT+'/output-'+id+'.json';
  await sandbox.writeFiles([{path:input,content:Buffer.from(JSON.stringify({method:body.method,params:body.params}))},...await Promise.all(['control.mjs','fill-field.mjs'].map(async file=>({path:ROOT+'/'+file,content:await readFile(path.join(process.cwd(),'server/browser',file))})))]);
  try{const command=await sandbox.runCommand('node',[ROOT+'/control.mjs',input,output]);if(command.exitCode!==0)throw Error('command');const result=await sandbox.readFileToBuffer({path:output});if(!result)throw Error('result');const data=JSON.parse(result.toString());if(['LOGIN_BUTTON_NOT_FOUND','LOGIN_FIELD_NOT_FOUND','LOGIN_INPUT'].includes(data.error))return res.status(409).json({error:data.error});if(data.error)throw Error('command');return res.json(data.result);}finally{await sandbox.runCommand('rm',['-f',input,output]);}
 }catch(error:any){console.warn(JSON.stringify({event:'social_browser_error',operation:body.operation,stage,name:error?.name,code:error?.code||error?.json?.error?.code||null,status:error?.status||null}));if(body.operation==='create')await sandbox?.stop().catch(()=>{});return res.status(502).json({error:'VERCEL_BROWSER_FAILED'});}
}
