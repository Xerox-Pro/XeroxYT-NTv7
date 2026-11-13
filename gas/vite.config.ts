import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
const root=process.cwd();
export default defineConfig({
  plugins:[{name:'gas-compat',enforce:'pre',transform(code,id){
    if(id.endsWith('/src/components/AppSwitcher.tsx'))code=code.replace(/'\/(app-icons\/[^']+)'/g,"((window as any).__XEROX_GAS_ASSETS__.base+'/$1')");
    if(id.endsWith('/src/MainApp.tsx'))code=code.replaceAll('window.location.search','location.search');
    if(id.endsWith('/src/components/LibraryPage.tsx'))code=code.replace('`${window.location.origin}/watch?list=${selectedPlaylist.id}`',"((window as any).__XEROX_GAS_SHARE__('/watch?list='+encodeURIComponent(selectedPlaylist.id)))");
    if(id.endsWith('/src/components/ShortsViewer.tsx'))code=code.replace('new URL(`/shorts/${video.videoId}`,window.location.origin).href',"((window as any).__XEROX_GAS_SHARE__('/shorts/'+video.videoId))");
    if(id.endsWith('/src/components/VideoPlayer.tsx'))code=code.replaceAll('url: window.location.href',"url: (window as any).__XEROX_GAS_SHARE__()").replaceAll('writeText(window.location.href)',"writeText((window as any).__XEROX_GAS_SHARE__())");
    return code;
  }},react(),tailwindcss()],
  publicDir:false,
  resolve:{alias:[
    {find:/^.*lib\/apiTransport\.mjs$/,replacement:path.join(root,'gas/client/transport.mjs')},
    {find:'@',replacement:root},
  ]},
  build:{outDir:'gas/web',emptyOutDir:true,cssCodeSplit:false,sourcemap:false,
    rollupOptions:{input:'gas/client/main.tsx',output:{format:'iife',name:'XeroxGAS',inlineDynamicImports:true,entryFileNames:'app-[hash].js',assetFileNames:'[name]-[hash][extname]'}}},
});
