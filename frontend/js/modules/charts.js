/**
 * charts.js — SVG 图表绘制（仪表盘、雷达图、饼图）
 */

function drawGauge(score) {
  var color = score >= 0.8 ? '#d63031' : score >= 0.6 ? '#e17055' : score >= 0.4 ? '#fdcb6e' : score > 0 ? '#00cec9' : '#636e72';
  var level = score >= 0.8 ? '极高风险' : score >= 0.6 ? '高风险' : score >= 0.4 ? '中风险' : score > 0 ? '低风险' : '安全';
  var angle = -180 + score * 180;

  var svg = '<svg width="150" height="95" viewBox="0 0 180 110" class="gauge-svg">' +
    '<path d="M 20 100 A 80 80 0 0 1 160 100" fill="none" stroke="#1a2a40" stroke-width="14" stroke-linecap="round"/>' +
    '<path d="M 20 100 A 80 80 0 0 1 160 100" fill="none" stroke="' + color + '" stroke-width="14" stroke-linecap="round"' +
    ' stroke-dasharray="' + (score * 252).toFixed(0) + ' 252" style="transition: stroke-dasharray 0.8s ease-out;"/>' +
    '<line x1="90" y1="100" x2="' + (90 + 70 * Math.cos(angle * Math.PI / 180)) + '" y2="' + (100 + 70 * Math.sin(angle * Math.PI / 180)) + '"' +
    ' stroke="#c0d0e0" stroke-width="2.5" stroke-linecap="round" style="transition: all 0.8s ease-out;"/>' +
    '<circle cx="90" cy="100" r="5" fill="#c0d0e0"/>' +
    '</svg>';

  return '<div class="gauge-wrap">' + svg +
    '<div class="gauge-score" style="color:' + color + ';">' + score.toFixed(2) + '</div>' +
    '<div class="gauge-level" style="color:' + color + ';">' + level + '</div>' +
    '</div>';
}

function drawRadarChart(dimensions) {
  if (!dimensions || dimensions.length === 0) {
    dimensions = [
      { label: '欺诈手法', value: 0.5 }, { label: '心理操控', value: 0.5 },
      { label: '资金风险', value: 0.5 }, { label: '法律风险', value: 0.4 },
      { label: '社会危害', value: 0.4 }, { label: '紧急程度', value: 0.5 },
    ];
  }
  var cx = 90, cy = 90, r = 70, n = dimensions.length;
  var svg = '<svg width="150" height="150" viewBox="0 0 180 180" class="radar-svg">';
  for (var l = 1; l <= 5; l++) {
    var pts = [];
    for (var i = 0; i < n; i++) {
      var a = -Math.PI / 2 + (2 * Math.PI * i) / n;
      pts.push((cx + (r / 5) * l * Math.cos(a)).toFixed(1) + ',' + (cy + (r / 5) * l * Math.sin(a)).toFixed(1));
    }
    svg += '<polygon points="' + pts.join(' ') + '" fill="none" stroke="' + (l === 5 ? '#1e3050' : '#152438') + '" stroke-width="' + (l === 5 ? '1.5' : '1') + '"/>';
  }
  for (var i2 = 0; i2 < n; i2++) {
    var a2 = -Math.PI / 2 + (2 * Math.PI * i2) / n;
    svg += '<line x1="' + cx + '" y1="' + cy + '" x2="' + (cx + r * Math.cos(a2)).toFixed(1) + '" y2="' + (cy + r * Math.sin(a2)).toFixed(1) + '" stroke="#1a2a40" stroke-width="1"/>';
  }
  var dp = [];
  for (var i3 = 0; i3 < n; i3++) {
    var a3 = -Math.PI / 2 + (2 * Math.PI * i3) / n;
    dp.push((cx + r * (dimensions[i3].value || 0) * Math.cos(a3)).toFixed(1) + ',' + (cy + r * (dimensions[i3].value || 0) * Math.sin(a3)).toFixed(1));
  }
  svg += '<polygon points="' + dp.join(' ') + '" fill="rgba(0,240,255,0.2)" stroke="#00f0ff" stroke-width="2" stroke-linejoin="round"/>';
  for (var i4 = 0; i4 < n; i4++) {
    var a4 = -Math.PI / 2 + (2 * Math.PI * i4) / n;
    svg += '<circle cx="' + (cx + r * (dimensions[i4].value || 0) * Math.cos(a4)).toFixed(1) + '" cy="' + (cy + r * (dimensions[i4].value || 0) * Math.sin(a4)).toFixed(1) + '" r="3.5" fill="#00f0ff" stroke="#0a0a12" stroke-width="1.5"/>';
  }
  for (var i5 = 0; i5 < n; i5++) {
    var a5 = -Math.PI / 2 + (2 * Math.PI * i5) / n;
    var lx = cx + (r + 18) * Math.cos(a5), ly = cy + (r + 18) * Math.sin(a5);
    svg += '<text x="' + lx.toFixed(0) + '" y="' + (ly + 4).toFixed(0) + '" text-anchor="middle" font-size="11" fill="#8899aa" font-weight="500">' + dimensions[i5].label + '</text>';
  }
  svg += '</svg>';
  return '<div class="radar-wrap">' + svg + '</div>';
}

