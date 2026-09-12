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
  const weighted = available.reduce(
    (total, component) => total + component.percentile * component.weight,
    0
  );
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
      const hasRoas = row.roas !== null;
      const score = normalizedScore([
        { weight: 0.4, percentile: percentile(row.interactionRate, rateValues, 'higher') },
        { weight: 0.35, percentile: percentile(row.cpe, cpeValues, 'lower') },
        {
          weight: 0.25,
          percentile: hasRoas
            ? percentile(row.roas, roasValues, 'higher')
            : percentile(row.cpa, cpaValues, 'lower')
        }
      ]);
      indexes.set(record.id, { efficiencyIndex: score, cohortSize: cohort.length });
    });
  }

  return records.map((record) => ({
    ...record,
    computed: {
      ...metricsOf(record),
      ...(indexes.get(record.id) || { efficiencyIndex: null, cohortSize: 0 })
    }
  }));
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