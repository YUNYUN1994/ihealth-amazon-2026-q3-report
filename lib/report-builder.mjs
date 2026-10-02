const unwrapCell = (value) => value && typeof value === 'object' && !Array.isArray(value) && Object.prototype.hasOwnProperty.call(value, 'value') ? value.value : value;
const cleanText = (value) => String(unwrapCell(value) ?? '').replace(/[⾎]/g, '血').trim();
const numberValue = (value) => {
  value = unwrapCell(value);
  if (value === null || value === undefined || value === '' || value === '-' || value === '- -' || value === '#N/A') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  let text = String(value).trim().replace(/[$,%\s,]/g, '');
  let negative = false;
  if (/^\(.*\)$/.test(text)) { negative = true; text = text.slice(1, -1); }
  const parsed = Number(text);
  return Number.isFinite(parsed) ? (negative ? -parsed : parsed) : 0;
};
const monthOf = (value) => {
  const match = String(unwrapCell(value) ?? '').match(/(?:年)?(\d{1,2})月(?:份)?/);
  return match ? Number(match[1]) : 0;
};
const clone = (value) => JSON.parse(JSON.stringify(value));
const change = (current, prior) => prior ? current / prior - 1 : null;
const zero = () => ({ units: 0, totalTest: 0, sales: 0, netSales: 0, payout: 0, cost: 0, profit: 0, adSpend: 0, refundQty: 0, returnFee: 0 });
const aggregate = (rows) => {
  const result = zero();
  for (const row of rows) for (const key of Object.keys(result)) result[key] += Number(row[key] || 0);
  result.mskuCount = new Set(rows.map((row) => row.msku).filter(Boolean)).size;
  result.asinCount = new Set(rows.map((row) => row.asin).filter(Boolean)).size;
  result.grossMargin = result.sales ? result.profit / result.sales : 0;
  result.adRatio = result.sales ? result.adSpend / result.sales : 0;
  result.refundRate = result.units ? result.refundQty / result.units : 0;
  result.avgPrice = result.units ? result.sales / result.units : 0;
  result.singleTestPayout = result.totalTest ? result.payout / result.totalTest : 0;
  return result;
};
const cell = (row, index) => Array.isArray(row) ? row[index] : null;
const classifyKind = (kind, productLine, msku) => {
  const explicit = cleanText(kind);
  if (/测试盒|试剂盒/.test(explicit)) return '测试盒';
  if (/硬件/.test(explicit)) return '硬件';
  const line = cleanText(productLine).toUpperCase();
  if (['COV', 'FLU', 'RSV'].includes(line)) return '测试盒';
  const sku = cleanText(msku).toUpperCase();
  if (/^(?:COV|CFR|FLU|RSV)(?:-|$)/.test(sku)) return '测试盒';
  if (line || sku) return '硬件';
  return '';
};

function parsePm(values) {
  const headers = (values[0] || []).map((value) => cleanText(value).replace(/[\s（）()_\-&]/g, '').toLowerCase());
  const column = (aliases, fallback) => {
    for (const alias of aliases) {
      const normalized = cleanText(alias).replace(/[\s（）()_\-&]/g, '').toLowerCase();
      const index = headers.indexOf(normalized);
      if (index >= 0) return index;
    }
    return fallback;
  };
  const columns = {
    year: column(['年份', '年度'], 0),
    month: column(['月份', '年月'], 1),
    quarter: column(['季度'], 2),
    msku: column(['MSKU', 'SKU'], 3),
    asin: column(['ASIN'], 4),
    units: column(['销量'], 5),
    sales: column(['销售额'], 6),
    adSpend: column(['广告费', '广告花费'], 11),
    refundQty: column(['退款数量'], 16),
    refundRate: column(['退款率'], 17),
    returnFee: column(['退货处理费'], 18),
    payout: column(['总回款', '净回款'], 19),
    cost: column(['总成本'], 23),
    profit: column(['利润'], 24),
    netSales: column(['净销售额'], 29),
    productLine: column(['产品线'], 30),
    owner: column(['归属'], 31),
    newOld: column(['新老品'], 32),
    totalTest: column(['总Test数', '总测试数'], 34),
    kind: column(['分类4', '业务线', '产品类型', '硬件测试盒'], 38),
  };
  return values.slice(1).map((row, index) => ({
    sourceRow: index + 2,
    year: Number(unwrapCell(cell(row, columns.year))),
    monthText: cleanText(cell(row, columns.month)),
    month: monthOf(cell(row, columns.month)),
    quarter: cleanText(cell(row, columns.quarter)),
    msku: cleanText(cell(row, columns.msku)),
    asin: cleanText(cell(row, columns.asin)),
    units: numberValue(cell(row, columns.units)),
    sales: numberValue(cell(row, columns.sales)),
    adSpend: Math.abs(numberValue(cell(row, columns.adSpend))),
    refundQty: numberValue(cell(row, columns.refundQty)),
    refundRate: numberValue(cell(row, columns.refundRate)),
    returnFee: numberValue(cell(row, columns.returnFee)),
    payout: numberValue(cell(row, columns.payout)),
    cost: numberValue(cell(row, columns.cost)),
    profit: numberValue(cell(row, columns.profit)),
    netSales: numberValue(cell(row, columns.netSales)),
    productLine: cleanText(cell(row, columns.productLine)),
    owner: cleanText(cell(row, columns.owner)),
    newOld: cleanText(cell(row, columns.newOld)),
    totalTest: numberValue(cell(row, columns.totalTest)),
    kind: cleanText(cell(row, columns.kind)),
  })).map((row) => ({ ...row, kind: classifyKind(row.kind, row.productLine, row.msku) })).filter((row) => [2025, 2026].includes(row.year) && row.msku && row.month >= 1 && row.month <= 9);
}

