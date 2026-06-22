/**
 * home.js — 中国标准省份地图 + 点击详情侧边栏 + 威胁情报流
 */
(function () {
  'use strict';

  var API_URL = window.location.protocol + '//' + window.location.hostname + ':8000/api/threat-feed';

  // 赛博朋克暗色省份配色
  var PROVINCE_COLORS = [
    '#0f1a2e','#121d33','#0e1828','#111c30','#10192c',
    '#0f1a2e','#131f35','#0e1828','#111c30','#10192c',
    '#0f1a2e','#121d33','#131f35','#0e1828','#111c30',
    '#10192c','#0f1a2e','#121d33','#0e1828','#111c30',
    '#10192c','#0f1a2e','#131f35','#121d33','#0e1828',
    '#111c30','#10192c','#0f1a2e','#121d33','#131f35',
    '#0e1828','#111c30','#10192c','#0f1a2e','#121d33'
  ];

  var LEVEL = {
    critical: { fill: '#e63946', name: '极高风险' },
    high:     { fill: '#f4a261', name: '高风险' },
    medium:   { fill: '#e9c46a', name: '中风险' },
    low:      { fill: '#2a9d8f', name: '低风险' },
  };

  var gChart = null;
  var gProvinceData = {};  // 省份名 → 详细数据

  // ============================================================
  // 中国地图渲染（标准配色 + 点击省份）
  // ============================================================
  function renderMap(data) {
    var dom = document.getElementById('globeChart');
    if (!dom) return;
    if (gChart) gChart.dispose();

    var chart = echarts.init(dom);
    chart.showLoading({ text: '加载地图…', color: '#4f6ef7', maskColor: 'rgba(5,8,15,0.8)' });

    // 构建省份→风险数据映射
    gProvinceData = {};
    data.nodes.forEach(function (n) { gProvinceData[n.name] = n; });

    fetch('css/china.json')
      .then(function (r) { return r.json(); })
      .then(function (geo) {
        chart.hideLoading();
        echarts.registerMap('china', geo);

        // 每个省份按标准配色着色
        var regions = geo.features
          .filter(function (f) { return f.properties.name; })
          .map(function (f, i) {
            return {
              name: f.properties.name,
              itemStyle: { areaColor: PROVINCE_COLORS[i % PROVINCE_COLORS.length] },
            };
          });

        chart.setOption({
          backgroundColor: 'transparent',
          tooltip: {
            trigger: 'item',
            backgroundColor: 'rgba(5,8,15,0.95)',
            borderColor: 'rgba(0,240,255,0.3)',
            padding: [12, 16],
            textStyle: { color: '#dce6f0', fontSize: 13, fontFamily: '"Noto Sans SC",sans-serif' },
            formatter: function (p) {
              var pd = gProvinceData[p.name];
              if (pd) {
                var lc = LEVEL[pd.level] || LEVEL.low;
                return '<b style="color:#fff;">' + p.name + '</b><br/>风险：<span style="color:' + lc.fill + '">' + lc.name + '</span><br/>节点：' + pd.count + '<br/><i style="color:var(--neon-cyan);">点击查看实时详情</i>';
              }
              return '<b>' + p.name + '</b>';
            },
          },
          geo: {
            map: 'china', roam: true, zoom: 1.2, center: [104, 36], aspectScale: 0.85,
            label: { show: true, color: 'rgba(255,255,255,0.4)', fontSize: 10, fontFamily: '"Noto Sans SC",sans-serif' },
            regions: regions,
            itemStyle: { borderColor: 'rgba(0,240,255,0.15)', borderWidth: 0.8, shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.5)' },
            emphasis: {
              label: { fontSize: 14, fontWeight: 'bold', color: '#fff' },
              itemStyle: { areaColor: '#1a3050', borderColor: 'rgba(0,240,255,0.5)', borderWidth: 2, shadowBlur: 20, shadowColor: 'rgba(0,240,255,0.15)' },
            },
          },
          series: [],
        });

        chart.getDom().style.backgroundColor = 'transparent';

        // 点击省份 → 显示侧边栏详情
        chart.on('click', function (p) {
          if (p.componentType === 'geo' && p.name) {
            showProvince(p.name);
          }
        });

        window.addEventListener('resize', function () { chart.resize(); });
        gChart = chart;
      })
      .catch(function () { chart.hideLoading(); });
  }

  // ============================================================
  // 省份详情侧边栏
  // ============================================================
  function showProvince(name) {
    var sidebar = document.getElementById('provinceSidebar');
    if (!sidebar) return;

    // 显示加载状态
    sidebar.style.display = 'block';
    sidebar.classList.add('open');
    document.getElementById('psName').textContent = name;
    document.getElementById('psDesc').textContent = '正在获取实时情报...';

    // 调用后端实时情报接口
    fetch(API_URL.replace('/api/threat-feed', '/api/province-intel?name=' + encodeURIComponent(name)))
      .then(function (r) { return r.json(); })
      .then(function (info) {
        document.getElementById('psName').textContent = name;
        var badge = document.getElementById('psBadge');
        badge.textContent = info.risk || '暂无数据';
        var riskColors = { '极高风险':'#e63946', '高风险':'#f4a261', '中风险':'#e9c46a', '低风险':'#2a9d8f' };
        badge.style.background = riskColors[info.risk] || '#666';

        document.getElementById('psStats').innerHTML =
          '<div class="ps-stat"><b>' + (info.nodes||0) + '</b><span>活跃节点</span></div>' +
          '<div class="ps-stat"><b>' + (info.monthly||0) + '</b><span>本月案件</span></div>' +
          '<div class="ps-stat"><b>' + (info.alerts||0) + '</b><span>高危预警</span></div>';

        document.getElementById('psDesc').textContent = info.desc || '';

        var barsHtml = '';
        (info.fraud_types || []).forEach(function (f) {
          barsHtml += '<div class="ps-bar-row"><span class="ps-bar-label">' + f.type + '</span>' +
            '<div class="ps-bar-track"><div class="ps-bar-fill" style="width:' + f.pct + '%;background:' + f.color + '"></div></div>' +
            '<span class="ps-bar-pct">' + f.pct + '%</span></div>';
        });
        document.getElementById('psBars').innerHTML = barsHtml;

        var casesHtml = '';
        (info.cases || []).forEach(function (c) {
          casesHtml += '<div class="ps-case">' + c + '</div>';
        });
        document.getElementById('psCases').innerHTML = casesHtml;
      })
      .catch(function () {
        document.getElementById('psDesc').textContent = '情报获取失败，请检查后端服务';
      });
  }

  // 关闭侧边栏（全局函数，供HTML onclick调用）
  window._closeProvince = function () {
    var sidebar = document.getElementById('provinceSidebar');
    if (sidebar) {
      sidebar.classList.remove('open');
      setTimeout(function () { sidebar.style.display = 'none'; }, 300);
    }
  };

  // ============================================================
  // 指标 + 情报流
  // ============================================================
  function updateInfoBar(data) {
    var el = document.getElementById('badgeNodes'); if (el && data.stats) el.textContent = data.stats.total_nodes + ' 节点';
    var t = document.getElementById('metricThreats'); if (t && data.stats) t.textContent = data.stats.active_threats;
    var a = document.getElementById('metricAlerts'); if (a && data.stats) a.textContent = data.stats.today_alerts;
    var r = document.getElementById('metricRegions'); if (r && data.stats) r.textContent = data.stats.coverage_regions;
  }

  function renderFeed(feeds) {
    var c = document.getElementById('threatFeed'); if (!c) return;
    var tags = { critical: 'CRIT', high: 'HIGH', medium: 'MED', low: 'LOW' };
    var h = '';
    for (var cp = 0; cp < 2; cp++) for (var i = 0; i < feeds.length; i++) {
      var f = feeds[i];
      h += '<div class="feed-item"><span class="feed-time">'+f.time+'</span><span class="feed-loc">'+f.loc+'</span><span class="feed-desc">'+f.desc+'</span><span class="feed-tag '+f.level+'">'+(tags[f.level]||'INFO')+'</span></div>';
    }
    c.innerHTML = h;
  }

  // ============================================================
  // 粒子背景
  // ============================================================
  function initParticles() {
    var canvas = document.getElementById('bgParticles'); if (!canvas) return;
    var ctx = canvas.getContext('2d'), w, h, pts = [];
    var colors = ['rgba(0,240,255,', 'rgba(255,0,170,'];
    function rs() { w = canvas.width = window.innerWidth; h = canvas.height = window.innerHeight; }
    rs(); window.addEventListener('resize', rs);
    for (var i = 0; i < 50; i++) pts.push({ x: Math.random()*w, y: Math.random()*h, r: Math.random()*1.2+0.3, vx: (Math.random()-0.5)*0.15, vy: (Math.random()-0.5)*0.15, o: Math.random()*0.35+0.05, c: colors[Math.floor(Math.random()*2)] });
    (function draw() { ctx.clearRect(0,0,w,h); for (var i=0;i<pts.length;i++) { var p=pts[i]; p.x+=p.vx; p.y+=p.vy; if(p.x<0)p.x=w; if(p.x>w)p.x=0; if(p.y<0)p.y=h; if(p.y>h)p.y=0; ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fillStyle=p.c+p.o+')'; ctx.fill(); } for (var i=0;i<pts.length;i++) for (var j=i+1;j<pts.length;j++) { var dx=pts[i].x-pts[j].x,dy=pts[i].y-pts[j].y,d=Math.sqrt(dx*dx+dy*dy); if(d<130){ ctx.beginPath(); ctx.moveTo(pts[i].x,pts[i].y); ctx.lineTo(pts[j].x,pts[j].y); ctx.strokeStyle='rgba(0,240,255,'+(0.045*(1-d/130))+')'; ctx.lineWidth=0.4; ctx.stroke(); } } requestAnimationFrame(draw); })();
  }

  // ============================================================
  // 计数动画
  // ============================================================
  function anim(el, tgt, dur, dec) { if(!el)return; var s=0,st=null; (function step(ts){ if(!st)st=ts; var p=Math.min((ts-st)/(dur||1200),1),c=s+(tgt-s)*(1-Math.pow(1-p,3)); el.textContent=(dec||0)>0?c.toFixed(dec):Math.round(c); if(p<1)requestAnimationFrame(step); else el.textContent=(dec||0)>0?tgt.toFixed(dec):tgt; })(); }

  // ============================================================
  // 主流程
  // ============================================================
  var gData = null;
  function loadData() {
    fetch(API_URL).then(function(r){return r.ok?r.json():null;}).then(function(data){if(!data)return;gData=data;if(!gChart)renderMap(data);updateInfoBar(data);renderFeed(data.feeds);}).catch(function(){});
  }
  document.addEventListener('DOMContentLoaded',function(){initParticles();loadData();setTimeout(function(){anim(document.getElementById('statAccuracy'),99.7,1500,1);anim(document.getElementById('statCoverage'),12,1000,0);anim(document.getElementById('statLatency'),0.3,1200,1);},600);setInterval(loadData,60000);});
})();
