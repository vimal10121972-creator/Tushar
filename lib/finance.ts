/** Deterministic financial engine. Monetary inputs use one currency and base units
 * (INR, not crore); shares are counts. Rates and ratios are decimals (0.12 = 12%).
 * Missing inputs stay null. This module supplies no investment assumptions/data. */
export type MaybeNumber = number | null | undefined;
export type Sector = 'non-financial' | 'bank' | 'nbfc' | 'insurance' | 'holding' | 'market-infrastructure';
export interface FinancialStatement {
  fiscalPeriod: string;
  revenue?: MaybeNumber; ebitda?: MaybeNumber; ebit?: MaybeNumber; netProfit?: MaybeNumber;
  eps?: MaybeNumber; assets?: MaybeNumber; liabilities?: MaybeNumber; equity?: MaybeNumber;
  nonControllingInterests?: MaybeNumber; debt?: MaybeNumber; cash?: MaybeNumber; cfo?: MaybeNumber; capex?: MaybeNumber;
  dividends?: MaybeNumber; dilutedShares?: MaybeNumber; depreciation?: MaybeNumber;
  currentAssets?: MaybeNumber; currentLiabilities?: MaybeNumber; interestExpense?: MaybeNumber;
  /** Capital employed = equity + interest-bearing debt, unless a sourced value is supplied. */
  capitalEmployed?: MaybeNumber;
}
export interface MarketInputs { price?: MaybeNumber; shares?: MaybeNumber; minorityInterest?: MaybeNumber; preferredEquity?: MaybeNumber }
export const finite = (x: MaybeNumber): x is number => typeof x === 'number' && Number.isFinite(x);
const positive = (x: MaybeNumber): x is number => finite(x) && x > 0;
const nonnegative = (x: MaybeNumber): x is number => finite(x) && x >= 0;
export function safeRatio(numerator: MaybeNumber, denominator: MaybeNumber): number | null {
  if (!finite(numerator) || !positive(denominator)) return null;
  const result = numerator / denominator;
  return Number.isFinite(result) ? result : null;
}
/** Negative/zero bases make a conventional percentage growth rate misleading. */
export function growth(current: MaybeNumber, previous: MaybeNumber): number | null {
  return finite(current) && positive(previous) ? safeRatio(current - previous, previous) : null;
}
export function cagr(ending: MaybeNumber, beginning: MaybeNumber, years: number): number | null {
  if (!positive(ending) || !positive(beginning) || !positive(years)) return null;
  const result = Math.pow(ending / beginning, 1 / years) - 1;
  return Number.isFinite(result) ? result : null;
}
const difference = (a: MaybeNumber, b: MaybeNumber) => finite(a) && finite(b) ? a - b : null;
const average = (a: MaybeNumber, b: MaybeNumber) => finite(a) && finite(b) ? (a + b) / 2 : null;
const capital = (s?: FinancialStatement) => !s ? null : finite(s.capitalEmployed) ? s.capitalEmployed : finite(s.equity) && finite(s.debt) ? s.equity + s.debt : null;

/** Returns annual ratios only when matching annual statements are supplied.
 * ROE/ROA/ROCE require opening and closing balance sheets, never silent closing-only proxies.
 * EPS and PAT must be attributable to the same ordinary shareholders as shares/equity. */
