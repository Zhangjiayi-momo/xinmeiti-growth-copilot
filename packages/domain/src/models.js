export const DATABASE_VERSION = 1;
export const RECORD_TYPES = ['content', 'creator'];
export const SUPPORTED_PLATFORMS = ['抖音', '小红书', 'B站', '公众号/视频号'];
export const OBJECTIVES = ['内容互动', '涨粉', '种草', '线索获取', '成交转化', '品牌曝光'];
export const REVIEW_ACTIONS = ['待复盘', '继续投放', '暂停', '优化素材', '更换达人', '延长观察'];

export function createId(prefix = 'id') {
  const random = globalThis.crypto?.randomUUID?.().slice(0, 8)
    || Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}_${random}`;
}

export function toNonNegativeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

export function createEmptyCampaign(overrides = {}) {
  const generatedId = createId('campaign');
  return {
    id: generatedId,
    name: '',
    brand: '',
    product: '',
    objective: '内容互动',
    audience: '',
    platforms: [],
    budget: 0,
    startDate: '',
    endDate: '',
    owner: '',
    notes: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
    id: overrides.id || generatedId
  };
}

export function createEmptyRecord(campaignId = '', overrides = {}) {
  const generatedId = createId('record');
  return {
    id: generatedId,
    campaignId,
    recordType: 'content',
    name: '',
    platform: '抖音',
    creatorName: '',
    followers: 0,
    url: '',
    publishedAt: new Date().toISOString().slice(0, 10),
    fees: {
      quote: 0,
      adSpend: 0,
      sampleCost: 0,
      serviceCost: 0
    },
    metrics: {
      impressions: 0,
      views: 0,
      likes: 0,
      favorites: 0,
      comments: 0,
      shares: 0,
      follows: 0,
      clicks: 0,
      orders: 0,
      revenue: 0,
      grossProfit: 0
    },
    review: {
      action: '待复盘',
      note: '',
      owner: '',
      dueAt: ''
    },
    source: 'manual',
    capturedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
    id: overrides.id || generatedId
  };
}

export function normalizeCampaign(input = {}) {
  const campaign = createEmptyCampaign(input);
  return {
    ...campaign,
    budget: toNonNegativeNumber(campaign.budget),
    platforms: Array.isArray(campaign.platforms) ? [...new Set(campaign.platforms.filter(Boolean))] : [],
    updatedAt: new Date().toISOString()
  };
}

export function normalizeRecord(input = {}, fallbackCampaignId = '') {
  const record = createEmptyRecord(input.campaignId || fallbackCampaignId, input);
  return {
    ...record,
    campaignId: record.campaignId || fallbackCampaignId,
    followers: toNonNegativeNumber(record.followers),
    fees: {
      quote: toNonNegativeNumber(record.fees?.quote),
      adSpend: toNonNegativeNumber(record.fees?.adSpend),
      sampleCost: toNonNegativeNumber(record.fees?.sampleCost),
      serviceCost: toNonNegativeNumber(record.fees?.serviceCost)
    },
    metrics: {
      impressions: toNonNegativeNumber(record.metrics?.impressions),
      views: toNonNegativeNumber(record.metrics?.views),
      likes: toNonNegativeNumber(record.metrics?.likes),
      favorites: toNonNegativeNumber(record.metrics?.favorites),
      comments: toNonNegativeNumber(record.metrics?.comments),
      shares: toNonNegativeNumber(record.metrics?.shares),
      follows: toNonNegativeNumber(record.metrics?.follows),
      clicks: toNonNegativeNumber(record.metrics?.clicks),
      orders: toNonNegativeNumber(record.metrics?.orders),
      revenue: toNonNegativeNumber(record.metrics?.revenue),
      grossProfit: toNonNegativeNumber(record.metrics?.grossProfit)
    },
    updatedAt: new Date().toISOString()
  };
}

export function validateCampaign(campaign) {
  const errors = [];
  if (!String(campaign?.name || '').trim()) errors.push('请填写战役名称');
  if (!String(campaign?.brand || '').trim()) errors.push('请填写品牌名称');
  if (!String(campaign?.product || '').trim()) errors.push('请填写产品或服务');
  if (!Array.isArray(campaign?.platforms) || campaign.platforms.length === 0) errors.push('请至少选择一个平台');
  if (toNonNegativeNumber(campaign?.budget) <= 0) errors.push('预算必须大于 0');
  if (campaign?.startDate && campaign?.endDate && campaign.startDate > campaign.endDate) {
    errors.push('结束日期不能早于开始日期');
  }
  return errors;
}

export function validateRecord(record) {
  const errors = [];
  if (!String(record?.campaignId || '').trim()) errors.push('请选择所属战役');
  if (!String(record?.name || '').trim()) errors.push('请填写内容或合作名称');
  if (!SUPPORTED_PLATFORMS.includes(record?.platform)) errors.push('请选择有效平台');
  if (!RECORD_TYPES.includes(record?.recordType)) errors.push('记录类型无效');
  if (record?.recordType === 'creator' && !String(record?.creatorName || '').trim()) {
    errors.push('达人合作记录需要填写达人昵称');
  }
  if (record?.recordType === 'creator' && toNonNegativeNumber(record?.fees?.quote) <= 0) {
    errors.push('达人合作报价必须大于 0');
  }
  return errors;
}

export function normalizeDatabase(input) {
  const source = input && typeof input === 'object' ? input : {};
  const campaigns = Array.isArray(source.campaigns)
    ? source.campaigns.map((campaign) => normalizeCampaign(campaign))
    : [];
  const campaignIds = new Set(campaigns.map((campaign) => campaign.id));
  const records = Array.isArray(source.records)
    ? source.records
      .filter((record) => campaignIds.has(record.campaignId))
      .map((record) => normalizeRecord(record, record.campaignId))
    : [];

  return {
    version: DATABASE_VERSION,
    campaigns,
    records,
    activeCampaignId: source.activeCampaignId || campaigns[0]?.id || '',
    updatedAt: new Date().toISOString()
  };
}