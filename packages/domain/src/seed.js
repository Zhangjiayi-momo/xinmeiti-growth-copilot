import { createEmptyCampaign, createEmptyRecord, normalizeDatabase } from './models.js';

const autumnCampaign = createEmptyCampaign({
  id: 'campaign_autumn',
  name: '秋季新品种草计划',
  brand: '澄野生活',
  product: '舒缓修护精华',
  objective: '成交转化',
  audience: '22-35 岁敏感肌女性，关注成分与真实测评',
  platforms: ['抖音', '小红书'],
  budget: 60000,
  startDate: '2026-09-01',
  endDate: '2026-09-30',
  owner: '内容运营',
  notes: '重点验证达人层级与内容形式的组合效率。'
});

const growthCampaign = createEmptyCampaign({
  id: 'campaign_growth',
  name: '品牌内容增长季',
  brand: '澄野生活',
  product: '品牌官方账号矩阵',
  objective: '内容互动',
  audience: '关注生活方式、职场治愈和轻护肤的年轻用户',
  platforms: ['B站', '公众号/视频号'],
  budget: 25000,
  startDate: '2026-08-15',
  endDate: '2026-10-15',
  owner: '内容运营',
  notes: '优先验证深度内容与短视频的情绪共鸣方向。'
});

function record(config) {
  return createEmptyRecord(config.campaignId, {
    ...config,
    fees: { quote: 0, adSpend: 0, sampleCost: 0, serviceCost: 0, ...config.fees },
    metrics: {
      impressions: 0, views: 0, likes: 0, favorites: 0, comments: 0,
      shares: 0, follows: 0, clicks: 0, orders: 0, revenue: 0, grossProfit: 0,
      ...config.metrics
    },
    review: { action: '待复盘', note: '', owner: '', dueAt: '', ...config.review }
  });
}

