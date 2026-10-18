import {dispatchWork,runtimeEnv} from '../../lib/worker';

export default async function handler(_req:Request,context:{deploy:{context:string}}){
 if(context.deploy.context!=='production'||runtimeEnv('ACTIVE_HOST')!=='netlify')return;
 // The scheduled function only dispatches; processing runs in the background worker.
 await dispatchWork({kind:'daily'});
}
export const config={schedule:'10 3 * * *'}; // 08:40 India Standard Time, once daily.