function drawCategoryPie(categories) {
  if (!categories || categories.length === 0) {
    categories = [
      { label: '冒充客服', value: 25, color: '#00f0ff' }, { label: '虚假投资', value: 20, color: '#ff00aa' },
      { label: '冒充公检法', value: 20, color: '#ff3355' }, { label: '信贷诈骗', value: 20, color: '#ffe600' },
      { label: '其他', value: 15, color: '#445566' },
    ];
  }
  var total = 0;
  for (var i = 0; i < categories.length; i++) { total += categories[i].value; }
  var cx = 75, cy = 75, outerR = 60, innerR = 35;
  var svg = '<svg width="130" height="130" viewBox="0 0 150 150" class="pie-svg">';
  var ca = -Math.PI / 2;
  for (var j = 0; j < categories.length; j++) {
    var sa = (categories[j].value / total) * 2 * Math.PI;
    svg += '<path d="M ' + (cx + innerR * Math.cos(ca)).toFixed(1) + ' ' + (cy + innerR * Math.sin(ca)).toFixed(1) +
      ' L ' + (cx + outerR * Math.cos(ca)).toFixed(1) + ' ' + (cy + outerR * Math.sin(ca)).toFixed(1) +
      ' A ' + outerR + ' ' + outerR + ' 0 ' + (sa > Math.PI ? 1 : 0) + ' 1 ' +
      (cx + outerR * Math.cos(ca + sa)).toFixed(1) + ' ' + (cy + outerR * Math.sin(ca + sa)).toFixed(1) +
      ' Z" fill="' + categories[j].color + '" stroke="#0a0f1e" stroke-width="1.5"/>';
    ca += sa;
  }
  svg += '<circle cx="75" cy="75" r="35" fill="#0a0f1e"/></svg>';
  var legend = '<div class="pie-legend">';
  for (var k = 0; k < categories.length; k++) {
    legend += '<div class="pie-legend-item"><span class="pie-legend-dot" style="background:' + categories[k].color + ';"></span>' + categories[k].label + '</div>';
  }
  legend += '</div>';
  return '<div class="pie-wrap">' + svg + legend + '</div>';
}

function extractDimensions(result) {
  if (!result || !result.risk_factors || result.risk_factors.length === 0) {
    var score = (result && result.basic_info && result.basic_info.risk_score) || 0;
    return [
      { label: '欺诈手法', value: score }, { label: '心理操控', value: Math.max(0, score - 0.1) },
      { label: '资金风险', value: score }, { label: '法律风险', value: Math.max(0, score - 0.15) },
      { label: '社会危害', value: Math.max(0, score - 0.05) }, { label: '紧急程度', value: score },
    ];
  }
  var dimMap = {};
  for (var i = 0; i < result.risk_factors.length; i++) {
    dimMap[result.risk_factors[i].category] = result.risk_factors[i].score;
  }
  return [
    { label: '欺诈手法', value: dimMap['欺诈手法'] || dimMap['欺诈话术'] || 0.3 },
    { label: '心理操控', value: dimMap['心理操控'] || dimMap['社会工程'] || 0.3 },
    { label: '资金风险', value: dimMap['资金风险'] || dimMap['财产损失'] || 0.3 },
    { label: '法律风险', value: dimMap['法律风险'] || 0.3 },
    { label: '社会危害', value: dimMap['社会危害'] || 0.3 },
    { label: '紧急程度', value: dimMap['紧急程度'] || dimMap['时效性'] || 0.3 },
  ];
}
