const hosts=new Set(['www.youtubeeducation.com','www.youtube.com','www.youtube-nocookie.com']);
export function ambientVideoUrl(source,id,origin){
 if(!/^[\w-]{11}$/.test(id||''))return '';
 try{
  const url=new URL(source);if(url.protocol!=='https:'||!hosts.has(url.hostname)||!url.pathname.startsWith('/embed/'))return '';
  url.pathname='/embed/'+id;
  for(const key of ['list','index','playlist','end'])url.searchParams.delete(key);
  for(const [key,value] of Object.entries({autoplay:'0',mute:'1',controls:'0',disablekb:'1',enablejsapi:'1',playsinline:'1',loop:'0',rel:'0',cc_load_policy:'0',origin}))url.searchParams.set(key,value);
  return url.toString();
 }catch{return '';}
}
