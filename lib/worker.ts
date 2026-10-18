import {timingSafeEqual} from 'node:crypto';

export type WorkItem={kind:'report';id:string}|{kind:'daily'};
export function runtimeEnv(key:string){
 const netlify=(globalThis as typeof globalThis & {Netlify?:{env:{get:(key:string)=>string|undefined}}}).Netlify;
 return netlify?.env.get(key)??process.env[key];
}
export function authorizedWorker(req:Request,secret=runtimeEnv('CRON_SECRET')){
 if(req.method!=='POST'||!secret)return false;
 const expected=Buffer.from('Bearer '+secret),supplied=Buffer.from(req.headers.get('authorization')||'');
 return expected.length===supplied.length&&timingSafeEqual(expected,supplied);
}
export function parseWorkItem(value:unknown):WorkItem{
 if(!value||typeof value!=='object')throw new Error('Invalid work item');
 const item=value as {kind?:unknown;id?:unknown};
 if(item.kind==='daily'&&item.id===undefined)return {kind:'daily'};
 if(item.kind==='report'&&typeof item.id==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item.id))return {kind:'report',id:item.id};
 throw new Error('Invalid work item');
}
export async function dispatchWork(item:WorkItem){
 const base=runtimeEnv('APP_URL'),secret=runtimeEnv('CRON_SECRET');
 if(!base||!secret)throw new Error('Background worker is not configured');
 const url=new URL('/.netlify/functions/research-worker',base);
 if(url.protocol!=='https:'||url.username||url.password)throw new Error('Invalid worker origin');
 const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+secret},body:JSON.stringify(parseWorkItem(item)),signal:AbortSignal.timeout(10000),redirect:'error',cache:'no-store'});
 if(response.status!==202)throw new Error('Background worker did not accept the job');
}
