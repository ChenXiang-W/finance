/**
 * zoom-hint.js — 浏览器页面缩放检测提示
 *
 * 背景：用户（或浏览器记忆）把页面缩放调至 <100% 时，整个页面会被等比缩小，
 * 观感"像是被缩小了"。本脚本检测 visualViewport.scale，偏离 100% 时给出
 * 一次性温和提示，引导按 Ctrl+0 恢复。不强制、不拦截用户手动缩放。
 */
(function () {
  'use strict';

  // 仅在支持 visualViewport 的现代浏览器上检测
  var vv = window.visualViewport;
  if (!vv || typeof vv.scale !== 'number') return;

  var scale = vv.scale;
  // 允许 97%~103% 的轻微偏差，超出才提示
  if (scale > 0.97 && scale < 1.03) return;

  // 同一会话内只提示一次，避免打扰
  try {
    if (sessionStorage.getItem('ffd_zoom_hint_shown')) return;
    sessionStorage.setItem('ffd_zoom_hint_shown', '1');
  } catch (e) { /* localStorage 不可用时仍提示 */ }

  function show() {
    var bar = document.createElement('div');
    bar.setAttribute('role', 'status');
    bar.style.cssText =
      'position:fixed;bottom:20px;right:20px;z-index:9999;max-width:340px;' +
      'padding:12px 16px;background:rgba(10,16,28,0.97);border:1px solid rgba(232,194,106,0.4);' +
      'border-left:3px solid #e8c26a;border-radius:8px;color:#e8edf5;font-size:13px;' +
      'font-family:-apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;' +
      'line-height:1.6;box-shadow:0 8px 28px rgba(0,0,0,0.45);' +
      'animation:ffdHintIn 0.25s ease-out;display:flex;gap:10px;align-items:flex-start';
    bar.innerHTML =
      '<span style="color:#e8c26a;font-weight:700;flex-shrink:0;">提示</span>' +
      '<span style="flex:1;">检测到浏览器页面缩放为 <b style="color:#e8c26a;">' + Math.round(scale * 100) + '%</b>' +
      '，页面会整体显示偏小。<br>按 <b style="font-family:Consolas,monospace;">Ctrl+0</b> 即可恢复 100%。</span>' +
      '<button style="background:none;border:none;color:#5a6b85;cursor:pointer;font-size:14px;padding:0 2px;" title="关闭">✕</button>';
    var style = document.createElement('style');
    style.textContent = '@keyframes ffdHintIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}';
    document.head.appendChild(style);
    document.body.appendChild(bar);
    bar.querySelector('button').onclick = function () { bar.remove(); };
    setTimeout(function () { if (bar.parentNode) bar.remove(); }, 6000);
  }

  // 等页面就绪且首帧渲染完再提示，避免与入场动画抢注意力
  if (document.readyState === 'complete') {
    setTimeout(show, 900);
  } else {
    window.addEventListener('load', function () { setTimeout(show, 900); }, { once: true });
  }
})();
