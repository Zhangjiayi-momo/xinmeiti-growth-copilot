function numeric(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

function safeRatio(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : null;
}

export function feesOf(record = {}) {
  const legacy = record;
  const fees = record.fees || {};
  return {
    quote: numeric(fees.quote ?? legacy.price),
    adSpend: numeric(fees.adSpend),
    sampleCost: numeric(fees.sampleCost),
    serviceCost: numeric(fees.serviceCost)
  };
}

export function metricsOfRecord(record = {}) {
  const input = record.metrics || {};
  const legacy = record;
  return {
    impressions: numeric(input.impressions),
    views: numeric(input.views),
    likes: numeric(input.likes ?? legacy.likes),
    favorites: numeric(input.favorites ?? legacy.favorites),
    comments: numeric(input.comments ?? legacy.comments),
    shares: numeric(input.shares),
    follows: numeric(input.follows),
    clicks: numeric(input.clicks),
    orders: numeric(input.orders ?? legacy.conversions),
    revenue: numeric(input.revenue),
    grossProfit: numeric(input.grossProfit)
  };
}

export function totalCost(record = {}) {
  const fees = feesOf(record);
  return fees.quote + fees.adSpend + fees.sampleCost + fees.serviceCost;
}

export function interactionCount(record = {}) {
  const metrics = metricsOfRecord(record);
  return metrics.likes + metrics.favorites + metrics.comments + metrics.shares;
}

export function metricsOf(record = {}) {
  const raw = metricsOfRecord(record);
  const cost = totalCost(record);
  const interaction = interactionCount(record);
  const displayDenominator = raw.views > 0 ? raw.views : raw.impressions;

  return {
    ...raw,
    totalCost: cost,
    interaction,
    interactionRate: safeRatio(interaction, displayDenominator),
    cpm: raw.impressions > 0 ? (cost / raw.impressions) * 1000 : null,
    cpe: interaction > 0 && cost > 0 ? cost / interaction : null,
    ctr: raw.impressions > 0 ? raw.clicks / raw.impressions : null,
    cvr: raw.clicks > 0 ? raw.orders / raw.clicks : null,
    cpa: cost > 0 && raw.orders > 0 ? cost / raw.orders : null,
    roas: cost > 0 && raw.revenue > 0 ? raw.revenue / cost : null,
    roi: cost > 0 && raw.grossProfit > 0 ? (raw.grossProfit - cost) / cost : null
  };
}

export function metricsOfSnapshot(record = {}, snapshot = {}) {
  return metricsOf({ ...record, metrics: snapshot.metrics || {} });
}

function sum(records, selector) {
  return records.reduce((total, record) => total + selector(record), 0);
}

export function aggregateMetrics(records = []) {
  const rows = records.map(metricsOf);
  const totalSpend = sum(rows, (row) => row.totalCost);
  const impressions = sum(rows, (row) => row.impressions);
  const views = sum(rows, (row) => row.views);
  const interactions = sum(rows, (row) => row.interaction);
  const clicks = sum(rows, (row) => row.clicks);
  const orders = sum(rows, (row) => row.orders);
  const revenue = sum(rows, (row) => row.revenue);
  const grossProfit = sum(rows, (row) => row.grossProfit);
  const interactionDenominator = views > 0 ? views : impressions;

  return {
    recordCount: rows.length,
    totalSpend,
    impressions,
    views,
    interactions,
    clicks,
    orders,
    revenue,
    grossProfit,
    interactionRate: safeRatio(interactions, interactionDenominator),
    cpm: impressions > 0 ? (totalSpend / impressions) * 1000 : null,
    cpe: interactions > 0 && totalSpend > 0 ? totalSpend / interactions : null,
    ctr: impressions > 0 ? clicks / impressions : null,
    cvr: clicks > 0 ? orders / clicks : null,
    cpa: totalSpend > 0 && orders > 0 ? totalSpend / orders : null,
    roas: totalSpend > 0 && revenue > 0 ? revenue / totalSpend : null,
    roi: totalSpend > 0 && grossProfit > 0 ? (grossProfit - totalSpend) / totalSpend : null
  };
}

export function peerKeyOf(record = {}) {
  return `${record.platform || '未知'}::${record.recordType || 'content'}`;
}

function percentile(value, sortedUnique, direction) {
  if (!Number.isFinite(value) || sortedUnique.length === 0) return null;
  if (sortedUnique.length === 1) return 0.5;
  const index = sortedUnique.findIndex((item) => Math.abs(item - value) < 1e-12);
  if (index < 0) return null;
  const ratio = index / (sortedUnique.length - 1);
  return direction === 'lower' ? 1 - ratio : ratio;
}

function normalizedScore(components) {
  const available = components.filter((component) => component.percentile !== null);
  if (available.length === 0) return null;
  const totalWeight = available.reduce((total, component) => total + component.weight, 0);
  const weighted = available.reduce((total, component) => total + component.percentile * component.weight, 0);
  return Math.round((weighted / totalWeight) * 100);
}

export function attachEfficiencyIndexes(records = []) {
  const cohorts = new Map();
  for (const record of records) {
    const key = peerKeyOf(record);
    if (!cohorts.has(key)) cohorts.set(key, []);
    cohorts.get(key).push(record);
  }

  const indexes = new Map();
  for (const cohort of cohorts.values()) {
    const metrics = cohort.map(metricsOf);
    const rateValues = [...new Set(metrics.map((item) => item.interactionRate).filter(Number.isFinite))].sort((a, b) => a - b);
    const cpeValues = [...new Set(metrics.map((item) => item.cpe).filter(Number.isFinite))].sort((a, b) => a - b);
    const roasValues = [...new Set(metrics.map((item) => item.roas).filter(Number.isFinite))].sort((a, b) => a - b);
    const cpaValues = [...new Set(metrics.map((item) => item.cpa).filter(Number.isFinite))].sort((a, b) => a - b);

    cohort.forEach((record, index) => {
      const row = metrics[index];
      const score = normalizedScore([
        { weight: 0.4, percentile: percentile(row.interactionRate, rateValues, 'higher') },
        { weight: 0.35, percentile: percentile(row.cpe, cpeValues, 'lower') },
        { weight: 0.25, percentile: row.roas !== null ? percentile(row.roas, roasValues, 'higher') : percentile(row.cpa, cpaValues, 'lower') }
      ]);
      indexes.set(record.id, { efficiencyIndex: score, cohortSize: cohort.length });
    });
  }

  return records.map((record) => ({
    ...record,
    computed: { ...metricsOf(record), ...(indexes.get(record.id) || { efficiencyIndex: null, cohortSize: 0 }) }
  }));
}

function changeRate(current, previous) {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0) return null;
  return (current - previous) / previous;
}

