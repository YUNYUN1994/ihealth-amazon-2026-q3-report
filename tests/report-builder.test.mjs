import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProductMapping, buildReport, parseMarketData, parsePm } from '../lib/report-builder.mjs';

const productHeaders = ['ASIN', 'MSKU', 'ASIN', '产品线', '新老分类', '归属', 'Test数', '做表分类', '做表分类2', '做表分类3', '成本', '26年Q2', '分类', '产品名称'];
const products = [
  productHeaders,
  ['A550', '550BT', 'A550', '血压计', '老品', '550BT', 1, '550BT', 550, '血压计', 10, 11, '硬件', '血压计550'],
  ['APT3', 'FBAPT3', 'APT3', '温度计', '老品', 'PT3', 1, 'PT3', 'PT3', '温度计', 8, 9, '硬件', '温度计PT3'],
  ['ACOV', 'COV-1', 'ACOV', 'COV', '老品', 'COV', 1, 'COV', 'COV', 'COV', 1, 1, '测试盒', 'COV测试盒'],
];
const pmHeaders = ['年份', '月份', '季度', 'MSKU', 'ASIN', '销量', '销售额', '促销折扣', 'Total(销售额-促销-FBA-佣金）', 'Adjustment', 'Coupon Fee', '广告费', 'Refund', '基本仓储费', '超龄仓储费', 'Deal Fee', '退款数量', '退款率', '退货处理费', '总回款', '单个回款', '单个推广费', '单个成本', '总成本', '利润', '毛利率', '推广费比', '成交价', '均价', '净销售额', '产品线', '归属', '新老品', 'Test数', '总Test数', '分类1', '分类2', '分类3', '分类4'];
function pmRow(year, msku, asin, units, productLineFormula, ownerFormula, kindFormula, totalTest = 0, month = 7) {
  const row = Array(39).fill('');
  const quarter = month <= 3 ? 'Q1' : month <= 6 ? 'Q2' : 'Q3';
  Object.assign(row, { 0: year, 1: `${year}年${month}月份`, 2: quarter, 3: msku, 4: asin, 5: units, 6: units * 20, 11: units, 16: 0, 18: 0, 19: units * 10, 23: units * 5, 24: units * 5, 29: units * 18, 30: productLineFormula, 31: ownerFormula, 32: 'VLOOKUP(D2,\'所有产品对应表\'!B:E,4,0)', 33: 1, 34: totalTest, 38: kindFormula });
  return row;
}
const pm = [pmHeaders];
for (const year of [2025, 2026]) {
  for (let i = 0; i < 20; i += 1) {
    pm.push(pmRow(year, '550BT', 'A550', 100, '=VLOOKUP(D2,\'所有产品对应表\'!B:D,3,0)', '=VLOOKUP(D2,\'所有产品对应表\'!B:F,5,0)', '=VLOOKUP(D2,\'所有产品对应表\'!B:M,12,0)'));
    pm.push(pmRow(year, 'FBAPT3', 'APT3', 50, '=VLOOKUP(D2,\'所有产品对应表\'!B:D,3,0)', '=VLOOKUP(D2,\'所有产品对应表\'!B:F,5,0)', '=VLOOKUP(D2,\'所有产品对应表\'!B:M,12,0)'));
    pm.push(pmRow(year, 'COV-1', 'ACOV', 10, '=VLOOKUP(D2,\'所有产品对应表\'!B:D,3,0)', '=VLOOKUP(D2,\'所有产品对应表\'!B:F,5,0)', '=VLOOKUP(D2,\'所有产品对应表\'!B:M,12,0)', 10));
  }
}

test('product table mapping resolves PM formula literals by MSKU', () => {
  const mapping = buildProductMapping(products);
  const rows = parsePm(pm, mapping);
  const bp = rows.find((row) => row.msku === '550BT');
  const pt3 = rows.find((row) => row.msku === 'FBAPT3');
  assert.equal(bp.productLine, '血压计');
  assert.equal(bp.owner, '550BT');
  assert.equal(bp.kind, '硬件');
  assert.equal(pt3.productLine, '温度计');
  assert.equal(pt3.owner, 'PT3');
});

