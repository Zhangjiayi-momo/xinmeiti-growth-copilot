const store = require('../../utils/store');
const { metricsOf, aggregate } = require('../../utils/metrics');
const fmt = require('../../utils/format');

Page({
  data: { stats: [], topRecords: [], recordCount: 0 },
  onShow() { this.loadData(); },
  onPullDownRefresh() { this.loadData(); wx.stopPullDownRefresh(); },
  loadData() {
    const records = store.listRecords();
    const summary = aggregate(records);
    const rows = records.map((record) => {
      const metrics = metricsOf(record);
      return Object.assign({}, record, {
        cpeText: metrics.cpe === null ? '—' : fmt.money(metrics.cpe),
        roasText: metrics.roas === null ? '—' : fmt.multiple(metrics.roas),
        interactionText: fmt.number(metrics.interaction),
        costText: fmt.money(metrics.cost),
        efficiency: metrics.cpe === null ? 0 : Math.max(0, Math.round(100 - Math.min(90, metrics.cpe)))
      });
    }).sort((a, b) => b.efficiency - a.efficiency);
    this.setData({
      recordCount: records.length,
      stats: [
        { label: '累计花费', value: fmt.money(summary.spend), note: `${summary.count} 条记录` },
        { label: '互动总量', value: fmt.number(summary.interaction), note: `CPE ${summary.cpe === null ? '—' : fmt.money(summary.cpe)}` },
        { label: '订单', value: fmt.number(summary.orders), note: `CPA ${summary.cpa === null ? '—' : fmt.money(summary.cpa)}` },
        { label: 'ROAS', value: summary.roas === null ? '—' : fmt.multiple(summary.roas), note: `收入 ${fmt.money(summary.revenue)}` }
      ],
      topRecords: rows.slice(0, 5)
    });
  },
  goRecords() { wx.switchTab({ url: '/pages/records/index' }); },
  goAdd() { wx.navigateTo({ url: '/pages/record-form/index' }); },
  goEdit(event) { wx.navigateTo({ url: `/pages/record-form/index?id=${event.currentTarget.dataset.id}` }); },
  onShareAppMessage() { return { title: '新媒体增长作战台', path: '/pages/dashboard/index' }; }
});