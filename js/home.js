/**
 * home.js — 全球威胁态势大屏（2D 极致打磨版）
 * 威胁连线 + 热力辐射 + 脉冲节点 + 实时情报流 + 赛博朋克粒子
 */
(function () {
  'use strict';

  var API_URL = 'http://localhost:8000/api/threat-feed';

  var LEVEL = {
    critical: { fill: '#ff2244', glow: 'rgba(255,34,68,0.8)', name: '极高风险' },
    high:     { fill: '#ff6b35', glow: 'rgba(255,107,53,0.7)', name: '高风险' },
    medium:   { fill: '#fdcb6e', glow: 'rgba(253,203,110,0.6)', name: '中风险' },
    low:      { fill: '#4f6ef7', glow: 'rgba(79,110,247,0.5)', name: '低风险' },
  };

  var gChart = null;

  // ============================================================
  // 地图渲染
  // ============================================================
  function renderMap(data) {
    var dom = document.getElementById('globeChart');
    if (!dom) return;
    if (gChart) gChart.dispose();

    var chart = echarts.init(dom);
    chart.showLoading({ text: '加载地图…', color: '#4f6ef7', maskColor: 'rgba(5,8,15,0.8)' });

    fetch('css/world.json')
      .then(function (r) { return r.json(); })
      .then(function (geo) {
        chart.hideLoading();
        echarts.registerMap('world', geo);

        // ---- 节点散点 ----
        var nodes = data.nodes.map(function (n) {
          var c = LEVEL[n.level] || LEVEL.low;
          return {
            name: n.name, value: [n.lng, n.lat, n.count],
            desc: n.desc, level: n.level,
            symbolSize: Math.max(8, Math.min(22, Math.sqrt(n.count) * 0.7)),
            itemStyle: { color: c.fill, shadowBlur: 18, shadowColor: c.glow, shadowOffsetY: 2 },
            label: { show: true, formatter: '{b}', color: '#fff', fontSize: 9, distance: 6, fontFamily: '"Noto Sans SC",sans-serif', textShadowBlur: 4, textShadowColor: '#000' },
            emphasis: { scale: 2, label: { fontSize: 13, fontWeight: 'bold' } },
          };
        });

        // ---- 脉冲涟漪（仅高危） ----
        var ripples = data.nodes
          .filter(function (n) { return n.level === 'critical' || n.level === 'high'; })
          .map(function (n) {
            var c = LEVEL[n.level] || LEVEL.high;
            return { name: n.name, value: [n.lng, n.lat, n.count], itemStyle: { color: c.fill } };
          });

        // ---- 威胁连线（极高→高→中 之间） ----
        var lines = [];
        var dangerNodes = data.nodes.filter(function (n) { return n.level === 'critical' || n.level === 'high'; });
        for (var i = 0; i < dangerNodes.length; i++) {
          for (var j = i + 1; j < dangerNodes.length; j++) {
            var dist = Math.sqrt(
              Math.pow(dangerNodes[i].lng - dangerNodes[j].lng, 2) +
              Math.pow(dangerNodes[i].lat - dangerNodes[j].lat, 2)
            );
            if (dist < 120) {
              lines.push({
                coords: [[dangerNodes[i].lng, dangerNodes[i].lat], [dangerNodes[j].lng, dangerNodes[j].lat]],
                lineStyle: { color: 'rgba(255,34,68,0.2)', width: 0.8, curveness: 0.2 },
              });
            }
          }
        }

        // ---- 热力辐射圈（极高节点周围） ----
        var heatZones = data.nodes
          .filter(function (n) { return n.level === 'critical'; })
          .map(function (n) {
            return {
              name: n.name,
              value: [n.lng, n.lat, Math.min(80, Math.sqrt(n.count) * 2)],
              itemStyle: {
                color: {
                  type: 'radial',
                  x: 0.5, y: 0.5, r: 0.5,
                  colorStops: [
                    { offset: 0, color: 'rgba(255,34,68,0.08)' },
                    { offset: 0.5, color: 'rgba(255,34,68,0.03)' },
                    { offset: 1, color: 'rgba(255,34,68,0)' },
                  ],
                },
              },
              silent: true,
              z: 0,
            };
          });

        chart.setOption({
          backgroundColor: 'transparent',
          tooltip: {
            trigger: 'item',
            backgroundColor: 'rgba(5,8,15,0.96)',
            borderColor: 'rgba(0,240,255,0.35)',
            padding: [14, 18],
            textStyle: { color: '#dce6f0', fontSize: 13, fontFamily: '"Noto Sans SC",sans-serif' },
            formatter: function (p) {
              if (!p.data || !p.data.desc) return '';
              var c = LEVEL[p.data.level] || LEVEL.low;
              return '<div style="font-size:16px;font-weight:700;margin-bottom:8px;color:#fff;">' + p.data.name + '</div>' +
                '<div style="margin-bottom:5px;"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' + c.fill + ';margin-right:8px;box-shadow:0 0 8px ' + c.glow + ';"></span>' +
                '等级：<b style="color:' + c.fill + ';">' + c.name + '</b></div>' +
                '<div style="color:rgba(255,255,255,0.6);margin-bottom:4px;">' + p.data.desc + '</div>' +
                '<div style="color:rgba(255,255,255,0.35);font-size:11px;">监控节点：<b style="color:#fff;">' + (p.data.value ? p.data.value[2] : '--') + '</b></div>';
            },
          },
          geo: {
            map: 'world', roam: true, zoom: 1.18, center: [25, 20], aspectScale: 0.75,
            itemStyle: {
              areaColor: '#0a1020',
              borderColor: 'rgba(0,240,255,0.18)',
              borderWidth: 0.6,
              shadowBlur: 20, shadowColor: 'rgba(0,0,0,0.6)', shadowOffsetY: 4,
            },
            emphasis: {
              itemStyle: { areaColor: '#111d38', borderColor: 'rgba(0,240,255,0.45)', borderWidth: 1.2 },
              label: { show: false },
            },
          },
          series: [
            // 热力辐射
            { type: 'scatter', coordinateSystem: 'geo', data: heatZones, symbolSize: function (v) { return v[2]; }, silent: true, z: 0 },
            // 连线
            { type: 'lines', coordinateSystem: 'geo', data: lines, silent: true, z: 1,
              effect: { show: true, period: 5, trailLength: 0.3, symbol: 'circle', symbolSize: 2, color: 'rgba(0,240,255,0.5)' },
            },
            // 散点
            { type: 'scatter', coordinateSystem: 'geo', data: nodes, z: 2, emphasis: { scale: 2 } },
            // 脉冲
            { type: 'effectScatter', coordinateSystem: 'geo', data: ripples, symbolSize: 6, z: 3,
              rippleEffect: { brushType: 'stroke', scale: 4, period: 2.5 },
              showEffectOn: 'render',
            },
          ],
        });

        chart.getDom().style.backgroundColor = 'transparent';
        window.addEventListener('resize', function () { chart.resize(); });
        gChart = chart;
      })
      .catch(function () { chart.hideLoading(); });
  }

  // ============================================================
  // 指标更新 + 情报流
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
  // 粒子
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
