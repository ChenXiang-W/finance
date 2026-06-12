/**
 * features.js — 全部增强功能
 * 大屏 · 主题 · 快捷键 · 批量 · URL · 拖拽 · 粒子 · 波形 · DNA · 告警 · 地图 · 标签云
 */

// ======== 大屏模式 ========
function toggleFullscreen() {
  document.body.classList.toggle('fullscreen');
  var btn = document.getElementById('btnFullscreen');
  btn.style.color = document.body.classList.contains('fullscreen') ? 'var(--neon-cyan)' : '';
  showToast(document.body.classList.contains('fullscreen') ? '大屏模式已开启' : '已退出大屏模式', 'success');
}

// ======== 主题切换 ========
function toggleTheme() {
  document.body.classList.toggle('light');
  var isLight = document.body.classList.contains('light');
  localStorage.setItem('theme', isLight ? 'light' : 'dark');
  document.getElementById('btnTheme').innerHTML = isLight ? '🌙' : '☀';
  showToast(isLight ? '已切换至日间模式' : '已切换至赛博朋克模式', 'success');
}
(function initTheme() {
  if (localStorage.getItem('theme') === 'light') {
    document.body.classList.add('light');
    document.getElementById('btnTheme').innerHTML = '🌙';
  }
})();

// ======== 快捷键弹窗 ========
function showShortcuts() { document.getElementById('shortcutModal').classList.add('active'); }
function hideShortcuts() { document.getElementById('shortcutModal').classList.remove('active'); }

// ======== 批量检测 ========
var batchMode = false;
function toggleBatchMode() {
  batchMode = !batchMode;
  var row = document.getElementById('batchRow');
  var ta = document.getElementById('textInput');
  if (batchMode) {
    row.style.display = 'flex';
    ta.placeholder = '批量模式：每行一条文本，空行分隔不同检测项…';
    ta.addEventListener('input', updateBatchCount);
    updateBatchCount();
  } else {
    row.style.display = 'none';
    ta.placeholder = '请粘贴短信、聊天记录、邮件或广告文案，智能体将自动识别欺诈风险并进行多维度深度分析…';
    ta.removeEventListener('input', updateBatchCount);
  }
}
function updateBatchCount() {
  var lines = document.getElementById('textInput').value.split('\n').filter(function (l) { return l.trim(); });
  document.getElementById('batchCounter').textContent = lines.length + ' 条';
}
function runBatchDetect() {
  var lines = document.getElementById('textInput').value.split('\n').filter(function (l) { return l.trim(); });
  if (lines.length === 0) { showToast('请输入至少一条文本', 'error'); return; }
  if (lines.length > 10) { showToast('单次最多检测 10 条', 'error'); return; }
  document.getElementById('textInput').value = lines[0];
  detectText();
  if (lines.length > 1) setTimeout(function () { showToast('已检测第 1 条，剩余 ' + (lines.length - 1) + ' 条请手动切换', 'success'); }, 2000);
}

// ======== URL 扫描 ========
function showUrlInput() { document.getElementById('urlScanRow').style.display = 'flex'; document.getElementById('urlInput').focus(); }
function hideUrlInput() { document.getElementById('urlScanRow').style.display = 'none'; }
function scanUrl() {
  var url = document.getElementById('urlInput').value.trim();
  if (!url) { showToast('请输入 URL', 'error'); return; }
  fetch(url, { mode: 'no-cors' })
    .then(function () { document.getElementById('textInput').value = '[URL 内容] ' + url + '\n（跨域限制，请手动粘贴网页文本）'; hideUrlInput(); detectText(); })
    .catch(function () { document.getElementById('textInput').value = '[URL] ' + url; hideUrlInput(); showToast('无法自动抓取，已填入 URL', 'error'); });
}

// ======== 文件拖拽 ========
(function initDragDrop() {
  var overlay = document.getElementById('dropOverlay');
  var dragCounter = 0;
  document.addEventListener('dragenter', function (e) { e.preventDefault(); dragCounter++; if (dragCounter === 1) overlay.classList.add('active'); });
  document.addEventListener('dragleave', function (e) { e.preventDefault(); dragCounter--; if (dragCounter === 0) overlay.classList.remove('active'); });
  document.addEventListener('dragover', function (e) { e.preventDefault(); });
  document.addEventListener('drop', function (e) {
    e.preventDefault(); dragCounter = 0; overlay.classList.remove('active');
    var file = e.dataTransfer.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function (ev) { document.getElementById('textInput').value = ev.target.result.slice(0, 10000); updateCharCount(); showToast('已导入 ' + file.name, 'success'); };
    reader.onerror = function () { showToast('文件读取失败', 'error'); };
    reader.readAsText(file);
  });
})();