export function createDemoDatabase() {
  const records = [
    record({
      id: 'record_dy_amy', campaignId: autumnCampaign.id, recordType: 'creator',
      name: '敏感肌换季急救实测', platform: '抖音', creatorName: '美妆小课堂Amy',
      followers: 186000, url: 'https://www.douyin.com/',
      publishedAt: '2026-09-03', source: 'demo',
      fees: { quote: 12000, adSpend: 3000, sampleCost: 500, serviceCost: 0 },
      metrics: { impressions: 320000, views: 290000, likes: 15200, favorites: 2800, comments: 910, shares: 1260, follows: 1080, clicks: 6400, orders: 210, revenue: 63000, grossProfit: 22000 },
      review: { action: '继续投放', note: 'CPE 和 ROAS 均领先，适合扩量并测试达人矩阵。', owner: '内容运营', dueAt: '2026-09-15' }
    }),
    record({
      id: 'record_xhs_lu', campaignId: autumnCampaign.id, recordType: 'creator',
      name: '成分党早C晚A避坑指南', platform: '小红书', creatorName: '鹿鹿成分笔记',
      followers: 92000, url: 'https://www.xiaohongshu.com/',
      publishedAt: '2026-09-04', source: 'demo',
      fees: { quote: 7800, adSpend: 1200, sampleCost: 420, serviceCost: 0 },
      metrics: { impressions: 180000, views: 132000, likes: 6100, favorites: 4050, comments: 480, shares: 720, follows: 640, clicks: 2260, orders: 128, revenue: 36000, grossProfit: 11200 },
      review: { action: '继续投放', note: '收藏率高，适合保留表单型内容结构。', owner: '内容运营', dueAt: '2026-09-16' }
    }),
    record({
      id: 'record_dy_self', campaignId: autumnCampaign.id, recordType: 'content',
      name: '3秒看懂换季泛红原因', platform: '抖音',
      url: 'https://www.douyin.com/', publishedAt: '2026-09-06', source: 'demo',
      fees: { quote: 0, adSpend: 1800, sampleCost: 200, serviceCost: 300 },
      metrics: { impressions: 120000, views: 99000, likes: 4800, favorites: 890, comments: 260, shares: 430, follows: 520, clicks: 1900, orders: 52, revenue: 14300, grossProfit: 4200 },
      review: { action: '优化素材', note: '自然互动尚可，但点击到成交的 CVR 偏低。', owner: '内容运营', dueAt: '2026-09-14' }
    }),
    record({
      id: 'record_xhs_self', campaignId: autumnCampaign.id, recordType: 'content',
      name: '反精致护肤清单', platform: '小红书',
      url: 'https://www.xiaohongshu.com/', publishedAt: '2026-09-07', source: 'demo',
      fees: { quote: 0, adSpend: 900, sampleCost: 160, serviceCost: 200 },
      metrics: { impressions: 76000, views: 56000, likes: 3100, favorites: 2250, comments: 190, shares: 380, follows: 350, clicks: 980, orders: 18, revenue: 4800, grossProfit: 1350 },
      review: { action: '延长观察', note: '收藏表现好，继续观察 7 天搜索流量。', owner: '内容运营', dueAt: '2026-09-20' }
    }),
    record({
      id: 'record_bili_start', campaignId: growthCampaign.id, recordType: 'creator',
      name: '敏感肌产品的配方逻辑', platform: 'B站', creatorName: '实验室老王',
      followers: 248000, url: 'https://www.bilibili.com/',
      publishedAt: '2026-08-28', source: 'demo',
      fees: { quote: 9500, adSpend: 1200, sampleCost: 420, serviceCost: 500 },
      metrics: { impressions: 210000, views: 176000, likes: 11800, favorites: 5300, comments: 840, shares: 960, follows: 780, clicks: 3200, orders: 64, revenue: 17300, grossProfit: 5200 },
      review: { action: '继续投放', note: '深度内容信任度高，适合承接搜索需求。', owner: '内容运营', dueAt: '2026-09-18' }
    }),
    record({
      id: 'record_bili_self', campaignId: growthCampaign.id, recordType: 'content',
      name: '打工人晚间护肤的5分钟', platform: 'B站',
      url: 'https://www.bilibili.com/', publishedAt: '2026-09-01', source: 'demo',
      fees: { quote: 0, adSpend: 600, sampleCost: 180, serviceCost: 250 },
      metrics: { impressions: 85000, views: 70000, likes: 4300, favorites: 1750, comments: 320, shares: 510, follows: 460, clicks: 1180, orders: 24, revenue: 6200, grossProfit: 1780 },
      review: { action: '优化素材', note: '开局节奏偏慢，三秒留存仍需提升。', owner: '内容运营', dueAt: '2026-09-17' }
    }),
    record({
      id: 'record_wx_self', campaignId: growthCampaign.id, recordType: 'content',
      name: '换季别急着叠满护肤品', platform: '公众号/视频号',
      url: 'https://channels.weixin.qq.com/', publishedAt: '2026-09-05', source: 'demo',
      fees: { quote: 0, adSpend: 500, sampleCost: 120, serviceCost: 180 },
      metrics: { impressions: 42000, views: 33000, likes: 1900, favorites: 1100, comments: 150, shares: 640, follows: 390, clicks: 760, orders: 31, revenue: 7900, grossProfit: 2300 },
      review: { action: '继续投放', note: '私域分享率高，适合沉淀长尾内容。', owner: '内容运营', dueAt: '2026-09-22' }
    }),
    record({
      id: 'record_wx_creator', campaignId: growthCampaign.id, recordType: 'creator',
      name: '护肤成分避坑对谈', platform: '公众号/视频号', creatorName: '成分研究所',
      followers: 76000, url: 'https://channels.weixin.qq.com/',
      publishedAt: '2026-09-08', source: 'demo',
      fees: { quote: 4200, adSpend: 800, sampleCost: 260, serviceCost: 0 },
      metrics: { impressions: 68000, views: 51000, likes: 2600, favorites: 1480, comments: 210, shares: 890, follows: 420, clicks: 930, orders: 22, revenue: 5400, grossProfit: 1500 },
      review: { action: '暂停', note: '流量成本高于当前目标，暂不扩量。', owner: '内容运营', dueAt: '2026-09-13' }
    })
  ];

  return normalizeDatabase({
    campaigns: [autumnCampaign, growthCampaign],
    records,
    activeCampaignId: autumnCampaign.id
  });
}