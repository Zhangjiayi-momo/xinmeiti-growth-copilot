# 新媒体增长作战台

面向新媒体运营的内容策略、达人合作与投放复盘工作台。

## 当前版本

当前 Web v0.4 已实现：

- 营销战役管理
- 内容与达人合作记录
- 曝光、互动、转化和成本数据录入
- CPM、CPE、CTR、CVR、CPA、ROAS、ROI 计算
- 同平台、同记录类型的效率指数
- 数据看板、达人排序和复盘行动
- CSV 导入、CSV 模板、CSV/JSON 导出
- IndexedDB + localStorage 双持久化
- 快照增长图和异常检测
- CSV、JSON、Excel 兼容导出
- 演示数据一键恢复
- 24 小时、72 小时、7 天指标快照
- 基于同类样本的系统行动建议
- 原生微信小程序伴侣（总览、记录、快速录入）
- 带版本冲突保护的本地/服务器同步 API
- 真实 XLSX 导出
- 同平台、同类型、同粉丝层级 benchmark
- 战役周度成本与收入趋势

## 一键启动

直接双击项目根目录的 `启动工作台.cmd`。启动脚本会自动查找 Codex 内置 Node 或系统 Node，并打开浏览器，不需要手动配置 `PATH`。

## 启动

项目使用原生 ES Modules 和 Node.js 内置模块，无第三方依赖。

```powershell
node apps/web/server.mjs
```

然后打开 `http://127.0.0.1:4173`。

如果使用 Codex 内置运行时：

```powershell
& "C:\Users\张佳怡\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" apps/web/server.mjs
```

## 测试

```powershell
node --test
```

## 构建

```powershell
node scripts/build.mjs
```

构建结果位于 `dist/`。

## 目录

```text
apps/web/            Web MVP
apps/miniapp/        原生微信小程序伴侣
packages/domain/     数据模型、校验和演示数据
packages/metrics/    指标计算引擎
docs/                产品、数据字典和指标口径
```

## 数据与隐私

Web 端同时保存到 IndexedDB、localStorage 和同源服务器。服务器默认写入 `data/database.json`，该文件不会进入 Git。分享或部署前应检查达人报价、订单、毛利等敏感数据，并通过 `SYNC_TOKEN` 保护外部访问。

## 服务器同步

启动时可设置同步令牌：

```powershell
$env:SYNC_TOKEN = "your-token"
node apps/web/server.mjs
```

详细接口见 `docs/数据同步API.md`。