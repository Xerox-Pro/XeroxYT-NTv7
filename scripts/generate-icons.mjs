// Create square, aspect-preserving icons from the current YouTube artwork.
// These files are generated before Vite builds; do not stretch the source.
import sharp from 'sharp';
import {fileURLToPath} from 'node:url';
import {mkdir} from 'node:fs/promises';
const source=new URL('../public/app-icons/youtube.jpeg',import.meta.url);
const directory=new URL('../public/',import.meta.url);
await mkdir(directory,{recursive:true});
const variants=[
 ['pwa-192x192.png',192,'#ffffff',0],
 ['pwa-512x512.png',512,'#ffffff',0],
 ['pwa-maskable-512x512.png',512,'#ffffff',.18],
 ['pwa-dark-192x192.png',192,'#101014',0],
 ['pwa-dark-512x512.png',512,'#101014',0],
 ['apple-touch-icon.png',180,'#ffffff',0],
 ['favicon.png',64,'#ffffff',0],
 ['favicon-32x32.png',32,'#ffffff',0],
 ['favicon-16x16.png',16,'#ffffff',0],
];
for(const [file,size,background,padding] of variants){
 const inset=Math.round(size*padding);
 const content=await sharp(fileURLToPath(source)).rotate().resize(size-2*inset,size-2*inset,{fit:'contain',background}).png().toBuffer();
 await sharp({create:{width:size,height:size,channels:4,background}})
  .composite([{input:content,left:inset,top:inset}]).png().toFile(fileURLToPath(new URL(file,directory)));
}
console.info('Generated square PWA and favicon assets without distorting artwork');
