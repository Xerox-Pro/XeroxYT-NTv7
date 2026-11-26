import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
const prefix='enc:v1:';
function key(env){
 const value=env.HISTORY_ENCRYPTION_KEY;
 if(typeof value!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(value))throw new Error('History encryption key not configured');
 const decoded=Buffer.from(value,'base64url');
 if(decoded.length!==32)throw new Error('Invalid history encryption key');
 return decoded;
}
export function isEncryptedHistory(value){return typeof value==='string'&&value.startsWith(prefix)}
function aad(userId,version){return Buffer.from(JSON.stringify(['xerox-history',userId,version]),'utf8')}
export function sealHistory(data,userId,version,env){
 const iv=randomBytes(12);
 const cipher=createCipheriv('aes-256-gcm',key(env),iv);
 cipher.setAAD(aad(userId,version));
 const body=Buffer.concat([cipher.update(data,'utf8'),cipher.final()]);
 return prefix+[iv,cipher.getAuthTag(),body].map(v=>v.toString('base64url')).join('.');
}
export function openHistory(value,userId,version,env){
 const k=key(env);
 // Old rows remain readable during a staged migration. Unknown ciphertext versions fail closed.
 if(!isEncryptedHistory(value)){
   if(typeof value!=='string'||!value.startsWith('['))throw new Error('Unknown history format');
   const parsed=JSON.parse(value);
   if(!Array.isArray(parsed))throw new Error('Invalid history data');
   return parsed;
 }
 const parts=value.slice(prefix.length).split('.');
 if(parts.length!==3||parts.some(v=>!/^[A-Za-z0-9_-]*$/.test(v)))throw new Error('Invalid history ciphertext');
 const [iv,tag,body]=parts.map(v=>Buffer.from(v,'base64url'));
 if(iv.length!==12||tag.length!==16)throw new Error('Invalid history ciphertext');
 const decipher=createDecipheriv('aes-256-gcm',k,iv);
 decipher.setAAD(aad(userId,version));
 decipher.setAuthTag(tag);
 const data=JSON.parse(Buffer.concat([decipher.update(body),decipher.final()]).toString('utf8'));
 if(!Array.isArray(data))throw new Error('Invalid history data');
 return data;
}
