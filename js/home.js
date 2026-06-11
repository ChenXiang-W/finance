/**
 * home.js — 世界地图 + 威胁情报 + 计数动画
 */
(function () {
  'use strict';

  var API_URL = 'http://localhost:8000/api/threat-feed';

  var LEVEL_COLORS = {
    critical: { fill: '#ff2244', glow: 'rgba(255,34,68,0.7)' },
    high:     { fill: '#ff6b35', glow: 'rgba(255,107,53,0.7)' },
    medium:   { fill: '#fdcb6e', glow: 'rgba(253,203,110,0.6)' },
    low:      { fill: '#4f6ef7', glow: 'rgba(79,110,247,0.6)' },
  };

  // ============================================================
  // 1. ECharts 世界地图
  // ============================================================
  var worldChart = null;

  function initWorldMap(data) {
    var dom = document.getElementById('globeChart');
    if (!dom) return;

    fetch('css/world.json')
      .then(function (r) { return r.json(); })
      .then(function (geo) {
        echarts.registerMap('world', geo);
        var chart = echarts.init(dom);

        var scatterData = data.nodes.map(function (n) {
          var c = LEVEL_COLORS[n.level] || LEVEL_COLORS.low;
          return {
            name: n.name,
            value: [n.lng, n.lat, n.count],
            desc: n.desc,
            level: n.level,
            symbolSize: Math.max(5, Math.min(18, Math.sqrt(n.count) * 0.6)),
            itemStyle: { color: c.fill, shadowBlur: 14, shadowColor: c.glow },
            label: {
              show: true,
              formatter: function (p) {
                // 地图上直接显示地区名 + 风险标签
                var lvl = { critical: '极高', high: '高', medium: '中', low: '低' }[n.level] || '';
                return n.name + (lvl ? ' · ' + lvl : '');
              },
              color: 'rgba(255,255,255,0.55)',
              fontSize: 10,
              distance: 5,
              fontFamily: '"Noto Sans SC",sans-serif',
            },
          };
        });

        var effectData = data.nodes
          .filter(function (n) { return n.level === 'critical' || n.level === 'high'; })
          .map(function (n) {
            var c = LEVEL_COLORS[n.level] || LEVEL_COLORS.high;
            return {
              name: n.name, value: [n.lng, n.lat, n.count],
              itemStyle: { color: c.fill },
            };
          });

        var option = {
          backgroundColor: 'transparent',
          tooltip: {
            trigger: 'item',
            backgroundColor: 'rgba(6,8,16,0.96)',
            borderColor: 'rgba(79,110,247,0.35)',
            padding: [12, 16],
            textStyle: { color: '#dce6f0', fontSize: 13, fontFamily: '"Noto Sans SC",sans-serif' },
            formatter: function (p) {
              if (!p.data || !p.data.desc) return '';
              var lvl = p.data.level || '';
              var lvlCN = { critical: '极高风险', high: '高风险', medium: '中风险', low: '低风险' }[lvl] || lvl;
              var lvlColor = LEVEL_COLORS[lvl] ? LEVEL_COLORS[lvl].fill : '#fff';
              return '<div style="font-size:15px;font-weight:700;margin-bottom:6px;">' + p.data.name + '</div>' +
                '<div style="margin-bottom:4px;"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + lvlColor + ';margin-right:6px;"></span>' +
                '威胁等级：<b style="color:' + lvlColor + '">' + lvlCN + '</b></div>' +
                '<div style="color:rgba(255,255,255,0.6);margin-bottom:4px;">' + p.data.desc + '</div>' +
                '<div style="color:rgba(255,255,255,0.4);font-size:11px;">活跃节点：<b>' + (p.data.value ? p.data.value[2] : '--') + '</b></div>';
            },
          },
          geo: {
            map: 'world',
            roam: true,
            zoom: 1.2,
            center: [22, 18],
            aspectScale: 0.75,
            itemStyle: {
              areaColor: '#0d1530',
              borderColor: 'rgba(79,110,247,0.22)',
              borderWidth: 0.7,
              shadowBlur: 16,
              shadowColor: 'rgba(0,0,0,0.5)',
              shadowOffsetY: 3,
            },
            emphasis: {
              itemStyle: { areaColor: '#152045', borderColor: 'rgba(79,110,247,0.5)', borderWidth: 1 },
              label: { show: false },
            },
            regions: data.nodes.map(function (n) {
              // 对高风险区域加深颜色
              if (n.level === 'critical') return { name: n.name, itemStyle: { areaColor: '#1a1030' } };
              return {};
            }),
          },
          series: [
            {
              type: 'scatter',
              coordinateSystem: 'geo',
              data: scatterData,
              emphasis: { scale: 1.8 },
            },
            {
              type: 'effectScatter',
              coordinateSystem: 'geo',
              data: effectData,
              symbolSize: 6,
              rippleEffect: { brushType: 'stroke', scale: 3.5, period: 3 },
              showEffectOn: 'render',
              zlevel: 1,
            },
          ],
        };

        chart.setOption(option);
        chart.getDom().style.backgroundColor = 'transparent';
        window.addEventListener('resize', function () { chart.resize(); });
        worldChart = chart;
      });
  }

  // ============================================================
  // 2. 更新指标徽章 + 情报流
  // ============================================================
  var LEVEL_TAGS = { critical: 'CRITICAL', high: 'HIGH', medium: 'MED', low: 'LOW' };

  function updateInfoBar(data) {
    var el = document.getElementById('badgeNodes');
    if (el && data.stats) el.textContent = data.stats.total_nodes + ' 节点';
    var t = document.getElementById('metricThreats');
    if (t && data.stats) t.textContent = data.stats.active_threats;
    var a = document.getElementById('metricAlerts');
    if (a && data.stats) a.textContent = data.stats.today_alerts;
    var r = document.getElementById('metricRegions');
    if (r && data.stats) r.textContent = data.stats.coverage_regions;
  }

  function renderFeed(feeds) {
    var c = document.getElementById('threatFeed');
    if (!c) return;
    var h = '';
    for (var cp = 0; cp < 2; cp++) {
      for (var i = 0; i < feeds.length; i++) {
        var f = feeds[i];
        h += '<div class="feed-item">' +
          '<span class="feed-time">' + f.time + '</span>' +
          '<span class="feed-loc">' + f.loc + '</span>' +
          '<span class="feed-desc">' + f.desc + '</span>' +
          '<span class="feed-tag ' + f.level + '">' + (LEVEL_TAGS[f.level] || 'INFO') + '</span>' +
          '</div>';
      }
    }
    c.innerHTML = h;
  }

  // ============================================================
  // 3. 赛博朋克粒子背景（青+洋红双色）
  // ============================================================
  function initParticles() {
    var canvas = document.getElementById('bgParticles');
    if (!canvas) return;
    var ctx = canvas.getContext('2d'), w, h, pts = [];
    var colors = ['rgba(0,240,255,', 'rgba(255,0,170,'];
    function rs() { w = canvas.width = window.innerWidth; h = canvas.height = window.innerHeight; }
    rs(); window.addEventListener('resize', rs);
    for (var i = 0; i < 50; i++) {
      pts.push({
        x: Math.random()*w, y: Math.random()*h,
        r: Math.random()*1.2+0.3,
        vx: (Math.random()-0.5)*0.15, vy: (Math.random()-0.5)*0.15,
        o: Math.random()*0.35+0.05,
        c: colors[Math.floor(Math.random()*2)],
      });
    }
    (function draw() {
      ctx.clearRect(0,0,w,h);
      for (var i=0;i<pts.length;i++) {
        var p=pts[i]; p.x+=p.vx; p.y+=p.vy;
        if(p.x<0)p.x=w; if(p.x>w)p.x=0;
        if(p.y<0)p.y=h; if(p.y>h)p.y=0;
        ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
        ctx.fillStyle = p.c + p.o + ')'; ctx.fill();
      }
      // 连线
      for (var i=0;i<pts.length;i++) {
        for (var j=i+1;j<pts.length;j++) {
          var dx=pts[i].x-pts[j].x, dy=pts[i].y-pts[j].y;
          var d=Math.sqrt(dx*dx+dy*dy);
          if(d<130){
            ctx.beginPath(); ctx.moveTo(pts[i].x,pts[i].y); ctx.lineTo(pts[j].x,pts[j].y);
            ctx.strokeStyle='rgba(0,240,255,'+(0.045*(1-d/130))+')';
            ctx.lineWidth=0.4; ctx.stroke();
          }
        }
      }
      requestAnimationFrame(draw);
    })();
  }

  // ============================================================
  // 4. 计数动画
  // ============================================================
  function anim(el, tgt, dur, dec) {
    if (!el) return; var s=0,st=null;
    (function step(ts){ if(!st)st=ts; var p=Math.min((ts-st)/(dur||1200),1); var c=s+(tgt-s)*(1-Math.pow(1-p,3)); el.textContent=(dec||0)>0?c.toFixed(dec):Math.round(c); if(p<1)requestAnimationFrame(step); else el.textContent=(dec||0)>0?tgt.toFixed(dec):tgt; })();
  }

  // ============================================================
  // 5. 主流程
  // ============================================================
  function loadData() {
    fetch(API_URL)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data) return;
        if (!worldChart) initWorldMap(data);
        updateInfoBar(data);
        renderFeed(data.feeds);
      })
      .catch(function () {});
  }

  document.addEventListener('DOMContentLoaded', function () {
    initParticles();
    loadData();
    setTimeout(function () {
      anim(document.getElementById('statAccuracy'), 99.7, 1500, 1);
      anim(document.getElementById('statCoverage'), 12, 1000, 0);
      anim(document.getElementById('statLatency'), 0.3, 1200, 1);
    }, 600);
    setInterval(loadData, 60000);
  });
})();