export function snapshotTrend(record = {}, snapshots = []) {
  const points = snapshots
    .filter((snapshot) => snapshot.recordId === record.id)
    .sort((left, right) => new Date(left.capturedAt) - new Date(right.capturedAt))
    .map((snapshot) => ({ ...snapshot, computed: metricsOfSnapshot(record, snapshot) }));

  const first = points[0];
  const latest = points.at(-1);
  return {
    points,
    latest: latest || null,
    snapshotCount: points.length,
    changes: first && latest ? {
      views: changeRate(latest.computed.views, first.computed.views),
      interactions: changeRate(latest.computed.interaction, first.computed.interaction),
      orders: changeRate(latest.computed.orders, first.computed.orders),
      revenue: changeRate(latest.computed.revenue, first.computed.revenue)
    } : null
  };
}

function valueRank(value, cohortValues, direction = 'higher') {
  const sorted = [...new Set(cohortValues.filter(Number.isFinite))].sort((a, b) => a - b);
  return percentile(value, sorted, direction);
}

export function buildRecommendation(record = {}, cohortRecords = [], objective = '内容互动') {
  const current = metricsOf(record);
  const comparable = cohortRecords.filter((item) => peerKeyOf(item) === peerKeyOf(record));
  const cohort = comparable.length ? comparable.map(metricsOf) : [current];
  const sampleSize = cohort.length;
  const confidence = sampleSize >= 5 ? 'high' : sampleSize >= 2 ? 'medium' : 'low';
  const rateRank = valueRank(current.interactionRate, cohort.map((item) => item.interactionRate), 'higher');
  const cpeRank = valueRank(current.cpe, cohort.map((item) => item.cpe), 'lower');
  const roasRank = valueRank(current.roas, cohort.map((item) => item.roas), 'higher');
  const cpaRank = valueRank(current.cpa, cohort.map((item) => item.cpa), 'lower');

  if (sampleSize < 2) {
    return {
      action: '延长观察', confidence: 'low',
      reason: '同平台、同记录类型的有效样本不足，暂时不能进行可靠横向比较。',
      evidence: [`当前有效样本 ${sampleSize} 条`]
    };
  }

  if (['成交转化', '种草', '线索获取'].includes(objective)) {
    if (current.roas === null && current.orders === 0) {
      return {
        action: '延长观察', confidence,
        reason: '当前缺少订单、收入或毛利数据，只能评估流量与互动效率，不能判断真实 ROI。',
        evidence: [`CPE ${current.cpe === null ? '缺失' : current.cpe.toFixed(2)} 元`, `互动率 ${current.interactionRate === null ? '缺失' : (current.interactionRate * 100).toFixed(2) + '%'}`]
      };
    }
    if (roasRank !== null && roasRank >= 0.67 && (cpeRank === null || cpeRank >= 0.5)) {
      return {
        action: '继续投放', confidence,
        reason: '归因收入效率和流量成本均处于同层级较优位置，可扩大预算或复制内容结构。',
        evidence: [`ROAS 排名 ${Math.round(roasRank * 100)}%`, `CPE 排名 ${cpeRank === null ? '缺失' : Math.round(cpeRank * 100) + '%'}`]
      };
    }
    if (current.roi !== null && current.roi < 0) {
      return {
        action: record.recordType === 'creator' ? '更换达人' : '优化素材', confidence,
        reason: '当前归因毛利无法覆盖投放成本，继续原样投入会扩大亏损。',
        evidence: [`ROI ${(current.roi * 100).toFixed(2)}%`, `总成本 ${current.totalCost.toFixed(2)} 元`]
      };
    }
    if (cpaRank !== null && cpaRank <= 0.33) {
      return {
        action: '优化素材', confidence,
        reason: '转化成本处于同层级后半段，应先检查点击到成交的承接内容，而不是直接扩量。',
        evidence: [`CPA 排名 ${Math.round(cpaRank * 100)}%`, `CVR ${current.cvr === null ? '缺失' : (current.cvr * 100).toFixed(2) + '%'}`]
      };
    }
  }

  if (rateRank !== null && rateRank >= 0.67) {
    return {
      action: '继续投放', confidence,
      reason: '互动率处于同层级前列，可作为素材或达人复投候选。',
      evidence: [`互动率排名 ${Math.round(rateRank * 100)}%`, `CPE ${current.cpe === null ? '缺失' : current.cpe.toFixed(2) + ' 元'}`]
    };
  }
  if (rateRank !== null && rateRank <= 0.33) {
    return {
      action: '优化素材', confidence,
      reason: '互动率处于同层级后半段，优先优化前 3 秒钩子、选题表达或受众匹配。',
      evidence: [`互动率排名 ${Math.round(rateRank * 100)}%`, `互动 ${current.interaction}`]
    };
  }
  return {
    action: '延长观察', confidence,
    reason: '当前表现位于同层级中段，建议继续观察并保留一个明确的测试变量。',
    evidence: [`有效样本 ${sampleSize} 条`, `效率指数待结合后续快照判断`]
  };
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function detectAnomalies(record = {}, snapshots = [], cohortRecords = [], objective = '内容互动') {
  const current = metricsOf(record);
  const comparable = cohortRecords.filter((item) => peerKeyOf(item) === peerKeyOf(record));
  const cohort = (comparable.length ? comparable : [record]).map(metricsOf);
  const cpeMedian = median(cohort.map((item) => item.cpe));
  const ctrMedian = median(cohort.map((item) => item.ctr));
  const cvrMedian = median(cohort.map((item) => item.cvr));
  const trend = snapshotTrend(record, snapshots);
  const issues = [];

  if (cpeMedian !== null && current.cpe !== null && cpeMedian > 0 && current.cpe > cpeMedian * 1.5) {
    issues.push({
      code: 'CPE_SPIKE', level: 'high', title: 'CPE 明显偏高',
      detail: `当前 CPE ${current.cpe.toFixed(2)} 元，超过同类中位数 ${cpeMedian.toFixed(2)} 元的 1.5 倍。`
    });
  }

  if (
    ctrMedian !== null && cvrMedian !== null &&
    current.ctr !== null && current.cvr !== null &&
    current.ctr >= ctrMedian * 1.2 && current.cvr <= cvrMedian * 0.7
  ) {
    issues.push({
      code: 'FUNNEL_BREAK', level: 'high', title: '点击后转化断层',
      detail: '点击率高于同类水平，但 CVR 明显偏低，问题更可能出现在商品页、承接内容或优惠设置。'
    });
  }

  if (trend.points.length >= 2 && trend.changes) {
    const viewGrowth = trend.changes.views;
    const interactionGrowth = trend.changes.interactions;
    if (
      viewGrowth !== null && interactionGrowth !== null &&
      viewGrowth - interactionGrowth > 0.35
    ) {
      issues.push({
        code: 'QUALITY_DECLINE', level: 'medium', title: '流量增长快于互动增长',
        detail: '阅读/播放增长高于互动增长超过 35 个百分点，新增流量可能不够精准或内容吸引力正在下降。'
      });
    }
  }

  if (['成交转化', '种草', '线索获取'].includes(objective) && current.totalCost > 0 && current.orders === 0) {
    issues.push({
      code: 'MISSING_CONVERSION', level: 'medium', title: '缺少转化结果',
      detail: '当前有明确投放成本但订单为 0，需要确认归因窗口、链接配置或承接页是否正常。'
    });
  }

  const capturedTime = Date.parse(record.capturedAt || '');
  if (Number.isFinite(capturedTime) && Date.now() - capturedTime > 7 * 24 * 60 * 60 * 1000) {
    issues.push({
      code: 'STALE_DATA', level: 'medium', title: '数据超过 7 天未更新',
      detail: '当前结论可能已经过期，建议补充 7 天或 30 天快照后再决定是否扩量。'
    });
  }

  if (!trend.points.length) {
    issues.push({
      code: 'NO_SNAPSHOT', level: 'low', title: '缺少时间快照',
      detail: '目前只有累计结果，无法判断内容是持续增长还是已经衰退。'
    });
  }

  return issues.sort((left, right) => ({ high: 0, medium: 1, low: 2 }[left.level] - { high: 0, medium: 1, low: 2 }[right.level]));
}
export function sortRecords(records, sortKey = 'efficiencyIndex', direction = 'desc') {
  const factor = direction === 'asc' ? 1 : -1;
  return [...records].sort((left, right) => {
    const a = left.computed?.[sortKey] ?? metricsOf(left)[sortKey];
    const b = right.computed?.[sortKey] ?? metricsOf(right)[sortKey];
    if (a === null || a === undefined) return 1;
    if (b === null || b === undefined) return -1;
    if (typeof a === 'string') return factor * a.localeCompare(b, 'zh-CN');
    return factor * (a - b);
  });
}