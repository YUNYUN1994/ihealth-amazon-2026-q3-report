import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProductMapping, buildReport, parsePm } from '../lib/report-builder.mjs';

const productHeaders = ['ASIN', 'MSKU', 'ASIN', '产品线', '新老分类', '归属', 'Test数', '做表分类', '做表分类2', '做表分类3', '成本', '26年Q2', '分类', '产品名称'];
const products = [
  productHeaders,
  ['A550', '550BT', 'A550', '血压计', '老品', '550BT', 1, '550BT', 550, '血压计', 10, 11, '硬件', '血压计550'],
  ['APT3', 'FBAPT3', 'APT3', '温度计', '老品', 'PT3', 1, 'PT3', 'PT3', '温度计', 8, 9, '硬件', '温度计PT3'],
  ['ACOV', 'COV-1', 'ACOV', 'COV', '老品', 'COV', 1, 'COV', 'COV', 'COV', 1, 1, '测试盒', 'COV测试盒'],
];
const pmHeaders = ['年份', '月份', '季度', 'MSKU', 'ASIN', '销量', '销售额', '促销折扣', 'Total(销售额-促销-FBA-佣金）', 'Adjustment', 'Coupon Fee', '广告费', 'Refund', '基本仓储费', '超龄仓储费', 'Deal Fee', '退款数量', '退款率', '退货处理费', '总回款', '单个回款', '单个推广费', '单个成本', '总成本', '利润', '毛利率', '推广费比', '成交价', '均价', '净销售额', '产品线', '归属', '新老品', 'Test数', '总Test数', '分类1', '分类2', '分类3', '分类4'];
function pmRow(year, msku, asin, units, productLineFormula, ownerFormula, kindFormula, totalTest = 0) {
  const row = Array(39).fill('');
  Object.assign(row, { 0: year, 1: `${year}年7月份`, 2: 'Q3', 3: msku, 4: asin, 5: units, 6: units * 20, 11: units, 16: 0, 18: 0, 19: units * 10, 23: units * 5, 24: units * 5, 29: units * 18, 30: productLineFormula, 31: ownerFormula, 32: 'VLOOKUP(D2,\'所有产品对应表\'!B:E,4,0)', 33: 1, 34: totalTest, 38: kindFormula });
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