function buildOverview(rows) {
  const ytd = (year) => rows.filter((row) => row.year === year && ['Q1', 'Q2', 'Q3'].includes(row.quarter));
  const annual = { 2025: aggregate(ytd(2025)), 2026: aggregate(ytd(2026)) };
  const yoy = {};
  for (const key of ['units', 'sales', 'payout', 'adSpend']) yoy[key] = change(annual[2026][key], annual[2025][key]);
  const quarters = ['Q1', 'Q2', 'Q3'].map((quarter) => ({ label: `2026${quarter}`, ...aggregate(rows.filter((row) => row.year === 2026 && row.quarter === quarter)) }));
  return { annual, yoy, quarters };
}

function buildTestkit(rows) {
  const testRows = rows.filter((row) => row.kind === '测试盒');
  const ytd = (year) => testRows.filter((row) => row.year === year && ['Q1', 'Q2', 'Q3'].includes(row.quarter));
  const annual = { 2025: aggregate(ytd(2025)), 2026: aggregate(ytd(2026)) };
  const yoy = {};
  for (const key of ['units', 'totalTest', 'sales', 'adSpend', 'payout', 'singleTestPayout']) yoy[key] = change(annual[2026][key], annual[2025][key]);
  const quarters = ['Q1', 'Q2', 'Q3'].map((quarter) => ({ label: `2026${quarter}`, ...aggregate(testRows.filter((row) => row.year === 2026 && row.quarter === quarter)) }));
  const categories = {};
  for (const year of [2025, 2026]) {
    const total = annual[year];
    categories[year] = ['COV', 'FLU', 'RSV'].map((name) => {
      const metrics = aggregate(ytd(year).filter((row) => row.productLine === name));
      return { name, ...metrics, missing: metrics.totalTest === 0, testShare: total.totalTest ? metrics.totalTest / total.totalTest : 0, payoutShare: total.payout ? metrics.payout / total.payout : 0 };
    });
  }
  const months = [];
  for (const year of [2025, 2026]) for (let month = 1; month <= 9; month += 1) {
    months.push({ year, month, label: `${year}年${month}月`, partial: false, ...aggregate(testRows.filter((row) => row.year === year && row.month === month)) });
  }
  return { annual, yoy, quarters, categories, months };
}

