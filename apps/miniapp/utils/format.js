function number(value) { return Number.isFinite(Number(value)) ? Number(value).toLocaleString('zh-CN') : '—'; }
function money(value) { const n = Number(value); return Number.isFinite(n) ? `¥${n.toFixed(2)}` : '—'; }
function percent(value) { return Number.isFinite(value) ? `${(value * 100).toFixed(2)}%` : '—'; }
function multiple(value) { return Number.isFinite(value) ? `${value.toFixed(2)}×` : '—'; }
module.exports = { number, money, percent, multiple };