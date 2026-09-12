import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateMetrics,
  attachEfficiencyIndexes,
  metricsOf,
  totalCost
} from '../src/metrics.js';

function record(overrides = {}) {
  return {
    id: overrides.id || 'r1',
    platform: overrides.platform || '小红书',
    recordType: overrides.recordType || 'creator',
    fees: { quote: 1000, adSpend: 200, sampleCost: 100, serviceCost: 0, ...overrides.fees },
    metrics: {
      impressions: 10000, views: 8000, likes: 500, favorites: 200,
      comments: 50, shares: 50, follows: 30, clicks: 200,
      orders: 10, revenue: 5000, grossProfit: 2400,
      ...overrides.metrics
    }
  };
}

test('总成本包含报价、广告费、样品成本和服务费', () => {
  assert.equal(totalCost(record()), 1300);
});

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
  const result = metricsOf(record({
    fees: { quote: 0, adSpend: 0, sampleCost: 0, serviceCost: 0 },
    metrics: { impressions: 0, views: 0, clicks: 0, likes: 0, favorites: 0, comments: 0, shares: 0, orders: 0, revenue: 0, grossProfit: 0 }
  }));
  assert.equal(result.cpm, null);
  assert.equal(result.cpe, null);
  assert.equal(result.ctr, null);
  assert.equal(result.cpa, null);
  assert.equal(result.roas, null);
  assert.equal(result.roi, null);
});

test('聚合指标使用总成本和总结果，而不是平均单条 ROI', () => {
  const first = record({ id: 'a' });
  const second = record({
    id: 'b',
    fees: { quote: 500, adSpend: 0, sampleCost: 0, serviceCost: 0 },
    metrics: { impressions: 5000, views: 4000, likes: 100, favorites: 50, comments: 20, shares: 30, clicks: 100, orders: 4, revenue: 1800, grossProfit: 800 }
  });
  const aggregate = aggregateMetrics([first, second]);
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