function buildHardware(rows, targetValues, returnValues) {
  const hardwareRows = rows.filter((row) => row.kind === '硬件');
  const years = [2025, 2026];
  const hardware = { sourceNote: 'PM_年月数据；数据通过飞书开放平台实时读取', generatedAt: new Date().toISOString() };
  const categoryOf = (row) => row.owner === '550BT' ? '550' : row.owner === 'PT3' ? 'PT3' : '其他';
  hardware.annualCategories = {};
  for (const year of years) {
    const yearRows = hardwareRows.filter((row) => row.year === year);
    const total = aggregate(yearRows);
    hardware.annualCategories[year] = ['550', 'PT3', '其他'].map((name) => {
      const metrics = aggregate(yearRows.filter((row) => categoryOf(row) === name));
      return { ...metrics, name, unitShare: total.units ? metrics.units / total.units : 0, payoutShare: total.payout ? metrics.payout / total.payout : 0 };
    });
  }
  hardware.monthlyTrend = [];
  for (const year of years) for (let month = 1; month <= 9; month += 1) {
    const metrics = aggregate(hardwareRows.filter((row) => row.year === year && row.month === month));
    hardware.monthlyTrend.push({ ...metrics, year, month, singlePayout: metrics.units ? metrics.payout / metrics.units : 0, partial: false });
  }
  const lineDefs = [
    { name: '血压计', match: ['血压计', '血压计配件'] },
    { name: '血糖仪', match: ['血糖仪', '血糖配件'] },
    { name: '温度计', match: ['温度计'] },
    { name: '验孕棒', match: ['验孕棒'] },
    { name: '体脂秤', match: ['体脂秤'] },
    { name: '血氧仪', match: ['血氧仪'] },
  ];
  hardware.productLines = {};
  for (const year of years) hardware.productLines[year] = lineDefs.map((definition) => ({ name: definition.name, ...aggregate(hardwareRows.filter((row) => row.year === year && definition.match.includes(row.productLine))) }));
  hardware.productLineYoy = {};
  for (const definition of lineDefs) {
    const current = hardware.productLines[2026].find((item) => item.name === definition.name);
    const prior = hardware.productLines[2025].find((item) => item.name === definition.name);
    hardware.productLineYoy[definition.name] = { units: change(current.units, prior.units), payout: change(current.payout, prior.payout), profit: change(current.profit, prior.profit) };
  }
  const skuKeys = [...new Set(hardwareRows.map((row) => row.msku))].filter(Boolean);
  const lineKeys = [...new Set(hardwareRows.map((row) => row.productLine))].filter(Boolean).sort((a, b) => a.localeCompare(b, 'zh-CN'));
  hardware.skuAnnual = [];
  for (const productLine of lineKeys) {
    const lineRows = hardwareRows.filter((row) => row.productLine === productLine);
    const totals = {};
    for (const year of years) {
      const metrics = aggregate(lineRows.filter((row) => row.year === year));
      totals[year] = { ...metrics, singlePayout: metrics.units ? metrics.payout / metrics.units : 0, grossMargin: metrics.sales ? metrics.profit / metrics.sales : 0 };
    }
    const skus = [...new Set(lineRows.map((row) => row.msku))].filter(Boolean).map((msku) => {
      const output = { msku, productLine, asin: [...new Set(lineRows.filter((row) => row.msku === msku).map((row) => row.asin).filter(Boolean))].join(' / '), years: {} };
      for (const year of years) {
        const metrics = aggregate(lineRows.filter((row) => row.msku === msku && row.year === year));
        output.years[year] = { ...metrics, singlePayout: metrics.units ? metrics.payout / metrics.units : 0, grossMargin: metrics.sales ? metrics.profit / metrics.sales : 0 };
      }
      output.unitsYoy = change(output.years[2026].units, output.years[2025].units);
      return output;
    }).filter((item) => item.years[2025].units || item.years[2026].units).sort((a, b) => b.years[2026].units - a.years[2026].units);
    hardware.skuAnnual.push({ productLine, totals, unitsYoy: change(totals[2026].units, totals[2025].units), skus });
  }
  const all2026 = aggregate(hardwareRows.filter((row) => row.year === 2026));
  const ranked = skuKeys.map((msku) => ({ msku, ...aggregate(hardwareRows.filter((row) => row.year === 2026 && row.msku === msku)) })).filter((item) => item.units >= 1000).sort((a, b) => b.units - a.units);
  let cumulative = 0;
  const focusNames = [];
  for (const item of ranked) {
    if (all2026.units && cumulative / all2026.units >= 0.8) break;
    focusNames.push(item.msku);
    cumulative += item.units;
  }
  hardware.focusCoverage = { units: cumulative, totalUnits: all2026.units, share: all2026.units ? cumulative / all2026.units : 0, threshold: 0.8, minUnits: 1000 };
  const yearAdTotal = Object.fromEntries(years.map((year) => [year, aggregate(hardwareRows.filter((row) => row.year === year)).adSpend]));
  hardware.focusSkus = focusNames.map((msku) => {
    const skuRows = hardwareRows.filter((row) => row.msku === msku);
    const output = { msku, asin: [...new Set(skuRows.map((row) => row.asin).filter(Boolean))].join(' / '), productLine: skuRows.find((row) => row.productLine)?.productLine || '', years: {} };
    for (const year of years) {
      const metrics = aggregate(skuRows.filter((row) => row.year === year));
      output.years[year] = { ...metrics, actualPrice: metrics.units ? metrics.netSales / metrics.units : 0, cpa: metrics.units ? metrics.adSpend / metrics.units : 0, netAdRatio: metrics.netSales ? metrics.adSpend / metrics.netSales : 0, adShare: yearAdTotal[year] ? metrics.adSpend / yearAdTotal[year] : 0 };
    }
    output.unitsYoy = change(output.years[2026].units, output.years[2025].units);
    return output;
  });
  const returnLineMap = new Map();
  for (const row of returnValues.slice(1)) {
    const line = cleanText(cell(row, 9));
    if (line && cell(row, 10) !== null && cell(row, 10) !== undefined && cell(row, 10) !== '') returnLineMap.set(line, numberValue(cell(row, 10)));
  }
  const returnMap = new Map();
  for (const row of returnValues.slice(2)) {
    const asin = cleanText(cell(row, 0));
    if (!asin) continue;
    returnMap.set(asin, { asin, years: { 2025: { rating: numberValue(cell(row, 1)), refundRate: numberValue(cell(row, 2)), returnRate: numberValue(cell(row, 3)) }, 2026: { rating: numberValue(cell(row, 4)), refundRate: numberValue(cell(row, 5)), returnRate: numberValue(cell(row, 6)) } } });
  }
  const top10Names = new Set(ranked.slice(0, 10).map((item) => item.msku));
  const top10Asins = new Set(hardwareRows.filter((row) => top10Names.has(row.msku)).map((row) => row.asin));
  const hardwareAsins = new Set(hardwareRows.map((row) => row.asin));
  hardware.returns = [...returnMap.values()].filter((item) => hardwareAsins.has(item.asin) && (top10Asins.has(item.asin) || item.years[2026].refundRate - item.years[2025].refundRate > 0.02 || item.years[2026].returnRate - item.years[2025].returnRate > 0.02)).map((item) => {
    const skuRows = hardwareRows.filter((row) => row.asin === item.asin);
    item.msku = [...new Set(skuRows.map((row) => row.msku).filter(Boolean))].join(' / ');
    item.productLine = skuRows.find((row) => row.productLine)?.productLine || '';
    for (const year of years) item.years[year].returnFee = aggregate(skuRows.filter((row) => row.year === year)).returnFee;
    item.amazon360 = returnLineMap.get(item.productLine) || 0;
    item.refundRise = item.years[2026].refundRate - item.years[2025].refundRate;
    item.returnRise = item.years[2026].returnRate - item.years[2025].returnRate;
    item.materialAlert = item.refundRise > 0.02 || item.returnRise > 0.02;
    item.alert = item.refundRise > 0 || item.returnRise > 0;
    return item;
  }).sort((a, b) => Number(b.materialAlert) - Number(a.materialAlert) || Number(b.alert) - Number(a.alert) || b.years[2026].refundRate - a.years[2026].refundRate);
  hardware.returnsMeta = { sheetFound: returnMap.size > 0, rowCount: returnMap.size, note: returnMap.size ? '退货率、退款率、评分和360天平均退货率来自“退货-汇报用”；退货处理费来自PM_年月数据。' : '缺少“退货-汇报用”数据' };
  const targetGroups = ['550', 'FBAPT3', 'HX-4N6X-2IWV', '其他硬件'];
  const targetGroup = (sku) => sku === '550BT' ? '550' : sku === 'FBAPT3' ? 'FBAPT3' : sku === 'HX-4N6X-2IWV' ? 'HX-4N6X-2IWV' : '其他硬件';
  const targets = targetValues.slice(1).map((row) => ({ msku: cleanText(cell(row, 0)), month: monthOf(cell(row, 1)), units: numberValue(cell(row, 4)), sales: numberValue(cell(row, 8)), adSpend: numberValue(cell(row, 14)), payout: numberValue(cell(row, 19)), profit: numberValue(cell(row, 24)) })).filter((row) => row.msku && row.month >= 1 && row.month <= 9);
  hardware.targetAttainment = targetGroups.map((name) => {
    const target2026 = aggregate(targets.filter((row) => targetGroup(row.msku) === name));
    const actual2025 = aggregate(hardwareRows.filter((row) => row.year === 2025 && targetGroup(row.msku) === name));
    const actual2026 = aggregate(hardwareRows.filter((row) => row.year === 2026 && targetGroup(row.msku) === name));
    const attainment = {};
    for (const key of ['units', 'sales', 'adSpend', 'payout', 'profit']) attainment[key] = target2026[key] ? actual2026[key] / target2026[key] : null;
    return { name, target2026, actual2025, actual2026, attainment };
  });
  hardware.targetMeta = { target2026Found: targets.length > 0, target2025Found: false, note: '2026年目标来自“硬件_2026年目标数据”；未提供2025年目标，因此2025年仅展示实际值。' };
  return hardware;
}