export function calculateRatios(current: FinancialStatement, previous?: FinancialStatement, market: MarketInputs = {}, sector: Sector = 'non-financial') {
  const financial = sector === 'bank' || sector === 'nbfc' || sector === 'insurance';
  // Outstanding shares at the quote date differ from annual weighted-average EPS shares.
  const shares = positive(market.shares) ? market.shares : null;
  const marketCap = nonnegative(market.price) && positive(shares) ? market.price * shares : null;
  const netDebt = difference(current.debt, current.cash);
  // No silent zero assumption for preferred equity or non-controlling interests.
  const enterpriseValue = !financial && finite(marketCap) && finite(netDebt) && nonnegative(market.minorityInterest) && nonnegative(market.preferredEquity)
    ? marketCap + netDebt + market.minorityInterest + market.preferredEquity : null;
  const fcf = nonnegative(current.capex) ? difference(current.cfo, current.capex) : null;
  return {
    revenueGrowth: growth(current.revenue, previous?.revenue), ebitdaGrowth: financial ? null : growth(current.ebitda, previous?.ebitda),
    patGrowth: growth(current.netProfit, previous?.netProfit), epsGrowth: growth(current.eps, previous?.eps),
    ebitdaMargin: financial ? null : safeRatio(current.ebitda, current.revenue), ebitMargin: financial ? null : safeRatio(current.ebit, current.revenue),
    netMargin: safeRatio(current.netProfit, current.revenue), roe: safeRatio(current.netProfit, average(current.equity, previous?.equity)),
    roa: safeRatio(current.netProfit, average(current.assets, previous?.assets)),
    roce: financial ? null : safeRatio(current.ebit, average(capital(current), capital(previous))),
    debtEquity: financial ? null : safeRatio(current.debt, current.equity), netDebt: financial ? null : netDebt,
    netDebtEbitda: financial ? null : safeRatio(netDebt, current.ebitda), currentRatio: financial ? null : safeRatio(current.currentAssets, current.currentLiabilities),
    interestCoverage: financial ? null : safeRatio(current.ebit, current.interestExpense),
    cfoPat: financial ? null : safeRatio(current.cfo, current.netProfit),
    /** Cash conversion defined here as CFO / EBITDA. */
    cashConversion: financial ? null : safeRatio(current.cfo, current.ebitda), capex: nonnegative(current.capex) ? current.capex : null,
    freeCashFlow: financial ? null : fcf, fcfMargin: financial ? null : safeRatio(fcf, current.revenue), marketCap, enterpriseValue,
    pe: safeRatio(marketCap, current.netProfit), pb: safeRatio(marketCap, current.equity),
    evEbitda: financial ? null : safeRatio(enterpriseValue, current.ebitda), evSales: financial ? null : safeRatio(enterpriseValue, current.revenue),
    priceSales: financial ? null : safeRatio(marketCap, current.revenue), dividendYield: nonnegative(current.dividends) ? safeRatio(current.dividends, marketCap) : null,
    fcfYield: financial ? null : safeRatio(fcf, marketCap),
  };
}

export interface WaccInput { riskFreeRate: number; beta: number; equityRiskPremium: number; preTaxCostOfDebt: number; taxRate: number; equityWeight: number; debtWeight: number }
function requireFinite(values: number[], label: string) { if (!values.every(Number.isFinite)) throw new RangeError(`${label}: all inputs must be finite`); }
function requireRate(rate: number, label: string) { if (!Number.isFinite(rate) || rate < 0 || rate > 1) throw new RangeError(`${label} must be between 0 and 1`); }
export function calculateWacc(input: WaccInput) {
  requireFinite(Object.values(input), 'WACC');
  requireRate(input.taxRate, 'Tax rate'); requireRate(input.equityWeight, 'Equity weight'); requireRate(input.debtWeight, 'Debt weight');
  if (Math.abs(input.equityWeight + input.debtWeight - 1) > 1e-8) throw new RangeError('Market-value capital weights must sum to 1');
  if (input.preTaxCostOfDebt < 0 || input.equityRiskPremium < 0) throw new RangeError('Cost of debt and equity risk premium cannot be negative');
  const costOfEquity = input.riskFreeRate + input.beta * input.equityRiskPremium;
  const afterTaxCostOfDebt = input.preTaxCostOfDebt * (1 - input.taxRate);
  return { costOfEquity, afterTaxCostOfDebt, wacc: costOfEquity * input.equityWeight + afterTaxCostOfDebt * input.debtWeight };
}
export interface ForecastYear {
  year: number; revenue: number; ebit: number; taxRate: number; depreciation: number; capex: number; changeNwc: number;
}
export interface DcfInput {
  forecasts: ForecastYear[]; wacc: number; terminalGrowth: number;
  /** Explicit normalized FCFF for year N+1; no implicit capex/working-capital assumptions. */
  terminalFcff: number;
  debt: number; cash: number; minorityInterest: number; preferredEquity: number; nonOperatingAssets: number; dilutedShares: number;
  marketPrice?: MaybeNumber;
}
/** End-of-year FCFF DCF. Taxes on EBIT are floored at zero; deferred tax benefits
 * are not assumed. Financial firms should use residual income/sector models. */
