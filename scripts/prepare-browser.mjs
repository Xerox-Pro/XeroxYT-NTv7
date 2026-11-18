import {Sandbox,Snapshot} from '@vercel/sandbox';
import {writeFile} from 'node:fs/promises';

if(process.env.VERCEL_ENV==='production'){
 // A named Chromium template is optional for a new Vercel project.
 // Never reuse a login profile or credentials from another project.
 let snapshotId=null;
 try {
  const template=await Sandbox.get({name:'social-login-browser-template-final',resume:true});
  const saved=template.currentSnapshotId?await Snapshot.get({snapshotId:template.currentSnapshotId}):null;
  const snapshot=saved&&!saved.expiresAt?(await template.stop(),saved):await template.snapshot({expiration:0});
  snapshotId=snapshot.snapshotId;
  console.info('Login browser template prepared');
 } catch(error) {
  const code=error?.json?.error?.code||error?.code;
  if(code!=='not_found')throw error;
  // The social-browser route responds VERCEL_BROWSER_NOT_CONFIGURED
  // until this Vercel project provisions its own Chromium template.
  console.warn('Optional browser template not found in this Vercel project; browser-based social login disabled.');
 }
 await writeFile('server/browser-template.mjs','export default '+JSON.stringify({snapshotId})+';\n');
}
