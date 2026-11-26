import { useId, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, LayoutGrid, Play, X } from 'lucide-react';

export default function AppPicker({ compact = false, current = 'youtube' }: { compact?: boolean; current?: 'youtube' | 'xerogram' }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const navigate = useNavigate();
  const isGas = '__XEROX_GAS_ASSETS__' in window;
  const id = useId();
  function select(app: 'youtube' | 'xerogram') {
    dialog.current?.close();
    if (app === current) return;
    let page = app === 'xerogram' ? '/xerogram' : '/';
    try {
      const saved = sessionStorage.getItem('xerox_service_page_' + app);
      if (saved?.startsWith('/') && !saved.startsWith('//') && (app === 'xerogram') === /^\/xerogram(?:[/?#]|$)/.test(saved)) page = saved;
    } catch { /* Navigation works without browser storage. */ }
    navigate(page);
  }
  return <>
    <button type="button" className={compact ? 'xg-switch compact' : 'xg-switch'} onClick={() => dialog.current?.showModal()} aria-haspopup="dialog">
      <LayoutGrid size={20} aria-hidden="true" /> アプリ切り替え
    </button>
    <dialog ref={dialog} className="xg-picker" aria-labelledby={id} onClick={event => { if (event.target === dialog.current) dialog.current.close(); }}>
      <div>
        <header><h2 id={id}>アプリ切り替え</h2><button type="button" aria-label="閉じる" onClick={() => dialog.current?.close()}><X size={21}/></button></header>
        <button type="button" onClick={() => select('youtube')} aria-current={current === 'youtube' ? 'true' : undefined}><Play size={22}/> XeroxYT</button>
        {isGas
          ? <a className="xg-switch" href="https://xeroxapp044.vercel.app/xerogram" target="_blank" rel="noopener noreferrer" onClick={() => dialog.current?.close()}><Camera size={22}/> Xerogram</a>
          : <button type="button" onClick={() => select('xerogram')} aria-current={current === 'xerogram' ? 'true' : undefined}><Camera size={22}/> Xerogram</button>}
      </div>
    </dialog>
  </>;
}
