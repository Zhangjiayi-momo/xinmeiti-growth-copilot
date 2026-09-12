# 新媒体增长作战台

面向新媒体运营的内容策略、达人合作与投放复盘工作台。

## 当前版本

第一阶段 Web MVP 已实现：

- 营销战役管理
- 内容与达人合作记录
- 曝光、互动、转化和成本数据录入
- CPM、CPE、CTR、CVR、CPA、ROAS、ROI 计算
- 同平台、同记录类型的效率指数
- 数据看板、达人排序和复盘行动
- CSV 导入、CSV 模板、CSV/JSON 导出
- 浏览器本地持久化
- 演示数据一键恢复
- 24 小时、72 小时、7 天指标快照
- 基于同类样本的系统行动建议
- 原生微信小程序伴侣（总览、记录、快速录入）

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
node --test packages/metrics/test/metrics.test.js packages/domain/test/models.test.js
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

当前版本的数据默认保存在浏览器本地存储中，不会上传服务器。分享前应先导出并检查数据，避免把达人报价、订单或毛利等敏感信息发送给无关人员。