export function calculateDcf(input: DcfInput) {
  requireFinite([input.wacc, input.terminalGrowth, input.terminalFcff, input.debt, input.cash, input.minorityInterest, input.preferredEquity, input.nonOperatingAssets, input.dilutedShares], 'DCF');
  if (input.wacc <= 0 || input.terminalGrowth <= -1 || input.terminalGrowth >= input.wacc) throw new RangeError('Require positive WACC and -1 < terminal growth < WACC');
  if (!input.forecasts.length || input.forecasts.length > 30) throw new RangeError('Supply 1–30 explicit forecast years');
  if (input.dilutedShares <= 0 || [input.debt, input.cash, input.minorityInterest, input.preferredEquity, input.nonOperatingAssets].some(v => v < 0)) throw new RangeError('Positive diluted shares and non-negative bridge inputs required');
  const forecast = input.forecasts.map((f, i) => {
    requireFinite(Object.values(f), 'Forecast'); requireRate(f.taxRate, 'Forecast tax rate');
    if (!Number.isInteger(f.year) || (i && f.year !== input.forecasts[i - 1].year + 1)) throw new RangeError('Forecast years must be consecutive integers');
    if (f.revenue < 0 || f.depreciation < 0 || f.capex < 0) throw new RangeError('Revenue, depreciation and capex must be non-negative');
    const taxes = Math.max(0, f.ebit) * f.taxRate;
    const nopat = f.ebit - taxes;
    const fcff = nopat + f.depreciation - f.capex - f.changeNwc;
    const discountFactor = 1 / (1 + input.wacc) ** (i + 1);
    return { ...f, taxes, nopat, fcff, discountFactor, presentValue: fcff * discountFactor };
  });
  const presentValueOfForecasts = forecast.reduce((total, f) => total + f.presentValue, 0);
  const terminalValue = input.terminalFcff / (input.wacc - input.terminalGrowth);
  const presentValueOfTerminal = terminalValue / (1 + input.wacc) ** forecast.length;
  const enterpriseValue = presentValueOfForecasts + presentValueOfTerminal;
  const equityValue = enterpriseValue - input.debt + input.cash - input.minorityInterest - input.preferredEquity + input.nonOperatingAssets;
  const intrinsicValuePerShare = equityValue / input.dilutedShares;
  requireFinite([terminalValue, enterpriseValue, equityValue, intrinsicValuePerShare], 'DCF outputs');
  return { forecast, presentValueOfForecasts, terminalValue, presentValueOfTerminal, enterpriseValue, equityValue, intrinsicValuePerShare,
    terminalValueWeight: safeRatio(presentValueOfTerminal, enterpriseValue),
    upside: positive(input.marketPrice) ? intrinsicValuePerShare / input.marketPrice - 1 : null,
    /** (Intrinsic - Price) / Intrinsic, different from upside / price. */
    marginOfSafety: finite(input.marketPrice) && positive(intrinsicValuePerShare) ? (intrinsicValuePerShare - input.marketPrice) / intrinsicValuePerShare : null,
    warnings: [equityValue < 0 ? 'Negative model equity value; not a tradable negative share price.' : '', input.terminalFcff <= 0 ? 'Non-positive terminal FCFF: perpetual-growth continuation requires review.' : ''].filter(Boolean),
  };
}
/** Scenarios must carry their own explicitly justified forecasts and assumptions. */
export function dcfScenarios(inputs: Record<'bear' | 'base' | 'bull', DcfInput>) {
  return { bear: calculateDcf(inputs.bear), base: calculateDcf(inputs.base), bull: calculateDcf(inputs.bull) };
}
/** Hold normalized terminal FCFF fixed; vary only discount rate and terminal growth.
 * Invalid g >= WACC cells stay null, never a fabricated value. */
