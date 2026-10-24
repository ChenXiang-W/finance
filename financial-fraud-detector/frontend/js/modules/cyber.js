/**
 * cyber.js — 赛博氛围：粒子网络 + 威胁情报滚动播报
 * 只在主页面使用；尊重「关闭动效」与系统减弱动效设置。
 */

var _fxRaf = null;

function fxMotionAllowed() {
  return !document.body.classList.contains('motion-off') && !prefersReducedMotion();
}

/* ---------------- 粒子网络 ---------------- */
function initParticles() {
  var canvas = document.getElementById('fxParticles');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var w = 0, h = 0, pts = [], frame = 0;
  var COLORS = ['rgba(0,243,255,', 'rgba(188,19,254,'];
  var LINKS = 130;

  function resize() {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
  }

  function seed() {
    pts = [];
    var count = window.innerWidth < 900 ? 20 : 34;
    for (var i = 0; i < count; i++) {
      pts.push({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 1.3 + 0.4,
        vx: (Math.random() - 0.5) * 0.16,
        vy: (Math.random() - 0.5) * 0.16,
        o: Math.random() * 0.35 + 0.08,
        c: COLORS[Math.floor(Math.random() * COLORS.length)],
      });
    }
  }

  function draw() {
    _fxRaf = requestAnimationFrame(draw);
    if (!fxMotionAllowed()) { ctx.clearRect(0, 0, w, h); return; }
    ctx.clearRect(0, 0, w, h);
    frame++;

    for (var i = 0; i < pts.length; i++) {
      var p = pts[i];
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0) p.x = w; if (p.x > w) p.x = 0;
      if (p.y < 0) p.y = h; if (p.y > h) p.y = 0;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = p.c + p.o + ')';
      ctx.fill();
    }

    // 连线每两帧算一次，降低开销
    if (frame % 2 === 0) {
      for (var a = 0; a < pts.length; a++) {
        for (var b = a + 1; b < pts.length; b++) {
          var dx = pts[a].x - pts[b].x;
          var dy = pts[a].y - pts[b].y;
          var d = Math.sqrt(dx * dx + dy * dy);
          if (d < LINKS) {
            ctx.beginPath();
            ctx.moveTo(pts[a].x, pts[a].y);
            ctx.lineTo(pts[b].x, pts[b].y);
            ctx.strokeStyle = 'rgba(0,243,255,' + (0.05 * (1 - d / LINKS)).toFixed(3) + ')';
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }
    }
  }

  resize();
  seed();
  window.addEventListener('resize', function () { resize(); seed(); });
  draw();
}

/* ---------------- 威胁情报滚动播报 ---------------- */
function initTicker() {
  var track = document.getElementById('tickerTrack');
  if (!track) return;

  var FALLBACK = [
    '[江苏·南京] P2P 清退后新型庞氏骗局被查，非法吸存 8 亿',
    '[四川·成都] 虚假投资平台非法吸存 8.5 亿，受害者遍布全国',
    '[广东·深圳] 虚假私募基金跑路，涉案金额 3.2 亿',
    '[浙江·杭州] 虚拟货币传销被取缔，发展下线超 5 万人',
    '[北京·朝阳] 虚假信托产品诈骗老年人，涉案超 8000 万',
    '[福建·厦门] 地下钱庄跨境洗钱通道被破，涉案 30 亿',
  ];

  function build(list) {
    var items = list.filter(Boolean);
    if (!items.length) items = FALLBACK;
    // 两遍内容，配合 translateX(-50%) 实现无缝滚动
    var spans = items.map(function (t) {
      return '<span>' + escapeHtml(t) + '</span>';
    }).join('');
    track.innerHTML = spans + spans;
    // 按内容长度调节速度，保持可读
    var seconds = Math.max(24, Math.min(90, items.length * 6));
    track.style.animationDuration = seconds + 's';
  }

  build(FALLBACK);

  apiGet('/api/threat-feed').then(function (data) {
    var feeds = (data && data.feeds) || [];
    if (!feeds.length) return;
    build(feeds.map(function (f) {
      return '[' + (f.loc || '全国') + '] ' + (f.desc || '');
    }));
  }).catch(function () { /* 后端离线时用内置播报 */ });
}

/* ---------------- 入口 ---------------- */
function initCyber() {
  if (!fxMotionAllowed()) return;
  initParticles();
  initTicker();
}
