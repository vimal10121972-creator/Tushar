import {after} from 'next/server';
import {timingSafeEqual} from 'node:crypto';
import {query} from '@/lib/db';
import {member,requireOwner,readableReport,cleanReport,validateOrigin,limit,HttpError} from '@/lib/access';
import {enqueue,processReport,runDaily,cached,validateAssumptions} from '@/lib/jobs';
import {dispatchWork} from '@/lib/worker';
import {searchCompanies,verifyCompany} from '@/lib/providers';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
async function startReport(id:string){
 if(process.env.ACTIVE_HOST==='netlify'){
  try{await dispatchWork({kind:'report',id});}
  catch{console.error('background-dispatch-failed',{reportId:id});} // The persisted job remains eligible for daily recovery.
 }else if(process.env.NODE_ENV!=='production')after(()=>processReport(id));
}
const respond=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
async function body(req:Request){
 if(Number(req.headers.get('content-length')||0)>100000)throw new HttpError(413,'Request too large.');
 const raw=await req.text();if(raw.length>100000)throw new HttpError(413,'Request too large.');
 try{return JSON.parse(raw);}catch{throw new HttpError(400,'Invalid JSON.');}
}
async function handle(req:Request){try{
 const url=new URL(req.url),path=url.pathname.slice(5).split('/').filter(Boolean),method=req.method;
 if(path[0]==='health')return respond({service:'Tushar Jain Research',status:'online',dataCoverage:'Progressive; reports disclose missing evidence',paidAi:false});
 if(path[0]==='cron'){
  // Netlify owns the only production scheduler. Legacy HTTP cron is development-only.
  if(process.env.NODE_ENV==='production')throw new HttpError(404,'Not found.');
  if(method!=='GET')throw new HttpError(405,'Method not allowed.');
  const expected=process.env.CRON_SECRET?Buffer.from('Bearer '+process.env.CRON_SECRET):null;
  const supplied=Buffer.from(req.headers.get('authorization')||'');
  if(!expected||expected.length!==supplied.length||!timingSafeEqual(expected,supplied))throw new HttpError(401,'Unauthorized');
  after(async()=>{try{await runDaily();}catch{console.error('daily-runner-failed');}});
  return respond({accepted:true});
 }
 if(!['GET','HEAD'].includes(method))validateOrigin(req);
 const user=await member();
 if(path[0]==='me'&&method==='GET')return respond({user,limits:{dailyReports:user.role==='OWNER'?10:3,workspaceDaily:20,workspaceMonthly:100,narrative:'Deterministic, no paid AI',reportEmail:'Not enabled',resumeAfterInterruption:'Daily recovery or manual retry'}});
 if(path[0]==='companies'&&method==='GET'){
  const q=(url.searchParams.get('q')||'').trim();
  if(q.length<2||q.length>100)throw new HttpError(400,'Enter 2–100 characters.');
  await limit('company-search:'+user.id,100,3600);
  return respond({companies:await cached('search:'+q.toUpperCase(),()=>searchCompanies(q),24)});
 }
 if(path[0]==='reports'){
  if(path.length===1&&method==='GET'){
   const reports=await query(`SELECT r.id,r.company,r.status,r.stage,r.stage_name,r.error,r.created_at,r.pdf_pages,(r.pdf_base64 IS NOT NULL) AS pdf_available FROM research.reports r WHERE r.user_id=$1 OR EXISTS(SELECT 1 FROM research.shares s WHERE s.report_id=r.id AND s.email=$2) ORDER BY r.created_at DESC LIMIT 100`,[user.id,user.email]);
   return respond({reports:reports.map(r=>({...r,stage:r.stage_name,stageIndex:r.stage,pdfAvailable:r.pdf_available}))});
  }
  if(path.length===1&&method==='POST'){
   const data=await body(req);
   if(typeof data.company?.id!=='string'||data.company.id.length>100)throw new HttpError(400,'Select a verified company first.');
   const company=await cached('identity:'+data.company.id,()=>verifyCompany(data.company.id),24);
   const report=await enqueue(user,company,validateAssumptions(data.assumptions||{}),req.headers.get('idempotency-key')||undefined);
   await startReport(report.id);
   return respond({report:cleanReport(report)},202);
  }
  if(path[1]){
   const report=await readableReport(path[1],user);
   if(path.length===2&&method==='GET'){
    const stages=await query('SELECT stage_name,status,detail,created_at FROM research.stage_events WHERE report_id=$1 ORDER BY id',[report.id]);
    return respond({report:{...cleanReport(report),stages}});
   }
   if(path[2]==='pdf'&&method==='GET'){
    if(!report.pdf_base64||!['READY','LIMITED','BLOCKED'].includes(report.status))throw new HttpError(409,'A checked PDF is not available for this report.');
    const file=Buffer.from(report.pdf_base64,'base64');
    return new Response(file,{headers:{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="Tushar-Jain-Research-${report.id}.pdf"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
   }
   if(report.user_id!==user.id)throw new HttpError(403,'Only the report creator can change it.');
   if(path[2]==='retry'&&method==='POST'){
    await limit('retry:'+user.id,5,3600);
    if(report.status==='BLOCKED')throw new HttpError(409,'Review the conflicting evidence before generating a corrected report.');
    if(!['QUEUED','PROCESSING','FAILED'].includes(report.status))throw new HttpError(409,'This report has already finished.');
    if(report.attempts>=5)throw new HttpError(429,'Retry allowance reached. The owner must review the provider error.');
    const rows=await query(`UPDATE research.reports SET status='QUEUED',next_attempt_at=now(),updated_at=now() WHERE id=$1 AND (lease_until IS NULL OR lease_until<now()) RETURNING *`,[report.id]);
    if(!rows[0])throw new HttpError(409,'A worker is already processing this report.');
    await startReport(report.id);return respond({report:cleanReport(rows[0])},202);
   }
   if(path[2]==='share'&&method==='POST'){
    const data=await body(req),email=String(data.email||'').trim().toLowerCase();
    const m=await query('SELECT user_id FROM research.members WHERE email=$1 AND active',[email]);
    if(!m.length)throw new HttpError(400,'The recipient must first join and verify their invited account.');
    await query('INSERT INTO research.shares(report_id,email,shared_by) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[report.id,email,user.id]);
    return respond({shared:true,emailNotification:false});
   }
  }
 }
 if(path[0]==='invites'&&method==='POST'){
  requireOwner(user);await limit('invites:'+user.id,20,86400);
  const data=await body(req),email=String(data.email||'').trim().toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)throw new HttpError(400,'Enter a valid email address.');
  await query(`INSERT INTO research.invites(email,invited_by) VALUES($1,$2) ON CONFLICT(email) DO UPDATE SET expires_at=now()+interval '14 days',invited_by=EXCLUDED.invited_by`,[email,user.id]);
  return respond({invited:true,emailNotification:false});
 }
 if(path[0]==='schedules'){
  if(method==='GET')return respond({schedules:await query('SELECT * FROM research.schedules WHERE user_id=$1 ORDER BY next_run_at',[user.id])});
  if(method==='POST'){
   const data=await body(req);if(!['MONTHLY','QUARTERLY'].includes(data.frequency))throw new HttpError(400,'Choose monthly or quarterly.');
   const n=await query('SELECT count(*) AS n FROM research.schedules WHERE user_id=$1 AND enabled',[user.id]);if(Number(n[0].n)>=3)throw new HttpError(429,'Maximum three active schedules per user.');
   const company=await cached('identity:'+String(data.company?.id),()=>verifyCompany(String(data.company?.id)),24);
   const rows=await query(`INSERT INTO research.schedules(user_id,company,frequency,next_run_at) VALUES($1,$2::jsonb,$3,now()+CASE WHEN $3='MONTHLY' THEN interval '1 month' ELSE interval '3 months' END) ON CONFLICT(user_id,company,frequency) DO UPDATE SET enabled=true RETURNING *`,[user.id,JSON.stringify(company),data.frequency]);
   return respond({schedule:rows[0]},201);
  }
  if(method==='DELETE'&&path[1]){await query('UPDATE research.schedules SET enabled=false WHERE id=$1 AND user_id=$2',[path[1],user.id]);return respond({disabled:true});}
 }
 if(path[0]==='admin'){
  requireOwner(user);
  if(method==='GET'){
   const [users,invites,providerHealth,failedReports,conflicts,settings]=await Promise.all([
    query('SELECT user_id,email,name,role,active,created_at FROM research.members ORDER BY created_at'),
    query('SELECT email,expires_at FROM research.invites WHERE expires_at>now()'),
    query('SELECT * FROM research.provider_health'),
    query("SELECT id,company,status,stage_name,error,attempts FROM research.reports WHERE status='FAILED' ORDER BY updated_at DESC LIMIT 25"),
    query("SELECT id,company,result->'validation' AS validation FROM research.reports WHERE status='BLOCKED' LIMIT 25"),
    query('SELECT key,value FROM research.settings')]);
   return respond({users,invites,providerHealth,failedReports,conflicts,settings,coverage:'NSE security directory and daily closes; TCS official financial workbook. Coverage is progressive; check each report.',scheduling:'One daily scheduler with persisted leases. Monthly and quarterly report subscriptions; no filing-event promises.',costPolicy:'Free allowances only. No paid inference or paid market data.'});
  }
  if(method==='POST'){
   const data=await body(req);
   if(data.userId===user.id)throw new HttpError(400,'Owner cannot revoke their own access.');
   if(typeof data.active!=='boolean')throw new HttpError(400,'Specify member active state.');
   await query("UPDATE research.members SET active=$1 WHERE user_id=$2 AND role='MEMBER'",[data.active,data.userId]);return respond({updated:true});
  }
 }
 throw new HttpError(404,'Not found.');
}catch(e){
 if(!(e instanceof HttpError))console.error('api-failure',{path:new URL(req.url).pathname,errorName:e instanceof Error?e.name:'Error'});
 return respond({error:e instanceof HttpError?e.message:'The service is temporarily unavailable. Please try again.',code:e instanceof HttpError?e.code:'SERVICE_UNAVAILABLE'},e instanceof HttpError?e.status:503);
}}
export const GET=handle;
export const POST=handle;
export const DELETE=handle;