export function dcfSensitivity(input: DcfInput, waccs: number[], growthRates: number[]) {
  calculateDcf(input);
  return waccs.map(wacc => ({ wacc, values: growthRates.map(terminalGrowth => {
    if (!finite(wacc) || !finite(terminalGrowth) || wacc <= 0 || terminalGrowth <= -1 || terminalGrowth >= wacc) return null;
    return calculateDcf({ ...input, wacc, terminalGrowth }).intrinsicValuePerShare;
  }) }));
}
export interface ResidualIncomeInput {
  openingBookEquity: number; costOfEquity: number; dilutedShares: number;
  /** Clean-surplus forecast: net income and dividends to ordinary shareholders. */
  forecasts: { year: number; netIncome: number; dividends: number }[];
  terminalRoe: number; terminalGrowth: number;
}
/** Ordinary-equity residual-income model for banks/NBFCs. Clean surplus assumes
 * no unmodelled issuance, buybacks, OCI or equity changes. */
export function calculateResidualIncome(input: ResidualIncomeInput) {
  requireFinite([input.openingBookEquity, input.costOfEquity, input.dilutedShares, input.terminalRoe, input.terminalGrowth], 'Residual income');
  if (input.openingBookEquity <= 0 || input.costOfEquity <= 0 || input.dilutedShares <= 0 || !input.forecasts.length || input.forecasts.length > 30) throw new RangeError('Positive book equity, cost of equity, shares and 1–30 forecast years required');
  if (input.terminalGrowth >= input.costOfEquity || input.terminalGrowth <= -1 || input.terminalRoe < 0 || input.terminalGrowth > input.terminalRoe) throw new RangeError('Terminal growth must be below cost of equity, above -1 and supportable by terminal ROE');
  let book = input.openingBookEquity;
  const forecast = input.forecasts.map((f, i) => {
    requireFinite(Object.values(f), 'Residual income forecast');
    if (!Number.isInteger(f.year) || (i && f.year !== input.forecasts[i - 1].year + 1) || f.dividends < 0) throw new RangeError('Consecutive forecast years and non-negative dividends required');
    const openingBook = book;
    const residualIncome = f.netIncome - input.costOfEquity * openingBook;
    book += f.netIncome - f.dividends;
    if (book <= 0) throw new RangeError('Clean-surplus forecast exhausts ordinary book equity');
    return { ...f, openingBook, closingBook: book, residualIncome, presentValue: residualIncome / (1 + input.costOfEquity) ** (i + 1) };
  });
  const terminalResidualIncome = book * (input.terminalRoe - input.costOfEquity);
  const terminalValue = terminalResidualIncome / (input.costOfEquity - input.terminalGrowth);
  const presentValueOfTerminal = terminalValue / (1 + input.costOfEquity) ** forecast.length;
  const equityValue = input.openingBookEquity + forecast.reduce((s, f) => s + f.presentValue, 0) + presentValueOfTerminal;
  return { forecast, terminalResidualIncome, terminalValue, presentValueOfTerminal, equityValue, intrinsicValuePerShare: equityValue / input.dilutedShares };
}