test('report validation prevents the 550/PT3 zero-category regression', () => {
  const report = buildReport({}, { products, pm, targets: [], returns: [] });
  const categories = report.reportExtensions.hardware.annualCategories[2026];
  assert.ok(categories.find((item) => item.name === '550').units > 0);
  assert.ok(categories.find((item) => item.name === 'PT3').units > 0);
  assert.equal(report.reportExtensions.hardware.dataQuality.unresolvedMappingRows, 0);
  assert.equal(report.reportExtensions.hardware.dataQuality.missingProductLineRows, 0);
});

test('report validation rejects unresolved formula-based product mappings', () => {
  const brokenProducts = [productHeaders, products[1], products[3]];
  assert.throws(() => buildReport({}, { products: brokenProducts, pm, targets: [], returns: [] }), /硬件数据有效性校验失败/);
});


test('hardware targets evaluate Feishu formula text instead of treating it as zero', () => {
  const targetHeaders = ['SKU', '月份', '季度', '预计日销', '月需求', '售价', '折扣', '实际售价', '销售额', '净销售额', '佣金', 'FBA Fee', '仓储%', '仓储', '广告费', '单个推广费', '推广费比', '退款率', '退款', '总回款', '单个回款（计退货）', '单个回款（未计退货）', '单个成本', '总成本', '利润', '单个利润', '产品线', '新老品', '归属', 'ASIN'];
  const targetRow = Array(30).fill('');
  Object.assign(targetRow, {
    0: '550BT', 1: '2026年1月份', 4: 100, 8: 2000, 14: 100, 19: 2000,
    22: 10, 23: 'W2*E2', 24: 'T2-X2', 25: 'Y2/E2',
  });
  const report = buildReport({}, { products, pm, targets: [targetHeaders, targetRow], returns: [] });
  const target = report.reportExtensions.hardware.targetAttainment.find((item) => item.name === '550');
  assert.equal(target.target2026.cost, 1000);
  assert.equal(target.target2026.profit, 1000);
  assert.equal(target.attainment.profit, target.actual2026.profit / 1000);
  assert.ok(report.reportExtensions.hardware.targetMeta.formulaCount >= 2);
  assert.equal(report.reportExtensions.hardware.targetMeta.formulaFallbackCount, 0);
});




test('PM formula-based total test count is evaluated instead of becoming zero', () => {
  const row = pmRow(2026, 'COV-1', 'ACOV', 10, '=VLOOKUP(D2,\'所有产品对应表\'!B:D,3,0)', '=VLOOKUP(D2,\'所有产品对应表\'!B:F,5,0)', '=VLOOKUP(D2,\'所有产品对应表\'!B:M,12,0)');
  row[33] = '=VLOOKUP(D2,\'所有产品对应表\'!B:G,6,0)';
  row[34] = 'AH2*F2';
  const parsed = parsePm([pmHeaders, row], buildProductMapping(products));
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].totalTest, 10);
});

test('testkit validation rejects sold rows with missing total test counts', () => {
  const brokenPm = pm.map((row) => {
    if (!Array.isArray(row) || row[3] !== 'COV-1') return row;
    const copy = [...row];
    copy[34] = 0;
    return copy;
  });
  assert.throws(() => buildReport({}, { products, pm: brokenPm, targets: [], returns: [] }), /测试盒数据有效性校验失败/);
});


