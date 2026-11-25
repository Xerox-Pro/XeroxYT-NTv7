import { createHmac, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const derive = promisify(scrypt);
const scope = 'xerox-account-kdf-v1\n';
const allowedKeys = () => [process.env.API_SHARED_SECRET, process.env.API_SHARED_SECRET_2].filter((key): key is string => typeof key === 'string' && key.length > 0);

// This endpoint is private to the account Workers, not to browsers.
// The exact same KDF parameters are retained for every existing account.
export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({error:'Method not allowed'}); }
  const signature = req.headers['x-account-kdf-signature'];
  if (typeof signature !== 'string' || !/^[a-f0-9]{64}$/.test(signature)) return res.status(403).json({error:'Forbidden'});
  if (Number(req.headers['content-length'] || 0) > 4096) return res.status(413).json({error:'Request too large'});
  if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) return res.status(415).json({error:'Invalid content type'});
  let body = req.body;
  try { if (typeof body === 'string') body = JSON.parse(body); } catch { return res.status(400).json({error:'Invalid request'}); }
  const {password, salt, timestamp} = body || {};
  if (typeof password !== 'string' || password.length < 12 || Buffer.byteLength(password) > 256 ||
      typeof salt !== 'string' || !/^[a-f0-9]{32}$/.test(salt) ||
      !Number.isSafeInteger(timestamp) || Math.abs(Date.now() - timestamp) > 60000) return res.status(400).json({error:'Invalid request'});
  const payload = JSON.stringify({password,salt,timestamp});
  const supplied = Buffer.from(signature, 'hex');
  if (!allowedKeys().some(key => timingSafeEqual(supplied, createHmac('sha256',key).update(scope+payload).digest()))) return res.status(403).json({error:'Forbidden'});
  try {
    const hash = await (derive as any)(password, Buffer.from(salt, 'hex'), 32, {N:32768,r:8,p:1,maxmem:64*1024*1024}) as Buffer;
    return res.status(200).json({hash:hash.toString('hex')});
  } catch {
    // Never log a password, salt, signature or derived hash.
    return res.status(503).json({error:'Password service unavailable'});
  }
}
