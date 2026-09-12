import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createEmptyCampaign,
  createEmptyRecord,
  normalizeDatabase,
  validateCampaign,
  validateRecord
} from '../src/models.js';
import { createDemoDatabase } from '../src/seed.js';

test('战役必填字段校验', () => {
  const campaign = createEmptyCampaign({ name: '', brand: '', product: '', platforms: [], budget: 0 });
  const errors = validateCampaign(campaign);
  assert.ok(errors.includes('请填写战役名称'));
  assert.ok(errors.includes('请填写品牌名称'));
  assert.ok(errors.includes('请至少选择一个平台'));
});

test('达人合作记录要求昵称和报价', () => {
  const record = createEmptyRecord('campaign_1', { name: '测试记录', recordType: 'creator' });
  const errors = validateRecord(record);
  assert.ok(errors.includes('达人合作记录需要填写达人昵称'));
  assert.ok(errors.includes('达人合作报价必须大于 0'));
});

test('数据库规范化会移除所属战役不存在的孤立记录', () => {
  const campaign = createEmptyCampaign({ id: 'campaign_1', name: '测试', brand: '品牌', product: '产品', platforms: ['抖音'], budget: 1000 });
  const valid = createEmptyRecord('campaign_1', { name: '有效记录' });
  const orphan = createEmptyRecord('campaign_missing', { name: '孤立记录' });
  const result = normalizeDatabase({ campaigns: [campaign], records: [valid, orphan] });
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].name, '有效记录');
});

test('演示数据包含两个战役且所有记录都有有效战役', () => {
  const demo = createDemoDatabase();
  assert.equal(demo.campaigns.length, 2);
  assert.ok(demo.records.length >= 8);
  const ids = new Set(demo.campaigns.map((campaign) => campaign.id));
  assert.ok(demo.records.every((record) => ids.has(record.campaignId)));
});
test('传入空 id 时仍会自动生成唯一标识', () => {
  const campaign = createEmptyCampaign({ id: undefined });
  const record = createEmptyRecord('campaign_1', { id: undefined });
  assert.ok(campaign.id.startsWith('campaign_'));
  assert.ok(record.id.startsWith('record_'));
});