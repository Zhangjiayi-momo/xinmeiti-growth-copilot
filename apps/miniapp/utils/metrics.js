function num(value) { const n = Number(value); return Number.isFinite(n) ? Math.max(0, n) : 0; }
function ratio(a, b) { return b > 0 ? a / b : null; }
function metricsOf(r) {
  const fees = r.fees || {};
  const m = r.metrics || {};
  const cost = num(fees.quote) + num(fees.adSpend) + num(fees.sampleCost) + num(fees.serviceCost);
  const interaction = num(m.likes) + num(m.favorites) + num(m.comments) + num(m.shares);
  const denominator = num(m.views) || num(m.impressions);
  const orders = num(m.orders);
  const revenue = num(m.revenue);
  const grossProfit = num(m.grossProfit);
  return { cost, interaction, impressions: num(m.impressions), views: num(m.views), orders, revenue, grossProfit,
    interactionRate: ratio(interaction, denominator), cpe: interaction > 0 && cost > 0 ? cost / interaction : null,
    cpa: orders > 0 && cost > 0 ? cost / orders : null, roas: revenue > 0 && cost > 0 ? revenue / cost : null,
    roi: grossProfit > 0 && cost > 0 ? (grossProfit - cost) / cost : null };
}
function aggregate(records) {
  const rows = records.map(metricsOf);
  const spend = rows.reduce((s, r) => s + r.cost, 0);
  const interaction = rows.reduce((s, r) => s + r.interaction, 0);
  const orders = rows.reduce((s, r) => s + r.orders, 0);
  const revenue = rows.reduce((s, r) => s + r.revenue, 0);
  return { count: records.length, spend, interaction, orders, revenue,
    cpe: interaction > 0 && spend > 0 ? spend / interaction : null,
    cpa: orders > 0 && spend > 0 ? spend / orders : null,
    roas: revenue > 0 && spend > 0 ? revenue / spend : null };
}
module.exports = { metricsOf, aggregate };