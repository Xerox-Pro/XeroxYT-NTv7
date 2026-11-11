import {shuffledQueue} from './playlistPlayback.mjs';
const channel=v=>v.authorId||v.author||'';
const mix=v=>v.type==='mix'||v.playlistId?.startsWith('RD');
// Keep the provider's candidates; space channels and mixes without moving existing cards.
export function spreadHome(videos,previous=[],random=Math.random){
 const remaining=shuffledQueue(videos,undefined,random),result=[],recent=previous.slice(-4);
 while(remaining.length){
  let best=0,bestScore=Infinity;
  for(let i=0;i<remaining.length;i++){
   const v=remaining[i],author=channel(v);
   const score=recent.reduce((sum,last,j)=>sum+(author&&channel(last)===author?(j+1)*4:0)+(mix(v)&&mix(last)?(j+1)*3:0),0);
   if(score<bestScore){best=i;bestScore=score;if(!score)break;}
  }
  const [next]=remaining.splice(best,1);result.push(next);recent.push(next);if(recent.length>4)recent.shift();
 }
 return result;
}
