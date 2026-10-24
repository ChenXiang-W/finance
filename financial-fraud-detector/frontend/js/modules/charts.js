/**
 * charts.js - 与 app-screens 规范一致的最小图元
 *   · 只用 1px 线、细条和等宽数字，不用渐变 / 发光 / 彩虹配色
 *   · 每条图都带刻度或数值，避免「没有刻度的图」
 */

/** 风险刻度尺：0–1，带刻度、警戒线与当前值标记（本产品自己的元素） */
function riskScale(score, opts) {
  opts = opts || {};
  var hasScore = isFinite(Number(score));
  var s = hasScore ? Math.max(0, Math.min(1, Number(score))) : null;
  var ticks = '';
  for (var i = 0; i <= 10; i++) {
    ticks += '<span class="scale-tick' + (i % 5 === 0 ? ' major' : '') + '" style="left:' + (i * 10) + '%"></span>';
  }
  var guard = '<span class="scale-guard" style="left:60%"></span>';
  var marker = hasScore
    ? '<span class="scale-marker" style="left:' + (s * 100).toFixed(1) + '%"></span>'
    : '';
  var labels = '<span>0</span><span>0.2</span><span>0.4</span><span>0.6</span><span>0.8</span><span>1.0</span>';
  return (
    '<div class="scale">' +
      '<div class="scale-head"><span>' + (opts.title || '风险刻度 0–1') + '</span>' +
        '<span>' + (hasScore ? '当前 ' + s.toFixed(2) : '当前 -') + ' · 警戒线 0.60</span></div>' +
      '<div class="scale-track">' + ticks + guard + marker + '</div>' +
      '<div class="scale-labels">' + labels + '</div>' +
    '</div>'
  );
}

/**
 * 横向条形列表：label + 细条 + 等宽数值
 * @param {Array<{label:string, value:number, text?:string, cls?:string}>} items
 */
function barList(items, opts) {
  opts = opts || {};
  var max = opts.max;
  if (!max) {
    max = 0;
    items.forEach(function (it) { if (Number(it.value) > max) max = Number(it.value); });
  }
  return items.map(function (it) {
    var v = Number(it.value) || 0;
    var pct = max > 0 ? Math.max(0, Math.min(100, (v / max) * 100)) : 0;
    return (
      '<div class="dim">' +
        '<span class="dim-label' + (opts.wide ? ' wide' : '') + '">' + escapeHtml(it.label) + '</span>' +
        '<span class="dim-track"><span class="dim-fill ' + (it.cls || '') + '" style="width:' + pct.toFixed(1) + '%"></span></span>' +
        '<span class="dim-val' + (opts.wide ? ' wide' : '') + '">' + (it.text !== undefined ? it.text : v) + '</span>' +
      '</div>'
    );
  }).join('');
}

/** 风险等级分布：三档，数值 + 占比 */
function riskDistribution(buckets) {
  var total = (buckets.high || 0) + (buckets.mid || 0) + (buckets.low || 0);
  var rows = [
    { label: '高风险', value: buckets.high || 0, cls: 'hi' },
    { label: '中风险', value: buckets.mid || 0, cls: 'mid' },
    { label: '低风险', value: buckets.low || 0, cls: 'lo' },
  ];
  if (!total) {
    return '<div class="empty"><p>还没有检测记录</p></div>';
  }
  return barList(rows.map(function (r) {
    var share = total ? (r.value / total) * 100 : 0;
    return { label: r.label, value: r.value, cls: r.cls, text: r.value + ' · ' + share.toFixed(0) + '%' };
  }), { max: total, wide: true });
}

/** 评分直方图：5 个区间，带区间标签 */
function scoreHistogram(values) {
  var buckets = [0, 0, 0, 0, 0];
  (values || []).forEach(function (v) {
    var s = Number(v);
    if (!isFinite(s)) return;
    var idx = Math.min(4, Math.max(0, Math.floor(s * 5)));
    buckets[idx]++;
  });
  var total = buckets.reduce(function (a, b) { return a + b; }, 0);
  if (!total) return '<div class="empty"><p>还没有评分数据</p></div>';
  var labels = ['0–0.2', '0.2–0.4', '0.4–0.6', '0.6–0.8', '0.8–1.0'];
  var rows = labels.map(function (label, i) {
    return { label: label, value: buckets[i], cls: i >= 3 ? 'hi' : (i === 2 ? 'mid' : 'lo'), text: String(buckets[i]) };
  });
  return barList(rows, { max: total, wide: true }) +
    '<p class="hint" style="margin-top:10px;">共 ' + total + ' 条评分 · 区间为左闭右开</p>';
}
