import {
  OBJECTIVES,
  REVIEW_ACTIONS,
  SUPPORTED_PLATFORMS,
  createEmptyCampaign,
  createEmptyRecord,
  createEmptySnapshot,
  normalizeCampaign,
  normalizeRecord,
  normalizeSnapshot,
  toNonNegativeNumber,
  validateCampaign,
  validateRecord,
  validateSnapshot
} from '../../../packages/domain/src/models.js';
import {
  aggregateMetrics,
  attachEfficiencyIndexes,
  buildRecommendation,
  snapshotTrend,
  sortRecords
} from '../../../packages/metrics/src/metrics.js';
import { loadDatabase, resetDatabase, saveDatabase } from './store.js';
import { csvTemplate, parseRecordsCsv, recordsToCsv } from './csv.js';
import {
  downloadBlob,
  escapeAttribute,
  escapeHtml,
  formatDate,
  formatMoney,
  formatMultiple,
  formatNumber,
  formatPercent,
  todayIso
} from './formatters.js';

const PAGE_META = {
  dashboard: ['运营总览', '数据看板', '用统一口径识别值得继续投入的内容与达人。'],
  campaigns: ['项目管理', '投放战役', '把内容、达人、预算和数据挂在同一个战役下。'],
  records: ['数据资产', '内容与达人', '记录成本、流量、互动、转化与收入数据。'],
  review: ['决策支持', '数据复盘', '查看效率排名，明确继续投放、暂停或优化的下一步。'],
  data: ['数据中心', '导入导出', '批量导入标准数据，并导出可复用的报表文件。']
};

const state = {
  db: loadDatabase(),
  view: location.hash.replace('#', '') || 'dashboard',
  selectedCampaignId: 'all',
  platform: 'all',
  recordSearch: '',
  recordSort: 'capturedAt',
  reviewAction: 'all',
  lastImportMessage: ''
};

if (!PAGE_META[state.view]) state.view = 'dashboard';

function notify(message, type = 'success') {
  const root = document.getElementById('toast-root');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  root.appendChild(toast);
  setTimeout(() => toast.remove(), 2800);
}

function campaignName(id) {
  return state.db.campaigns.find((campaign) => campaign.id === id)?.name || '未归属战役';
}

function recordById(id) {
  return state.db.records.find((record) => record.id === id);
}

function snapshotsForRecord(recordId) {
  return state.db.snapshots
    .filter((snapshot) => snapshot.recordId === recordId)
    .sort((left, right) => new Date(left.capturedAt) - new Date(right.capturedAt));
}

function renderSnapshotStrip(record) {
  const snapshots = snapshotsForRecord(record.id).slice(-4);
  if (!snapshots.length) return '<span class="small muted">暂无快照</span>';
  const trend = snapshotTrend(record, snapshots);
  const interactionChange = trend.changes?.interactions;
  return `<div class="snapshot-trend-head">
      <span>${trend.snapshotCount} 个时间点</span>
      <strong>${interactionChange === null || interactionChange === undefined ? '等待更多快照' : `互动增长 ${formatPercent(interactionChange)}`}</strong>
    </div>
    <div class="snapshot-strip">${snapshots.map((snapshot) => {
      const computed = snapshotTrend(record, [snapshot]).latest?.computed;
      return `<div class="snapshot-chip">
        <span>${escapeHtml(snapshot.label)}</span>
        <strong>${computed ? formatNumber(computed.interaction) : '—'} 互动</strong>
        <small>${formatDate(snapshot.capturedAt)} · ${computed ? formatNumber(computed.views) : '—'} 阅读/播放</small>
      </div>`;
    }).join('')}</div>`;
}
function campaignById(id) {
  return state.db.campaigns.find((campaign) => campaign.id === id);
}

function enrichedRecords() {
  return attachEfficiencyIndexes(state.db.records);
}

function scopeRecords(records, { useFilters = true } = {}) {
  if (!useFilters || state.selectedCampaignId === 'all') return records;
  return records.filter((record) => record.campaignId === state.selectedCampaignId);
}

function safeHref(url) {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : '';
  } catch {
    return '';
  }
}

function efficiencyClass(index) {
  if (index === null || index === undefined) return 'neutral';
  if (index >= 70) return 'good';
  if (index >= 40) return 'mid';
  return 'low';
}

function renderCampaignOptions(selected = 'all', includeAll = true) {
  const options = state.db.campaigns.map((campaign) => `
    <option value="${escapeAttribute(campaign.id)}" ${campaign.id === selected ? 'selected' : ''}>
      ${escapeHtml(campaign.name)}
    </option>`).join('');
  return `${includeAll ? `<option value="all" ${selected === 'all' ? 'selected' : ''}>全部战役</option>` : ''}${options}`;
}

function renderPlatformOptions(selected = '抖音') {
  return SUPPORTED_PLATFORMS.map((platform) => `
    <option value="${escapeAttribute(platform)}" ${platform === selected ? 'selected' : ''}>${escapeHtml(platform)}</option>
  `).join('');
}

function metricCard(label, value, note = '', accent = false) {
  return `<article class="kpi ${accent ? 'accent' : ''}">
    <span>${escapeHtml(label)}</span>
    <strong>${value}</strong>
    <small>${escapeHtml(note)}</small>
  </article>`;
}

function renderTopbarActions() {
  if (state.view === 'dashboard' || state.view === 'records') {
    return '<button class="button primary" data-action="new-record">新增内容/达人</button>';
  }
  if (state.view === 'campaigns') {
    return '<button class="button primary" data-action="new-campaign">新建营销战役</button>';
  }
  if (state.view === 'review') {
    return '<button class="button secondary" data-action="export-report">导出复盘报告</button>';
  }
  return '<button class="button secondary" data-action="download-template">下载 CSV 模板</button>';
}

function topRecord(records, key, direction = 'desc') {
  return sortRecords(records.filter((record) => record.computed?.[key] !== null), key, direction)[0] || null;
}

