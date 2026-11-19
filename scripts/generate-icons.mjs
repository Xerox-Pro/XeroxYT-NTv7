// Generate all site, tab and PWA icons from the same GAS-edition artwork.
// Never use the legacy youtube.jpeg: it is an older icon.
import sharp from 'sharp';
import {fileURLToPath} from 'node:url';
import {mkdir,writeFile} from 'node:fs/promises';

const sourceCommit='fec69ad4b60f5d67d30ed48a6c008f4a9022167b';
const sourceRepo='Xerox-Pro/XeroxYT-NTv7-for-GAS';
const root=new URL('../public/',import.meta.url);
const iconDir=new URL('../public/app-icons/',import.meta.url);
await mkdir(fileURLToPath(iconDir),{recursive:true});

async function fetchSource(name){
 const file='public/app-icons/'+name;
 const urls=[
  `https://raw.githubusercontent.com/${sourceRepo}/${sourceCommit}/${file}`,
  `https://api.github.com/repos/${sourceRepo}/contents/${file}?ref=${sourceCommit}`
 ];
 const errors=[];
 for(const url of urls){
  try{
   const response=await fetch(url,{headers:{'Accept':'application/vnd.github+json','User-Agent':'XeroxYT-Icon-Build'},signal:AbortSignal.timeout(12000)});
   if(!response.ok){errors.push(`${response.status} ${new URL(url).hostname}`);continue;}
   let bytes;
   if(new URL(url).hostname==='api.github.com'){
    const json=await response.json();
    if(json.encoding!=='base64'||typeof json.content!=='string')throw new Error('Unexpected GitHub response');
    bytes=Buffer.from(json.content.replace(/\\s/g,''),'base64');
   }else bytes=Buffer.from(await response.arrayBuffer());
   if(bytes.length<100||bytes.length>5_000_000)throw new Error('Invalid icon size');
   const meta=await sharp(bytes).metadata();
   if(meta.format!=='png'||!meta.width||!meta.height)throw new Error('Source is not a valid PNG');
   return bytes;
  }catch(error){errors.push(String(error.message||error));}
 }
 throw new Error('Unable to fetch GAS '+name+'; refusing to silently restore legacy artwork: '+errors.join('; '));
}
const light=await fetchSource('youtube.png');
const dark=await fetchSource('youtube-dark.png');
await Promise.all([writeFile(fileURLToPath(new URL('youtube.png',iconDir)),light),writeFile(fileURLToPath(new URL('youtube-dark.png',iconDir)),dark)]);

const variants=[
 ['pwa-192x192-gas.png',192,light,'#ffffff',0],
 ['pwa-512x512-gas.png',512,light,'#ffffff',0],
 ['pwa-maskable-512x512-gas.png',512,light,'#ffffff',.18],
 ['pwa-dark-192x192-gas.png',192,dark,'#101014',0],
 ['pwa-dark-512x512-gas.png',512,dark,'#101014',0],
 ['apple-touch-icon-gas.png',180,light,'#ffffff',0],
 ['favicon-gas.png',64,light,'#ffffff',0],
 ['favicon-32x32-gas.png',32,light,'#ffffff',0],
 ['favicon-16x16-gas.png',16,light,'#ffffff',0],
];
for(const [file,size,source,background,padding] of variants){
 const inset=Math.round(size*padding);
 const image=await sharp(source).rotate().resize(size-2*inset,size-2*inset,{fit:'contain',background}).png().toBuffer();
 await sharp({create:{width:size,height:size,channels:4,background}})
  .composite([{input:image,left:inset,top:inset}]).png()
  .toFile(fileURLToPath(new URL(file,root)));
}

// Also replace /favicon.ico so browsers that request it directly see the new icon.
// The ICO contains a standard 32-bit BGRA bitmap and a transparency mask.
const size=32;
const {data}=await sharp(light).rotate().resize(size,size,{fit:'contain',background:'#ffffff'}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
const pixels=Buffer.alloc(size*size*4),mask=Buffer.alloc(size*4);
for(let y=0;y<size;y++)for(let x=0;x<size;x++){
 const source=((size-1-y)*size+x)*4,target=(y*size+x)*4;
 pixels[target]=data[source+2];pixels[target+1]=data[source+1];pixels[target+2]=data[source];pixels[target+3]=data[source+3];
 if(data[source+3]<128)mask[y*4+(x>>3)]|=0x80>>(x&7);
}
const dib=Buffer.alloc(40);
dib.writeUInt32LE(40,0);dib.writeInt32LE(size,4);dib.writeInt32LE(size*2,8);
dib.writeUInt16LE(1,12);dib.writeUInt16LE(32,14);dib.writeUInt32LE(pixels.length+mask.length,20);
const image=Buffer.concat([dib,pixels,mask]);
const header=Buffer.alloc(22);
header.writeUInt16LE(1,2);header.writeUInt16LE(1,4);
header.writeUInt8(size,6);header.writeUInt8(size,7);
header.writeUInt16LE(1,10);header.writeUInt16LE(32,12);
header.writeUInt32LE(image.length,14);header.writeUInt32LE(22,18);
await writeFile(fileURLToPath(new URL('favicon.ico',root)),Buffer.concat([header,image]));
console.info('Generated GAS-edition light/dark favicon and square PWA assets');
