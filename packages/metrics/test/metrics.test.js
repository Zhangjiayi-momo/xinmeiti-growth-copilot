import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateMetrics,
  attachEfficiencyIndexes,
  buildRecommendation,
  detectAnomalies,
  metricsOf,
  snapshotTrend,
  totalCost
} from '../src/metrics.js';

function record(overrides = {}) {
  return {
    id: overrides.id || 'r1', platform: overrides.platform || '小红书', recordType: overrides.recordType || 'creator', capturedAt: overrides.capturedAt,
    fees: { quote: 1000, adSpend: 200, sampleCost: 100, serviceCost: 0, ...overrides.fees },
    metrics: { impressions: 10000, views: 8000, likes: 500, favorites: 200, comments: 50, shares: 50, follows: 30, clicks: 200, orders: 10, revenue: 5000, grossProfit: 2400, ...overrides.metrics }
  };
}

test('总成本包含报价、广告费、样品成本和服务费', () => assert.equal(totalCost(record()), 1300));

test('计算互动、成本与转化指标', () => {
  const result = metricsOf(record());
  assert.equal(result.interaction, 800);
  assert.equal(result.interactionRate, 0.1);
  assert.equal(result.cpm, 130);
  assert.equal(result.cpe, 1.625);
  assert.equal(result.ctr, 0.02);
  assert.equal(result.cvr, 0.05);
  assert.equal(result.cpa, 130);
  assert.equal(result.roas, 5000 / 1300);
  assert.equal(result.roi, (2400 - 1300) / 1300);
});

test('分母为零时返回 null，不产生 Infinity 或 NaN', () => {
  const result = metricsOf(record({ fees: { quote: 0, adSpend: 0, sampleCost: 0, serviceCost: 0 }, metrics: { impressions: 0, views: 0, clicks: 0, likes: 0, favorites: 0, comments: 0, shares: 0, orders: 0, revenue: 0, grossProfit: 0 } }));
  assert.equal(result.cpm, null);
  assert.equal(result.cpe, null);
  assert.equal(result.ctr, null);
  assert.equal(result.cpa, null);
  assert.equal(result.roas, null);
  assert.equal(result.roi, null);
});

test('聚合指标使用总成本和总结果', () => {
  const aggregate = aggregateMetrics([record({ id: 'a' }), record({ id: 'b', fees: { quote: 500, adSpend: 0, sampleCost: 0, serviceCost: 0 }, metrics: { impressions: 5000, views: 4000, likes: 100, favorites: 50, comments: 20, shares: 30, clicks: 100, orders: 4, revenue: 1800, grossProfit: 800 } })]);
  assert.equal(aggregate.totalSpend, 1800);
  assert.equal(aggregate.orders, 14);
  assert.equal(aggregate.roas, 6800 / 1800);
  assert.equal(aggregate.roi, (3200 - 1800) / 1800);
});

test('效率指数只在同平台同记录类型内比较', () => {
  const top = record({ id: 'top', metrics: { impressions: 10000, views: 10000, likes: 1000, favorites: 300, comments: 100, shares: 100 } });
  const bottom = record({ id: 'bottom', metrics: { impressions: 10000, views: 10000, likes: 100, favorites: 20, comments: 10, shares: 10 } });
  const otherPlatform = record({ id: 'other', platform: '抖音', metrics: { impressions: 10000, views: 10000, likes: 1000, favorites: 300, comments: 100, shares: 100 } });
  const result = attachEfficiencyIndexes([top, bottom, otherPlatform]);
  const topResult = result.find((item) => item.id === 'top');
  const bottomResult = result.find((item) => item.id === 'bottom');
  assert.equal(topResult.computed.cohortSize, 2);
  assert.equal(bottomResult.computed.cohortSize, 2);
  assert.ok(topResult.computed.efficiencyIndex > bottomResult.computed.efficiencyIndex);
  assert.equal(result.find((item) => item.id === 'other').computed.cohortSize, 1);
});

test('快照趋势能够计算首尾变化', () => {
  const current = record();
  const trend = snapshotTrend(current, [
    { id: 's1', recordId: current.id, capturedAt: '2026-09-01T00:00:00Z', metrics: { views: 1000, likes: 10, orders: 1, revenue: 100 } },
    { id: 's2', recordId: current.id, capturedAt: '2026-09-07T00:00:00Z', metrics: { views: 3000, likes: 50, orders: 3, revenue: 500 } }
  ]);
  assert.equal(trend.snapshotCount, 2);
  assert.equal(trend.changes.views, 2);
  assert.equal(trend.changes.interactions, 4);
});

test('系统建议在样本不足时明确提示低置信度', () => {
  const result = buildRecommendation(record(), [record()], '成交转化');
  assert.equal(result.action, '延长观察');
  assert.equal(result.confidence, 'low');
});

test('系统建议会识别高 ROAS 表现', () => {
  const strong = record({ id: 'strong' });
  const weak = record({ id: 'weak', fees: { quote: 5000, adSpend: 0, sampleCost: 0, serviceCost: 0 }, metrics: { impressions: 10000, views: 8000, likes: 100, favorites: 20, comments: 10, shares: 10, clicks: 200, orders: 2, revenue: 5000, grossProfit: 1000 } });
  const result = buildRecommendation(strong, [strong, weak], '成交转化');
  assert.equal(result.action, '继续投放');
  assert.equal(result.confidence, 'medium');
});
test('异常检测能够发现 CPE 和转化异常', () => {
  const good = record({ id: 'good', fees: { quote: 500, adSpend: 0, sampleCost: 0, serviceCost: 0 }, metrics: { impressions: 10000, views: 8000, likes: 500, favorites: 200, comments: 50, shares: 50, clicks: 50, orders: 10, revenue: 5000, grossProfit: 2400 } });
  const bad = record({ id: 'bad', fees: { quote: 5000, adSpend: 0, sampleCost: 0, serviceCost: 0 }, metrics: { impressions: 10000, views: 8000, likes: 50, favorites: 10, comments: 5, shares: 5, clicks: 500, orders: 1, revenue: 500, grossProfit: 100 }, capturedAt: new Date().toISOString() });
  const result = detectAnomalies(bad, [{ id: 's1', recordId: 'bad', capturedAt: new Date().toISOString(), metrics: bad.metrics }], [good, bad], '成交转化');
  assert.ok(result.some((item) => item.code === 'CPE_SPIKE'));
  assert.ok(result.some((item) => item.code === 'MISSING_CONVERSION') === false);
  assert.ok(result.some((item) => item.level === 'high'));
});

test('异常检测能够发现缺少快照和过期数据', () => {
  const stale = record({ id: 'stale', capturedAt: '2026-01-01T00:00:00.000Z' });
  const result = detectAnomalies(stale, [], [stale], '内容互动');
  assert.ok(result.some((item) => item.code === 'NO_SNAPSHOT'));
  assert.ok(result.some((item) => item.code === 'STALE_DATA'));
});