test('hardware return comparison matches independent yearly ASIN columns and applies the exact scope', () => {
  const returnProducts = [productHeaders];
  const returnPm = [pmHeaders];
  returnProducts.push(products[3]);
  for (let month = 0; month < 5; month += 1) {
    returnPm.push(pmRow(2025, 'COV-1', 'ACOV', 10, 'COV', 'COV', '测试盒', 10));
    returnPm.push(pmRow(2026, 'COV-1', 'ACOV', 10, 'COV', 'COV', '测试盒', 10));
  }
  const returnSheet = [
    ['ASIN', '2025年截止Q3', '', '', '', 'ASIN', '2026年截止Q3', '', '', '', '', '产品线', '亚马逊360天平均退货率（商机探测器）'],
    ['', '评分', '退款率', '退货率', '', '', '评分', '退款率', '退货率', '', '', '血压计', 0.0332],
  ];
  const yearlyReturns = [];
  for (let i = 1; i <= 12; i += 1) {
    const msku = `HW-${i}`;
    const asin = `AHW${i}`;
    returnProducts.push([asin, msku, asin, '血压计', '老品', msku, 1, msku, msku, '血压计', 5, 5, '硬件', `硬件产品${i}`]);
    for (let month = 0; month < 5; month += 1) {
      returnPm.push(pmRow(2025, msku, asin, 100, '血压计', msku, '硬件'));
      returnPm.push(pmRow(2026, msku, asin, 1300 - i * 100, '血压计', msku, '硬件'));
    }
    yearlyReturns.push({
      asin,
      rating2025: 3 + i / 100,
      refund2025: 0.04,
      return2025: 0.05,
      rating2026: 4 + i / 100,
      refund2026: i === 11 ? 0.09 : 0.04,
      return2026: i === 12 ? 0.061 : i === 11 ? 0.06 : 0.04,
    });
  }
  const reversed2026 = [...yearlyReturns].reverse();
  for (let index = 0; index < yearlyReturns.length; index += 1) {
    const prior = yearlyReturns[index];
    const current = reversed2026[index];
    returnSheet.push([
      prior.asin, prior.rating2025, prior.refund2025, prior.return2025, '',
      current.asin, current.rating2026, current.refund2026, current.return2026, '', '', '', '',
    ]);
  }
  const report = buildReport({}, { products: returnProducts, pm: returnPm, targets: [], returns: returnSheet });
  const rows = report.reportExtensions.hardware.returns;
  const included = new Set(rows.map((item) => item.msku));
  assert.equal(rows.length, 11);
  for (let i = 1; i <= 10; i += 1) assert.ok(included.has(`HW-${i}`), `HW-${i} should be included as a 2026 top-10 product`);
  assert.equal(included.has('HW-11'), false, 'refund-rate rise and an exact 1-point return-rate rise must not add a product outside the top 10');
  assert.ok(included.has('HW-12'), 'return-rate rise above 1 percentage point should add a product outside the top 10');
  const hw12 = rows.find((item) => item.msku === 'HW-12');
  assert.equal(hw12.years[2025].rating, 3.12, '2025 values must match by the 2025 ASIN column');
  assert.equal(hw12.years[2026].rating, 4.12, '2026 values must match by the independent 2026 ASIN column');
  assert.equal(hw12.years[2026].returnRate, 0.061);
  assert.ok(Math.abs(hw12.returnRise - 0.011) < 1e-12);
  assert.equal(hw12.materialAlert, true);
  assert.equal(hw12.amazon360, 0.0332, '360-day average must come from columns 11 and 12');
  const malformedReturnSheet = returnSheet.map((row) => [...row]);
  malformedReturnSheet[0][5] = '';
  assert.throws(
    () => buildReport({}, { products: returnProducts, pm: returnPm, targets: [], returns: malformedReturnSheet }),
    /退货数据有效性校验失败/,
    'a shifted or incomplete return-sheet layout must fail instead of publishing incorrect rates',
  );
});


function marketFixture() {
  const values = [
    ['测试盒', '', '', '', '', '', '血压计', '', '', '', '', '', '温度计'],
    ['年份', '季度', '月份', '销量（选品指南针）', '搜索量（亚马逊查询绩效）', '', '年份', '季度', '月份', '大盘搜索量', '大盘销量', '', '年份', '季度', '月份', '大盘搜索量', '大盘销量', 'Baby类目', '个护类目'],
  ];
  for (const year of [2025, 2026]) for (let month = 1; month <= 9; month += 1) {
    const incomplete = year === 2026 && month === 9;
    const ym = year * 100 + month;
    const row = Array(20).fill('');
    Object.assign(row, {
      0: year, 1: month <= 3 ? 'Q1' : month <= 6 ? 'Q2' : 'Q3', 2: ym, 3: incomplete ? '' : year === 2025 ? 500 : 600, 4: incomplete ? '' : year === 2025 ? 1000 : 1200,
      6: year, 7: month <= 3 ? 'Q1' : month <= 6 ? 'Q2' : 'Q3', 8: ym, 9: incomplete ? '' : year === 2025 ? 2000 : 2200, 10: incomplete ? '' : year === 2025 ? 1000 : 1100,
      12: year, 13: month <= 3 ? 'Q1' : month <= 6 ? 'Q2' : 'Q3', 14: ym, 15: incomplete ? '' : year === 2025 ? 3000 : 3300, 16: incomplete ? '' : year === 2025 ? 1500 : 1650, 17: incomplete ? '' : year === 2025 ? 750 : 825, 18: incomplete ? '' : year === 2025 ? 750 : 825,
    });
    values.push(row);
  }
  return values;
}

