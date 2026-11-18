// When the linked TV client returns an empty Shorts feed or a temporary
// upstream error, use the anonymous discovery feed instead of an empty viewer.
export async function loadShortsWithFallback({personalized,fallbackActive=false,primaryUrl,publicUrl,load}) {
 if(!personalized||fallbackActive)return {data:await load(fallbackActive?publicUrl:primaryUrl),usedFallback:fallbackActive};
 try {
  const data=await load(primaryUrl);
  if(Array.isArray(data?.videos)&&data.videos.some(video=>video?.isShort))
   return {data,usedFallback:false};
 } catch(error) {
  // Authentication and quota errors need to remain visible to the user.
  if(error?.isDailyLimit||[400,401,403,404,429].includes(error?.status))throw error;
 }
 return {data:await load(publicUrl),usedFallback:true};
}
