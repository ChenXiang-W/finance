/**
 * utils.js — 通用工具函数
 */

function showToast(msg, type) {
  var el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'show';
  if (type) el.classList.add(type);
  clearTimeout(el._timeout);
  el._timeout = setTimeout(function () { el.className = ''; }, 3000);
}

function formatTime(iso) {
  try { return new Date(iso).toLocaleString('zh-CN', { hour12: false }); }
  catch (_) { return iso; }
}

function animateScore(el, target, duration) {
  if (!el) return;
  duration = duration || 800;
  var start = 0;
  var startTime = null;
  function step(timestamp) {
    if (!startTime) startTime = timestamp;
    var progress = Math.min((timestamp - startTime) / duration, 1);
    var eased = 1 - Math.pow(1 - progress, 3);
    var current = start + (target - start) * eased;
    el.textContent = current.toFixed(2);
    if (progress < 1) { requestAnimationFrame(step); }
    else { el.textContent = target.toFixed(2); }
  }
  requestAnimationFrame(step);
}

function playAlertSound() {
  try {
    var ctx = new (window.AudioContext || window.webkitAudioContext)();
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = 'square';
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(1200, ctx.currentTime + 0.08);
    osc.frequency.linearRampToValueAtTime(600, ctx.currentTime + 0.2);
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.25);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.25);
  } catch (_) {}
}
