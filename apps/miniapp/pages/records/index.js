const store = require('../../utils/store');
const { metricsOf } = require('../../utils/metrics');
const fmt = require('../../utils/format');

Page({
  data: { platforms: ['全部', '抖音', '小红书', 'B站', '公众号/视频号'], activePlatform: '全部', records: [] },
  onShow() { this.loadRecords(); },
  loadRecords() {
    const active = this.data.activePlatform;
    const records = store.listRecords().filter((record) => active === '全部' || record.platform === active).map((record) => {
      const metrics = metricsOf(record);
      return Object.assign({}, record, {
        cpeText: metrics.cpe === null ? '—' : fmt.money(metrics.cpe),
        roasText: metrics.roas === null ? '—' : fmt.multiple(metrics.roas),
        interactionText: fmt.number(metrics.interaction),
        costText: fmt.money(metrics.cost)
      });
    });
    this.setData({ records });
  },
  selectPlatform(event) { this.setData({ activePlatform: event.currentTarget.dataset.platform }, () => this.loadRecords()); },
  goAdd() { wx.navigateTo({ url: '/pages/record-form/index' }); },
  goEdit(event) { wx.navigateTo({ url: `/pages/record-form/index?id=${event.currentTarget.dataset.id}` }); },
  deleteRecord(event) {
    const recordId = event.currentTarget.dataset.id;
    wx.showModal({ title: '删除记录', content: '确认删除这条记录？', success: (result) => {
      if (result.confirm) { store.deleteRecord(recordId); this.loadRecords(); wx.showToast({ title: '已删除', icon: 'success' }); }
    } });
  },
  onShareAppMessage() { return { title: '我的新媒体投放数据', path: '/pages/records/index' }; }
});