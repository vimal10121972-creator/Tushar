import test from 'node:test';
import assert from 'node:assert/strict';
import {
  safeRatio, growth, cagr, calculateRatios, calculateWacc, calculateDcf,
  dcfSensitivity, dcfScenarios, calculateResidualIncome, rsi, macd,
  maximumDrawdown, calculateBeta, technicalSnapshot, validateFinancials,
  normalizeMonetaryUnit, type DcfInput, type PricePoint,
} from '../lib/finance';
const near = (actual: number | null, expected: number, tolerance = 1e-10) => {
  assert.equal(typeof actual, 'number');
  assert.ok(Math.abs(actual! - expected) <= tolerance, `expected ${expected}, got ${actual}`);
};
// Deliberately synthetic arithmetic fixtures, exclusively for tests. Not market data.
const dcf: DcfInput = {
  forecasts: [{ year: 2027, revenue: 1000, ebit: 100, taxRate: .25, depreciation: 10, capex: 15, changeNwc: 0 }],
  wacc: .10, terminalGrowth: .03, terminalFcff: 70,
  debt: 100, cash: 50, minorityInterest: 10, preferredEquity: 5, nonOperatingAssets: 10, dilutedShares: 10, marketPrice: 80,
};
function pricesFromReturns(returns: number[]): PricePoint[] {
  let close = 100;
  return [0, ...returns].map((r, i) => {
    if (i) close *= 1 + r;
    return { date: new Date(Date.UTC(2020, 0, i + 1)).toISOString().slice(0, 10), adjustedClose: close };
  });
}

test('missing, negative-base, invalid and zero-denominator values do not become zero', () => {
  for (const value of [null, undefined, NaN, Infinity]) assert.equal(safeRatio(value, 100), null);
  for (const denominator of [null, undefined, 0, -1, NaN, Infinity]) assert.equal(safeRatio(1, denominator), null);
  near(safeRatio(0, 10), 0); near(safeRatio(-5, 10), -.5);
  near(growth(120, 100), .2); assert.equal(growth(-5, -10), null);
  near(cagr(144, 100, 2), .2); assert.equal(cagr(0, 100, 2), null);
  assert.equal(cagr(100, 100, 0), null);
});

test('CAPM WACC uses market weights and after-tax cost of debt', () => {
  const result = calculateWacc({ riskFreeRate: .06, beta: 1.2, equityRiskPremium: .05, preTaxCostOfDebt: .08, taxRate: .25, equityWeight: .75, debtWeight: .25 });
  near(result.costOfEquity, .12); near(result.afterTaxCostOfDebt, .06); near(result.wacc, .105);
  assert.throws(() => calculateWacc({ riskFreeRate: .06, beta: 1, equityRiskPremium: .05, preTaxCostOfDebt: .08, taxRate: .25, equityWeight: .8, debtWeight: .3 }), /sum to 1/);
});

test('DCF independently reconciles NOPAT, terminal value, EV and ordinary-equity bridge', () => {
  const result = calculateDcf(dcf);
  near(result.forecast[0].nopat, 75); near(result.forecast[0].fcff, 70);
  near(result.presentValueOfForecasts, 700 / 11);
  near(result.terminalValue, 1000); near(result.presentValueOfTerminal, 10000 / 11);
  near(result.enterpriseValue, 10700 / 11);
  near(result.equityValue, 10095 / 11);
  near(result.intrinsicValuePerShare, 10095 / 110);
  near(result.upside, (10095 / 110) / 80 - 1);
  near(result.marginOfSafety, 1 - 80 / (10095 / 110));
  near(result.terminalValueWeight, 100 / 107);
});

test('DCF floors loss-year tax benefits, rejects invalid forecast chronology and invalid terminal spread', () => {
  const loss = calculateDcf({ ...dcf, forecasts: [{ ...dcf.forecasts[0], ebit: -100 }] });
  near(loss.forecast[0].taxes, 0); near(loss.forecast[0].fcff, -105);
  assert.throws(() => calculateDcf({ ...dcf, terminalGrowth: .1 }), /terminal growth/);
  assert.throws(() => calculateDcf({ ...dcf, dilutedShares: 0 }), /Positive diluted/);
  assert.throws(() => calculateDcf({ ...dcf, forecasts: [...dcf.forecasts, { ...dcf.forecasts[0], year: 2029 }] }), /consecutive/);
  assert.throws(() => calculateDcf({ ...dcf, cash: NaN }), /finite/);
});

