// Share concurrent work only. Completed personal responses are never cached.
export function createInflightJson(read,scope=()=>'',pending=new Map()){
 return function(url,options){
  if(options?.signal||options?.headers||options?.body||(options?.method&&options.method!=='GET'))return read(url,options);
  const key=scope()+'|'+url+'|'+(options?.credentials||'')+'|'+(options?.cache||'');
  let task=pending.get(key);
  if(!task){task=Promise.resolve().then(()=>read(url,options)).finally(()=>{if(pending.get(key)===task)pending.delete(key);});pending.set(key,task);}
  return task.then(value=>structuredClone(value));
 };
}