// ======== 粒子动画 ========
(function initParticles() {
  var canvas = document.getElementById('particleCanvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var particles = [];
  function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
  resize(); window.addEventListener('resize', resize);
  for (var i = 0; i < 60; i++) {
    particles.push({ x: Math.random() * canvas.width, y: Math.random() * canvas.height, vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.5) * 0.3 - 0.1, size: Math.random() * 1.5 + 0.5, opacity: Math.random() * 0.4 + 0.1 });
  }
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i]; p.x += p.vx; p.y += p.vy;
      if (p.x < 0) p.x = canvas.width; if (p.x > canvas.width) p.x = 0;
      if (p.y < 0) p.y = canvas.height; if (p.y > canvas.height) p.y = 0;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fillStyle = 'rgba(0,240,255,' + p.opacity + ')'; ctx.fill();
      for (var j = i + 1; j < particles.length; j++) {
        var p2 = particles[j], dx = p.x - p2.x, dy = p.y - p2.y, dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 100) { ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p2.x, p2.y); ctx.strokeStyle = 'rgba(0,240,255,' + (0.06 * (1 - dist / 100)) + ')'; ctx.lineWidth = 0.5; ctx.stroke(); }
      }
    }
    requestAnimationFrame(draw);
  }
  draw();
})();

// ======== HUD 时钟 & 节点跳动 ========
(function initHud() {
  function tick() { var el = document.getElementById('hudClock'); if (el) { var d = new Date(); el.textContent = pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()); } }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  tick(); setInterval(tick, 1000);
  function bump() { var el = document.getElementById('hudNodes'); if (el) { var b = 1024; el.textContent = (b + Math.floor(Math.random() * 50 - 25)).toLocaleString(); } }
  setInterval(bump, 2000);
})();

// ======== 波形动画 ========
(function initWaveform() {
  var canvas = document.getElementById('waveformCanvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  function draw() {
    if (!document.getElementById('loadingOverlay').classList.contains('active')) { requestAnimationFrame(draw); return; }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    var cx = canvas.width / 2, cy = canvas.height / 2;
    for (var i = 0; i < 26; i++) {
      var h = Math.sin(Date.now() / 200 + i * 0.4) * 10 + Math.random() * 16 + 8;
      var x = cx - 104 + i * 8;
      var g = ctx.createLinearGradient(x, cy - h / 2, x, cy + h / 2);
      g.addColorStop(0, 'rgba(0,240,255,' + (0.6 + Math.random() * 0.4) + ')');
      g.addColorStop(0.5, 'rgba(255,0,170,' + (0.3 + Math.random() * 0.3) + ')');
      g.addColorStop(1, 'rgba(0,240,255,' + (0.4 + Math.random() * 0.4) + ')');
      ctx.fillStyle = g; ctx.fillRect(x, cy - h / 2, 4, h);
    }
    requestAnimationFrame(draw);
  }
  draw();
})();

// ======== DNA 双螺旋 ========
var dnaAnimId = null;
function initDnaHelix() {
  var canvas = document.getElementById('dnaCanvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  function draw() {
    if (canvas.style.display === 'none') { dnaAnimId = requestAnimationFrame(draw); return; }
    ctx.clearRect(0, 0, 180, 180);
    var t = Date.now() / 1000;
    for (var i = 0; i < 50; i++) {
      var p = i / 49, y = 20 + p * 140;
      var a1 = t * 3 + p * Math.PI * 4, a2 = a1 + Math.PI;
      var x1 = 90 + Math.cos(a1) * 22, x2 = 90 + Math.cos(a2) * 22;
      ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.strokeStyle = 'rgba(0,240,255,' + (0.1 + p * 0.15) + ')'; ctx.lineWidth = 1; ctx.stroke();
      ctx.beginPath(); ctx.arc(x1, y, 2.5, 0, Math.PI * 2); ctx.fillStyle = 'rgba(0,240,255,' + (0.5 + p * 0.3) + ')'; ctx.fill();
      ctx.beginPath(); ctx.arc(x2, y, 2.5, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,0,170,' + (0.3 + p * 0.3) + ')'; ctx.fill();
    }
    dnaAnimId = requestAnimationFrame(draw);
  }
  draw();
}

var loadingAnimType = 'wave';
function toggleLoadingAnim() {
  var wave = document.getElementById('waveformCanvas'), dna = document.getElementById('dnaCanvas');
  if (loadingAnimType === 'wave') { loadingAnimType = 'dna'; wave.style.display = 'none'; dna.style.display = 'block'; if (!dnaAnimId) initDnaHelix(); }
  else { loadingAnimType = 'wave'; wave.style.display = 'block'; dna.style.display = 'none'; }
}

// ======== 告警触发（renderResult 增强） ========
var origRenderResult = renderResult;
renderResult = function (data) {
  origRenderResult(data);
  var score = (data.basic_info && data.basic_info.risk_score) || 0;
  if (score >= 0.8) {
    document.body.classList.add('alert-flash');
    setTimeout(function () { document.body.classList.remove('alert-flash'); }, 500);
    playAlertSound();
  }
};