test('sensitivity centre agrees, invalid cells stay null, scenarios do not silently change assumptions', () => {
  const grid = dcfSensitivity(dcf, [.09, .1, .11], [.03, .1]);
  near(grid[1].values[0], 10095 / 110);
  assert.equal(grid[0].values[1], null); assert.equal(grid[1].values[1], null);
  assert.ok(grid[0].values[0]! > grid[1].values[0]! && grid[1].values[0]! > grid[2].values[0]!);
  const scenario = dcfScenarios({ bear: { ...dcf, wacc: .11 }, base: dcf, bull: { ...dcf, wacc: .09 } });
  assert.ok(scenario.bear.intrinsicValuePerShare < scenario.base.intrinsicValuePerShare);
  assert.ok(scenario.bull.intrinsicValuePerShare > scenario.base.intrinsicValuePerShare);
});

test('ratios use average balance sheets and explicit equity bridge inputs', () => {
  const prev = { fiscalPeriod: '2024', revenue: 800, equity: 400, assets: 800, debt: 100 };
  const now = { fiscalPeriod: '2025', revenue: 1000, ebitda: 200, ebit: 150, netProfit: 100, equity: 600, assets: 1200, debt: 200, cash: 50, cfo: 120, capex: 40, dilutedShares: 10, currentAssets: 300, currentLiabilities: 150, interestExpense: 30, dividends: 20 };
  const ratios = calculateRatios(now, prev, { price: 100, shares: 10, minorityInterest: 10, preferredEquity: 5 });
  near(ratios.roe, .2); near(ratios.roa, .1); near(ratios.roce, 150 / 650);
  near(ratios.revenueGrowth, .25); near(ratios.freeCashFlow, 80); near(ratios.netDebt, 150);
  near(ratios.marketCap, 1000); near(ratios.enterpriseValue, 1165); near(ratios.evEbitda, 5.825);
  near(ratios.pe, 10); near(ratios.currentRatio, 2); near(ratios.dividendYield, .02);
  assert.equal(calculateRatios(now).roe, null);
  assert.equal(calculateRatios(now, prev, { price: 100 }).marketCap, null); // EPS weighted-average shares cannot price today's market cap
  assert.equal(calculateRatios(now, prev, { price: 100 }).enterpriseValue, null);
  assert.equal(calculateRatios({ ...now, netProfit: -100 }, prev, { price: 100 }).pe, null);
});

test('bank/NBFC/insurance ratios do not expose corporate EV, EBITDA, leverage or FCFF proxies', () => {
  for (const sector of ['bank', 'nbfc', 'insurance'] as const) {
    const result = calculateRatios({ fiscalPeriod: '2025', revenue: 1000, ebitda: 200, ebit: 100, netProfit: 80, equity: 100, assets: 1000, debt: 500, cash: 50, cfo: 100, capex: 20 }, { fiscalPeriod: '2024', equity: 100, assets: 1000 }, { price: 10, shares: 20, minorityInterest: 0, preferredEquity: 0 }, sector);
    for (const key of ['enterpriseValue', 'evEbitda', 'ebitdaMargin', 'debtEquity', 'netDebtEbitda', 'freeCashFlow', 'roce'] as const) assert.equal(result[key], null, `${sector}:${key}`);
    near(result.roe, .8); near(result.pb, 2);
  }
});

