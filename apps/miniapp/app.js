const store = require('./utils/store');

App({
  globalData: { version: '0.1.0' },
  onLaunch() {
    store.ensureSeedData();
  }
});