function chinaDate() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function buildReport(baseline, sheets) {
  const report = clone(baseline);
  const rows = parsePm(sheets.pm || []);
  if (rows.length < 100) throw new Error(`PM_年月数据有效记录过少：${rows.length}`);
  const hardwareRowCount = rows.filter((row) => row.kind === '硬件').length;
  const testkitRowCount = rows.filter((row) => row.kind === '测试盒').length;
  const unclassifiedRowCount = rows.length - hardwareRowCount - testkitRowCount;
  if (!hardwareRowCount || !testkitRowCount) {
    throw new Error(`PM_年月数据分类识别失败：硬件 ${hardwareRowCount} 行，测试盒 ${testkitRowCount} 行，未分类 ${unclassifiedRowCount} 行。请检查“分类4/业务线”列。`);
  }
  const overview = buildOverview(rows);
  const testkit = buildTestkit(rows);
  const hardware = buildHardware(rows, sheets.targets || [], sheets.returns || []);
  report.reportExtensions = { overall: overview, testkit, hardware };
  const q3 = (year) => aggregate(rows.filter((row) => row.year === year && row.quarter === 'Q3'));
  report.summary = report.summary || {};
  report.summary['2025Q3'] = q3(2025);
  report.summary['2026Q3'] = q3(2026);
  const comparison = {};
  for (const key of ['units', 'sales', 'netSales', 'payout', 'cost', 'profit', 'adSpend', 'refundQty', 'grossMargin', 'adRatio', 'refundRate', 'avgPrice']) {
    const actual = report.summary['2026Q3'][key];
    const prior = report.summary['2025Q3'][key];
    comparison[key] = { actual, prior, growth: prior ? actual / prior - 1 : 0 };
    if (['grossMargin', 'adRatio', 'refundRate'].includes(key)) comparison[key].delta = actual - prior;
  }
  report.summary.comparison2025 = comparison;
  report.months = [7, 8, 9].map((month) => {
    const actual = aggregate(rows.filter((row) => row.year === 2026 && row.month === month));
    const prior = aggregate(rows.filter((row) => row.year === 2025 && row.month === month));
    return { month: `2026年${month}月份`, label: String(month), actual, prior, growth: { units: change(actual.units, prior.units) || 0, sales: change(actual.sales, prior.sales) || 0, profit: change(actual.profit, prior.profit) || 0, adSpend: change(actual.adSpend, prior.adSpend) || 0 } };
  });
  report.lines = report.lines || {};
  for (const [key, kind] of [['hardware', '硬件'], ['testkit', '测试盒']]) {
    const actual = aggregate(rows.filter((row) => row.year === 2026 && row.quarter === 'Q3' && row.kind === kind));
    const prior = aggregate(rows.filter((row) => row.year === 2025 && row.quarter === 'Q3' && row.kind === kind));
    report.lines[key] = { ...(report.lines[key] || {}), type: kind, actual, prior, months: [7, 8, 9].map((month) => ({ label: `${month}月`, ...aggregate(rows.filter((row) => row.year === 2026 && row.quarter === 'Q3' && row.month === month && row.kind === kind)) })) };
  }
  const oldNames = report.productNamesByAsin || {};
  const productNamesByAsin = {};
  for (const row of (sheets.products || []).slice(1)) {
    const asin = cleanText(cell(row, 0));
    const name = cleanText(cell(row, 13));
    if (!asin || !name) continue;
    productNamesByAsin[asin] = { ...(oldNames[asin] || {}), name, title: oldNames[asin]?.title || '', source: '飞书「所有产品对应表」产品名称', mappingKey: asin };
  }
  report.productNamesByAsin = productNamesByAsin;
  report.productNameSource = '飞书「所有产品对应表」';
  const max2026Month = Math.max(...rows.filter((row) => row.year === 2026).map((row) => row.month), 0);
  report.rawCounts = { ...(report.rawCounts || {}), q3Rows: rows.filter((row) => row.year === 2026 && row.quarter === 'Q3').length, q26Rows: rows.filter((row) => row.year === 2026).length, q25Rows: rows.filter((row) => row.year === 2025).length, q26Msku: new Set(rows.filter((row) => row.year === 2026).map((row) => row.msku)).size, hardwareRows: hardwareRowCount, testkitRows: testkitRowCount, unclassifiedRows: unclassifiedRowCount };
  report.meta = { ...(report.meta || {}), dataThrough: `2026年${max2026Month || 9}月`, generatedOn: chinaDate(), refreshedAt: new Date().toISOString(), refreshSource: 'Feishu Open Platform API', note: '硬件与测试盒分为两条业务线独立汇报；硬件目标读取自「硬件_2026年目标数据」。' };
  report.missing = { ...(report.missing || {}), sep28_30: max2026Month < 9 };
  return report;
}
