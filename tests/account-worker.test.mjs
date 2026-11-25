import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import {sealHistory,openHistory} from '../cloudflare/auth/history-crypto.mjs';
import worker from '../cloudflare/auth/worker.mjs';

test('registration, login, isolation, history and logout', async () => {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../cloudflare/auth/schema.sql', import.meta.url), 'utf8'));
  const db = { prepare(sql) { return { bind(...args) { return { async first() { return sqlite.prepare(sql).get(...args) || null; }, async run() { const r = sqlite.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; } }; } }; } };
  const env = { DB: db, ALLOWED_ORIGINS: 'https://example.test', HISTORY_ENCRYPTION_KEY: randomBytes(32).toString('base64url') };
  const send = (path, method = 'GET', data, session, origin = 'https://example.test') => worker.fetch(new Request(`https://worker.test/api/account${path}`, { method, headers: { Origin: origin, 'Content-Type': 'application/json', ...(session ? { Cookie: session } : {}) }, ...(data ? { body: JSON.stringify(data) } : {}) }), env);
  const credentials = { username: 'alice', password: 'a secure password' };
  let res = await send('/register', 'POST', credentials);
  assert.equal(res.status, 200);
  const session = res.headers.get('set-cookie').split(';')[0];
  assert.match(session, /^__Host-xy_session=/);
  assert.equal((await send('/history', 'GET')).status, 401);
  assert.equal((await send('/history', 'PUT', { history: [{videoId: 'one'}], version: 0 }, session)).status, 200);
  const saved = sqlite.prepare('SELECT data FROM history').get().data;
  assert.match(saved,/^enc:v1:/);
  assert.ok(!saved.includes('videoId'));
  assert.equal((await send('/history', 'PUT', { history: [], version: 0 }, session)).status, 409);
  res = await send('/history', 'GET', undefined, session);
  assert.equal((await res.json()).history[0].videoId, 'one');
  res = await send('/register', 'POST', { username: 'bob', password: 'another password' });
  const bob = res.headers.get('set-cookie').split(';')[0];
  assert.deepEqual((await (await send('/history', 'GET', undefined, bob)).json()).history, []);
  assert.equal((await send('/logout', 'POST', {}, session, 'https://evil.test')).status, 403);
  assert.equal((await send('/logout', 'POST', {}, session)).status, 200);
  assert.equal((await send('/session', 'GET', undefined, session)).status, 401);
  assert.equal((await send('/login', 'POST', { ...credentials, password: 'incorrect password' })).status, 401);
  assert.equal((await send('/login', 'POST', credentials)).status, 200);
  const alice=sqlite.prepare('SELECT id FROM users WHERE username = ?').get('alice').id;
  sqlite.prepare('UPDATE history SET data = ? WHERE user_id = ?').run('[{"videoId":"legacy"}]',alice);
  res=await send('/history','GET',undefined,session);
  // Obtain a fresh cookie because the earlier session was logged out.
  res=await send('/login','POST',credentials);
  const fresh=res.headers.get('set-cookie').split(';')[0];
  res=await send('/history','GET',undefined,fresh);
  assert.equal((await res.json()).history[0].videoId,'legacy');
  assert.match(sqlite.prepare('SELECT data FROM history WHERE user_id = ?').get(alice).data,/^enc:v1:/);
  sqlite.close();
});

test('AES-GCM history encryption binds records to owner and version',()=>{
 const env={HISTORY_ENCRYPTION_KEY:randomBytes(32).toString('base64url')};
 const data='[{"videoId":"private"}]';
 const a=sealHistory(data,'alice',1,env), b=sealHistory(data,'alice',1,env);
 assert.notEqual(a,b);
 assert.deepEqual(openHistory(a,'alice',1,env),JSON.parse(data));
 assert.throws(()=>openHistory(a,'bob',1,env));
 assert.throws(()=>openHistory(a,'alice',2,env));
 assert.throws(()=>openHistory(a,'alice',1,{HISTORY_ENCRYPTION_KEY:randomBytes(32).toString('base64url')}));
 assert.throws(()=>openHistory(a,'alice',1,{}));
 assert.throws(()=>openHistory(a.slice(0,-4)+'AAAA','alice',1,env));
});
