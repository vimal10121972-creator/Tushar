import {authorizedWorker,parseWorkItem,runtimeEnv} from '../../lib/worker';
import {processReport,runDaily} from '../../lib/jobs';

type Context={deploy:{context:string}};
export default async function handler(req:Request,context:Context){
 // A background response is asynchronous: authorization must precede all database work.
 if(!authorizedWorker(req))return new Response(null,{status:401});
 if(context.deploy.context!=='production'||runtimeEnv('ACTIVE_HOST')!=='netlify')return;
 if(Number(req.headers.get('content-length')||0)>1024)return;
 const raw=await req.text();if(raw.length>1024)return;
 let item;try{item=parseWorkItem(JSON.parse(raw));}catch{return;}
 // Shared engine also runs outside Netlify; resolve runtime-scoped values here.
 process.env.DATABASE_URL=runtimeEnv('DATABASE_URL');
 process.env.ACTIVE_HOST='netlify';
 if(item.kind==='daily')await runDaily();
 else await processReport(item.id,220000);
}
export const config={background:true};