export interface PricePoint { date: string; adjustedClose: number }
/** Chronological adjusted daily closes only; duplicates/nonfinite/nonpositive data rejected. */
function checkedPrices(points: PricePoint[]) {
  for (let i = 0; i < points.length; i++) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(points[i].date) || (!Number.isFinite(Date.parse(points[i].date)) || new Date(points[i].date).toISOString().slice(0, 10) !== points[i].date) || !positive(points[i].adjustedClose) || (i && points[i].date <= points[i - 1].date)) throw new RangeError('Price history requires unique increasing ISO dates and positive adjusted closes');
  }
  return points.map(p => p.adjustedClose);
}
function sma(prices: number[], period: number) { return prices.length < period ? null : prices.slice(-period).reduce((s, p) => s + p, 0) / period; }
export function rsi(prices: number[], period = 14): number | null {
  if (!Number.isInteger(period) || period < 1) throw new RangeError('RSI period must be a positive integer');
  if (prices.some(p => !positive(p))) throw new RangeError('RSI requires positive finite closes');
  if (prices.length <= period) return null;
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) { const delta = prices[i] - prices[i - 1]; gain += Math.max(0, delta) / period; loss += Math.max(0, -delta) / period; }
  for (let i = period + 1; i < prices.length; i++) { const delta = prices[i] - prices[i - 1]; gain = (gain * (period - 1) + Math.max(0, delta)) / period; loss = (loss * (period - 1) + Math.max(0, -delta)) / period; }
  return loss === 0 ? gain === 0 ? 50 : 100 : 100 - 100 / (1 + gain / loss);
}
function emaSeries(prices: number[], period: number): (number | null)[] {
  const series: (number | null)[] = prices.map(() => null);
  if (prices.length < period) return series;
  let ema = prices.slice(0, period).reduce((s, p) => s + p, 0) / period;
  series[period - 1] = ema;
  const alpha = 2 / (period + 1);
  for (let i = period; i < prices.length; i++) { ema = prices[i] * alpha + ema * (1 - alpha); series[i] = ema; }
  return series;
}
export function macd(prices: number[]): { line: number; signal: number; histogram: number } | null {
  if (prices.some(p => !positive(p))) throw new RangeError('MACD requires positive finite closes');
  if (prices.length < 34) return null;
  const fast = emaSeries(prices, 12), slow = emaSeries(prices, 26);
  const lines = prices.slice(25).map((_, i) => fast[i + 25]! - slow[i + 25]!);
  const signals = emaSeries(lines, 9);
  const line = lines[lines.length - 1], signal = signals[signals.length - 1]!;
  return { line, signal, histogram: line - signal };
}
/** Non-positive result: trough/previous peak - 1 across the supplied full history. */
export function maximumDrawdown(prices: number[]): number | null {
  if (prices.length < 2) return null;
  if (prices.some(p => !positive(p))) throw new RangeError('Drawdown requires positive finite closes');
  let peak = prices[0], drawdown = 0;
  for (const p of prices) { peak = Math.max(peak, p); drawdown = Math.min(drawdown, p / peak - 1); }
  return drawdown;
}
/** Daily simple-return regression, >=60 matched return intervals by default.
 * Matching both interval endpoints avoids comparing different holding periods. */
export function calculateBeta(stock: PricePoint[], benchmark: PricePoint[], minimumObservations = 60): number | null {
  checkedPrices(stock); checkedPrices(benchmark);
  if (!Number.isInteger(minimumObservations) || minimumObservations < 2) throw new RangeError('Beta needs at least 2 observations');
  const benchmarkReturns = new Map<string, number>();
  for (let i = 1; i < benchmark.length; i++) benchmarkReturns.set(`${benchmark[i - 1].date}/${benchmark[i].date}`, benchmark[i].adjustedClose / benchmark[i - 1].adjustedClose - 1);
  const pairs: [number, number][] = [];
  for (let i = 1; i < stock.length; i++) { const b = benchmarkReturns.get(`${stock[i - 1].date}/${stock[i].date}`); if (finite(b)) pairs.push([stock[i].adjustedClose / stock[i - 1].adjustedClose - 1, b]); }
  if (pairs.length < minimumObservations) return null;
  const stockMean = pairs.reduce((s, p) => s + p[0], 0) / pairs.length, benchmarkMean = pairs.reduce((s, p) => s + p[1], 0) / pairs.length;
  const covarianceSum = pairs.reduce((s, p) => s + (p[0] - stockMean) * (p[1] - benchmarkMean), 0);
  const varianceSum = pairs.reduce((s, p) => s + (p[1] - benchmarkMean) ** 2, 0);
  return varianceSum > 1e-16 ? covarianceSum / varianceSum : null;
}
/** Horizon labels use 21/63/126/252 trading observations, not calendar dates.
 * 52-week range uses 252 adjusted closes; long-term CAGR uses 756/1260 intervals.
 * Volatility is sample SD of daily log returns, annualized by sqrt(252). */