test('market sheet parser validates three blocks and treats incomplete September 2026 as zero', () => {
  const parsed = parseMarketData(marketFixture());
  assert.equal(parsed.records.length, 54);
  assert.deepEqual(parsed.incompleteMonths, [9]);
  for (const key of ['testkit', 'bloodPressure', 'thermometer']) {
    const september = parsed.records.find((row) => row.categoryKey === key && row.year === 2026 && row.month === 9);
    assert.equal(september.marketSearch, 0);
    assert.equal(september.marketUnits, 0);
    assert.equal(september.incomplete, true);
  }
});

test('market overview aggregates Q1-Q3, includes September iHealth units when only market data is incomplete, and calculates share and yoy', () => {
  const pmWithSeptember = pm.map((row) => [...row]);
  pmWithSeptember.push(pmRow(2026, '550BT', 'A550', 31, '=VLOOKUP(D2,\'所有产品对应表\'!B:D,3,0)', '=VLOOKUP(D2,\'所有产品对应表\'!B:F,5,0)', '=VLOOKUP(D2,\'所有产品对应表\'!B:M,12,0)', 0, 9));
  pmWithSeptember.push(pmRow(2026, 'FBAPT3', 'APT3', 17, '=VLOOKUP(D2,\'所有产品对应表\'!B:D,3,0)', '=VLOOKUP(D2,\'所有产品对应表\'!B:F,5,0)', '=VLOOKUP(D2,\'所有产品对应表\'!B:M,12,0)', 0, 9));
  pmWithSeptember.push(pmRow(2026, 'COV-1', 'ACOV', 23, '=VLOOKUP(D2,\'所有产品对应表\'!B:D,3,0)', '=VLOOKUP(D2,\'所有产品对应表\'!B:F,5,0)', '=VLOOKUP(D2,\'所有产品对应表\'!B:M,12,0)', 23, 9));
  const report = buildReport({}, { products, pm: pmWithSeptember, targets: [], returns: [], market: marketFixture() });
  const market = report.reportExtensions.market;
  assert.equal(market.categories.length, 3);
  assert.deepEqual(market.incompleteMonths, [9]);
  const testkit = market.categories.find((item) => item.key === 'testkit');
  const bloodPressure = market.categories.find((item) => item.key === 'bloodPressure');
  const thermometer = market.categories.find((item) => item.key === 'thermometer');
  assert.equal(testkit.years[2025].marketSearch, 9000);
  assert.equal(testkit.years[2026].marketSearch, 9600);
  assert.equal(testkit.years[2026].marketUnits, 4800);
  assert.equal(testkit.years[2026].iHealthUnits, 223);
  assert.equal(testkit.years[2026].marketShare, 223 / 4800);
  assert.equal(testkit.years[2026].months.find((item) => item.month === 9).iHealthUnits, 23);
  assert.equal(bloodPressure.years[2026].iHealthUnits, 2031);
  assert.equal(bloodPressure.years[2026].months.find((item) => item.month === 9).iHealthUnits, 31);
  assert.equal(thermometer.years[2026].iHealthUnits, 1017);
  assert.equal(thermometer.years[2026].months.find((item) => item.month === 9).iHealthUnits, 17);
  assert.match(market.incompleteNotice, /iHealth实际销量已包含对应月份数据/);
  assert.match(market.incompleteNotice, /市场占有率为暂算值/);
  assert.equal(testkit.yoy.marketSearch, 9600 / 9000 - 1);
});

test('market sheet parser rejects shifted layouts and unexpected missing values', () => {
  const shifted = marketFixture();
  shifted[0][6] = '血压仪';
  assert.throws(() => parseMarketData(shifted), /血压计区块标题缺失或错位/);
  const missing = marketFixture();
  missing[3][4] = '';
  assert.throws(() => parseMarketData(missing), /2025年2月搜索量或销量为空/);
});
