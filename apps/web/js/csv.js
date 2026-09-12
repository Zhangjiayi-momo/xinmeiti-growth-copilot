import { normalizeRecord, RECORD_TYPES, validateRecord } from '../../../packages/domain/src/models.js';

const TEMPLATE_HEADERS = [
  '记录名称', '类型', '平台', '投放战役', '达人昵称', '粉丝数', '内容链接', '发布时间',
  '报价', '广告费', '样品成本', '服务费', '曝光量', '阅读/播放量', '点赞', '收藏',
  '评论', '分享', '涨粉', '点击', '订单', '收入', '毛利', '数据采集时间'
];

const HEADER_ALIASES = {
  name: ['记录名称', '内容名称', '合作名称', 'name'],
  recordType: ['类型', '记录类型', 'type', 'recordtype'],
  platform: ['平台', 'platform'],
  campaign: ['投放战役', '战役', 'campaign', 'campaignid'],
  creatorName: ['达人昵称', '达人', '达人名称', 'creatorname'],
  followers: ['粉丝数', '粉丝量', 'followers'],
  url: ['内容链接', '合作链接', '链接', 'url'],
  publishedAt: ['发布时间', '发布日期', 'publishedat'],
  quote: ['报价', '达人报价', 'quote', 'price'],
  adSpend: ['广告费', '投放费', 'adspend'],
  sampleCost: ['样品成本', 'samplecost'],
  serviceCost: ['服务费', 'servicecost'],
  impressions: ['曝光量', '曝光', 'impressions'],
  views: ['阅读/播放量', '阅读量', '播放量', 'views'],
  likes: ['点赞', '点赞数', 'likes'],
  favorites: ['收藏', '收藏数', 'favorites'],
  comments: ['评论', '评论数', 'comments'],
  shares: ['分享', '分享数', 'shares'],
  follows: ['涨粉', '关注', '关注数', 'follows'],
  clicks: ['点击', '点击量', 'clicks'],
  orders: ['订单', '订单数', '转化数', 'orders', 'conversions'],
  revenue: ['收入', '归因收入', 'revenue'],
  grossProfit: ['毛利', '归因毛利', 'grossprofit'],
  capturedAt: ['数据采集时间', '数据时间', 'capturedat']
};

function normalizeHeader(value) {
  return String(value ?? '').replace(/^\uFEFF/, '').trim().toLowerCase().replace(/\s+/g, '');
}

function number(value) {
  const parsed = Number(String(value ?? '').replace(/[¥￥,%]/g, '').trim());
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      field += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      row.push(field);
      field = '';
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(field);
      field = '';
      if (row.some((cell) => String(cell).trim() !== '')) rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }

  row.push(field);
  if (row.some((cell) => String(cell).trim() !== '')) rows.push(row);
  return rows;
}

function headerIndex(headers, aliases) {
  const normalized = headers.map(normalizeHeader);
  for (const alias of aliases) {
    const index = normalized.indexOf(normalizeHeader(alias));
    if (index >= 0) return index;
  }
  return -1;
}

function read(row, indexes, key) {
  const index = indexes[key];
  return index >= 0 ? String(row[index] ?? '').trim() : '';
}

function mapRecordType(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (['达人', '达人合作', 'creator'].includes(normalized)) return 'creator';
  if (['内容', '自营内容', 'content'].includes(normalized)) return 'content';
  return RECORD_TYPES.includes(normalized) ? normalized : 'content';
}

