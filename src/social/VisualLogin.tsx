import {useRef, useState} from 'react';
import {type Service, socialRequest} from './client';

export default function VisualLogin({service, onConnected}: {service: Service; onConnected: () => void}) {
 const [consent, setConsent] = useState(false);
 const [active, setActive] = useState(false);
 const [busy, setBusy] = useState(false);
 const [error, setError] = useState('');
 const [image, setImage] = useState('');
 const textInput = useRef<HTMLInputElement>(null);
 const lock = useRef(false);

 const post = (action: string, body: object = {}) => socialRequest(service, 'login/' + action, {
  method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body),
 });

 const refresh = async () => {
  const data = await post('view');
  if (typeof data.image !== 'string' || !/^[A-Za-z0-9+/=]+$/.test(data.image)) {
   throw new Error('ログイン画面の画像を取得できませんでした。');
  }
  setImage(data.image);
 };

 const run = async (action: string, body?: object) => {
  if (lock.current) return;
  lock.current = true;
  setBusy(true);
  setError('');
  try {
   if (action === 'view') {
    await refresh();
    return;
   }
   const result = await post(action, body);
   if (action === 'cancel' || result.connected === true) {
    setImage('');
    setActive(false);
    if (result.connected === true) onConnected();
    return;
   }
   if (action === 'start') setActive(true);
   await refresh();
  } catch (cause) {
   setError(cause instanceof Error ? cause.message : 'ログイン画面に接続できませんでした。');
  } finally {
   lock.current = false;
   setBusy(false);
  }
 };

 return <section className="social-browser-login">
  <h3>{service === 'instagram' ? 'Instagram' : 'TikTok'}にログイン</h3>
  <p>公式ログイン画面をサーバーで開きます。連携にはログイン後のセッション情報を暗号化して保存します。</p>
  {!active ? <>
   <label className="social-check"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)}/>サーバーでログイン画面を操作することに同意します</label>
   <button type="button" className="social-primary" disabled={!consent || busy} onClick={() => void run('start', {consent})}>ログイン画面を開く</button>
  </> : <>
   {image && <button type="button" disabled={busy} aria-label="ログイン画面の項目を選択" onClick={event => {
    const frame = event.currentTarget.querySelector('img');
    if (!frame || event.detail === 0) return;
    const rect = frame.getBoundingClientRect();
    const x = (event.clientX - rect.left) * 390 / rect.width;
    const y = (event.clientY - rect.top) * 780 / rect.height;
    if (x >= 0 && x <= 390 && y >= 0 && y <= 780) void run('input', {action: 'click', x, y});
   }}><img src={'data:image/jpeg;base64,' + image} width={390} height={780} alt="公式ログイン画面" draggable={false} style={{display: 'block', maxWidth: '100%', height: 'auto'}}/></button>}
   <form onSubmit={event => {
    event.preventDefault();
    const field = textInput.current;
    if (!field?.value || busy) return;
    const text = field.value;
    field.value = '';
    void run('input', {action: 'text', text});
   }}>
    <label>選択した欄への入力<input ref={textInput} type="password" autoComplete="off" maxLength={500}/></label>
    <button type="submit" disabled={busy}>入力する</button>
   </form>
   <div className="social-login-fields">
    {['Tab', 'Enter', 'Backspace'].map(key => <button key={key} type="button" disabled={busy} onClick={() => void run('input', {action: 'key', key})}>{key}</button>)}
    <button type="button" disabled={busy} onClick={() => void run('input', {action: 'scroll', delta: 500})}>下へ</button>
    <button type="button" disabled={busy} onClick={() => void run('input', {action: 'scroll', delta: -500})}>上へ</button>
    <button type="button" disabled={busy} onClick={() => void run('view')}>画面を更新</button>
    <button type="button" disabled={busy} onClick={() => void run('finish')}>ログインを確認して連携</button>
    <button type="button" disabled={busy} onClick={() => void run('cancel')}>中止</button>
   </div>
  </>}
  {busy && <p role="status">処理中…</p>}
  {error && <p className="social-alert" role="alert">{error}</p>}
 </section>;
}
