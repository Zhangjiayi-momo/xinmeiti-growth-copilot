const DB_KEY = 'xinmeiti_growth_copilot_miniapp_v1';
function id(prefix) { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`; }
function emptyRecord(overrides = {}) {
  return Object.assign({
    id: id('record'), campaignId: 'campaign_default', name: '', platform: '抖音', recordType: 'content',
    creatorName: '', followers: 0, publishedAt: new Date().toISOString().slice(0, 10),
    fees: { quote: 0, adSpend: 0, sampleCost: 0, serviceCost: 0 },
    metrics: { impressions: 0, views: 0, likes: 0, favorites: 0, comments: 0, shares: 0, follows: 0, clicks: 0, orders: 0, revenue: 0, grossProfit: 0 },
    review: { action: '待复盘', note: '' }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
  }, overrides);
}
function demoDatabase() {
  return { version: 1, campaigns: [{ id: 'campaign_default', name: '默认运营战役', objective: '内容互动', budget: 30000 }], records: [
    emptyRecord({ id: 'demo_1', name: '敏感肌换季急救实测', platform: '抖音', recordType: 'creator', creatorName: '美妆小课堂Amy', fees: { quote: 5000, adSpend: 1000, sampleCost: 300, serviceCost: 0 }, metrics: { impressions: 120000, views: 98000, likes: 5200, favorites: 980, comments: 320, shares: 480, follows: 420, clicks: 2100, orders: 68, revenue: 20400, grossProfit: 7000 } }),
    emptyRecord({ id: 'demo_2', name: '反精致护肤清单', platform: '小红书', fees: { adSpend: 800, sampleCost: 120, serviceCost: 0 }, metrics: { impressions: 65000, views: 48000, likes: 2800, favorites: 1900, comments: 160, shares: 310, follows: 290, clicks: 820, orders: 21, revenue: 6300, grossProfit: 1900 } })
  ] };
}
function ensureSeedData() { if (!wx.getStorageSync(DB_KEY)) wx.setStorageSync(DB_KEY, demoDatabase()); }
function getDatabase() { ensureSeedData(); return wx.getStorageSync(DB_KEY) || demoDatabase(); }
function saveDatabase(db) { db.updatedAt = new Date().toISOString(); wx.setStorageSync(DB_KEY, db); return db; }
function listRecords() { return getDatabase().records || []; }
function getRecord(recordId) { return listRecords().find((item) => item.id === recordId); }
function upsertRecord(input) {
  const db = getDatabase(); const record = emptyRecord(Object.assign({}, input, { id: input.id || id('record'), updatedAt: new Date().toISOString() }));
  const index = db.records.findIndex((item) => item.id === record.id);
  if (index >= 0) db.records[index] = record; else db.records.unshift(record);
  saveDatabase(db); return record;
}
function deleteRecord(recordId) { const db = getDatabase(); db.records = db.records.filter((item) => item.id !== recordId); saveDatabase(db); }
module.exports = { DB_KEY, ensureSeedData, getDatabase, demoDatabase, listRecords, getRecord, upsertRecord, deleteRecord, emptyRecord };