function renderDashboard() {
  const records = scopeRecords(enrichedRecords());
  const aggregate = aggregateMetrics(records);

  if (!records.length) {
    return `<section class="card"><div class="empty-state">
      <div class="empty-icon">0</div><h3>还没有可分析的数据</h3>
      <p>先创建战役，再添加第一条内容或达人合作记录。</p>
      <button class="button primary" data-action="new-record" style="margin-top:16px">新增记录</button>
    </div></section>`;
  }

  const visibleRows = records.filter((record) => record.computed.revenue > 0 || record.computed.totalCost > 0);
  const maxRevenue = Math.max(...visibleRows.map((record) => Math.max(record.computed.revenue, record.computed.totalCost)), 1);
  const bestEfficiency = topRecord(records, 'efficiencyIndex', 'desc');
  const lowestCpe = topRecord(records, 'cpe', 'asc');
  const highestRoas = topRecord(records, 'roas', 'desc');
  const weakestRoi = topRecord(records.filter((record) => record.computed.roi !== null), 'roi', 'asc');
  const ranked = sortRecords(records, 'efficiencyIndex', 'desc').slice(0, 6);

  const insights = [
    bestEfficiency && {
      title: `效率最高：${bestEfficiency.name}`,
      body: `${bestEfficiency.platform} · ${campaignName(bestEfficiency.campaignId)} · 同层级 ${bestEfficiency.computed.cohortSize} 条样本`,
      value: `${bestEfficiency.computed.efficiencyIndex} 分`
    },
    lowestCpe && {
      title: `CPE 最低：${lowestCpe.name}`,
      body: `总成本 ${formatMoney(lowestCpe.computed.totalCost)}，互动 ${formatNumber(lowestCpe.computed.interaction)}`,
      value: formatMoney(lowestCpe.computed.cpe)
    },
    highestRoas?.computed?.roas !== null && highestRoas && {
      title: `ROAS 最高：${highestRoas.name}`,
      body: `收入 ${formatMoney(highestRoas.computed.revenue)}，成本 ${formatMoney(highestRoas.computed.totalCost)}`,
      value: formatMultiple(highestRoas.computed.roas)
    },
    weakestRoi && {
      title: `优先复盘：${weakestRoi.name}`,
      body: `当前 ROI ${formatPercent(weakestRoi.computed.roi)}，建议检查素材或人群匹配`,
      value: weakestRoi.review?.action || '待复盘'
    }
  ].filter(Boolean);

  return `
    <div class="filter-bar">
      <div class="field" style="min-width:220px">
        <label for="dashboard-campaign">查看战役</label>
        <select id="dashboard-campaign" data-filter="campaign">${renderCampaignOptions(state.selectedCampaignId)}</select>
      </div>
      <span class="small muted">当前显示 ${records.length} 条记录</span>
    </div>

    <section class="kpi-grid">
      ${metricCard('总花费', formatMoney(aggregate.totalSpend), `${aggregate.recordCount} 条记录`, true)}
      ${metricCard('CPE', aggregate.cpe === null ? '—' : formatMoney(aggregate.cpe), `互动 ${formatNumber(aggregate.interactions)}`)}
      ${metricCard('CPA', aggregate.cpa === null ? '—' : formatMoney(aggregate.cpa), `订单 ${formatNumber(aggregate.orders)}`)}
      ${metricCard('ROAS', aggregate.roas === null ? '—' : formatMultiple(aggregate.roas), `收入 ${formatMoney(aggregate.revenue)}`)}
      ${metricCard('ROI', aggregate.roi === null ? '—' : formatPercent(aggregate.roi), `毛利 ${formatMoney(aggregate.grossProfit)}`, true)}
    </section>

    <section class="grid-2">
      <article class="card">
        <div class="card-header">
          <div><h2>成本与收入对比</h2><p>条形长度按本页最大收入归一化，标签同时保留成本和收入。</p></div>
          <span class="status-pill">${escapeHtml(state.selectedCampaignId === 'all' ? '全部战役' : campaignName(state.selectedCampaignId))}</span>
        </div>
        <div class="card-body bar-list">
          ${visibleRows.slice().sort((a, b) => b.computed.revenue - a.computed.revenue).slice(0, 8).map((record) => `
            <div class="bar-row">
              <div class="bar-label">
                <strong>${escapeHtml(record.name)}</strong>
                <small>${escapeHtml(record.platform)} · 成本 ${formatMoney(record.computed.totalCost)} · 收入 ${formatMoney(record.computed.revenue)}</small>
              </div>
              <div class="bar-track"><div class="bar-fill" style="width:${Math.max(3, (record.computed.revenue / maxRevenue) * 100).toFixed(1)}%"></div></div>
              <div class="bar-value">${record.computed.roas === null ? '无收入' : formatMultiple(record.computed.roas)}</div>
            </div>`).join('')}
        </div>
      </article>

      <article class="card">
        <div class="card-header"><div><h2>行动提示</h2><p>基于当前数据自动定位最值得关注的项目。</p></div></div>
        <div class="card-body insight-list">
          ${insights.map((insight) => `<div class="insight">
            <div><h4>${escapeHtml(insight.title)}</h4><p>${escapeHtml(insight.body)}</p></div>
            <strong>${escapeHtml(insight.value)}</strong>
          </div>`).join('')}
        </div>
      </article>
    </section>

    <section class="card">
      <div class="card-header">
        <div><h2>记录效率排名</h2><p>效率指数只在同平台、同记录类型内比较，原始指标始终可见。</p></div>
        <button class="button secondary small" data-action="go-records">查看全部</button>
      </div>
      <div class="card-body">${renderRecordTable(ranked, { compact: true })}</div>
    </section>`;
}

function renderCampaigns() {
  if (!state.db.campaigns.length) {
    return `<section class="card"><div class="empty-state">
      <div class="empty-icon">战</div><h3>还没有营销战役</h3>
      <p>先定义目标、预算、人群和平台，再录入内容与达人数据。</p>
      <button class="button primary" data-action="new-campaign" style="margin-top:16px">新建战役</button>
    </div></section>`;
  }

  const rows = enrichedRecords();
  const cards = state.db.campaigns.map((campaign) => {
    const records = rows.filter((record) => record.campaignId === campaign.id);
    const metrics = aggregateMetrics(records);
    const progress = campaign.budget > 0 ? Math.min(100, (metrics.totalSpend / campaign.budget) * 100) : 0;
    return `<article class="card campaign-card">
      <div class="campaign-top">
        <div class="campaign-title"><h3>${escapeHtml(campaign.name)}</h3><p>${escapeHtml(campaign.brand)} · ${escapeHtml(campaign.product)}</p></div>
        <span class="status-pill">${escapeHtml(campaign.objective)}</span>
      </div>
      <div>${campaign.platforms.map((platform) => `<span class="platform-pill">${escapeHtml(platform)}</span>`).join('')}</div>
      <div class="campaign-meta">
        <div class="meta-box"><span>预算</span><strong>${formatMoney(campaign.budget, 0)}</strong></div>
        <div class="meta-box"><span>已花费</span><strong>${formatMoney(metrics.totalSpend, 0)}</strong></div>
        <div class="meta-box"><span>记录数</span><strong>${records.length}</strong></div>
      </div>
      <div>
        <div class="small muted" style="display:flex;justify-content:space-between;margin-bottom:7px"><span>预算使用</span><span>${progress.toFixed(1)}%</span></div>
        <div class="progress"><i style="width:${progress.toFixed(1)}%"></i></div>
      </div>
      <div class="campaign-meta">
        <div class="meta-box"><span>ROAS</span><strong>${metrics.roas === null ? '—' : formatMultiple(metrics.roas)}</strong></div>
        <div class="meta-box"><span>ROI</span><strong>${metrics.roi === null ? '—' : formatPercent(metrics.roi)}</strong></div>
        <div class="meta-box"><span>周期</span><strong>${formatDate(campaign.startDate)} - ${formatDate(campaign.endDate)}</strong></div>
      </div>
      <div class="actions">
        <button class="button secondary small" data-action="edit-campaign" data-id="${escapeAttribute(campaign.id)}">编辑</button>
        <button class="button ghost small" data-action="delete-campaign" data-id="${escapeAttribute(campaign.id)}">删除</button>
      </div>
    </article>`;
  }).join('');

  return `<section class="campaign-grid">${cards}</section>`;
}
function filteredRecords(rows) {
  let result = scopeRecords(rows);
  if (state.platform !== 'all') result = result.filter((record) => record.platform === state.platform);
  if (state.recordSearch.trim()) {
    const query = state.recordSearch.trim().toLowerCase();
    result = result.filter((record) => [record.name, record.creatorName, record.platform]
      .some((value) => String(value || '').toLowerCase().includes(query)));
  }
  return sortRecords(result, state.recordSort, state.recordSort === 'cpe' || state.recordSort === 'cpa' ? 'asc' : 'desc');
}

