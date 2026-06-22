/**
 * main.js — 应用初始化入口 & 全局快捷键
 *
 * 职责：
 *   1. DOM 就绪后初始化：绑定事件、加载历史、更新统计
 *   2. 全局快捷键注册（Ctrl+Enter 检测、F11 全屏等）
 *
 * 依赖：config.js / utils.js / api.js / detect.js / sidebar.js / agent.js / features.js
 */

// 加载当前用户信息到导航栏
function loadUserInfo() {
  var nameEl = document.getElementById('displayUserName');
  if (!nameEl) return;
  var user = localStorage.getItem('app_user');
  if (user) {
    try { var u = JSON.parse(user); nameEl.textContent = u.username || '用户'; }
    catch(e) { nameEl.textContent = '用户'; }
    return;
  }
  nameEl.textContent = '未登录';
  nameEl.style.cursor = 'pointer';
  nameEl.onclick = openAuth;
}

// 打开登录弹窗
function openAuth() {
  document.getElementById('authModal').style.display = 'flex';
  document.getElementById('authError').style.display = 'none';
}
function closeAuth() {
  document.getElementById('authModal').style.display = 'none';
}

var authIsLogin = true;
function toggleAuthMode() {
  authIsLogin = !authIsLogin;
  document.getElementById('authTitle').textContent = authIsLogin ? '登录' : '注册';
  document.getElementById('authSubmitBtn').textContent = authIsLogin ? '登 录' : '注 册';
  document.getElementById('authSwitchText').textContent = authIsLogin ? '没有账号？' : '已有账号？';
  document.getElementById('authSwitchLink').textContent = authIsLogin ? '立即注册' : '去登录';
  document.getElementById('authEmail').style.display = authIsLogin ? 'none' : 'block';
}

function doAuth() {
  var u = document.getElementById('authUsername').value.trim();
  var p = document.getElementById('authPassword').value.trim();
  var e = document.getElementById('authEmail').value.trim();
  var err = document.getElementById('authError');
  if (!u || !p) { err.textContent = '请填写用户名和密码'; err.style.display = 'block'; return; }

  var path = authIsLogin ? '/api/auth/login' : '/api/auth/register';
  var qs = 'username=' + encodeURIComponent(u) + '&password=' + encodeURIComponent(p);
  if (!authIsLogin && e) qs += '&email=' + encodeURIComponent(e);

  fetch(API_BASE + path + '?' + qs, { method: 'POST' })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (d.ok) {
        localStorage.setItem('app_user', JSON.stringify({ username: d.username, id: d.id, token: d.token }));
        localStorage.setItem('app_token', d.token);
        document.getElementById('displayUserName').textContent = d.username;
        closeAuth();
      } else {
        err.textContent = d.error || '操作失败';
        err.style.display = 'block';
      }
    })
    .catch(function () { err.textContent = '网络错误'; err.style.display = 'block'; });
}

// ============================================================
// 应用初始化 — DOM 就绪后执行
// ============================================================
// 软件页面初始化
document.addEventListener('DOMContentLoaded', function () {
  // 加载用户信息到导航栏
  loadUserInfo();
  document.getElementById('textInput').addEventListener('input', updateCharCount);
  updateCharCount();
  document.getElementById('agentSendBtn').addEventListener('click', function () { sendAgentMessage(); });
  loadHistory();
  updateStats();
  updateMiniStats();
  checkApiStatus();

  // 加载设置
  document.getElementById('apiKeyInput').value = localStorage.getItem('deepseek_api_key') || '';
  document.getElementById('apiUrlInput').value = localStorage.getItem('deepseek_api_url') || 'https://api.deepseek.com';
  document.getElementById('modelInput').value = localStorage.getItem('deepseek_model') || 'deepseek-chat';
});

// 全局快捷键
document.addEventListener('keydown', function (e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); detectText(); }
  if ((e.ctrlKey || e.metaKey) && e.key === 'b') { e.preventDefault(); toggleBatchMode(); }
  if ((e.ctrlKey || e.metaKey) && e.key === 'u') { e.preventDefault(); showUrlInput(); }
  if ((e.ctrlKey || e.metaKey) && e.key === 'f') { e.preventDefault(); expandSidebar('history'); document.getElementById('historySearch').focus(); }
  if ((e.ctrlKey || e.metaKey) && e.key === 'd') { e.preventDefault(); toggleTheme(); }
  if (e.key === '?' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); showShortcuts(); }
  if (e.key === 'Escape') { hideShortcuts(); hideUrlInput(); if (batchMode) toggleBatchMode(); }
  if (e.key === 'F11') { e.preventDefault(); toggleFullscreen(); }
});
