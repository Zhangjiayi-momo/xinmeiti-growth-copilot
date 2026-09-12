export const DATABASE_VERSION = 2;
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

export function normalizeMetrics(input = {}) {
  return {
    impressions: toNonNegativeNumber(input.impressions),
    views: toNonNegativeNumber(input.views),
    likes: toNonNegativeNumber(input.likes),
    favorites: toNonNegativeNumber(input.favorites),
    comments: toNonNegativeNumber(input.comments),
    shares: toNonNegativeNumber(input.shares),
    follows: toNonNegativeNumber(input.follows),
    clicks: toNonNegativeNumber(input.clicks),
    orders: toNonNegativeNumber(input.orders),
    revenue: toNonNegativeNumber(input.revenue),
    grossProfit: toNonNegativeNumber(input.grossProfit)
  };
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
    metrics: normalizeMetrics(overrides.metrics),
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
    id: overrides.id || generatedId,
    metrics: normalizeMetrics(overrides.metrics),
    fees: {
      quote: toNonNegativeNumber(overrides.fees?.quote),
      adSpend: toNonNegativeNumber(overrides.fees?.adSpend),
      sampleCost: toNonNegativeNumber(overrides.fees?.sampleCost),
      serviceCost: toNonNegativeNumber(overrides.fees?.serviceCost)
    },
    review: {
      action: overrides.review?.action || '待复盘',
      note: overrides.review?.note || '',
      owner: overrides.review?.owner || '',
      dueAt: overrides.review?.dueAt || ''
    }
  };
}

export function createEmptySnapshot(recordId = '', overrides = {}) {
  const generatedId = createId('snapshot');
  return {
    id: generatedId,
    recordId,
    label: '当前数据',
    capturedAt: new Date().toISOString(),
    metrics: normalizeMetrics(overrides.metrics),
    createdAt: new Date().toISOString(),
    ...overrides,
    id: overrides.id || generatedId,
    recordId: overrides.recordId || recordId,
    metrics: normalizeMetrics(overrides.metrics)
  };
}

export function normalizeCampaign(input = {}) {
  const campaign = createEmptyCampaign(input);
  return {
    ...campaign,
    id: campaign.id || createId('campaign'),
    budget: toNonNegativeNumber(campaign.budget),
    platforms: Array.isArray(campaign.platforms) ? [...new Set(campaign.platforms.filter(Boolean))] : [],
    updatedAt: new Date().toISOString()
  };
}

export function normalizeRecord(input = {}, fallbackCampaignId = '') {
  const record = createEmptyRecord(input.campaignId || fallbackCampaignId, input);
  return {
    ...record,
    id: record.id || createId('record'),
    campaignId: record.campaignId || fallbackCampaignId,
    followers: toNonNegativeNumber(record.followers),
    fees: {
      quote: toNonNegativeNumber(record.fees?.quote),
      adSpend: toNonNegativeNumber(record.fees?.adSpend),
      sampleCost: toNonNegativeNumber(record.fees?.sampleCost),
      serviceCost: toNonNegativeNumber(record.fees?.serviceCost)
    },
    metrics: normalizeMetrics(record.metrics),
    updatedAt: new Date().toISOString()
  };
}

export function normalizeSnapshot(input = {}, fallbackRecordId = '') {
  const snapshot = createEmptySnapshot(input.recordId || fallbackRecordId, input);
  return {
    ...snapshot,
    id: snapshot.id || createId('snapshot'),
    recordId: snapshot.recordId || fallbackRecordId,
    label: String(snapshot.label || '数据快照').trim(),
    capturedAt: snapshot.capturedAt || new Date().toISOString(),
    metrics: normalizeMetrics(snapshot.metrics)
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

export function validateSnapshot(snapshot) {
  const errors = [];
  if (!String(snapshot?.recordId || '').trim()) errors.push('快照缺少所属记录');
  if (!String(snapshot?.capturedAt || '').trim()) errors.push('请选择数据时间');
  if (!String(snapshot?.label || '').trim()) errors.push('请填写快照名称');
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
  const recordIds = new Set(records.map((record) => record.id));

  const snapshotsByKey = new Map();
  const rawSnapshots = Array.isArray(source.snapshots)
    ? source.snapshots
    : records.map((record) => createEmptySnapshot(record.id, {
      label: '初始数据',
      capturedAt: record.capturedAt || record.updatedAt || new Date().toISOString(),
      metrics: record.metrics,
      id: `snapshot_${record.id}_migration`
    }));

  for (const snapshot of rawSnapshots) {
    if (!recordIds.has(snapshot.recordId)) continue;
    const normalized = normalizeSnapshot(snapshot, snapshot.recordId);
    snapshotsByKey.set(`${normalized.recordId}|${normalized.capturedAt}`, normalized);
  }

  for (const record of records) {
    const ownSnapshots = [...snapshotsByKey.values()]
      .filter((snapshot) => snapshot.recordId === record.id)
      .sort((left, right) => new Date(left.capturedAt) - new Date(right.capturedAt));
    if (ownSnapshots.length === 0) {
      const snapshot = createEmptySnapshot(record.id, {
        label: '当前数据',
        capturedAt: record.capturedAt || record.updatedAt || new Date().toISOString(),
        metrics: record.metrics
      });
      snapshotsByKey.set(`${snapshot.recordId}|${snapshot.capturedAt}`, snapshot);
    }
  }

  const snapshots = [...snapshotsByKey.values()]
    .sort((left, right) => new Date(left.capturedAt) - new Date(right.capturedAt));

  const reconciledRecords = records.map((record) => {
    const latest = [...snapshots]
      .filter((snapshot) => snapshot.recordId === record.id)
      .sort((left, right) => new Date(right.capturedAt) - new Date(left.capturedAt))[0];
    return latest ? {
      ...record,
      metrics: latest.metrics,
      capturedAt: latest.capturedAt
    } : record;
  });

  return {
    version: DATABASE_VERSION,
    campaigns,
    records: reconciledRecords,
    snapshots,
    activeCampaignId: source.activeCampaignId || campaigns[0]?.id || '',
    updatedAt: source.updatedAt || new Date().toISOString()
  };
}