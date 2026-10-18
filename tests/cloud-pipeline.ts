// Integration check: run only against the isolated research-development Neon branch.
// Not included in the default unit-test glob. Contains no production financial fixtures.
import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
import {query} from '../lib/db';
import {searchCompanies} from '../lib/providers';
import {enqueue,processReport} from '../lib/jobs';
async function main(){
 if(!process.env.DATABASE_URL?.includes('ep-'))throw new Error('A configured development branch is required.');
 const companies=await searchCompanies('TCS'),company=companies.find(c=>c.symbol==='TCS');assert.ok(company);
 const id='qa-pipeline-20261017';
 await query(`INSERT INTO research.members(user_id,email,name,role) VALUES($1,'qa-pipeline@example.invalid','Cloud pipeline QA','MEMBER') ON CONFLICT(user_id) DO NOTHING`,[id]);
 const r=await enqueue({id,role:'MEMBER'},company,{},'qa-pipeline-20261017');
 const duplicate=await enqueue({id,role:'MEMBER'},company,{},'qa-pipeline-20261017');assert.equal(r.id,duplicate.id);
 await Promise.all([processReport(r.id),processReport(r.id)]);
 const [final]=await query('SELECT status,stage,pdf_base64,pdf_pages,error,result FROM research.reports WHERE id=$1',[r.id]);
 console.log(JSON.stringify({status:final.status,stage:final.stage,pdfPages:final.pdf_pages,error:final.error,sourceCount:final.result?.sources?.length,conflicts:final.result?.packet?.conflicts?.length}));
 assert.ok(['LIMITED','BLOCKED'].includes(final.status));assert.ok(final.pdf_base64);assert.ok(final.pdf_pages<=15);
 const events=await query("SELECT stage,count(*)::int AS n FROM research.stage_events WHERE report_id=$1 AND status='complete' GROUP BY stage",[r.id]);
 assert.equal(events.length,6);assert.ok(events.every(e=>e.n===1),'Only one worker may complete each stage');
 await mkdir('tmp',{recursive:true});await writeFile('tmp/live-tcs-diagnostic.pdf',Buffer.from(final.pdf_base64,'base64'));
 console.log('PASS: real source → persistent stages → checked PDF; duplicate enqueue and concurrent worker safety.');
}
main().catch(e=>{console.error(e.name,e.message);process.exitCode=1;});