test('bank residual-income model returns book value when ROE equals cost of equity', () => {
  const result = calculateResidualIncome({ openingBookEquity: 1000, costOfEquity: .1, dilutedShares: 100, forecasts: [{ year: 2027, netIncome: 100, dividends: 50 }], terminalRoe: .1, terminalGrowth: .03 });
  near(result.forecast[0].residualIncome, 0); near(result.equityValue, 1000); near(result.intrinsicValuePerShare, 10);
  assert.throws(() => calculateResidualIncome({ openingBookEquity: 1000, costOfEquity: .1, dilutedShares: 100, forecasts: [{ year: 2027, netIncome: 100, dividends: 1200 }], terminalRoe: .1, terminalGrowth: .03 }), /exhausts/);
});

test('Wilder RSI seed and smoothing agree with an independently hand-computed example', () => {
  near(rsi([10, 12, 11, 13], 3), 80); // average gains 4/3, average losses 1/3
  near(rsi([10, 12, 11, 13, 12], 3), 800 / 13); // smoothed gains 8/9, losses 5/9
  near(rsi([10, 10, 10, 10], 3), 50); near(rsi([10, 11, 12, 13], 3), 100); near(rsi([13, 12, 11, 10], 3), 0);
  assert.equal(rsi([10, 12, 11], 3), null);
  assert.throws(() => rsi([10, 0, 11]), /positive finite/);
});

test('maximum drawdown follows preceding peaks, not final return or full-period minimum', () => {
  near(maximumDrawdown([100, 120, 90, 150, 100, 160]), -1 / 3);
  near(maximumDrawdown([100, 110, 120]), 0);
  assert.equal(maximumDrawdown([100]), null);
});

test('beta uses consistently normalized covariance/variance and matched holding intervals', () => {
  const returns = Array.from({ length: 65 }, (_, i) => (i % 5 - 2) / 100);
  const benchmark = pricesFromReturns(returns), stock = pricesFromReturns(returns.map(r => .001 + 2 * r));
  near(calculateBeta(stock, benchmark), 2);
  assert.equal(calculateBeta(stock.slice(0, 60), benchmark), null);
  assert.equal(calculateBeta(stock, pricesFromReturns(returns.map(() => 0))), null);
  const sparse = [stock[0], stock[2], stock[4], stock[6]];
  assert.equal(calculateBeta(sparse, benchmark, 2), null); // no matching two-day benchmark intervals
});

test('technical horizons require enough observations and price dates are real, ordered, unique', () => {
  const history = pricesFromReturns(Array(252).fill(.001));
  const result = technicalSnapshot(history);
  near(result.return1m, 1.001 ** 21 - 1); near(result.return1y, 1.001 ** 252 - 1);
  assert.equal(result.cagr3y, null); assert.equal(result.beta, null);
  near(technicalSnapshot(pricesFromReturns(Array(20).fill(.001))).annualizedVolatility, 0);
  assert.equal(technicalSnapshot([]).return1m, null);
  assert.throws(() => technicalSnapshot([{ date: '2026-02-30', adjustedClose: 100 }]), /ISO dates/);
  assert.throws(() => technicalSnapshot([history[0], history[0]]), /ISO dates/);
  assert.throws(() => technicalSnapshot([history[1], history[0]]), /ISO dates/);
  const flatMacd = macd(Array(40).fill(100))!;
  near(flatMacd.line, 0); near(flatMacd.signal, 0); near(flatMacd.histogram, 0);
});

test('accounting reconciliation distinguishes conflicts from missing, units remain explicit', () => {
  const checks = validateFinancials({ fiscalPeriod: '2025', assets: 1000, liabilities: 700, equity: 280, nonControllingInterests: 20, netProfit: 100, dilutedShares: 10, eps: 10, ebitda: 110, ebit: 100, depreciation: 10 }, { market: { price: 20, shares: 10 }, reportedMarketCap: 200 });
  assert.ok(checks.every(c => c.status === 'pass'));
  const errors = validateFinancials({ fiscalPeriod: '2025', assets: 1000, liabilities: 700, equity: 200, nonControllingInterests: 0 });
  assert.equal(errors[0].status, 'conflicting'); assert.equal(errors[1].status, 'missing');
  near(normalizeMonetaryUnit(1.5, 'crore'), 15000000); near(normalizeMonetaryUnit(2, 'lakh'), 200000);
  assert.equal(normalizeMonetaryUnit(null, 'crore'), null);
});