function renderRecordTable(records, { compact = false } = {}) {
  if (!records.length) {
    return `<div class="empty-state"><div class="empty-icon">记</div><h3>没有符合条件的记录</h3><p>调整筛选条件，或新增第一条内容/达人记录。</p></div>`;
  }

  return `<div class="table-wrap"><table>
    <thead><tr>
      <th>记录</th><th>平台</th><th class="num">总成本</th><th class="num">互动</th>
      <th class="num">互动率</th><th class="num">CPE</th>
      ${compact ? '' : '<th class="num">CPA</th><th class="num">ROAS</th><th class="num">ROI</th>'}
      <th class="num">效率指数</th><th class="num">快照</th>${compact ? '' : '<th>操作</th>'}
    </tr></thead>
    <tbody>
      ${records.map((record) => {
        const m = record.computed;
        const href = safeHref(record.url);
        const nameMarkup = href ? `<a href="${escapeAttribute(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(record.name)}</a>` : escapeHtml(record.name);
        return `<tr>
          <td class="title-cell"><strong>${nameMarkup}</strong><small>${record.recordType === 'creator' ? `达人 · ${escapeHtml(record.creatorName || '未填写')}` : '内容'} · ${escapeHtml(campaignName(record.campaignId))}</small></td>
          <td><span class="type-pill ${escapeHtml(record.recordType)}">${record.recordType === 'creator' ? '达人' : '内容'}</span><br><span class="platform-pill">${escapeHtml(record.platform)}</span></td>
          <td class="num">${formatMoney(m.totalCost)}</td>
          <td class="num">${formatNumber(m.interaction)}</td>
          <td class="num">${formatPercent(m.interactionRate)}</td>
          <td class="num">${m.cpe === null ? '—' : formatMoney(m.cpe)}</td>
          ${compact ? '' : `<td class="num">${m.cpa === null ? '—' : formatMoney(m.cpa)}</td><td class="num">${m.roas === null ? '—' : formatMultiple(m.roas)}</td><td class="num">${m.roi === null ? '—' : formatPercent(m.roi)}</td>`}
          <td class="num"><span class="score-pill ${efficiencyClass(m.efficiencyIndex)}">${m.efficiencyIndex === null ? '样本不足' : m.efficiencyIndex}</span></td>
          <td class="num">${snapshotsForRecord(record.id).length}</td>
          ${compact ? '' : `<td><div class="actions"><button class="button ghost small" data-action="add-snapshot" data-id="${escapeAttribute(record.id)}">快照</button><button class="button secondary small" data-action="edit-record" data-id="${escapeAttribute(record.id)}">编辑</button><button class="button ghost small" data-action="delete-record" data-id="${escapeAttribute(record.id)}">删除</button></div></td>`}
        </tr>`;
      }).join('')}
    </tbody>
  </table></div>`;
}

function renderRecords() {
  const rows = filteredRecords(enrichedRecords());
  return `
    <div class="filter-bar">
      <div class="field" style="min-width:210px"><label for="record-campaign">战役</label><select id="record-campaign" data-filter="campaign">${renderCampaignOptions(state.selectedCampaignId)}</select></div>
      <div class="field" style="min-width:150px"><label for="record-platform">平台</label><select id="record-platform" data-filter="platform"><option value="all">全部平台</option>${SUPPORTED_PLATFORMS.map((platform) => `<option value="${escapeAttribute(platform)}" ${state.platform === platform ? 'selected' : ''}>${escapeHtml(platform)}</option>`).join('')}</select></div>
      <div class="field" style="min-width:210px;flex:1"><label for="record-search">搜索</label><input id="record-search" data-filter="record-search" value="${escapeAttribute(state.recordSearch)}" placeholder="搜索记录名称、达人昵称"></div>
      <div class="field" style="min-width:160px"><label for="record-sort">排序</label><select id="record-sort" data-filter="record-sort">${[['capturedAt','最近更新'],['efficiencyIndex','效率指数'],['cpe','CPE 最低'],['roas','ROAS 最高'],['totalCost','成本最高'],['roi','ROI 最高']].map(([key,label]) => `<option value="${key}" ${state.recordSort === key ? 'selected' : ''}>${label}</option>`).join('')}</select></div>
    </div>
    <section class="card">
      <div class="card-header"><div><h2>数据明细</h2><p>显示 ${rows.length} / ${state.db.records.length} 条。效率指数按同平台、同记录类型计算。</p></div></div>
      <div class="card-body" id="records-table-root">${renderRecordTable(rows)}</div>
    </section>`;
}

function renderReview() {
  let rows = scopeRecords(enrichedRecords());
  if (state.reviewAction !== 'all') rows = rows.filter((record) => (record.review?.action || '待复盘') === state.reviewAction);
  rows = sortRecords(rows, 'efficiencyIndex', 'desc');

  return `
    <div class="filter-bar">
      <div class="field" style="min-width:220px"><label for="review-campaign">战役</label><select id="review-campaign" data-filter="campaign">${renderCampaignOptions(state.selectedCampaignId)}</select></div>
      <div class="field" style="min-width:180px"><label for="review-action">行动状态</label><select id="review-action" data-filter="review-action"><option value="all">全部状态</option>${REVIEW_ACTIONS.map((action) => `<option value="${escapeAttribute(action)}" ${state.reviewAction === action ? 'selected' : ''}>${escapeHtml(action)}</option>`).join('')}</select></div>
      <span class="small muted">共 ${rows.length} 条记录。系统建议仅基于当前同类样本，不替代增量实验。</span>
    </div>
    ${!rows.length ? `<section class="card"><div class="empty-state"><div class="empty-icon">✓</div><h3>当前筛选下没有记录</h3><p>可以切换战役或行动状态。</p></div></section>` : `
    <section class="stack">${rows.map((record) => {
      const m = record.computed;
      const campaign = campaignById(record.campaignId);
      const recommendation = buildRecommendation(record, rows, campaign?.objective || '内容互动');
      const confidenceLabel = { high: '较高', medium: '一般', low: '较低' }[recommendation.confidence] || '较低';
      return `<article class="review-card">
        <div class="review-card-head"><div><h3>${escapeHtml(record.name)}</h3><p>${escapeHtml(record.platform)} · ${record.recordType === 'creator' ? `达人 ${escapeHtml(record.creatorName)}` : '自营内容'} · ${escapeHtml(campaignName(record.campaignId))}</p></div><span class="score-pill ${efficiencyClass(m.efficiencyIndex)}">效率 ${m.efficiencyIndex === null ? '样本不足' : m.efficiencyIndex}</span></div>
        <div class="review-metrics">
          <div class="review-metric"><span>总成本</span><strong>${formatMoney(m.totalCost)}</strong></div>
          <div class="review-metric"><span>互动率</span><strong>${formatPercent(m.interactionRate)}</strong></div>
          <div class="review-metric"><span>CPE</span><strong>${m.cpe === null ? '—' : formatMoney(m.cpe)}</strong></div>
          <div class="review-metric"><span>ROAS</span><strong>${m.roas === null ? '—' : formatMultiple(m.roas)}</strong></div>
          <div class="review-metric"><span>ROI</span><strong>${m.roi === null ? '—' : formatPercent(m.roi)}</strong></div>
        </div>
        <div class="recommendation-panel">
          <div class="recommendation-head"><div><span class="eyebrow">系统建议 · 置信度${confidenceLabel}</span><h4>${escapeHtml(recommendation.action)}</h4></div><button class="button secondary small" data-action="apply-recommendation" data-id="${escapeAttribute(record.id)}" data-suggested="${escapeAttribute(recommendation.action)}" data-reason="${escapeAttribute(recommendation.reason)}">采用建议</button></div>
          <p>${escapeHtml(recommendation.reason)}</p>
          <div class="evidence-list">${recommendation.evidence.map((item) => `<span>${escapeHtml(item)}</span>`).join('')}</div>
        </div>
        <div>
          <div class="small muted" style="margin-bottom:8px">指标快照 · 共 ${snapshotsForRecord(record.id).length} 条</div>
          ${renderSnapshotStrip(record)}
        </div>
        <div class="review-note-row"><div><div class="form-grid">
          <div class="field"><label for="review-action-${escapeAttribute(record.id)}">下一步行动</label><select id="review-action-${escapeAttribute(record.id)}">${REVIEW_ACTIONS.map((action) => `<option value="${escapeAttribute(action)}" ${record.review?.action === action ? 'selected' : ''}>${escapeHtml(action)}</option>`).join('')}</select></div>
          <div class="field"><label for="review-owner-${escapeAttribute(record.id)}">负责人</label><input id="review-owner-${escapeAttribute(record.id)}" value="${escapeAttribute(record.review?.owner || '')}" placeholder="填写负责人"></div>
          <div class="field span-2"><label for="review-note-${escapeAttribute(record.id)}">复盘备注</label><textarea id="review-note-${escapeAttribute(record.id)}" placeholder="记录判断依据、下一步验证变量或风险">${escapeHtml(record.review?.note || '')}</textarea></div>
        </div></div><button class="button primary" data-action="save-review" data-id="${escapeAttribute(record.id)}">保存复盘</button></div>
      </article>`;
    }).join('')}</section>`}`;
}
function renderData() {
  return `
    <section class="kpi-grid">
      ${metricCard('营销战役', formatNumber(state.db.campaigns.length), '当前本地数据', true)}
      ${metricCard('内容/达人记录', formatNumber(state.db.records.length), '支持指标快照')}
      ${metricCard('存储方式', '本地', '浏览器 localStorage')}
      ${metricCard('数据版本', 'v2', '支持指标快照')}
      ${metricCard('导出格式', 'CSV / JSON', '适合周报与备份')}
    </section>
    <section class="data-grid">
      <article class="card"><div class="card-body data-action">
        <h4>批量导入</h4><p>先下载标准模板，填写后导入。若 CSV 中未写战役，将导入到当前选择的战役。</p>
        <div class="field"><label for="import-campaign">导入到战役</label><select id="import-campaign">${renderCampaignOptions(state.selectedCampaignId === 'all' ? state.db.campaigns[0]?.id : state.selectedCampaignId, false)}</select></div>
        <input class="file-input" id="csv-file" type="file" accept=".csv,text/csv">
        <div><button class="button primary" data-action="import-csv">开始导入</button></div>
        ${state.lastImportMessage ? `<div class="import-result ${state.lastImportMessage.includes('失败') ? 'error' : 'success'} show">${escapeHtml(state.lastImportMessage)}</div>` : ''}
      </div></article>
      <article class="card"><div class="card-body data-action">
        <h4>导出当前数据</h4><p>CSV 用于表格复盘；JSON 可用于备份或迁移到云端版本。</p>
        <div><button class="button secondary" data-action="export-csv">导出 CSV</button></div>
        <div><button class="button secondary" data-action="export-json">导出 JSON</button></div>
        <div><button class="button ghost" data-action="download-template">下载 CSV 模板</button></div>
      </div></article>
      <article class="card"><div class="card-body data-action">
        <h4>指标口径</h4><p>ROI 使用归因毛利计算。没有收入或毛利的数据只展示 CPE、CPA 等效率指标，不强行标为 ROI。</p>
        <div class="small muted">ROI =（归因毛利 - 总成本）÷ 总成本</div><div class="small muted">总成本 = 报价 + 广告费 + 样品成本 + 服务费</div>
        <div><button class="button ghost" data-action="go-review">前往数据复盘</button></div>
      </div></article>
      <article class="card"><div class="card-body data-action">
        <h4>演示与初始化</h4><p>恢复演示数据会覆盖当前内容；清空数据会删除本浏览器中的战役和记录。</p>
        <div><button class="button secondary" data-action="reset-demo">恢复演示数据</button></div><div><button class="button danger" data-action="clear-all">清空全部数据</button></div>
      </div></article>
    </section>`;
}

function render() {
  document.querySelectorAll('.nav-item').forEach((button) => button.classList.toggle('active', button.dataset.view === state.view));
  const meta = PAGE_META[state.view];
  document.getElementById('page-eyebrow').textContent = meta[0];
  document.getElementById('page-title').textContent = meta[1];
  document.getElementById('page-subtitle').textContent = meta[2];
  document.getElementById('topbar-actions').innerHTML = renderTopbarActions();
  const app = document.getElementById('app');
  if (state.view === 'dashboard') app.innerHTML = renderDashboard();
  if (state.view === 'campaigns') app.innerHTML = renderCampaigns();
  if (state.view === 'records') app.innerHTML = renderRecords();
  if (state.view === 'review') app.innerHTML = renderReview();
  if (state.view === 'data') app.innerHTML = renderData();
}
function openModal(content, small = false) {
  document.getElementById('modal-root').innerHTML = `<div class="modal-backdrop"><div class="modal ${small ? 'small' : ''}" role="dialog" aria-modal="true">${content}</div></div>`;
}

function closeModal() {
  document.getElementById('modal-root').innerHTML = '';
}

function openCampaignModal(id = '') {
  const campaign = id ? campaignById(id) : createEmptyCampaign();
  openModal(`
    <form data-form="campaign">
      <div class="modal-header"><div><h2>${id ? '编辑营销战役' : '新建营销战役'}</h2><p>战役是内容、达人、成本与效果数据的统一上下文。</p></div><button type="button" class="close-button" data-action="close-modal" aria-label="关闭">×</button></div>
      <div class="modal-body">
        <input type="hidden" name="id" value="${escapeAttribute(campaign.id)}">
        <div class="form-grid">
          <div class="field"><label>战役名称 *</label><input name="name" required value="${escapeAttribute(campaign.name)}" placeholder="例如：秋季新品种草计划"></div>
          <div class="field"><label>品牌 *</label><input name="brand" required value="${escapeAttribute(campaign.brand)}" placeholder="品牌名称"></div>
          <div class="field"><label>产品或服务 *</label><input name="product" required value="${escapeAttribute(campaign.product)}" placeholder="主推产品或服务"></div>
          <div class="field"><label>核心目标</label><select name="objective">${OBJECTIVES.map((objective) => `<option ${campaign.objective === objective ? 'selected' : ''}>${escapeHtml(objective)}</option>`).join('')}</select></div>
          <div class="field"><label>预算 *</label><input name="budget" type="number" min="1" step="1" required value="${campaign.budget || ''}" placeholder="例如：60000"></div>
          <div class="field"><label>负责人</label><input name="owner" value="${escapeAttribute(campaign.owner)}" placeholder="填写负责人"></div>
          <div class="field"><label>开始日期</label><input name="startDate" type="date" value="${escapeAttribute(campaign.startDate)}"></div>
          <div class="field"><label>结束日期</label><input name="endDate" type="date" value="${escapeAttribute(campaign.endDate)}"></div>
          <div class="field span-2"><label>目标人群</label><textarea name="audience" placeholder="年龄、需求、消费场景和核心痛点">${escapeHtml(campaign.audience)}</textarea></div>
          <div class="field span-2"><label>投放平台 *</label><div style="display:flex;flex-wrap:wrap;gap:12px">${SUPPORTED_PLATFORMS.map((platform) => `<label style="display:flex;gap:6px;align-items:center;font-size:12px"><input type="checkbox" name="platforms" value="${escapeAttribute(platform)}" ${campaign.platforms.includes(platform) ? 'checked' : ''}>${escapeHtml(platform)}</label>`).join('')}</div></div>
          <div class="field span-2"><label>补充说明</label><textarea name="notes" placeholder="验证目标、风险、约束条件等">${escapeHtml(campaign.notes)}</textarea></div>
        </div>
      </div>
      <div class="modal-footer"><button type="button" class="button ghost" data-action="close-modal">取消</button><button class="button primary" type="submit">保存战役</button></div>
    </form>`, false);
}

function feeValue(record, key) {
  return record?.fees?.[key] ?? 0;
}

function metricValue(record, key) {
  return record?.metrics?.[key] ?? 0;
}

function openRecordModal(id = '') {
  const record = id ? recordById(id) : createEmptyRecord(state.selectedCampaignId === 'all' ? state.db.campaigns[0]?.id : state.selectedCampaignId);
  if (!record) return notify('记录不存在', 'error');
  if (!state.db.campaigns.length) return notify('请先创建营销战役', 'error');

  openModal(`
    <form data-form="record">
      <div class="modal-header"><div><h2>${id ? '编辑内容/达人记录' : '新增内容/达人记录'}</h2><p>先录入可靠原始数据，系统会自动计算派生指标。</p></div><button type="button" class="close-button" data-action="close-modal" aria-label="关闭">×</button></div>
      <div class="modal-body">
        <input type="hidden" name="id" value="${escapeAttribute(record.id)}">
        <div class="form-grid">
          <div class="field"><label>所属战役 *</label><select name="campaignId" required>${renderCampaignOptions(record.campaignId, false)}</select></div>
          <div class="field"><label>记录类型 *</label><select name="recordType"><option value="content" ${record.recordType === 'content' ? 'selected' : ''}>内容</option><option value="creator" ${record.recordType === 'creator' ? 'selected' : ''}>达人合作</option></select></div>
          <div class="field"><label>内容/合作名称 *</label><input name="name" required value="${escapeAttribute(record.name)}" placeholder="例如：敏感肌换季急救实测"></div>
          <div class="field"><label>平台 *</label><select name="platform">${renderPlatformOptions(record.platform)}</select></div>
          <div class="field"><label>达人昵称</label><input name="creatorName" value="${escapeAttribute(record.creatorName)}" placeholder="达人合作时填写"></div>
          <div class="field"><label>粉丝数</label><input name="followers" type="number" min="0" value="${record.followers || ''}" placeholder="例如：100000"></div>
          <div class="field"><label>内容链接</label><input name="url" type="url" value="${escapeAttribute(record.url)}" placeholder="https://..."></div>
          <div class="field"><label>发布时间</label><input name="publishedAt" type="date" value="${escapeAttribute(record.publishedAt)}"></div>
        </div>
        <div class="form-section"><h3 class="form-section-title">成本 <span>所有金额单位均为元</span></h3><div class="form-grid">
          <div class="field"><label>达人报价</label><input name="fees.quote" type="number" min="0" step="0.01" value="${feeValue(record, 'quote')}"></div>
          <div class="field"><label>广告投放费</label><input name="fees.adSpend" type="number" min="0" step="0.01" value="${feeValue(record, 'adSpend')}"></div>
          <div class="field"><label>样品成本</label><input name="fees.sampleCost" type="number" min="0" step="0.01" value="${feeValue(record, 'sampleCost')}"></div>
          <div class="field"><label>服务费</label><input name="fees.serviceCost" type="number" min="0" step="0.01" value="${feeValue(record, 'serviceCost')}"></div>
        </div></div>
        <div class="form-section"><h3 class="form-section-title">流量与互动 <span>缺失字段填写 0，不要留空</span></h3><div class="form-grid">
          ${[['impressions','曝光量'],['views','阅读/播放量'],['likes','点赞'],['favorites','收藏'],['comments','评论'],['shares','分享'],['follows','涨粉/关注'],['clicks','点击']].map(([key, label]) => `<div class="field"><label>${label}</label><input name="metrics.${key}" type="number" min="0" value="${metricValue(record, key)}"></div>`).join('')}
        </div></div>
        <div class="form-section"><h3 class="form-section-title">转化与收入 <span>无转化数据时填写 0</span></h3><div class="form-grid">
          <div class="field"><label>订单/转化数</label><input name="metrics.orders" type="number" min="0" value="${metricValue(record, 'orders')}"></div>
          <div class="field"><label>归因收入</label><input name="metrics.revenue" type="number" min="0" step="0.01" value="${metricValue(record, 'revenue')}"></div>
          <div class="field span-2"><label>归因毛利（不含投放费用）</label><input name="metrics.grossProfit" type="number" min="0" step="0.01" value="${metricValue(record, 'grossProfit')}"><div class="field-hint">ROI =（归因毛利 - 总成本）÷ 总成本。没有可靠收入或毛利时不要填写。</div></div>
        </div></div>
      </div>
      <div class="modal-footer"><button type="button" class="button ghost" data-action="close-modal">取消</button><button class="button primary" type="submit">保存记录</button></div>
    </form>`, false);
}
function numberFrom(form, name) {
  return toNonNegativeNumber(form.get(name));
}

function saveCampaignForm(form) {
  const formData = new FormData(form);
  const existing = formData.get('id') ? campaignById(formData.get('id')) : null;
  const campaign = normalizeCampaign({
    ...(existing || {}),
    id: formData.get('id') || undefined,
    name: formData.get('name'),
    brand: formData.get('brand'),
    product: formData.get('product'),
    objective: formData.get('objective'),
    audience: formData.get('audience'),
    platforms: formData.getAll('platforms'),
    budget: numberFrom(formData, 'budget'),
    startDate: formData.get('startDate'),
    endDate: formData.get('endDate'),
    owner: formData.get('owner'),
    notes: formData.get('notes')
  });
  const errors = validateCampaign(campaign);
  if (errors.length) return notify(errors[0], 'error');
  if (existing) {
    state.db.campaigns = state.db.campaigns.map((item) => item.id === existing.id ? campaign : item);
  } else {
    state.db.campaigns.push(campaign);
  }
  state.db.activeCampaignId = campaign.id;
  state.selectedCampaignId = campaign.id;
  state.db = saveDatabase(state.db);
  closeModal();
  render();
  notify(existing ? '战役已更新' : '战役已创建');
}

function syncSnapshotForRecord(record, options = {}) {
  const capturedAt = options.capturedAt || record.capturedAt || new Date().toISOString();
  const existing = state.db.snapshots.find((snapshot) => snapshot.recordId === record.id && snapshot.capturedAt === capturedAt);
  const snapshot = normalizeSnapshot({
    ...(existing || {}),
    id: existing?.id,
    recordId: record.id,
    label: options.label || existing?.label || '当前数据',
    capturedAt,
    metrics: record.metrics
  }, record.id);
  state.db.snapshots = state.db.snapshots.filter((item) => !(item.recordId === record.id && item.capturedAt === capturedAt));
  state.db.snapshots.push(snapshot);
  return { ...record, capturedAt, metrics: snapshot.metrics };
}
function saveRecordForm(form) {
  const formData = new FormData(form);
  const existing = formData.get('id') ? recordById(formData.get('id')) : null;
  let record = normalizeRecord({
    ...(existing || {}),
    id: formData.get('id') || undefined,
    campaignId: formData.get('campaignId'),
    recordType: formData.get('recordType'),
    name: formData.get('name'),
    platform: formData.get('platform'),
    creatorName: formData.get('creatorName'),
    followers: numberFrom(formData, 'followers'),
    url: formData.get('url'),
    publishedAt: formData.get('publishedAt'),
    fees: {
      quote: numberFrom(formData, 'fees.quote'),
      adSpend: numberFrom(formData, 'fees.adSpend'),
      sampleCost: numberFrom(formData, 'fees.sampleCost'),
      serviceCost: numberFrom(formData, 'fees.serviceCost')
    },
    metrics: {
      impressions: numberFrom(formData, 'metrics.impressions'),
      views: numberFrom(formData, 'metrics.views'),
      likes: numberFrom(formData, 'metrics.likes'),
      favorites: numberFrom(formData, 'metrics.favorites'),
      comments: numberFrom(formData, 'metrics.comments'),
      shares: numberFrom(formData, 'metrics.shares'),
      follows: numberFrom(formData, 'metrics.follows'),
      clicks: numberFrom(formData, 'metrics.clicks'),
      orders: numberFrom(formData, 'metrics.orders'),
      revenue: numberFrom(formData, 'metrics.revenue'),
      grossProfit: numberFrom(formData, 'metrics.grossProfit')
    }
  }, formData.get('campaignId'));
  const errors = validateRecord(record);
  if (errors.length) return notify(errors[0], 'error');
  record = syncSnapshotForRecord(record, {
    label: existing ? '数据修正' : (record.recordType === 'creator' ? '合作数据' : '发布数据')
  });
  if (existing) {
    state.db.records = state.db.records.map((item) => item.id === existing.id ? record : item);
  } else {
    state.db.records.push(record);
  }
  state.db = saveDatabase(state.db);
  closeModal();
  render();
  notify(existing ? '记录已更新' : '记录已创建');
}

function toDateTimeLocal(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 16);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function openSnapshotModal(recordId) {
  const record = recordById(recordId);
  if (!record) return notify('记录不存在', 'error');
  const latest = snapshotsForRecord(recordId).at(-1);
  const metrics = latest?.metrics || record.metrics;
  openModal(`
    <form data-form="snapshot">
      <div class="modal-header"><div><h2>新增指标快照</h2><p>${escapeHtml(record.name)} · 保留 24 小时、72 小时和 7 天数据，后续才能判断增长与衰退。</p></div><button type="button" class="close-button" data-action="close-modal" aria-label="关闭">×</button></div>
      <div class="modal-body">
        <input type="hidden" name="recordId" value="${escapeAttribute(record.id)}">
        <div class="form-grid">
          <div class="field"><label>快照名称 *</label><select name="label"><option>24小时</option><option>72小时</option><option>7天</option><option>14天</option><option>30天</option><option>自定义</option></select></div>
          <div class="field"><label>数据时间 *</label><input name="capturedAt" type="datetime-local" required value="${toDateTimeLocal(new Date().toISOString())}"></div>
        </div>
        <div class="form-section"><h3 class="form-section-title">指标数据 <span>填写该时间点累计数据</span></h3><div class="form-grid">
          ${[['impressions','曝光量'],['views','阅读/播放量'],['likes','点赞'],['favorites','收藏'],['comments','评论'],['shares','分享'],['follows','涨粉/关注'],['clicks','点击'],['orders','订单/转化数'],['revenue','归因收入'],['grossProfit','归因毛利（不含投放费用）']].map(([key,label]) => `<div class="field"><label>${label}</label><input name="metrics.${key}" type="number" min="0" step="0.01" value="${metrics[key] ?? 0}"></div>`).join('')}
        </div></div>
      </div>
      <div class="modal-footer"><button type="button" class="button ghost" data-action="close-modal">取消</button><button class="button primary" type="submit">保存快照</button></div>
    </form>`, false);
}

function saveSnapshotForm(form) {
  const formData = new FormData(form);
  const record = recordById(formData.get('recordId'));
  if (!record) return notify('记录不存在', 'error');
  const capturedDate = new Date(formData.get('capturedAt'));
  const snapshot = normalizeSnapshot({
    recordId: record.id,
    label: formData.get('label'),
    capturedAt: Number.isNaN(capturedDate.getTime()) ? new Date().toISOString() : capturedDate.toISOString(),
    metrics: {
      impressions: numberFrom(formData, 'metrics.impressions'),
      views: numberFrom(formData, 'metrics.views'),
      likes: numberFrom(formData, 'metrics.likes'),
      favorites: numberFrom(formData, 'metrics.favorites'),
      comments: numberFrom(formData, 'metrics.comments'),
      shares: numberFrom(formData, 'metrics.shares'),
      follows: numberFrom(formData, 'metrics.follows'),
      clicks: numberFrom(formData, 'metrics.clicks'),
      orders: numberFrom(formData, 'metrics.orders'),
      revenue: numberFrom(formData, 'metrics.revenue'),
      grossProfit: numberFrom(formData, 'metrics.grossProfit')
    }
  }, record.id);
  const errors = validateSnapshot(snapshot);
  if (errors.length) return notify(errors[0], 'error');
  state.db.snapshots = state.db.snapshots.filter((item) => !(item.recordId === record.id && item.capturedAt === snapshot.capturedAt));
  state.db.snapshots.push(snapshot);
  const latest = snapshotsForRecord(record.id).at(-1);
  state.db.records = state.db.records.map((item) => item.id === record.id ? normalizeRecord({
    ...item,
    capturedAt: latest.capturedAt,
    metrics: latest.metrics,
    updatedAt: new Date().toISOString()
  }, item.campaignId) : item);
  state.db = saveDatabase(state.db);
  closeModal();
  render();
  notify('指标快照已保存');
}

function applyRecommendation(recordId, action, reason) {
  state.db.records = state.db.records.map((record) => record.id === recordId ? normalizeRecord({
    ...record,
    review: {
      ...record.review,
      action,
      note: record.review?.note || reason
    }
  }, record.campaignId) : record);
  state.db = saveDatabase(state.db);
  render();
  notify(`已采用系统建议：${action}`);
}
function saveReview(id) {
  const record = recordById(id);
  if (!record) return notify('记录不存在', 'error');
  state.db.records = state.db.records.map((item) => item.id === id ? normalizeRecord({
    ...item,
    review: {
      action: document.getElementById(`review-action-${id}`)?.value || '待复盘',
      note: document.getElementById(`review-note-${id}`)?.value || '',
      owner: document.getElementById(`review-owner-${id}`)?.value || '',
      dueAt: item.review?.dueAt || ''
    }
  }, item.campaignId) : item);
  state.db = saveDatabase(state.db);
  render();
  notify('复盘结论已保存');
}

function exportWeeklyReport() {
  const records = scopeRecords(enrichedRecords());
  if (!records.length) return notify('当前没有可导出的记录', 'error');
  const aggregate = aggregateMetrics(records);
  const ranked = sortRecords(records, 'efficiencyIndex', 'desc');
  const best = ranked[0];
  const weakest = [...ranked].reverse().find((record) => record.computed.efficiencyIndex !== null);
  const actions = ranked.filter((record) => record.review?.action && record.review.action !== '待复盘');
  const lines = [
    '# 新媒体投放复盘报告', '',
    `- 范围：${state.selectedCampaignId === 'all' ? '全部战役' : campaignName(state.selectedCampaignId)}`,
    `- 生成时间：${new Date().toLocaleString('zh-CN', { hour12: false })}`,
    `- 记录数量：${records.length}`, '',
    '## 核心指标', '',
    '| 总成本 | 互动 | CPE | 订单 | CPA | 收入 | ROAS | ROI |',
    '|---|---:|---:|---:|---:|---:|---:|---:|',
    `| ${formatMoney(aggregate.totalSpend)} | ${formatNumber(aggregate.interactions)} | ${aggregate.cpe === null ? '—' : formatMoney(aggregate.cpe)} | ${formatNumber(aggregate.orders)} | ${aggregate.cpa === null ? '—' : formatMoney(aggregate.cpa)} | ${formatMoney(aggregate.revenue)} | ${aggregate.roas === null ? '—' : formatMultiple(aggregate.roas)} | ${aggregate.roi === null ? '—' : formatPercent(aggregate.roi)} |`, '',
    '## 表现结论', '',
    best ? `- 效率最高：${best.name}，效率指数 ${best.computed.efficiencyIndex}，CPE ${best.computed.cpe === null ? '—' : formatMoney(best.computed.cpe)}，ROAS ${best.computed.roas === null ? '—' : formatMultiple(best.computed.roas)}。` : '- 当前样本不足，暂无法计算效率排名。',
    weakest ? `- 优先复盘：${weakest.name}，效率指数 ${weakest.computed.efficiencyIndex}，需要检查素材、人群或转化路径。` : '- 暂无待优化记录。', '',
    '## 行动清单', ''
  ];
  if (actions.length) {
    for (const record of actions) {
      lines.push(`- [ ] ${record.review.action}：${record.name}${record.review.note ? `。${record.review.note}` : ''}${record.review.owner ? `（负责人：${record.review.owner}）` : ''}`);
    }
  } else {
    lines.push('- [ ] 当前尚未填写复盘行动。');
  }
  lines.push('', '> 效率指数仅用于同平台、同记录类型内相对比较，不能替代真实收入和增量分析。');
  downloadBlob(`新媒体复盘_${todayIso()}.md`, lines.join('\n'), 'text/markdown;charset=utf-8');
  notify('复盘报告已导出');
}

function exportCsv() {
  if (!state.db.records.length) return notify('暂无数据可导出', 'error');
  downloadBlob(`新媒体投放数据_${todayIso()}.csv`, '\uFEFF' + recordsToCsv(state.db.records, state.db.campaigns), 'text/csv;charset=utf-8');
  notify('CSV 已导出');
}

function exportJson() {
  downloadBlob(`新媒体增长作战台_备份_${todayIso()}.json`, JSON.stringify(state.db, null, 2), 'application/json;charset=utf-8');
  notify('JSON 已导出');
}

async function importCsv() {
  const file = document.getElementById('csv-file')?.files?.[0];
  const selectedCampaignId = document.getElementById('import-campaign')?.value || '';
  if (!file) return notify('请先选择 CSV 文件', 'error');
  if (!selectedCampaignId) return notify('请先选择导入到的战役', 'error');
  try {
    const result = parseRecordsCsv(await file.text(), state.db.campaigns, selectedCampaignId);
    if (result.errors.length) {
      state.lastImportMessage = `导入失败：${result.errors[0]}`;
      render();
      return;
    }
    const existingKeys = new Set(state.db.records.map((record) => [record.campaignId, record.platform, record.name, record.publishedAt].join('|')));
    let added = 0;
    let skipped = 0;
    for (const record of result.records) {
      const key = [record.campaignId, record.platform, record.name, record.publishedAt].join('|');
      if (existingKeys.has(key)) {
        skipped += 1;
        continue;
      }
      state.db.records.push(record);
      state.db.snapshots.push(normalizeSnapshot({ recordId: record.id, label: 'CSV导入', capturedAt: record.capturedAt, metrics: record.metrics }));
      existingKeys.add(key);
      added += 1;
    }
    state.db = saveDatabase(state.db);
    state.lastImportMessage = `导入完成：新增 ${added} 条，跳过重复 ${skipped} 条。`;
    render();
  } catch (error) {
    state.lastImportMessage = `导入失败：${error.message}`;
    render();
  }
}

function downloadTemplate() {
  downloadBlob('新媒体投放数据导入模板.csv', '\uFEFF' + csvTemplate(), 'text/csv;charset=utf-8');
  notify('CSV 模板已下载');
}

function deleteRecord(id) {
  const record = recordById(id);
  if (!record) return;
  if (!confirm(`确认删除「${record.name}」？此操作无法撤销。`)) return;
  state.db.records = state.db.records.filter((item) => item.id !== id);
  state.db.snapshots = state.db.snapshots.filter((item) => item.recordId !== id);
  state.db = saveDatabase(state.db);
  render();
  notify('记录已删除');
}

function deleteCampaign(id) {
  const campaign = campaignById(id);
  if (!campaign) return;
  const count = state.db.records.filter((record) => record.campaignId === id).length;
  if (!confirm(`确认删除战役「${campaign.name}」及其中 ${count} 条记录？此操作无法撤销。`)) return;
  state.db.campaigns = state.db.campaigns.filter((item) => item.id !== id);
  state.db.records = state.db.records.filter((record) => record.campaignId !== id);
  const remainingRecordIds = new Set(state.db.records.map((record) => record.id));
  state.db.snapshots = state.db.snapshots.filter((snapshot) => remainingRecordIds.has(snapshot.recordId));
  state.db.activeCampaignId = state.db.campaigns[0]?.id || '';
  if (state.selectedCampaignId === id) state.selectedCampaignId = 'all';
  state.db = saveDatabase(state.db);
  render();
  notify('战役已删除');
}

function refreshRecordTable() {
  const root = document.getElementById('records-table-root');
  if (root) root.innerHTML = renderRecordTable(filteredRecords(enrichedRecords()));
}

document.addEventListener('click', (event) => {
  const nav = event.target.closest('[data-view]');
  if (nav) {
    state.view = nav.dataset.view;
    location.hash = state.view;
    render();
    return;
  }
  const actionElement = event.target.closest('[data-action]');
  if (!actionElement) return;
  const action = actionElement.dataset.action;
  const id = actionElement.dataset.id || '';
  if (action === 'new-campaign') openCampaignModal();
  if (action === 'edit-campaign') openCampaignModal(id);
  if (action === 'delete-campaign') deleteCampaign(id);
  if (action === 'new-record') openRecordModal();
  if (action === 'edit-record') openRecordModal(id);
  if (action === 'add-snapshot') openSnapshotModal(id);
  if (action === 'apply-recommendation') applyRecommendation(id, actionElement.dataset.suggested || '待复盘', actionElement.dataset.reason || '');
  if (action === 'delete-record') deleteRecord(id);
  if (action === 'close-modal') closeModal();
  if (action === 'save-review') saveReview(id);
  if (action === 'export-report') exportWeeklyReport();
  if (action === 'export-csv') exportCsv();
  if (action === 'export-json') exportJson();
  if (action === 'download-template') downloadTemplate();
  if (action === 'import-csv') importCsv();
  if (action === 'go-records') { state.view = 'records'; location.hash = 'records'; render(); }
  if (action === 'go-review') { state.view = 'review'; location.hash = 'review'; render(); }
  if (action === 'reset-demo' && confirm('恢复演示数据将覆盖当前本地数据，是否继续？')) {
    state.db = resetDatabase();
    state.selectedCampaignId = 'all';
    render();
    notify('演示数据已恢复');
  }
  if (action === 'clear-all' && confirm('确认清空全部战役和记录？此操作无法撤销。')) {
    state.db = saveDatabase({ version: 1, campaigns: [], records: [], activeCampaignId: '' });
    state.selectedCampaignId = 'all';
    render();
    notify('本地数据已清空');
  }
});

document.addEventListener('submit', (event) => {
  const form = event.target.closest('form[data-form]');
  if (!form) return;
  event.preventDefault();
  if (form.dataset.form === 'campaign') saveCampaignForm(form);
  if (form.dataset.form === 'record') saveRecordForm(form);
  if (form.dataset.form === 'snapshot') saveSnapshotForm(form);
});

document.addEventListener('change', (event) => {
  const filter = event.target.dataset.filter;
  if (!filter) return;
  if (filter === 'campaign') {
    state.selectedCampaignId = event.target.value;
    render();
  }
  if (filter === 'platform') {
    state.platform = event.target.value;
    refreshRecordTable();
  }
  if (filter === 'record-sort') {
    state.recordSort = event.target.value;
    refreshRecordTable();
  }
  if (filter === 'review-action') {
    state.reviewAction = event.target.value;
    render();
  }
});

document.addEventListener('input', (event) => {
  if (event.target.dataset.filter === 'record-search') {
    state.recordSearch = event.target.value;
    refreshRecordTable();
  }
});

window.addEventListener('hashchange', () => {
  const view = location.hash.replace('#', '');
  if (PAGE_META[view]) {
    state.view = view;
    render();
  }
});

render();
window.addEventListener('hashchange', () => {
  const view = location.hash.replace('#', '');
  if (PAGE_META[view]) {
    state.view = view;
    render();
  }
});

render();