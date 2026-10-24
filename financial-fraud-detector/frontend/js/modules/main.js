/**
 * main.js — 页面初始化与事件绑定
 */

/* ---------------- 外观（主题 / 动效） ---------------- */

function applyTheme() {
  var mode = localStorage.getItem('theme') === 'light' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', mode);
}

function setTheme(isDark) {
  localStorage.setItem('theme', isDark ? 'dark' : 'light');
  applyTheme();
  var sw = document.getElementById('setTheme');
  if (sw) sw.checked = !!isDark;
}

function applyMotion() {
  var off = localStorage.getItem('motion_off') === '1';
  document.body.classList.toggle('motion-off', off);
  var sw = document.getElementById('setMotion');
  if (sw) sw.checked = !off;
}

function setMotion(on) {
  localStorage.setItem('motion_off', on ? '0' : '1');
  applyMotion();
  if (on && typeof initCyber === 'function') initCyber();
}

/* ---------------- 绑定 ---------------- */

function bindEvents() {
  // 左侧图标栏 + 跳转按钮
  document.querySelectorAll('.rail-btn[data-view]').forEach(function (btn) {
    btn.addEventListener('click', function () { setView(this.getAttribute('data-view')); });
  });
  document.querySelectorAll('[data-goto]').forEach(function (btn) {
    btn.addEventListener('click', function () { setView(this.getAttribute('data-goto')); });
  });

  // 新检测 / 引擎
  document.getElementById('btnNewDetect').addEventListener('click', resetSurface);
  document.querySelectorAll('#engines .engine').forEach(function (btn) {
    btn.addEventListener('click', function () { setEngine(this.getAttribute('data-engine')); });
  });

  // 快捷操作
  document.getElementById('btnQuickBatch').addEventListener('click', toggleBatch);
  document.getElementById('btnQuickUrl').addEventListener('click', toggleUrl);

  // 输入区
  var ta = document.getElementById('textInput');
  ta.addEventListener('input', updateCharCount);
  ta.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      dispatchSend();
    }
  });
  document.getElementById('btnSend').addEventListener('click', dispatchSend);

  // 输入区 chips
  document.getElementById('chipExample').addEventListener('click', fillExample);
  document.getElementById('chipBatch').addEventListener('click', toggleBatch);
  document.getElementById('chipUrl').addEventListener('click', toggleUrl);
  document.getElementById('chipNew').addEventListener('click', resetSurface);

  // 空态建议卡
  document.querySelectorAll('.suggestion[data-example]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var key = this.getAttribute('data-example');
      if (!EXAMPLES[key]) return;
      ta.value = EXAMPLES[key];
      updateCharCount();
      ta.focus();
    });
  });

  // 示例报告
  document.getElementById('btnDemo').addEventListener('click', runDemoPreview);

  // 报告操作
  document.getElementById('btnCopy').addEventListener('click', copyResult);
  document.getElementById('btnExport').addEventListener('click', exportReport);

  // 历史筛选
  var search = document.getElementById('historySearch');
  if (search) {
    search.addEventListener('input', debounce(function () {
      historyQuery = search.value.trim();
      renderHistory();
    }, 180));
  }
  document.querySelectorAll('#historyLevel button').forEach(function (btn) {
    btn.addEventListener('click', function () {
      historyLevel = this.getAttribute('data-level');
      document.querySelectorAll('#historyLevel button').forEach(function (b) {
        b.setAttribute('aria-pressed', b === btn ? 'true' : 'false');
      });
      renderHistory();
    });
  });

  // 统计范围
  document.querySelectorAll('#statsScope button').forEach(function (btn) {
    btn.addEventListener('click', function () { setStatsScope(this.getAttribute('data-scope')); });
  });

  // 设置
  document.getElementById('setTheme').addEventListener('change', function () { setTheme(this.checked); });
  document.getElementById('setMotion').addEventListener('change', function () { setMotion(this.checked); });
  document.getElementById('btnSaveSettings').addEventListener('click', saveSettings);

  // 快捷键
  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); dispatchSend(); }
    if (e.key === 'Escape') {
      if (batchMode || urlMode) { batchMode = false; urlMode = false; updateComposer(); }
      else if (typeof currentResult !== 'undefined' && currentResult) { resetSurface(); }
    }
  });
}

/* ---------------- 启动 ---------------- */

document.addEventListener('DOMContentLoaded', function () {
  applyTheme();
  applyMotion();
  bindEvents();
  setEngine(getEngine());
  updateCharCount();
  updateComposer();
  initViewFromHash();
  refreshSidebar();
  checkService();
  if (typeof initCyber === 'function') initCyber();
  setInterval(checkService, 30000);
});
