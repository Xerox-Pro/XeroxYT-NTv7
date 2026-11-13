if(process.env.VERCEL_ENV==='production'){
 const call=async body=>{const response=await fetch('https://xeroxapp044.vercel.app/api/social-browser',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+process.env.API_SHARED_SECRET},body:JSON.stringify(body),signal:AbortSignal.timeout(45000)});if(!response.ok)throw Error('Login browser verification failed: '+response.status);return response.json();};
 const browser=await call({operation:'create',service:'instagram'});
 try{const frame=await call({operation:'command',sessionId:browser.sessionId,method:'Page.captureScreenshot',params:{format:'jpeg',quality:30,captureBeyondViewport:false}});if(typeof frame.data!=='string'||frame.data.length<100)throw Error('Login browser frame missing');console.info('Verified isolated Vercel browser startup and screen capture');}
 finally{await call({operation:'close',sessionId:browser.sessionId});}
}
