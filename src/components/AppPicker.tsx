import { ChevronUp } from 'lucide-react';
import './app-picker.css';

export default function AppPicker() {
  return <>
    <button type="button" className="x-switch" popoverTarget="app-picker" aria-label="アプリを切り替える"><ChevronUp size={20}/></button>
    <section popover="auto" id="app-picker" className="x-picker" aria-label="アプリ選択">
      <h2>アプリを切り替える</h2>
      <button type="button" aria-current="true" popoverTarget="app-picker" popoverTargetAction="hide"><img className="x-mark" src="/app-icons/youtube.png" alt=""/>XeroxYT-NTv7<small>使用中</small></button>
      <a href="https://xeroxapp047.vercel.app/"><img className="x-mark" src="/app-icons/xerogram.webp" alt=""/>Xerogram<small aria-hidden="true">↗</small></a>
    </section>
  </>;
}
