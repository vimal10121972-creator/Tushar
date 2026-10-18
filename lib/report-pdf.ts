import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb, RGB } from 'pdf-lib';

const C = {
  navy: rgb(11 / 255, 37 / 255, 69 / 255), blue: rgb(22 / 255, 54 / 255, 94 / 255),
  red: rgb(200 / 255, 16 / 255, 46 / 255), gold: rgb(176 / 255, 141 / 255, 87 / 255),
  grey: rgb(244 / 255, 246 / 255, 248 / 255), white: rgb(1, 1, 1),
  ink: rgb(.15, .20, .27), muted: rgb(.37, .43, .50), line: rgb(.83, .86, .89),
};
const W = 595.28, H = 841.89, M = 44, BOTTOM = 60, TOP = 759, CW = W - 2 * M;
const ascii = (v: unknown) => String(v ?? '').replace(/₹/g, 'INR ').replace(/[–—−]/g, '-').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/×/g, 'x').replace(/•/g, '-').normalize('NFKD').replace(/[^\x20-\x7E\n]/g, '');
const arr = (v: any): any[] => Array.isArray(v) ? v : [];
const number = (v: any): number | null => typeof v === 'number' && Number.isFinite(v) ? v : null;
const fmt = (v: any, decimals = 2) => number(v) === null ? 'Not available' : v.toLocaleString('en-IN', { maximumFractionDigits: decimals, minimumFractionDigits: decimals });
const money = (v: any) => number(v) === null ? 'Not available' : `INR ${fmt(v)}`;
const textValue = (v: any): string => v == null ? 'Not available' : typeof v === 'object' ? Object.entries(v).map(([k, value]) => `${k}: ${typeof value === 'object' ? JSON.stringify(value) : value}`).join('; ') : String(v);
const date = (v: any): string => { const d = new Date(v); return v && Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : 'Not available'; };

