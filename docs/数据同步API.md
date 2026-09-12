# 数据同步 API

服务端与 Web 页面同源运行，默认数据文件为 `data/database.json`。该文件已被 Git 忽略。

## 环境变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| PORT | 4173 | 服务端口 |
| HOST | 127.0.0.1 | 监听地址 |
| DATA_FILE | data/database.json | 数据文件路径 |
| SYNC_TOKEN | 空 | 设置后 API 必须携带 Bearer Token |

## 接口

### GET /api/health

返回当前数据版本和可写状态。

### GET /api/database

返回：

```json
{
  "revision": 1,
  "updatedAt": "2026-09-12T00:00:00.000Z",
  "database": {}
}
```

### PUT /api/database

请求体：

```json
{
  "baseRevision": 1,
  "database": {}
}
```

服务端只在 `baseRevision` 与当前版本一致时写入。版本不一致时返回 `409` 和服务器最新数据，防止多人同时编辑时互相覆盖。

## 鉴权

设置 `SYNC_TOKEN` 后，请求需要包含：

```http
Authorization: Bearer <token>
```

Web 数据中心可以保存该令牌。

## 生产部署建议

当前文件仓库适用于单实例内部使用。正式团队部署应替换为 PostgreSQL 或 CloudBase，并在服务端增加用户身份、项目权限和审计日志。