import assert from 'node:assert/strict';
import {afterEach,test} from 'node:test';
import {authorizedWorker,dispatchWork,parseWorkItem} from '../lib/worker';
import worker from '../netlify/functions/research-worker.mjs';
import daily from '../netlify/functions/research-daily.mjs';

const original={secret:process.env.CRON_SECRET,url:process.env.APP_URL,host:process.env.ACTIVE_HOST};
const originalFetch=globalThis.fetch;
afterEach(()=>{
 for(const [key,value] of Object.entries({CRON_SECRET:original.secret,APP_URL:original.url,ACTIVE_HOST:original.host})){
  if(value===undefined)delete process.env[key];else process.env[key]=value;
 }
 globalThis.fetch=originalFetch;
});
test('background handler rejects unauthorized invocations before database access',async()=>{
 process.env.CRON_SECRET='a-server-only-secret';
 const response=await worker(new Request('https://example.netlify.app/worker',{method:'POST'}),{deploy:{context:'production'}});
 assert.equal(response?.status,401);
 assert.equal(authorizedWorker(new Request('https://example.netlify.app/worker',{method:'POST',headers:{Authorization:'Bearer incorrect'}})),false);
 assert.equal(authorizedWorker(new Request('https://example.netlify.app/worker',{headers:{Authorization:'Bearer a-server-only-secret'}})),false);
});
test('preview deploys cannot dispatch or run production work',async()=>{
 process.env.CRON_SECRET='a-server-only-secret';process.env.ACTIVE_HOST='netlify';
 globalThis.fetch=async()=>{throw new Error('Preview must never dispatch');};
 assert.equal(await daily(new Request('https://preview.netlify.app'),{deploy:{context:'deploy-preview'}}),undefined);
 const req=new Request('https://preview.netlify.app/worker',{method:'POST',headers:{Authorization:'Bearer a-server-only-secret'},body:'{"kind":"daily"}'});
 assert.equal(await worker(req,{deploy:{context:'deploy-preview'}}),undefined);
});
test('worker accepts only recognized work items and UUID report identifiers',()=>{
 assert.deepEqual(parseWorkItem({kind:'daily'}),{kind:'daily'});
 assert.throws(()=>parseWorkItem({kind:'report',id:'../../admin'}));
 assert.throws(()=>parseWorkItem({kind:'daily',id:'unexpected'}));
 assert.throws(()=>parseWorkItem({kind:'delete'}));
});
test('dispatch sends credentials only to configured HTTPS endpoint and requires async acceptance',async()=>{
 process.env.CRON_SECRET='test-secret-not-a-real-credential';process.env.APP_URL='https://example.netlify.app';
 let calls=0;
 globalThis.fetch=async(input,init)=>{
  calls++;assert.equal(String(input),'https://example.netlify.app/.netlify/functions/research-worker');
  assert.equal(init?.redirect,'error');assert.equal(init?.method,'POST');
  assert.equal(new Headers(init?.headers).get('authorization'),'Bearer test-secret-not-a-real-credential');
  assert.deepEqual(JSON.parse(String(init?.body)),{kind:'daily'});
  return new Response(null,{status:202});
 };
 await dispatchWork({kind:'daily'});assert.equal(calls,1);
 process.env.APP_URL='http://example.netlify.app';
 await assert.rejects(dispatchWork({kind:'daily'}),/Invalid worker origin/);assert.equal(calls,1);
 process.env.APP_URL='https://example.netlify.app';
 globalThis.fetch=async()=>new Response(null,{status:401});
 await assert.rejects(dispatchWork({kind:'daily'}),/did not accept/);
});
