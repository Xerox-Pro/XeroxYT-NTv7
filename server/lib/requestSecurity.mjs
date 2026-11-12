export async function boundedRequestBody(request,limit=1024*1024){
 const declared=Number(request.headers.get('content-length'));
 if(Number.isFinite(declared)&&declared>limit)throw new RangeError('Request too large');
 const reader=request.body?.getReader();if(!reader)return undefined;let size=0;const chunks=[];
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit)throw new RangeError('Request too large');chunks.push(value);}}catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
 const result=new Uint8Array(size);let offset=0;for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.byteLength;}return result;
}