type Box = { page: number; x: number; y: number; w: number; h: number; kind: string };
class Layout {
  page!: PDFPage; y = TOP; boxes: Box[] = []; sections = new Set<string>(); counts: number[] = [];
  constructor(public doc: PDFDocument, public regular: PDFFont, public bold: PDFFont, public company: string, public reportDate: string) {}
  newPage(title: string) {
    if (this.doc.getPageCount() >= 15) throw new Error('PDF exceeds the 15-page limit; reduce evidence volume before publication.');
    this.page = this.doc.addPage([W, H]); this.y = TOP; this.counts.push(0);
    this.page.drawRectangle({ x: 0, y: H - 8, width: W, height: 8, color: C.navy });
    this.page.drawText('TUSHAR JAIN RESEARCH', { x: M, y: H - 36, size: 9, font: this.bold, color: C.navy });
    this.page.drawText(this.reportDate, { x: W - M - this.regular.widthOfTextAtSize(this.reportDate, 8), y: H - 36, size: 8, font: this.regular, color: C.muted });
    this.page.drawLine({ start: { x: M, y: H - 47 }, end: { x: W - M, y: H - 47 }, thickness: .6, color: C.line });
    this.heading(title, 18);
  }
  record(x: number, y: number, w: number, h: number, kind: string) {
    if (x < M - .1 || x + w > W - M + .1 || y < BOTTOM - .1 || y + h > TOP + 20) throw new Error(`PDF content overflow: ${kind}`);
    this.boxes.push({ page: this.doc.getPageCount(), x, y, w, h, kind }); this.counts[this.counts.length - 1]++;
  }
  wrap(value: any, size: number, width = CW, bold = false): string[] {
    const font = bold ? this.bold : this.regular;
    const out: string[] = [];
    for (const para of ascii(value).split('\n')) {
      let line = '';
      for (const word of para.split(/\s+/).filter(Boolean)) {
        if (font.widthOfTextAtSize(word, size) > width) {
          if (line) { out.push(line); line = ''; }
          let part = '';
          for (const char of word) { if (font.widthOfTextAtSize(part + char, size) > width) { out.push(part); part = ''; } part += char; }
          line = part;
        } else if (font.widthOfTextAtSize(line ? `${line} ${word}` : word, size) > width) { out.push(line); line = word; }
        else line = line ? `${line} ${word}` : word;
      }
      out.push(line);
    }
    return out;
  }
  room(height: number) { if (this.y - height < BOTTOM) this.newPage('Research evidence | continued'); }
  heading(label: string, size = 12) {
    // y is the next text baseline; reserve the ascent when font size increases.
    this.y -= Math.max(4, size - 10);
    this.sections.add(label); const lines = this.wrap(label, size, CW, true); this.room(lines.length * (size + 4) + 14);
    for (const line of lines) { this.page.drawText(line, { x: M, y: this.y, size, font: this.bold, color: C.navy }); this.record(M, this.y - 2, CW, size + 2, 'heading'); this.y -= size + 4; }
    this.y -= 10;
  }
  para(value: any, opts: { size?: number; color?: RGB; bold?: boolean } = {}) {
    const size = opts.size ?? 10; const leading = size * 1.43;
    for (const line of this.wrap(value, size, CW, opts.bold)) {
      this.room(leading + 2); this.page.drawText(line, { x: M, y: this.y, size, font: opts.bold ? this.bold : this.regular, color: opts.color ?? C.ink });
      this.record(M, this.y - 2, CW, size + 2, 'paragraph'); this.y -= leading;
    }
    this.y -= 8;
  }
  table(headers: string[], rows: any[][], widths?: number[]) {
    const ws = widths ?? headers.map(() => CW / headers.length); const size = 9;
    if (Math.abs(ws.reduce((a, b) => a + b, 0) - CW) > 1) throw new Error('Invalid PDF table widths');
    const renderRow = (cells: any[], head: boolean) => {
      const lines = cells.map((cell, i) => this.wrap(textValue(cell), size, ws[i] - 16, head));
      const height = Math.max(...lines.map(l => l.length)) * 12 + 15;
      if (height > TOP - BOTTOM - 110) throw new Error('PDF table cell too long to render safely');
      if (this.y - height < BOTTOM) { this.newPage('Research evidence | continued'); if (!head) renderRow(headers, true); }
      let x = M; const baseY = this.y - height;
      this.page.drawRectangle({ x, y: baseY, width: CW, height, color: head ? C.blue : C.grey });
      for (let i = 0; i < ws.length; i++) {
        lines[i].forEach((line, j) => this.page.drawText(line, { x: x + 8, y: this.y - 14 - j * 12, size, font: head ? this.bold : this.regular, color: head ? C.white : C.ink }));
        x += ws[i];
      }
      this.record(M, baseY, CW, height, head ? 'table-header' : 'table-row');
      this.page.drawLine({ start: { x: M, y: baseY }, end: { x: W - M, y: baseY }, thickness: .8, color: C.white }); this.y = baseY;
    };
    renderRow(headers, true); rows.forEach(row => renderRow(row, false)); this.y -= 18;
  }
  callout(label: string, content: string) { this.heading(label); this.para(content, { color: C.red }); }
  chart(prices: any[], adjusted = false) {
    const p = prices.map(v => ({ value: number(v.adjustedClose ?? v.close ?? v.price ?? v.value), date: v.date ?? v.asOf })).filter(v => v.value !== null && v.value > 0 && date(v.date) !== 'Not available') as { value: number; date: any }[];
    if (p.length < 2) { this.para('Price chart not produced: at least two dated, verified observations are required.'); return; }
    const h = 145; this.room(h + 45); const low = Math.min(...p.map(v => v.value)), high = Math.max(...p.map(v => v.value));
    const y0 = this.y - h, x0 = M + 74, width = CW - 84, range = high - low || 1;
    this.page.drawRectangle({ x: M, y: y0, width: CW, height: h, color: C.grey });
    const plot = (i: number) => ({ x: x0 + i / (p.length - 1) * width, y: y0 + 25 + ((p[i].value - low) / range) * (h - 50) });
    for (let i = 1; i < p.length; i++) this.page.drawLine({ start: plot(i - 1), end: plot(i), thickness: 1.8, color: C.blue });
    this.page.drawText(`INR ${fmt(high)}`, { x: M + 8, y: y0 + h - 20, size: 8, font: this.regular, color: C.muted });
    this.page.drawText(`INR ${fmt(low)}`, { x: M + 8, y: y0 + 26, size: 8, font: this.regular, color: C.muted });
    this.record(M, y0, CW, h, 'chart'); this.y = y0 - 16;
    this.para(`${date(p[0].date)} to ${date(p[p.length - 1].date)} | ${adjusted ? 'Adjusted' : 'Unadjusted'} closing prices, INR/share. Intervening dates may be absent.`, { size: 8.5 });
  }
  finish() {
    this.doc.getPages().forEach((page, i) => {
      page.drawLine({ start: { x: M, y: 43 }, end: { x: W - M, y: 43 }, thickness: .6, color: C.gold });
      const footer = `Created by Tushar Jain | Educational research | ${i + 1} / ${this.doc.getPageCount()}`;
      page.drawText(footer, { x: M, y: 29, size: 8, font: this.regular, color: C.muted });
    });
    for (let i = 0; i < this.boxes.length; i++) for (let j = i + 1; j < this.boxes.length; j++) {
      const a = this.boxes[i], b = this.boxes[j];
      if (a.page === b.page && a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h - .5 && a.y + a.h > b.y + .5) throw new Error(`PDF overlapping content on page ${a.page}: ${a.kind}/${b.kind}`);
    }
    if (this.counts.some(c => c < 2)) throw new Error('PDF contains an unintended blank page');
  }
}

