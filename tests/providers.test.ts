import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {parseCsv,parseCompanyMaster,parseBhavcopy,completedSessionCandidates,reportedCell,parseTcsWorkbook,type CompanyIdentity} from '../lib/providers';
const identity:CompanyIdentity={id:'NSE:INE467B01029',name:'Tata Consultancy Services Limited',symbol:'TCS',nseSymbol:'TCS',isin:'INE467B01029',sourceUrl:'https://nsearchives.nseindia.com',retrievedAt:'2026-10-17T00:00:00Z'};
test('security master preserves quoted names, ISIN identity and excludes other series',()=>{
 const csv='SYMBOL,NAME OF COMPANY, SERIES, ISIN NUMBER\r\nTEST,"Test, Limited",EQ,INE123A01010\r\nTEST,"Test, Limited",BE,INE123A01010\r\n';
 const list=parseCompanyMaster(csv,'2026-10-17');assert.equal(list.length,1);assert.equal(list[0].name,'Test, Limited');assert.equal(list[0].id,'NSE:INE123A01010');assert.throws(()=>parseCompanyMaster('<html>blocked</html>'));assert.throws(()=>parseCsv('a,b\n"unfinished,c'));
});
test('closing price needs exact symbol, EQ series and requested session date',()=>{
 const csv='SYMBOL, SERIES, DATE1, CLOSE_PRICE\nTCS, BE, 16-Oct-2026, 999\nTCS, EQ, 15-Oct-2026, 100\nTCS, EQ, 16-Oct-2026, 101.25\n';
 assert.equal(parseBhavcopy(csv,identity,'2026-10-16'),101.25);assert.equal(parseBhavcopy(csv,identity,'2026-10-14'),null);
});
test('EOD selection respects IST publication cutoff and weekend',()=>{
 assert.equal(completedSessionCandidates(new Date('2026-10-17T10:00:00Z'))[0],'2026-10-16');
 assert.equal(completedSessionCandidates(new Date('2026-10-16T10:00:00Z'))[0],'2026-10-15');
 assert.equal(completedSessionCandidates(new Date('2026-10-16T14:00:00Z'))[0],'2026-10-16');
});
test('reported values use explicit exceptional-item comments; ambiguous adjusted values stay missing',()=>{
 const workbook=new ExcelJS.Workbook(),sheet=workbook.addWorksheet('fixture');const cell=sheet.getCell('A1');cell.value=100;assert.equal(reportedCell(cell,true).value,null);cell.note='90 including Exceptional Items';assert.equal(reportedCell(cell,true).value,90);
});
test('TCS workbook preserves periods, INR million conversion, shares and excludes unreported cash flow',async()=>{
 const w=new ExcelJS.Workbook(),s=w.addWorksheet('IFRS-PnL,BS-INR');
 s.addRow(['TCS Consolidated Income Statement as per IFRS - INR Mn','FY26','2Q27']);
 s.addRow(['','EX-ADJ FY26','']);s.addRow(['Revenue',1000,300]);s.addRow(['Operating Income',200,60]);s.getCell('B4').note='180 including Exceptional Items';s.addRow(['Net Income Before Extraordinary Items',150,45]);s.getCell('B5').note='140 including Exceptional Items';s.addRow(['Basic and Diluted EPS (after adjusting for bonus shares)',15,4.5]);s.getCell('B6').note='14 including Exceptional Items';
 s.addRow(['Depreciation & Amortisation',20,5]);s.addRow(['Weighted average no of shares used in computing Basic and Diluted EPS',10000000,10000000]);s.addRow(['Total Assets',500,550]);s.addRow(['Total Liabilities',200,210]);s.addRow(["Total Shareholders' Equity",290,330]);s.addRow(['Non Controlling Interests',10,10]);s.addRow(['Cash and Cash Equivalents',50,55]);
 const result=await parseTcsWorkbook(new Uint8Array(await w.xlsx.writeBuffer()),'https://www.tcs.com/fixture.xlsx');
 assert.equal(result.annual.length,1);assert.equal(result.quarterly.length,1);assert.equal(result.annual[0].revenue,1e9);assert.equal(result.annual[0].ebit,180e6);assert.equal(result.annual[0].eps,14);assert.equal(result.annual[0].dilutedShares,1e7);assert.equal(result.annual[0].ebitda,200e6);assert.equal(result.annual[0].cfo,null);assert.equal(result.annual[0].debt,null);assert.equal(result.quarterly[0].fiscalPeriod,'Q2 FY2027');assert.equal(result.annual[0].nonControllingInterests,10e6);
});
test('unexplained same-workbook disagreements withhold affected metrics and retain evidence',async()=>{
 const w=new ExcelJS.Workbook();
 for(const name of ['IFRS-PnL,BS-INR Historical','IFRS-PnL,BS-INR']){const s=w.addWorksheet(name);s.addRow(['TCS Consolidated Income Statement as per IFRS - INR Mn','FY26']);s.addRow([]);s.addRow(['Revenue',1000]);s.addRow(['Total Revenue',1000]);s.addRow(['Operating Income',200]);s.addRow(['Net Income Before Extraordinary Items',150]);s.addRow(['Total Assets',name.includes('Historical')?500:510]);s.addRow(['Total Liabilities',name.includes('Historical')?200:210]);if(name.includes('Historical')){s.addRow(['Depreciation',15]);s.addRow(['Depreciation',10]);}else{s.addRow(['Depreciation & Amortisation',20]);}}
 const result=await parseTcsWorkbook(new Uint8Array(await w.xlsx.writeBuffer()),'https://www.tcs.com/fixture.xlsx');const a=result.annual[0];assert.equal(a.revenue,1e9);assert.equal(a.ebit,200e6);assert.equal(a.assets,null);assert.equal(a.liabilities,null);assert.equal(a.depreciation,null);assert.equal(a.ebitda,null);assert.equal(result.conflicts.length,3);assert.match(result.conflicts[0],/500000000 INR versus current sheet 510000000/);
});
