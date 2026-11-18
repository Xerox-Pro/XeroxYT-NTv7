const key='xerox_theme_v1';
export function readTheme(){try{const value=localStorage.getItem(key);return ['light','dark'].includes(value)?value:'system';}catch{return 'system';}}
export function applyTheme(mode=readTheme()){
 const dark=mode==='dark'||mode==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches;
 document.documentElement.dataset.theme=dark?'dark':'light';document.documentElement.style.colorScheme=dark?'dark':'light';
}
export function setTheme(mode){if(!['system','light','dark'].includes(mode))return;try{localStorage.setItem(key,mode);}catch{}applyTheme(mode);window.dispatchEvent(new Event('xerox-theme-changed'));}
export function watchTheme(){const media=window.matchMedia('(prefers-color-scheme: dark)'),update=()=>applyTheme();update();media.addEventListener('change',update);window.addEventListener('storage',update);return()=>{media.removeEventListener('change',update);window.removeEventListener('storage',update);};}
