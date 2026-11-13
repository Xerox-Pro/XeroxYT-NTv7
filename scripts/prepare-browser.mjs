import {Sandbox,Snapshot} from '@vercel/sandbox';
import {writeFile} from 'node:fs/promises';
if(process.env.VERCEL_ENV==='production'){
 // This template contains Chromium and libraries only, never a signed-in profile.
 const template=await Sandbox.get({name:'social-login-browser-template-final',resume:true});
 const saved=template.currentSnapshotId?await Snapshot.get({snapshotId:template.currentSnapshotId}):null;
 const snapshot=saved&&!saved.expiresAt?(await template.stop(),saved):await template.snapshot({expiration:0});
 await writeFile('server/browser-template.mjs','export default '+JSON.stringify({snapshotId:snapshot.snapshotId})+';\n');
 console.info('Login browser template prepared');
}