export function parseRecordsCsv(text, campaigns, selectedCampaignId = '') {
  const rows = parseCsv(text);
  if (rows.length < 2) return { records: [], errors: ['CSV 至少需要表头和一行数据'] };

  const headers = rows[0];
  const indexes = Object.fromEntries(
    Object.entries(HEADER_ALIASES).map(([key, aliases]) => [key, headerIndex(headers, aliases)])
  );

  if (indexes.name < 0) return { records: [], errors: ['缺少「记录名称」列'] };
  if (indexes.platform < 0) return { records: [], errors: ['缺少「平台」列'] };

  const campaignByName = new Map(campaigns.map((campaign) => [campaign.name.trim(), campaign.id]));
  const campaignById = new Set(campaigns.map((campaign) => campaign.id));
  const records = [];
  const errors = [];

  rows.slice(1).forEach((row, rowIndex) => {
    const campaignValue = read(row, indexes, 'campaign');
    const campaignId = campaignById.has(campaignValue)
      ? campaignValue
      : campaignByName.get(campaignValue) || selectedCampaignId || campaigns[0]?.id;

    if (!campaignId) {
      errors.push(`第 ${rowIndex + 2} 行：找不到可用的投放战役`);
      return;
    }

    const record = normalizeRecord({
      id: undefined,
      campaignId,
      recordType: mapRecordType(read(row, indexes, 'recordType')),
      name: read(row, indexes, 'name'),
      platform: read(row, indexes, 'platform'),
      creatorName: read(row, indexes, 'creatorName'),
      followers: number(read(row, indexes, 'followers')),
      url: read(row, indexes, 'url'),
      publishedAt: read(row, indexes, 'publishedAt'),
      fees: {
        quote: number(read(row, indexes, 'quote')),
        adSpend: number(read(row, indexes, 'adSpend')),
        sampleCost: number(read(row, indexes, 'sampleCost')),
        serviceCost: number(read(row, indexes, 'serviceCost'))
      },
      metrics: {
        impressions: number(read(row, indexes, 'impressions')),
        views: number(read(row, indexes, 'views')),
        likes: number(read(row, indexes, 'likes')),
        favorites: number(read(row, indexes, 'favorites')),
        comments: number(read(row, indexes, 'comments')),
        shares: number(read(row, indexes, 'shares')),
        follows: number(read(row, indexes, 'follows')),
        clicks: number(read(row, indexes, 'clicks')),
        orders: number(read(row, indexes, 'orders')),
        revenue: number(read(row, indexes, 'revenue')),
        grossProfit: number(read(row, indexes, 'grossProfit'))
      },
      source: 'csv',
      capturedAt: read(row, indexes, 'capturedAt') || new Date().toISOString()
    }, campaignId);
    const validationErrors = validateRecord(record);
    if (validationErrors.length) {
      errors.push(`第 ${rowIndex + 2} 行：${validationErrors[0]}`);
      return;
    }
    records.push(record);
  });

  return { records, errors };
}

function csvCell(value) {
  let text = String(value ?? '');
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
export function recordsToCsv(records, campaigns) {
  const campaignName = new Map(campaigns.map((campaign) => [campaign.id, campaign.name]));
  const rows = records.map((record) => [
    record.name,
    record.recordType === 'creator' ? '达人' : '内容',
    record.platform,
    campaignName.get(record.campaignId) || '',
    record.creatorName || '',
    record.followers || 0,
    record.url || '',
    record.publishedAt || '',
    record.fees?.quote || 0,
    record.fees?.adSpend || 0,
    record.fees?.sampleCost || 0,
    record.fees?.serviceCost || 0,
    record.metrics?.impressions || 0,
    record.metrics?.views || 0,
    record.metrics?.likes || 0,
    record.metrics?.favorites || 0,
    record.metrics?.comments || 0,
    record.metrics?.shares || 0,
    record.metrics?.follows || 0,
    record.metrics?.clicks || 0,
    record.metrics?.orders || 0,
    record.metrics?.revenue || 0,
    record.metrics?.grossProfit || 0,
    record.capturedAt || ''
  ]);

  return [TEMPLATE_HEADERS, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
}

export function csvTemplate() {
  const example = [
    '敏感肌换季实测', '达人', '小红书', '秋季新品种草计划', '测试达人', 100000,
    'https://example.com/post', '2026-09-10', 5000, 1000, 300, 0,
    120000, 90000, 5000, 2800, 350, 420, 500, 1800, 80, 24000, 7200, ''
  ];
  return [TEMPLATE_HEADERS, example].map((row) => row.map(csvCell).join(',')).join('\r\n');
}