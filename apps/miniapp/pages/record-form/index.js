const store = require('../../utils/store');

Page({
  data: {
    isEdit: false,
    platforms: ['抖音', '小红书', 'B站', '公众号/视频号'],
    types: [{ key: 'content', label: '自营内容' }, { key: 'creator', label: '达人合作' }],
    record: store.emptyRecord()
  },
  onLoad(options) {
    if (options.id) {
      const record = store.getRecord(options.id);
      if (record) this.setData({ record, isEdit: true });
    }
  },
  onField(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({ [`record.${field}`]: event.detail.value });
  },
  onNumberField(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({ [`record.${field}`]: Math.max(0, Number(event.detail.value) || 0) });
  },
  onPlatformChange(event) { this.setData({ 'record.platform': this.data.platforms[event.detail.value] }); },
  onTypeChange(event) { this.setData({ 'record.recordType': this.data.types[event.detail.value].key }); },
  submit() {
    const record = this.data.record;
    if (!String(record.name || '').trim()) return wx.showToast({ title: '请填写记录名称', icon: 'none' });
    if (record.recordType === 'creator' && !String(record.creatorName || '').trim()) return wx.showToast({ title: '请填写达人昵称', icon: 'none' });
    store.upsertRecord(record);
    wx.showToast({ title: this.data.isEdit ? '已更新' : '已保存', icon: 'success' });
    setTimeout(() => wx.navigateBack(), 350);
  },
  onShareAppMessage() { return { title: '新媒体增长作战台', path: '/pages/dashboard/index' }; }
});