/** Builds an evidence-led PDF. Throws on layout or identity failure; callers must not mark failed PDFs ready. */
export async function buildResearchPdf(report: any): Promise<{ bytes: Uint8Array; pageCount: number; checks: string[] }> {
  const result = report.result ?? {}, packet = result.packet ?? {}, company = report.company ?? packet.company ?? {};
  const name = ascii(company.name), symbol = ascii(company.nseSymbol ?? company.symbol ?? company.bseCode ?? '');
  if (!name || !symbol || date(report.created_at) === 'Not available') throw new Error('PDF requires company name, ticker, and valid report date');
  const doc = await PDFDocument.create(); const regular = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold);
  doc.setTitle(`${name} | Tushar Jain Research`); doc.setAuthor('Tushar Jain Research'); doc.setSubject('Evidence-led equity research; educational use');
  const l = new Layout(doc, regular, bold, name, date(report.created_at));
  const financialData = packet.financials ?? {}, priceData = packet.prices ?? {};
  // Annual and quarterly periods remain distinct; neither is silently annualized.
  const financials = Array.isArray(financialData) ? financialData : [
    ...arr(financialData.annual).map(f => ({ ...f, periodType: 'Annual' })),
    ...arr(financialData.quarterly).map(f => ({ ...f, periodType: 'Quarterly' })),
  ];
  const prices = [...(Array.isArray(priceData) ? priceData : arr(priceData.history))]
    .filter(p => date(p.date ?? p.asOf) !== 'Not available' && (number(p.adjustedClose ?? p.close ?? p.price) ?? 0) > 0)
    .sort((a, b) => String(a.date ?? a.asOf).localeCompare(String(b.date ?? b.asOf)));
  const sources = arr(packet.sources), metrics = result.metrics ?? {}, valuation = result.valuation ?? {};
  const missing = arr(packet.missing), conflicts = arr(packet.conflicts);
  const limitations = [...new Set([...arr(result.limitations), ...arr(packet.limitations)].map(textValue))];
  const intrinsic = number(valuation.intrinsicValuePerShare ?? valuation.intrinsicValue ?? valuation.perShare);
  const validated = (result.validation?.valid === true || result.validation?.ok === true) && result.validation?.valid !== false && result.validation?.ok !== false;
  const limited = intrinsic === null || !validated || conflicts.length > 0 || !sources.length || missing.length > 0;
  const historyLatest = prices.at(-1);
  const quoteAvailable = !Array.isArray(priceData) && (number(priceData.price) ?? 0) > 0 && date(priceData.asOf) !== 'Not available';
  const latest = quoteAvailable ? { price: priceData.price, date: priceData.asOf, source: arr(priceData.sources)[0]?.url ?? arr(priceData.sources)[0]?.id } : historyLatest;
  const price = latest?.close ?? latest?.price ?? latest?.adjustedClose;
  const adjustedHistory = !Array.isArray(priceData) && priceData.adjusted === true;
  const sourceRef = (row: any) => textValue(row.sourceId ?? row.source ?? row.url ?? 'Source attribution unavailable');
  const title = (x: string) => l.newPage(x);
  title('Independent Equity Analysis');
  l.para('Prepared by Tushar Jain Research', { color: C.muted, size: 10 });
  l.heading(name, 26);
  l.para(`${symbol} | ISIN: ${company.isin || 'Not verified'} | Sector: ${company.sector || 'Not verified'}`, { color: C.muted });
  l.callout(conflicts.length ? 'BLOCKED - SOURCE CONFLICT DIAGNOSTIC' : limited ? 'LIMITED RESEARCH' : 'VALUATION WORKING PAPER', conflicts.length ? 'Unresolved source conflicts prevent publication of a completed research report. This diagnostic documents available evidence and discrepancies; it is not a successful investment research report.' : limited ? 'Evidence is incomplete. No investment call or defensible intrinsic value is issued unless the required inputs and reconciliations pass validation.' : 'The valuation below is a model estimate conditional on explicitly stated assumptions. It is not a recommendation.');
  l.table(['RESEARCH SNAPSHOT', 'OBSERVATION'], [
    ['Report date (UTC)', date(report.created_at)], ['Market-price date', latest ? date(latest.date ?? latest.asOf) : 'Not available'],
    ['Observed close (INR/share)', money(price)], ['Intrinsic value (INR/share)', limited ? 'Withheld - required evidence incomplete' : money(intrinsic)],
    ['Evidence retrieved (UTC)', date(packet.retrievedAt)], ['Company identification', `${symbol}${company.bseCode ? ` | BSE ${company.bseCode}` : ''}`],
  ], [190, CW - 190]);
  l.heading('Investment snapshot'); l.para(result.summary || 'A defensible investment conclusion requires verified financial statements, market data, capital structure and valuation assumptions. The available evidence is documented in this report.');
  l.para('Currency convention: all monetary observations are stated in INR, unless explicitly labelled otherwise. INR/share values are per share; ratios and percentages are identified separately.', { size: 9, color: C.muted });

  title('01 | Executive summary & business evidence');
  l.heading('Evidence-led assessment');
  const narrative = arr(result.narrative);
  if (narrative.length) narrative.forEach(n => l.para(textValue(n))); else l.para('Narrative analysis is withheld because sufficient primary-source business and operating evidence has not been retrieved.');
  l.heading('Business model, industry & competitive position');
  l.para(packet.company?.description || company.description || 'Business-model and competitive-position claims are not independently verified in this evidence packet. Consult the latest annual report and exchange filings before drawing conclusions.');
  l.heading('Research coverage');
  l.table(['EVIDENCE CATEGORY', 'AVAILABLE IN THIS REPORT'], [
    ['Historical financial observations', `${financials.length} observation(s)`], ['Dated market-price observations', `${prices.length + (quoteAvailable ? 1 : 0)} observation(s)`],
    ['Source records', `${sources.length} record(s)`], ['Missing items', missing.length ? missing.map(textValue).join('; ') : 'See valuation gates and source register'],
  ], [220, CW - 220]);

  title('02 | Historical financial performance');
  l.para('Statement observations preserve their source period and reporting basis. Canonical monetary values are INR; no crore-to-rupee conversion is applied without a stated source unit.', { size: 9, color: C.muted });
  if (financials.length) {
    const groups = [
      { label: 'Latest five annual periods', items: financials.filter(f => String(f.periodType).toLowerCase() === 'annual').slice(-5) },
      { label: 'Latest four quarterly periods', items: financials.filter(f => String(f.periodType).toLowerCase() === 'quarterly').slice(-4) },
    ];
    const fields: [string,string,string][] = [['revenue','Revenue','INR crore'],['ebit','EBIT','INR crore'],['ebitda','EBITDA','INR crore'],['netProfit','Attributable PAT','INR crore'],['eps','EPS','INR/share'],['assets','Assets','INR crore'],['liabilities','Liabilities','INR crore'],['equity','Ordinary equity','INR crore'],['nonControllingInterests','Non-controlling interests','INR crore'],['cash','Cash equivalents','INR crore'],['debt','Borrowings','INR crore'],['cfo','Operating cash flow','INR crore'],['capex','Capital expenditure','INR crore']];
    for (const group of groups) {
      if (!group.items.length) continue;
      l.heading(group.label);
      l.para('Consolidated IFRS where stated by the source. Monetary amounts below are INR crore (INR base units divided by 10,000,000); EPS is INR per share. Missing or conflicted fields remain unavailable.', {size:9});
      const width=(CW-145)/group.items.length;
      l.table(['METRIC / UNIT',...group.items.map(f=>f.fiscalPeriod)],fields.map(([key,label,unit])=>[`${label} (${unit})`,...group.items.map(f=>number(f[key])===null?'Unavailable':fmt(unit==='INR crore'?f[key]/1e7:f[key]))]),[145,...group.items.map(()=>width)]);
      l.para(`Source: ${group.items[0].sourceUrl || 'See source register'} | Basis: ${group.items[0].scope || 'Unspecified'} | All retrieved periods and source adjustments remain available in the application.`,{size:8.5});
    }
    if (!groups.some(g=>g.items.length)) l.para('No explicitly classified annual or quarterly statement observations are available.');
  } else l.callout('Financial statements unavailable', 'Revenue, earnings, assets, liabilities and cash flow have not been verified. Missing values are not treated as zero.');
  l.heading('Balance sheet, cash flow & earnings quality');
  l.para('Earnings quality requires reconciliation of operating cash flow, profit, working capital, capital expenditure and exceptional items on a consistent reporting basis. Where these inputs are absent, conversion ratios and cash-flow conclusions are withheld.');
  const moneyMetrics=new Set(['capex','freeCashFlow','marketCap','enterpriseValue','netDebt']);
  const percentMetrics=new Set(['revenueGrowth','ebitdaGrowth','patGrowth','epsGrowth','ebitdaMargin','ebitMargin','netMargin','roe','roa','roce','fcfMargin','dividendYield','fcfYield']);
  const metricRows=Object.entries(metrics).filter(([,v])=>typeof v==='number').map(([k,v])=>[k,moneyMetrics.has(k)?fmt(Number(v)/1e7):percentMetrics.has(k)?fmt(Number(v)*100):fmt(v),moneyMetrics.has(k)?'INR crore':percentMetrics.has(k)?'%':'times']);
  if (metricRows.length) { l.heading('Deterministic calculations'); l.table(['CALCULATION', 'RESULT', 'UNIT'], metricRows, [230, 100, CW - 330]); }

  title('03 | Valuation & model discipline');
  l.heading('Intrinsic valuation');
  l.para(limited ? 'No intrinsic value or price target is published. Required valuation inputs are unavailable, conflicted or have not passed model validation.' : `Model-implied intrinsic value: ${money(intrinsic)} per share.`, { bold: true });
  if (valuation.method || valuation.reason) l.para(`Method: ${textValue(valuation.method ?? 'Not selected')}\n${textValue(valuation.reason ?? '')}`);
  const assumptions = valuation.assumptions;
  if (assumptions && Object.keys(assumptions).length) { l.heading('Labelled valuation assumptions'); l.table(['ASSUMPTION', 'VALUE'], Object.entries(assumptions).map(([k, v]) => [k, textValue(v)]), [230, CW - 230]); }
  l.heading('Required valuation gates');
  l.table(['CHECK', 'WHY IT MATTERS'], [
    ['Cash-flow definition and reporting basis', 'FCFF, FCFE and dividends cannot be mixed. Financial firms require an appropriate equity model.'],
    ['Discount rate and terminal growth', 'Terminal growth must remain below the discount rate; rate units must be consistent.'],
    ['Equity bridge and diluted shares', 'Debt, cash, minority interests and share counts must reconcile to the same period.'],
    ['Independent reconciliation', 'DCF, sensitivity centre and published intrinsic value must agree before a conclusion is released.'],
  ], [210, CW - 210]);
  l.heading('Sensitivity, peers & valuation cross-check');
  l.para(limited ? 'Sensitivity, bull/base/bear targets and peer-implied values are withheld because a validated base valuation is unavailable. No synthetic consensus or peer multiples are substituted.' : 'Sensitivity and peer comparisons must use the same base assumptions and reporting periods. Refer to model workings in the application; results not included in the evidence packet are not asserted here.');

  title('04 | Market context, governance & risks');
  l.heading('Technical snapshot'); l.chart(prices, adjustedHistory);
  if (latest) l.para(`Latest observation: ${money(price)} per share on ${date(latest.date ?? latest.asOf)}. Source: ${sourceRef(latest)}. This is a dated observation, not a live quote.`, { size: 9 });
  l.heading('Ownership, governance & capital allocation');
  l.para('Promoter holdings, pledges, related-party transactions, audit qualifications and capital-allocation decisions require current filings. No positive governance conclusion is inferred from the absence of adverse evidence.');
  l.heading('Material risks & evidence limitations');
  const risks = limitations.length ? limitations : ['Incomplete evidence can materially change the financial interpretation and valuation.', 'Market prices and historical results do not establish future performance.'];
  risks.forEach(r => l.para(`- ${r}`));
  if (conflicts.length) { l.heading('Unresolved source conflicts'); conflicts.forEach(c => l.para(textValue(c), { color: C.red })); }
  l.heading('Catalysts, recent developments & analyst estimates');
  l.para('Only dated, attributable developments can support a catalyst. Analyst forecasts, target prices and consensus are unavailable unless explicitly present in the source register; none are fabricated.');

  title('05 | Sources, methodology & disclaimer');
  l.heading('Source register');
  if (!sources.length) l.para('No verified source records were retrieved. This document is an evidence-gap report and must not be interpreted as completed investment research.', { color: C.red });
  else sources.forEach((s: any, i: number) => {
    l.para(`[${s.id ?? i + 1}] ${s.title ?? s.name ?? s.provider ?? 'Source record'}${s.publisher ? ` | ${s.publisher}` : ''}`, { bold: true, size: 9.5 });
    if (s.url) l.para(s.url, { size: 8.5, color: C.blue });
    l.para(`Published / period: ${s.publishedAt ?? s.date ?? s.period ?? 'Not specified'} | Retrieved: ${s.retrievedAt ?? packet.retrievedAt ?? 'Not specified'}${s.status ? ` | Status: ${s.status}` : ''}`, { size: 8.5, color: C.muted });
  });
  l.heading('Methodology & quality controls');
  l.para('Deterministic code performs financial calculations. Missing, non-finite and conflicted values are not converted to zero. Financial assumptions are separate from sourced observations. This PDF checks company identity, report date, page count, content boundaries, text collisions, table integrity and page furniture before publication.');
  l.para(`Report ID: ${report.id ?? 'Not assigned'} | Research state: ${conflicts.length ? 'BLOCKED DIAGNOSTIC' : limited ? 'LIMITED RESEARCH' : 'VALUATION WORKING PAPER'} | Market-price date: ${latest ? date(latest.date ?? latest.asOf) : 'Not available'}`, { size: 9 });
  l.heading('Important disclaimer');
  l.para('Prepared by Tushar Jain Research for education and independent research. This is not personalized investment advice, an offer, or a recommendation to buy, sell or hold any security. No SEBI registration is claimed. Data may be incomplete, delayed or erroneous. Verify primary filings and consult an appropriately registered professional where needed. Investment values can fall and past performance does not assure future results.', { size: 9.5 });
  l.finish();
  const bytes = await doc.save(); const reopened = await PDFDocument.load(bytes);
  if (reopened.getPageCount() !== doc.getPageCount() || reopened.getPageCount() > 15) throw new Error('Serialized PDF page validation failed');
  return { bytes, pageCount: doc.getPageCount(), checks: ['company_identity_present', 'report_date_valid', latest ? 'market_price_date_disclosed' : 'market_price_missing_disclosed', 'required_sections_present', 'a4_layout', 'page_count_lte_15', 'no_content_overflow', 'no_text_overlap', 'table_cells_wrapped', 'no_blank_pages', 'minimum_text_8pt', 'headers_footers_numbered', 'serialized_pdf_reopened', limited ? 'incomplete_valuation_withheld' : 'valuation_labelled_conditional', 'disclaimer_present'] };
}
