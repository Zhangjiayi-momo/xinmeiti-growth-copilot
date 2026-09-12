import test from 'node:test';
import assert from 'node:assert/strict';
import { createXlsxBytes } from '../js/xlsx.js';

test('XLSX 生成包含完整 ZIP 签名和 Open XML 内容', () => {
  const bytes = createXlsxBytes(['记录名称', '阅读量'], [['测试内容', 1234]]);
  assert.equal(bytes[0], 0x50);
  assert.equal(bytes[1], 0x4B);
  const text = new TextDecoder().decode(bytes);
  assert.ok(text.includes('xl/workbook.xml'));
  assert.ok(text.includes('xl/worksheets/sheet1.xml'));
  assert.ok(text.includes('测试内容'));
  assert.ok(text.includes('<v>1234</v>'));
});

test('XLSX 导出阻止公式注入', () => {
  const bytes = createXlsxBytes(['名称'], [['=HYPERLINK("https://example.com")']]);
  const text = new TextDecoder().decode(bytes);
  assert.ok(text.includes("&apos;=HYPERLINK"));
});