const test = require('node:test');
const assert = require('node:assert/strict');

const storage = new Map();
global.wx = {
  getStorageSync(key) { return storage.get(key); },
  setStorageSync(key, value) { storage.set(key, value); }
};

const store = require('../utils/store');
const { metricsOf, aggregate } = require('../utils/metrics');

test('小程序首次启动会生成演示数据', () => {
  storage.clear();
  store.ensureSeedData();
  const database = store.getDatabase();
  assert.equal(database.campaigns.length, 1);
  assert.equal(database.records.length, 2);
});

test('小程序记录可以新增、编辑和删除', () => {
  storage.clear();
  store.ensureSeedData();
  const created = store.upsertRecord(store.emptyRecord({ name: '测试记录', platform: '抖音', metrics: { views: 1000, likes: 50 } }));
  assert.ok(store.getRecord(created.id));
  store.upsertRecord(Object.assign({}, created, { name: '更新后的记录' }));
  assert.equal(store.getRecord(created.id).name, '更新后的记录');
  store.deleteRecord(created.id);
  assert.equal(store.getRecord(created.id), undefined);
});

test('小程序指标公式与 Web 口径保持一致', () => {
  const record = store.emptyRecord({
    fees: { quote: 1000, adSpend: 200, sampleCost: 100, serviceCost: 0 },
    metrics: { impressions: 10000, views: 8000, likes: 500, favorites: 200, comments: 50, shares: 50, clicks: 200, orders: 10, revenue: 5000, grossProfit: 2400 }
  });
  const result = metricsOf(record);
  assert.equal(result.cost, 1300);
  assert.equal(result.interaction, 800);
  assert.equal(result.cpe, 1.625);
  assert.equal(result.roas, 5000 / 1300);
  assert.equal(aggregate([record]).orders, 10);
});