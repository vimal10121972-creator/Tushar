import test from 'node:test';
import assert from 'node:assert/strict';
import {PDFDocument} from 'pdf-lib';
import {buildResearchPdf} from '../lib/report-pdf';
const fixture=()=>({id:'test-only',company:{name:'TEST ONLY — Layout Fixture',symbol:'TEST',isin:'TEST-ONLY'},created_at:'2026-10-17T00:00:00Z',status:'LIMITED',result:{summary:'Test-only evidence packet.',narrative:['A synthetic fixture for software QA; not investment research.'],packet:{prices:{price:null,asOf:null,history:[],adjusted:false},financials:{annual:[],quarterly:[]},sources:[],missing:['All source evidence unavailable in test fixture'],conflicts:[],limitations:[]},validation:{valid:false}}});
test('PDF enforces A4, page cap, explicit missing evidence and serialized integrity',async()=>{
 const pdf=await buildResearchPdf(fixture());const doc=await PDFDocument.load(pdf.bytes);
 assert.ok(pdf.pageCount>0&&pdf.pageCount<=15);assert.equal(doc.getPageCount(),pdf.pageCount);
 for(const p of doc.getPages()){assert.ok(Math.abs(p.getWidth()-595.28)<.1);assert.ok(Math.abs(p.getHeight()-841.89)<.1);}
 assert.ok(pdf.checks.includes('incomplete_valuation_withheld'));
});
test('PDF rejects missing identity and invalid report date',async()=>{
 await assert.rejects(buildResearchPdf({...fixture(),company:{}}));
 await assert.rejects(buildResearchPdf({...fixture(),created_at:'invalid'}));
});
test('PDF cannot release a value with unresolved conflicts',async()=>{
 const f:any=fixture();f.result.valuation={intrinsicValuePerShare:123};f.result.validation={valid:true};f.result.packet.missing=[];f.result.packet.sources=[{url:'https://example.invalid/test-only',title:'Synthetic QA fixture'}];f.result.packet.conflicts=['Conflicting test evidence'];
 const pdf=await buildResearchPdf(f);assert.ok(pdf.checks.includes('incomplete_valuation_withheld'));
});
