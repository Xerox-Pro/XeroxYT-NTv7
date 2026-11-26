import {ChevronUp} from 'lucide-react';
import './app-picker.css';

function lastYouTubePage() {
  try {
    const saved = sessionStorage.getItem('xerox_service_page_youtube') || '/';
    if (saved.startsWith('/') && !saved.startsWith('//') && !saved.includes('\\')) return saved;
  } catch {}
  return '/';
}

export default function AppPicker({current = 'youtube'}: {current?: 'youtube' | 'xerogram'}) {
  const popover = 'app-picker';
  const gas = (window as Window & {__XEROX_GAS_ASSETS__?: {base: string}}).__XEROX_GAS_ASSETS__;
  const close = () => document.getElementById(popover)?.hidePopover();
  const youtube = <><img className="x-mark" src={(gas?.base || '') + '/app-icons/youtube.png'} alt=""/>XeroxYT-NTv7</>;
  const xerogram = <><img className="x-mark" src={(gas?.base || '') + '/app-icons/xerogram.webp'} alt=""/>Xerogram</>;
  return <>
    <button type="button" className="x-switch" popoverTarget={popover} aria-label="アプリを切り替える"><ChevronUp size={20}/></button>
    <section popover="auto" id={popover} className="x-picker" aria-label="アプリ選択">
      <h2>アプリを切り替える</h2>
      {current === 'youtube'
        ? <button type="button" aria-current="true" popoverTarget={popover} popoverTargetAction="hide">{youtube}<small>使用中</small></button>
        : <a href={lastYouTubePage()} onClick={close}>{youtube}</a>}
      {current === 'xerogram'
        ? <button type="button" aria-current="true" popoverTarget={popover} popoverTargetAction="hide">{xerogram}<small>使用中</small></button>
        : gas
          ? <a href="https://xeroxapp044.vercel.app/xerogram" target="_blank" rel="noopener noreferrer" onClick={close}>{xerogram}</a>
          : <a href="/xerogram" onClick={close}>{xerogram}</a>}
    </section>
  </>;
}
