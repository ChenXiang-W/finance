/**
 * sidebar.js — 侧边栏交互、历史记录、统计、设置
 */

function toggleSidebar() {
  var sidebar = document.getElementById('sidebar');
  if (sidebar.classList.contains('expanded')) { collapseSidebar(); }
  else { expandSidebar('history'); }
}

function expandSidebar(tab) {
  var sidebar = document.getElementById('sidebar');
  sidebar.classList.add('expanded');
  switchSidebarTab(tab || 'history');
  updateSidebarIconActive(tab || 'history');
  var titles = { history: '检测历史', stats: '统计概览', settings: '系统设置' };
  document.getElementById('sidebarPanelTitle').textContent = titles[tab] || '检测历史';
}

function collapseSidebar() { document.getElementById('sidebar').classList.remove('expanded'); }

function switchSidebarTab(tab) {
  var tabBtns = document.querySelectorAll('.sidebar-tab');
  for (var i = 0; i < tabBtns.length; i++) { tabBtns[i].classList.toggle('active', tabBtns[i].getAttribute('data-tab') === tab); }
  var contents = document.querySelectorAll('.sidebar-tab-content');
  for (var j = 0; j < contents.length; j++) { contents[j].classList.remove('active'); }
  var target = document.getElementById('sidebar-' + tab);
  if (target) target.classList.add('active');
  updateSidebarIconActive(tab);
  var titles = { history: '检测历史', stats: '统计概览', settings: '系统设置' };
  document.getElementById('sidebarPanelTitle').textContent = titles[tab] || '';
  if (!document.getElementById('sidebar').classList.contains('expanded')) {
    document.getElementById('sidebar').classList.add('expanded');
  }
  if (tab === 'history') loadHistory();
  if (tab === 'stats') updateStats();
}

function updateSidebarIconActive(tab) {
  var iconBtns = document.querySelectorAll('.sidebar-icon-btn[data-tab]');
  for (var i = 0; i < iconBtns.length; i++) { iconBtns[i].classList.toggle('active', iconBtns[i].getAttribute('data-tab') === tab); }
}

// ---- 历史 ----
var allHistoryData = [];
function loadHistory() {
  var area = document.getElementById('historyArea');
  apiGet('/api/session/' + sessionId)
    .then(function (result) {
      allHistoryData = (result.data && result.data.conversations) || [];
      renderHistoryList(allHistoryData);
    })
    .catch(function () { allHistoryData = []; area.innerHTML = '<div class="empty-mini">后端未连接</div>'; });
}

function renderHistoryList(convs) {
  var area = document.getElementById('historyArea');
  if (convs.length === 0) { area.innerHTML = '<div class="empty-mini">暂无检测记录</div>'; return; }
  var html = '<div class="history-list">';
  convs.slice().reverse().forEach(function (conv, idx) {
    var score = conv.risk_score || 0;
    var color = score >= 0.8 ? '#d63031' : score >= 0.6 ? '#e17055' : score >= 0.4 ? '#fdcb6e' : '#00cec9';
    var preview = (conv.user_text || '').slice(0, 45);
    html += '<div class="history-item" onclick="loadHistoryItem(' + (convs.length - 1 - idx) + ')">' +
      '<div class="history-dot" style="background:' + color + ';"></div>' +
      '<div class="history-content">' +
        '<div class="history-text">' + preview + (preview.length >= 45 ? '…' : '') + '</div>' +
        '<div class="history-meta">' +
          '<span class="history-risk" style="color:' + color + ';">' + (conv.risk_level || '未知') + '</span>' +
          '<span>' + formatTime(conv.timestamp) + '</span>' +
        '</div>' +
      '</div>' +
    '</div>';
  });
  html += '</div>';
  area.innerHTML = html;
}

function filterHistory() {
  var query = document.getElementById('historySearch').value.toLowerCase();
  var filtered = allHistoryData.filter(function (c) {
    return (c.user_text || '').toLowerCase().indexOf(query) !== -1 || (c.risk_level || '').toLowerCase().indexOf(query) !== -1;
  });
  renderHistoryList(filtered);
}

function loadHistoryItem(index) {
  apiGet('/api/session/' + sessionId)
    .then(function (result) {
      var convs = (result.data && result.data.conversations) || [];
      if (convs[index]) { document.getElementById('textInput').value = convs[index].user_text || ''; updateCharCount(); showToast('已加载到输入框，可重新检测', 'success'); }
    }).catch(function () {});
}

function clearHistory() {
  if (!confirm('确定清空所有检测记录？此操作不可恢复。')) return;
  apiDelete('/api/session/' + sessionId)
    .then(function () {
      sessionId = getOrCreateSessionId();
      localStorage.setItem('fraud_session_id', sessionId);
      showToast('历史已清空', 'success');
      loadHistory(); updateStats();
    }).catch(function (err) { showToast('清空失败: ' + err.message, 'error'); });
}

// ---- 统计 ----
function updateStats() {
  apiGet('/api/session/' + sessionId)
    .then(function (result) {
      var convs = (result.data && result.data.conversations) || [];
      var info = result.data && result.data.session_info;
      document.getElementById('totalDetections').textContent = convs.length;
      document.getElementById('highRiskCount').textContent = convs.filter(function (c) { return (c.risk_score || 0) >= 0.6; }).length;
      document.getElementById('avgRiskScore').textContent = (info && info.avg_risk_score) ? info.avg_risk_score : '—';
      document.getElementById('sessionCount').textContent = 1;
    }).catch(function () { document.getElementById('avgRiskScore').textContent = '—'; });
}

function updateMiniStats() {
  apiGet('/api/session/' + sessionId)
    .then(function (result) {
      var convs = (result.data && result.data.conversations) || [];
      var info = result.data && result.data.session_info;
      document.getElementById('miniTodayDetections').textContent = convs.length || '—';
      document.getElementById('miniAvgRisk').textContent = (info && info.avg_risk_score) ? info.avg_risk_score : '—';
      document.getElementById('miniHighRisk').textContent = convs.filter(function (c) { return (c.risk_score || 0) >= 0.6; }).length || '—';
    }).catch(function () {});
}

// ---- 设置 ----
function saveSettings() {
  var apiKey = document.getElementById('apiKeyInput').value.trim();
  var apiUrl = document.getElementById('apiUrlInput').value.trim();
  var model = document.getElementById('modelInput').value.trim();
  localStorage.setItem('deepseek_api_key', apiKey);
  localStorage.setItem('deepseek_api_url', apiUrl || 'https://api.deepseek.com');
  localStorage.setItem('deepseek_model', model || 'deepseek-chat');
  apiPost('/api/llm/config', { api_key: apiKey || null, base_url: apiUrl || 'https://api.deepseek.com', model: model || 'deepseek-chat' }).catch(function () {});
  var saved = document.getElementById('settingsSaved');
  saved.style.display = 'inline';
  setTimeout(function () { saved.style.display = 'none'; }, 2000);
  showToast(apiKey ? '设置已保存，智能体已就绪' : '设置已保存（未配置 API Key 将无法使用智能体）', apiKey ? 'success' : 'error');
}

// ---- 输入框 ----
function updateCharCount() { document.getElementById('charCount').textContent = document.getElementById('textInput').value.length; }
function clearInput() { document.getElementById('textInput').value = ''; updateCharCount(); }
function fillExample(name) { document.getElementById('textInput').value = EXAMPLES[name]; updateCharCount(); }