export function technicalSnapshot(points: PricePoint[], benchmark?: PricePoint[]) {
  const prices = checkedPrices(points), n = prices.length, last = prices[n - 1];
  const returnOver = (period: number) => n > period ? last / prices[n - 1 - period] - 1 : null;
  const logReturns = prices.slice(1).map((p, i) => Math.log(p / prices[i]));
  const mean = logReturns.length ? logReturns.reduce((s, r) => s + r, 0) / logReturns.length : 0;
  const volatility = logReturns.length >= 20 ? Math.sqrt(logReturns.reduce((s, r) => s + (r - mean) ** 2, 0) / (logReturns.length - 1)) * Math.sqrt(252) : null;
  return { observations: n, asOf: points[n - 1]?.date ?? null, return1m: returnOver(21), return3m: returnOver(63), return6m: returnOver(126), return1y: returnOver(252),
    cagr3y: n > 756 ? cagr(last, prices[n - 1 - 756], 3) : null, cagr5y: n > 1260 ? cagr(last, prices[n - 1 - 1260], 5) : null,
    high52w: n >= 252 ? Math.max(...prices.slice(-252)) : null, low52w: n >= 252 ? Math.min(...prices.slice(-252)) : null,
    sma20: sma(prices, 20), sma50: sma(prices, 50), sma200: sma(prices, 200), rsi14: rsi(prices), macd: macd(prices),
    annualizedVolatility: volatility, maximumDrawdown: maximumDrawdown(prices), beta: benchmark ? calculateBeta(points, benchmark) : null };
}

export interface ValidationCheck { name: string; status: 'pass' | 'missing' | 'conflicting'; actual: number | null; expected: number | null; difference: number | null }
/** Tolerances should reflect source rounding. Absolute tolerance is in the
 * monetary/shares unit of the equation; EPS uses epsAbsoluteTolerance. */
export function validateFinancials(statement: FinancialStatement, options: { relativeTolerance?: number; absoluteTolerance?: number; epsAbsoluteTolerance?: number; market?: MarketInputs; reportedMarketCap?: MaybeNumber } = {}): ValidationCheck[] {
  const relative = options.relativeTolerance ?? 0.01, absolute = options.absoluteTolerance ?? 1, epsAbsolute = options.epsAbsoluteTolerance ?? 0.02;
  if (![relative, absolute, epsAbsolute].every(v => Number.isFinite(v) && v >= 0)) throw new RangeError('Validation tolerances must be finite and non-negative');
  const check = (name: string, actual: MaybeNumber, expected: MaybeNumber, tolerance = absolute): ValidationCheck => {
    if (!finite(actual) || !finite(expected)) return { name, status: 'missing', actual: finite(actual) ? actual : null, expected: finite(expected) ? expected : null, difference: null };
    const delta = actual - expected;
    return { name, status: Math.abs(delta) <= Math.max(tolerance, relative * Math.max(Math.abs(actual), Math.abs(expected))) ? 'pass' : 'conflicting', actual, expected, difference: delta };
  };
  return [
    check('Assets = liabilities + ordinary equity + non-controlling interests', statement.assets, finite(statement.liabilities) && finite(statement.equity) && finite(statement.nonControllingInterests) ? statement.liabilities + statement.equity + statement.nonControllingInterests : null),
    check('EPS = attributable PAT / diluted weighted-average shares', statement.eps, safeRatio(statement.netProfit, statement.dilutedShares), epsAbsolute),
    check('EBITDA = EBIT + depreciation and amortization', statement.ebitda, finite(statement.ebit) && finite(statement.depreciation) ? statement.ebit + statement.depreciation : null),
    check('Market cap = price × outstanding shares', options.reportedMarketCap, nonnegative(options.market?.price) && positive(options.market?.shares) ? options.market.price * options.market.shares : null),
  ];
}

/** Convert sourced units before calculation; does not convert currencies. */
export function normalizeMonetaryUnit(value: MaybeNumber, unit: 'unit' | 'thousand' | 'lakh' | 'million' | 'crore' | 'billion'): number | null {
  if (!finite(value)) return null;
  const multiplier = { unit: 1, thousand: 1e3, lakh: 1e5, million: 1e6, crore: 1e7, billion: 1e9 }[unit];
  const result = value * multiplier;
  return Number.isFinite(result) ? result : null;
}
