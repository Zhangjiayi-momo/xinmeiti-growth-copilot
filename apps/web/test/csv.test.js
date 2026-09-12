import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, parseRecordsCsv, recordsToCsv } from '../js/csv.js';
import { createDemoDatabase } from '../../../packages/domain/src/seed.js';

test('CSV 解析支持逗号、换行和转义引号', () => {
  const rows = parseCsv('a,b\r\n"包含,逗号","包含""引号"""\r\n"多行\n文本",x');
  assert.deepEqual(rows, [['a', 'b'], ['包含,逗号', '包含"引号"'], ['多行\n文本', 'x']]);
});

test('标准模板可以导入并生成完整记录', () => {
  const demo = createDemoDatabase();
  const template = `记录名称,类型,平台,投放战役,达人昵称,粉丝数,内容链接,发布时间,报价,广告费,样品成本,服务费,曝光量,阅读/播放量,点赞,收藏,评论,分享,涨粉,点击,订单,收入,毛利,数据采集时间\r\n测试内容,内容,抖音,秋季新品种草计划,,,https://example.com,2026-09-10,0,100,0,0,10000,8000,500,200,50,20,10,100,5,2000,600,2026-09-11`;
  const result = parseRecordsCsv(template, demo.campaigns);
  assert.equal(result.errors.length, 0);
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].campaignId, 'campaign_autumn');
  assert.equal(result.records[0].metrics.views, 8000);
});

test('导出能够阻止表格公式注入', () => {
  const demo = createDemoDatabase();
  const record = demo.records[0];
  record.name = '=HYPERLINK("https://example.com")';
  const csv = recordsToCsv([record], demo.campaigns);
  assert.ok(csv.includes("'=HYPERLINK"));
});