// ======== 威胁地图 (ECharts) ========
var threatMapChart = null;
function initThreatMap() {
  var dom = document.getElementById('threatMapChart');
  if (!dom || !window.echarts) return;
  threatMapChart = echarts.init(dom);
  var coords = [
    { name: '东南亚', value: [105, 15, 92] }, { name: '东欧', value: [30, 50, 45] },
    { name: '西非', value: [0, 10, 78] }, { name: '南亚', value: [78, 22, 65] },
    { name: '华北', value: [116, 38, 55] }, { name: '华南', value: [113, 23, 48] },
    { name: '中东', value: [45, 28, 38] }, { name: '南美', value: [-55, -10, 32] },
    { name: '北美', value: [-100, 38, 25] }, { name: '西欧', value: [5, 48, 20] },
  ];
  fetch('https://cdn.jsdelivr.net/npm/echarts@5.5.0/map/json/world.json')
    .then(function (r) { return r.json(); })
    .then(function (geoJson) { echarts.registerMap('world', geoJson); setMapOpt(true); })
    .catch(function () { setMapOpt(false); });

  function setMapOpt(hasGeo) {
    var opt;
    if (hasGeo) {
      opt = { backgroundColor: 'transparent',
        geo: { map: 'world', roam: false, zoom: 1.3, center: [80, 25], itemStyle: { areaColor: '#0d1525', borderColor: 'rgba(0,240,255,0.12)' }, emphasis: { itemStyle: { areaColor: '#152035' } } },
        series: [
          { type: 'scatter', coordinateSystem: 'geo', data: coords, symbolSize: function (v) { return Math.sqrt(v[2]) * 2; }, itemStyle: { color: '#ff2244', shadowBlur: 12, shadowColor: 'rgba(255,34,68,0.6)' }, emphasis: { scale: 2, itemStyle: { color: '#ff00aa' } } },
          { type: 'effectScatter', coordinateSystem: 'geo', data: coords.slice(0, 3), symbolSize: 6, rippleEffect: { brushType: 'stroke', scale: 4 }, itemStyle: { color: '#00f0ff' }, zlevel: 1 }
        ] };
    } else {
      opt = { backgroundColor: 'transparent', xAxis: { show: false, min: -180, max: 180 }, yAxis: { show: false, min: -90, max: 90 },
        series: [
          { type: 'scatter', data: coords, symbolSize: function (v) { return Math.sqrt(v[2]) * 2.5; }, itemStyle: { color: '#ff2244', shadowBlur: 10, shadowColor: 'rgba(255,34,68,0.5)' }, label: { show: true, formatter: function (p) { return p.name; }, position: 'right', color: '#8899aa', fontSize: 9 } },
          { type: 'effectScatter', data: coords.slice(0, 3), symbolSize: 8, rippleEffect: { scale: 5 }, itemStyle: { color: '#00f0ff' } }
        ] };
    }
    threatMapChart.setOption(opt);
  }
  window.addEventListener('resize', function () { if (threatMapChart) threatMapChart.resize(); });
}
function toggleThreatMap() {
  var row = document.getElementById('threatMapRow'); row.classList.toggle('collapsed');
  var btn = row.querySelector('.threat-map-header button'); btn.textContent = row.classList.contains('collapsed') ? '+ 展开' : '− 收起';
  if (!row.classList.contains('collapsed') && threatMapChart) setTimeout(function () { threatMapChart.resize(); }, 350);
}

// ======== 标签云 (ECharts WordCloud) ========
var wordcloudChart = null;
function initWordcloud() {
  var dom = document.getElementById('wordcloudChart');
  if (!dom || !window.echarts) return;
  wordcloudChart = echarts.init(dom);
  var data = [
    { name: '冒充客服', value: 92 }, { name: '虚假投资', value: 78 }, { name: '冒充公检法', value: 65 },
    { name: '刷单诈骗', value: 60 }, { name: '杀猪盘', value: 55 }, { name: '征信修复', value: 48 },
    { name: '钓鱼链接', value: 42 }, { name: '信贷诈骗', value: 38 }, { name: '虚拟货币', value: 35 },
    { name: '深度伪造', value: 30 }, { name: '伪基站', value: 28 }, { name: 'AB贷', value: 25 },
    { name: '庞氏骗局', value: 22 }, { name: '非法集资', value: 20 }, { name: '套路贷', value: 18 },
  ];
  wordcloudChart.setOption({
    backgroundColor: 'transparent',
    series: [{ type: 'wordCloud', shape: 'circle', width: '100%', height: '100%', sizeRange: [10, 28], rotationRange: [-30, 30], gridSize: 6, drawOutOfBound: false,
      textStyle: { fontFamily: 'sans-serif', fontWeight: 'bold', color: function () { return ['#00f0ff','#ff00aa','#00ff66','#ffe600','#ff6b35','#ff2244'][Math.floor(Math.random()*6)]; } },
      emphasis: { textStyle: { shadowBlur: 10, shadowColor: 'rgba(0,240,255,0.6)' } }, data: data }]
  });
}

// ======== 初始化 ECharts ========
(function initCharts() {
  var check = setInterval(function () {
    if (window.echarts) { clearInterval(check); initThreatMap(); initWordcloud(); }
  }, 100);
  setTimeout(function () { clearInterval(check); }, 5000);
})();
