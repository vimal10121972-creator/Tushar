import {randomUUID,createHash} from 'node:crypto';
import {query} from './db';
import {limit,HttpError} from './usage';
import {verifyCompany,fetchMarketData,fetchFinancials,type CompanyIdentity} from './providers';
import {calculateRatios,calculateDcf,dcfScenarios,dcfSensitivity,validateFinancials,type DcfInput,type FinancialStatement,type Sector} from './finance';
import {buildResearchPdf} from './report-pdf';

export const STAGES=['Verify company identity','Collect closing price','Collect official financial statements','Validate and calculate','Assemble evidence-led narrative','Generate and check PDF','Complete'];
const json=(v:unknown)=>JSON.stringify(v);
const unique=(v:string[])=>[...new Set(v)];
export async function cached<T>(key:string,fn:()=>Promise<T>,hours=12):Promise<T>{
 const rows=await query('SELECT value FROM research.source_cache WHERE key=$1 AND expires_at>now()',[key]);
 if(rows[0])return rows[0].value;
 const value=await fn();
 await query(`INSERT INTO research.source_cache(key,value,expires_at) VALUES($1,$2::jsonb,now()+($3::text||' hours')::interval) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,expires_at=EXCLUDED.expires_at`,[key,json(value),hours]);
 return value;
}
export function validateAssumptions(a:any){
 if(!a || typeof a!=='object'||Array.isArray(a))throw new HttpError(400,'Assumptions must be an object.');
 if(a.dcf){
  if(typeof a.justification!=='string'||a.justification.trim().length<30)throw new HttpError(400,'Explain the forecast assumptions and their evidence in at least 30 characters.');
  try{calculateDcf(a.dcf);}catch(e){throw new HttpError(400,'Invalid DCF: '+(e as Error).message);}
 }
 if(a.scenarios){if(!a.dcf)throw new HttpError(400,'Provide the base DCF before scenarios.');try{dcfScenarios(a.scenarios);}catch(e){throw new HttpError(400,'Invalid scenarios: '+(e as Error).message);}}
 return a;
}
export async function enqueue(user:{id:string,role:string},company:CompanyIdentity,assumptions:any={},key?:string){
 const day=new Date().toISOString().slice(0,10);
 const fingerprint=createHash('sha256').update(json({company:company.id,assumptions,day})).digest('hex');
 const idempotency=key||fingerprint;
 if(idempotency.length>150)throw new HttpError(400,'Invalid request identifier.');
 const prior=await query('SELECT * FROM research.reports WHERE user_id=$1 AND idempotency_key=$2',[user.id,idempotency]);
 if(prior[0])return prior[0];
 const size=await query('SELECT pg_database_size(current_database()) AS bytes');
 if(Number(size[0].bytes)>350_000_000)throw new HttpError(429,'Report storage is close to the free allowance. Ask the owner to review stored reports.');
 await limit('reports-user:'+user.id,user.role==='OWNER'?10:3);
 await limit('reports-global-day',20);
 // Calendar-month counter, independent of provider quotas; reject before any generation.
 await limit('reports-global-month',100,32*86400,day.slice(0,7));
 const rows=await query(`INSERT INTO research.reports(user_id,company,company_key,idempotency_key,assumptions) VALUES($1,$2::jsonb,$3,$4,$5::jsonb) ON CONFLICT(user_id,idempotency_key) DO UPDATE SET idempotency_key=EXCLUDED.idempotency_key RETURNING *`,[user.id,json(company),company.id,idempotency,json(assumptions)]);
 return rows[0];
}
function sectorFor(company:CompanyIdentity):Sector{
 const s=(company.sector||'')+' '+company.name;
 if(/insurance|life assurance/i.test(s))return 'insurance';
 if(/bank\b/i.test(s))return 'bank';
 if(/finance|financial services|housing finance|investment company/i.test(s))return 'nbfc';
 if(/holding/i.test(s))return 'holding';
 if(/depositor|exchange|asset management|registrar/i.test(s))return 'market-infrastructure';
 return 'non-financial';
}
function calculate(payload:any,company:CompanyIdentity,assumptions:any){
 const annual:FinancialStatement[]=[...(payload.financials?.annual||[])].sort((a,b)=>a.fiscalPeriod.localeCompare(b.fiscalPeriod));
 const current=annual.at(-1),previous=annual.at(-2),sector=sectorFor(company);
 const conflicts:string[]=[...(payload.financials?.conflicts||[])];
 const checks=current?validateFinancials(current):[];
 const failed=checks.filter((c:any)=>c.status==='conflicting');
 failed.forEach((c:any)=>conflicts.push(c.message||c.check||c.name||'Financial reconciliation failed'));
 const metrics=current?calculateRatios(current,previous,{price:payload.market?.price},sector):{};
 const limitations:string[]=unique([...(payload.market?.limitations||[]),...(payload.financials?.limitations||[]),'Narrative is a deterministic summary of retrieved evidence, not an AI analyst opinion.','Peer valuations, governance assessment, material news and adjusted price history are not yet automatically validated.']);
 let valuation:any=null;
 if(assumptions.dcf){
  if(!['non-financial','market-infrastructure'].includes(sector))limitations.push('Generic FCFF DCF withheld for this sector. A sector-specific valuation is required.');
  else if(conflicts.length)limitations.push('DCF withheld because unresolved source or reconciliation conflicts exist.');
  else{
   const input:DcfInput={...assumptions.dcf,marketPrice:payload.market?.price};
   const result=calculateDcf(input);
   valuation={method:'User-supplied FCFF scenario; not an independently established intrinsic value',assumptionStatus:'Assumption',justification:assumptions.justification,inputs:input,...result,
    sensitivity:{basis:'Terminal FCFF is held fixed as WACC and terminal growth vary.',growthRates:[input.terminalGrowth-.01,input.terminalGrowth,input.terminalGrowth+.01],rows:dcfSensitivity(input,[input.wacc-.01,input.wacc,input.wacc+.01],[input.terminalGrowth-.01,input.terminalGrowth,input.terminalGrowth+.01])},
    scenarios:assumptions.scenarios?dcfScenarios(assumptions.scenarios):null};
   limitations.push('Forecasts and the equity bridge are supplied assumptions and have not been independently verified against all current filings.');
  }
 }
 const missing=unique([...(payload.market?.missing||[]),...(payload.financials?.missing||[]),...(!valuation?['Defensible intrinsic valuation: essential inputs or justified assumptions are unavailable.']:[])]);
 const packet={company,prices:payload.market,financials:payload.financials,sources:uniqueSources([...(payload.market?.sources||[]),...(payload.financials?.sources||[]),{url:company.sourceUrl,title:'Official security identity',publisher:'Exchange / company',retrievedAt:company.retrievedAt}]),missing,conflicts,limitations,retrievedAt:new Date().toISOString()};
 return {packet,metrics,valuation,sector,validation:{valid:conflicts.length===0,checks,conflicts},limitations,missing,sources:packet.sources};
}
function uniqueSources(s:any[]){const seen=new Set();return s.filter(x=>x?.url&&!seen.has(x.url)&&(seen.add(x.url),true));}
function narrative(result:any){
 const p=result.packet,m=p.prices,f=p.financials,annual=f?.annual||[],last=annual.at(-1);
 const title=`${p.company.name}: evidence available for review`;
 const lines=[`Identity: ${p.company.name}; ${p.company.symbol||p.company.bseCode||p.company.isin}.`,
 m?.price?`The retrieved completed-session close is INR ${m.price.toLocaleString('en-IN')} on ${m.asOf}. This is not a live quote.`:'A verified completed-session closing price was not available.',
 `${annual.length} annual financial periods and ${(f?.quarterly||[]).length} quarterly periods were retrieved. Annual and quarterly figures remain separate.`,
 last?`Latest annual period: ${last.fiscalPeriod}. Monetary statement values are stored in INR base units. Ratios use only available, compatible inputs.`:'Historical annual statements were unavailable for a validated calculation.',
 'No buy, sell or hold recommendation is issued. Missing cash-flow, peer, governance and valuation evidence limits an investment conclusion.'];
 if(typeof result.metrics?.revenueGrowth==='number')lines.push(`Revenue changed ${(100*result.metrics.revenueGrowth).toFixed(2)}% between the two latest available comparable annual periods; verify publication dates and accounting basis in the source register.`);
 return {...result,summary:title,narrative:lines};
}
export async function isActiveHost(){
 const host=await query("SELECT value FROM research.settings WHERE key='active_host'");
 return host[0]?.value===(process.env.ACTIVE_HOST||'development');
}
export async function processReport(id:string,budgetMs=220000){
 if(!await isActiveHost())return;
 const start=Date.now();
 while(Date.now()-start<budgetMs-25000){
  const token=randomUUID();
  const rows=await query(`UPDATE research.reports SET lease_token=$2,lease_until=now()+interval '90 seconds',status='PROCESSING',updated_at=now()
   WHERE id=$1 AND status IN ('QUEUED','PROCESSING') AND next_attempt_at<=now() AND (lease_until IS NULL OR lease_until<now()) RETURNING *`,[id,token]);
  if(!rows[0])return;
  const report=rows[0],stage=report.stage,payload=report.payload||{};
  try{
   let result=report.result,company=report.company;
   if(stage===0)company=await cached('identity:'+report.company_key,()=>verifyCompany(report.company_key),24);
   if(stage===1)payload.market=await cached('market:'+company.id+':'+new Date().toISOString().slice(0,10),()=>fetchMarketData(company),6);
   if(stage===2)payload.financials=await cached('financials:'+company.id,()=>fetchFinancials(company),12);
   if(stage===3)result=calculate(payload,company,report.assumptions);
   if(stage===4)result=narrative(result);
   if(stage===5){
    const finalStatus=result.packet.conflicts.length?'BLOCKED':'LIMITED';
    const pdf=await buildResearchPdf({...report,company,result,status:finalStatus});
    if(pdf.bytes.byteLength>2_500_000)throw new Error('PDF exceeds the free storage size guard.');
    result.pdfQuality={pageCount:pdf.pageCount,checks:pdf.checks};
    await query(`UPDATE research.reports SET status=$6,stage=6,stage_name=$7,result=$3::jsonb,pdf_base64=$4,pdf_pages=$5,lease_token=NULL,lease_until=NULL,error=$8,updated_at=now() WHERE id=$1 AND lease_token=$2`,[id,token,json(result),Buffer.from(pdf.bytes).toString('base64'),pdf.pageCount,finalStatus,finalStatus==='BLOCKED'?'Blocked: source conflicts; diagnostic available':'Limited research available',finalStatus==='BLOCKED'?'Source conflicts prevent a completed research report. The diagnostic PDF documents the discrepancies.':null]);
    await event(id,stage,'complete','PDF available; incomplete evidence explicitly disclosed');return;
   }
   await query(`UPDATE research.reports SET company=$3::jsonb,payload=$4::jsonb,result=$5::jsonb,stage=stage+1,stage_name=$6,lease_token=NULL,lease_until=NULL,error=NULL,updated_at=now() WHERE id=$1 AND lease_token=$2`,[id,token,json(company),json(payload),result?json(result):null,STAGES[stage+1]]);
   await event(id,stage,'complete');
  }catch(e){
   const message=(e instanceof Error?e.message:'Stage failed').slice(0,500).replace(/postgres(?:ql)?:\/\/\S+/g,'[redacted]');
   console.error('research-stage-failed',{reportId:id,stage,errorName:e instanceof Error?e.name:'Error'});
   await query(`UPDATE research.reports SET attempts=attempts+1,status=CASE WHEN attempts>=2 THEN 'FAILED' ELSE 'QUEUED' END,error=$3,next_attempt_at=now()+interval '15 minutes',lease_token=NULL,lease_until=NULL,updated_at=now() WHERE id=$1 AND lease_token=$2`,[id,token,message]);
   await event(id,stage,'failed',message);return;
  }
 }
}
async function event(id:string,stage:number,status:string,detail?:string){await query('INSERT INTO research.stage_events(report_id,stage,stage_name,status,detail) VALUES($1,$2,$3,$4,$5)',[id,stage,STAGES[stage],status,detail||null]);}
export async function runDaily(){
 if(!await isActiveHost())return {skipped:'Inactive host'};
 const schedules=await query(`SELECT s.*,m.role FROM research.schedules s JOIN research.members m ON m.user_id=s.user_id WHERE s.enabled AND m.active AND s.next_run_at<=now() ORDER BY next_run_at LIMIT 10`);
 for(const s of schedules){try{
  await enqueue({id:s.user_id,role:s.role},s.company,{},'schedule:'+s.id+':'+new Date(s.next_run_at).toISOString().slice(0,10));
  await query(`UPDATE research.schedules SET next_run_at=now()+CASE WHEN frequency='MONTHLY' THEN interval '1 month' ELSE interval '3 months' END WHERE id=$1`,[s.id]);
 }catch(e){if(!(e instanceof HttpError&&e.status===429))console.error('schedule-failed',s.id);}}
 const rows=await query(`SELECT id FROM research.reports WHERE status IN ('QUEUED','PROCESSING') AND next_attempt_at<=now() AND (lease_until IS NULL OR lease_until<now()) ORDER BY created_at LIMIT 4`);
 const start=Date.now();
 for(const r of rows){if(Date.now()-start>180000)break;await processReport(r.id,Math.max(30000,220000-(Date.now()-start)));}
 return {examined:rows.length};
}
