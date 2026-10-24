/**
 * utils.js - 通用工具（格式化 / 提示 / 风险分档）
 */

/** 轻提示：真实浮层，3s 后自动收起 */
function showToast(msg, type) {
  var el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.className = 'show' + (type ? ' ' + type : '');
  clearTimeout(el._t);
  el._t = setTimeout(function () { el.className = ''; }, 3000);
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 「2026-10-23 01:20」形式的本地时间；空值给灰色 - */
function fmtWhen(value) {
  if (!value) return '-';
  var d;
  if (typeof value === 'string') {
    // 支持 "2026-10-23 01:20:01" 与 ISO
    d = new Date(value.replace(' ', 'T'));
    if (isNaN(d.getTime())) d = new Date(value);
  } else {
    d = new Date(value);
  }
  if (isNaN(d.getTime())) return String(value);
  function p(n) { return n < 10 ? '0' + n : String(n); }
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
    ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

/** 固定两位小数；非数字给灰色 - */
function fmtScore(v) {
  var n = Number(v);
  return isFinite(n) ? n.toFixed(2) : '-';
}

/** 风险分档：high ≥ 0.6，mid ≥ 0.4，其余 low */
function riskTier(score) {
  var s = Number(score) || 0;
  if (s >= 0.6) return 'high';
  if (s >= 0.4) return 'mid';
  return 'low';
}
function tierText(tier) {
  return { high: '高风险', mid: '中风险', low: '低风险' }[tier] || '未知';
}
/** 状态胶囊的配色类：高风险用负向、中风险警告、低风险正向 */
function pillClass(tier) {
  return { high: 'neg', mid: 'warn', low: 'pos' }[tier] || '';
}

function debounce(fn, ms) {
  var t = null;
  return function () {
    var args = arguments, self = this;
    clearTimeout(t);
    t = setTimeout(function () { fn.apply(self, args); }, ms || 200);
  };
}

function prefersReducedMotion() {
  return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}
