/**
 * nav.js — 视图切换、左侧资产栏（会话/引擎/置顶/最近/状态）、历史、统计、设置
 */
var currentView = 'detect';
var sessionConvs = [];
var historyQuery = '';
var historyLevel = 'all';
var statsScope = 'session';

var VIEWS = ['detect', 'history', 'stats', 'settings'];

/* ---------------- 视图 ---------------- */

function setView(name) {
  if (VIEWS.indexOf(name) < 0) name = 'detect';
  currentView = name;
  VIEWS.forEach(function (v) {
    var el = document.getElementById('view-' + v);
    if (el) el.hidden = (v !== name);
  });
  var btns = document.querySelectorAll('.rail-btn[data-view]');
  for (var i = 0; i < btns.length; i++) {
    var isOn = btns[i].getAttribute('data-view') === name;
    if (isOn) btns[i].setAttribute('aria-current', 'page');
    else btns[i].removeAttribute('aria-current');
  }
  if (location.hash !== '#/' + name) {
    try { history.replaceState(null, '', '#/' + name); } catch (e) { /* file:// 忽略 */ }
  }
  if (name === 'history') loadHistory();
  if (name === 'stats') renderStats();
  if (name === 'settings') renderSettings();
  if (name === 'detect') refreshSidebar();
}

function initViewFromHash() {
  var h = (location.hash || '').replace(/^#\/?/, '');
  setView(VIEWS.indexOf(h) >= 0 ? h : 'detect');
}

/* ---------------- 左侧资产栏 ---------------- */

function renderSessionLabel() {
  var el = document.getElementById('sessionLabel');
  if (!el) return;
  el.textContent = String(sessionId).replace(/^session_/, '').slice(0, 14);
}

/** 服务状态 + 全局计数：写入左栏底部与快捷操作数字 */
function renderKpis() {
  return apiGet('/api/stats').then(function (s) {
    var total = s.total_detections || 0;
    var high = s.high_risk_count || 0;
    var foot = document.getElementById('serviceFoot');
    var dot = document.getElementById('serviceDot');
    if (dot) dot.className = 'dot on';
    if (foot) foot.textContent = '后端在线 · 累计 ' + total + ' 条 · 高风险 ' + high;
    var batchNum = document.querySelector('#btnQuickBatch .num');
    var urlNum = document.querySelector('#btnQuickUrl .num');
    if (batchNum) batchNum.textContent = '20';
    if (urlNum) urlNum.textContent = '1';
    return s;
  }).catch(function () {
    var foot = document.getElementById('serviceFoot');
    var dot = document.getElementById('serviceDot');
    if (dot) dot.className = 'dot off';
    if (foot) foot.textContent = '后端离线 · 只能直连智能体';
  });
}

function loadSession(onDone) {
  return apiGet('/api/session/' + sessionId).then(function (res) {
    sessionConvs = (res.data && res.data.conversations) || [];
    if (onDone) onDone(sessionConvs);
    return sessionConvs;
  }).catch(function () {
    sessionConvs = [];
    if (onDone) onDone(sessionConvs);
    return [];
  });
}

/** 最近检测：左栏 34px 行 */
function renderRecent() {
  loadSession(function (convs) {
    var box = document.getElementById('recentRows');
    if (!box) return;
    var latest = convs.slice(-5).reverse();
    if (!latest.length) {
      box.innerHTML = '<p class="hint">还没有检测记录</p>';
    } else {
      box.innerHTML = latest.map(function (c) {
        var tier = riskTier(c.risk_score);
        return '<button class="recent-row" data-open="' + c.id + '" title="' + escapeHtml(c.user_text || '') + '">' +
          '<span class="recent-dot ' + tier + '"></span>' +
          '<span class="recent-label">' + escapeHtml((c.user_text || '').slice(0, 24)) + '</span>' +
          '<span class="recent-val">' + fmtScore(c.risk_score) + '</span>' +
        '</button>';
      }).join('');
      var rows = box.querySelectorAll('.recent-row');
      for (var i = 0; i < rows.length; i++) {
        rows[i].onclick = function () { openConversation(this.getAttribute('data-open')); };
      }
    }
    renderPinned();
    renderWelcomeRecent(convs);
  });
}

/** 空态下方的最近 3 条：让空态有实质内容，而不是一整块空白 */
function renderWelcomeRecent(convs) {
  var box = document.getElementById('welcomeRecent');
  if (!box) return;
  var latest = (convs || []).slice(-3).reverse();
  var head = '<div class="caption">最近检测</div>';
  if (!latest.length) {
    box.innerHTML = head + '<p class="hint">还没有记录，粘贴一段文本开始第一条检测。</p>';
    return;
  }
  box.innerHTML = head + latest.map(function (c) {
    var tier = riskTier(c.risk_score);
    return '<button class="recent-row" data-open="' + c.id + '">' +
      '<span class="recent-dot ' + tier + '"></span>' +
      '<span class="recent-label">' + escapeHtml((c.user_text || '').slice(0, 34)) + '</span>' +
      '<span class="recent-val">' + fmtScore(c.risk_score) + '</span>' +
    '</button>';
  }).join('');
  var rows = box.querySelectorAll('.recent-row');
  for (var i = 0; i < rows.length; i++) {
    rows[i].onclick = function () { openConversation(this.getAttribute('data-open')); };
  }
}

/** 置顶：当前报告；没有就取最近一条 */
function renderPinned() {
  var box = document.getElementById('pinnedReport');
  if (!box) return;
  var conv = sessionConvs.length ? sessionConvs[sessionConvs.length - 1] : null;
  if (typeof currentResult !== 'undefined' && currentResult) {
    var ri = currentResult.basic_info || {};
    box.innerHTML = '<button class="pinned" id="pinnedCurrent">' +
      '<span class="pinned-title">' + escapeHtml(ri.fraud_category || '当前报告') + ' · 评分 ' + fmtScore(ri.risk_score) + '</span>' +
      '<span class="pinned-meta">' + escapeHtml(currentResult.report_id || '') + ' · ' + escapeHtml(fmtWhen(ri.detected_at)) + '</span>' +
    '</button>';
  } else if (conv) {
    box.innerHTML = '<button class="pinned" id="pinnedLast">' +
      '<span class="pinned-title">' + escapeHtml((conv.user_text || '').slice(0, 28)) + '</span>' +
      '<span class="pinned-meta">' + escapeHtml(conv.fraud_type || '未分类') + ' · ' + fmtScore(conv.risk_score) + ' · ' + escapeHtml(fmtWhen(conv.timestamp)) + '</span>' +
    '</button>';
    var last = document.getElementById('pinnedLast');
    if (last) last.onclick = function () { openConversation(conv.id); };
  } else {
    box.innerHTML = '<p class="hint">还没有报告</p>';
  }
}

function refreshSidebar() {
  renderSessionLabel();
  renderKpis();
  renderRecent();
}

/* ---------------- 历史记录页 ---------------- */

function loadHistory() {
  loadSession(function () { renderHistory(); });
}

function renderHistory() {
  var tbody = document.getElementById('historyBody');
  if (!tbody) return;
  var q = historyQuery.toLowerCase();
  var filtered = sessionConvs.filter(function (c) {
    var hitQ = !q ||
      (c.user_text || '').toLowerCase().indexOf(q) !== -1 ||
      (c.fraud_type || '').toLowerCase().indexOf(q) !== -1 ||
      (c.risk_level || '').toLowerCase().indexOf(q) !== -1;
    var hitL = historyLevel === 'all' || riskTier(c.risk_score) === historyLevel;
    return hitQ && hitL;
  }).slice().reverse();

  var totalEl = document.getElementById('historyTotal');
  if (totalEl) totalEl.textContent = filtered.length + ' 条';

  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="6"><div class="empty"><p>' +
      (sessionConvs.length ? '没有符合筛选条件的记录' : '还没有检测记录') + '</p></div></td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(function (c) {
    var tier = riskTier(c.risk_score);
    return '<tr data-open="' + c.id + '" style="cursor:pointer;">' +
      '<td class="mono" style="color:var(--muted)">' + escapeHtml(fmtWhen(c.timestamp)) + '</td>' +
      '<td><span class="truncate" title="' + escapeHtml(c.user_text || '') + '">' + escapeHtml((c.user_text || '').slice(0, 60)) + '</span></td>' +
      '<td>' + escapeHtml(c.fraud_type || '未分类') + '</td>' +
      '<td><span class="pill ' + pillClass(tier) + '">' + tierText(tier) + '</span></td>' +
      '<td class="n mono">' + fmtScore(c.risk_score) + '</td>' +
      '<td class="n"><button class="row-del" data-del="' + c.id + '" title="删除这条记录">×</button></td>' +
    '</tr>';
  }).join('');

  var trs = tbody.querySelectorAll('tr[data-open]');
  for (var i = 0; i < trs.length; i++) {
    trs[i].onclick = function (ev) {
      if (ev.target && ev.target.hasAttribute && ev.target.hasAttribute('data-del')) return;
      openConversation(this.getAttribute('data-open'));
    };
  }
  var dels = tbody.querySelectorAll('[data-del]');
  for (var j = 0; j < dels.length; j++) {
    dels[j].onclick = function (ev) {
      ev.stopPropagation();
      deleteConversation(this.getAttribute('data-del'));
    };
  }
}

/** 打开历史记录：回到工作台并渲染当时的完整报告 */
function openConversation(id) {
  var conv = null;
  for (var i = 0; i < sessionConvs.length; i++) {
    if (String(sessionConvs[i].id) === String(id)) { conv = sessionConvs[i]; break; }
  }
  if (!conv) return;
  setView('detect');
  if (conv.result) {
    renderReport(conv.result);
    showToast('已恢复 ' + fmtWhen(conv.timestamp) + ' 的报告', 'success');
  } else {
    showToast('该记录没有完整报告', 'error');
  }
}

function deleteConversation(id) {
  apiDelete('/api/session/' + sessionId + '/item/' + id).then(function () {
    showToast('已删除', 'success');
    loadSession(function () { renderRecent(); renderHistory(); });
  }).catch(function (err) {
    showToast('删除失败：' + err.message, 'error');
  });
}

/* ---------------- 统计页 ---------------- */

function setStatsScope(scope) {
  statsScope = scope;
  var btns = document.querySelectorAll('#statsScope button');
  for (var i = 0; i < btns.length; i++) {
    btns[i].setAttribute('aria-pressed', btns[i].getAttribute('data-scope') === scope ? 'true' : 'false');
  }
  renderStats();
}

function renderStats() {
  var sub = document.getElementById('statsSub');
  if (statsScope === 'global') {
    if (sub) sub.textContent = '全部记录的检测分布';
    apiGet('/api/stats').then(function (s) {
      var total = s.total_detections || 0;
      var high = s.high_risk_count || 0;
      document.getElementById('sKpiTotal').textContent = total;
      document.getElementById('sKpiHigh').textContent = high;
      document.getElementById('sKpiAvg').textContent = (s.avg_risk_score > 0) ? Number(s.avg_risk_score).toFixed(2) : '-';
      document.getElementById('sKpiTypes').textContent = (s.categories || []).length;

      var cats = (s.categories || []).map(function (c) {
        return { label: c.name || '未分类', value: c.count || 0, text: String(c.count || 0) };
      });
      document.getElementById('statsCategories').innerHTML = cats.length
        ? barList(cats, { wide: true })
        : '<div class="empty"><p>暂无数据</p></div>';

      document.getElementById('statsRisk').innerHTML = total
        ? barList([
            { label: '高风险', value: high, cls: 'hi', text: high + ' · ' + Math.round(high / total * 100) + '%' },
            { label: '其他/未分级', value: Math.max(0, total - high), text: String(Math.max(0, total - high)) },
          ], { max: total, wide: true }) +
          '<p class="hint" style="margin-top:10px;">全部记录只提供高风险计数，中/低风险未细分。</p>'
        : '<div class="empty"><p>暂无数据</p></div>';

      document.getElementById('statsScale').innerHTML =
        riskScale(s.avg_risk_score > 0 ? s.avg_risk_score : null, { title: '平均评分位置' });
    }).catch(function () {
      document.getElementById('statsCategories').innerHTML = '<div class="empty"><p>后端不可用</p></div>';
    });
    renderStatsRecent();
    return;
  }

  loadSession(function (convs) {
    if (sub) sub.textContent = '本会话的检测分布与最近记录 · ' + convs.length + ' 条';
    var total = convs.length;
    var high = convs.filter(function (c) { return riskTier(c.risk_score) === 'high'; }).length;
    var scores = convs.map(function (c) { return Number(c.risk_score); }).filter(function (v) { return isFinite(v); });
    var avg = scores.length ? scores.reduce(function (a, b) { return a + b; }, 0) / scores.length : null;
    var typeCount = {};
    convs.forEach(function (c) {
      var k = c.fraud_type || '未分类';
      typeCount[k] = (typeCount[k] || 0) + 1;
    });

    document.getElementById('sKpiTotal').textContent = total;
    document.getElementById('sKpiHigh').textContent = high;
    document.getElementById('sKpiAvg').textContent = avg != null ? avg.toFixed(2) : '-';
    document.getElementById('sKpiTypes').textContent = Object.keys(typeCount).length;

    var cats = Object.keys(typeCount).map(function (k) {
      return { label: k, value: typeCount[k], text: String(typeCount[k]) };
    }).sort(function (a, b) { return b.value - a.value; });
    document.getElementById('statsCategories').innerHTML = cats.length
      ? barList(cats, { wide: true })
      : '<div class="empty"><p>还没有检测记录</p></div>';

    var buckets = { high: high, mid: 0, low: 0 };
    convs.forEach(function (c) {
      var t = riskTier(c.risk_score);
      if (t === 'mid') buckets.mid++;
      else if (t === 'low') buckets.low++;
    });
    document.getElementById('statsRisk').innerHTML = riskDistribution(buckets);
    document.getElementById('statsScale').innerHTML = scoreHistogram(scores);
    renderStatsRecent();
  });
}

function renderStatsRecent() {
  var tbody = document.getElementById('statsRecent');
  if (!tbody) return;
  var latest = sessionConvs.slice(-10).reverse();
  var note = document.getElementById('statsRecentNote');
  if (note) note.textContent = '本会话最近 ' + latest.length + ' 条';
  if (!latest.length) {
    tbody.innerHTML = '<tr><td colspan="5"><div class="empty"><p>还没有检测记录</p></div></td></tr>';
    return;
  }
  tbody.innerHTML = latest.map(function (c) {
    var tier = riskTier(c.risk_score);
    return '<tr>' +
      '<td class="mono" style="color:var(--muted)">' + escapeHtml(fmtWhen(c.timestamp)) + '</td>' +
      '<td><span class="truncate">' + escapeHtml((c.user_text || '').slice(0, 60)) + '</span></td>' +
      '<td>' + escapeHtml(c.fraud_type || '未分类') + '</td>' +
      '<td><span class="pill ' + pillClass(tier) + '">' + tierText(tier) + '</span></td>' +
      '<td class="n mono">' + fmtScore(c.risk_score) + '</td>' +
    '</tr>';
  }).join('');
}

/* ---------------- 设置页 ---------------- */

function renderSettings() {
  var theme = localStorage.getItem('theme');
  var motionOff = localStorage.getItem('motion_off') === '1';
  var setTheme = document.getElementById('setTheme');
  var setMotion = document.getElementById('setMotion');
  if (setTheme) setTheme.checked = theme !== 'light';
  if (setMotion) setMotion.checked = !motionOff;
  document.getElementById('setApiBase').value = localStorage.getItem('api_base') || '';
  document.getElementById('setKey').value = localStorage.getItem('deepseek_api_key') || '';
  document.getElementById('setApiUrl').value = localStorage.getItem('deepseek_api_url') || 'https://api.deepseek.com';
  document.getElementById('setModel').value = localStorage.getItem('deepseek_model') || 'deepseek-chat';
  checkService();
}

function saveSettings() {
  var apiBase = document.getElementById('setApiBase').value.trim().replace(/\/+$/, '');
  var key = document.getElementById('setKey').value.trim();
  var apiUrl = document.getElementById('setApiUrl').value.trim();
  var model = document.getElementById('setModel').value.trim();
  var oldBase = localStorage.getItem('api_base') || '';

  if (apiBase) localStorage.setItem('api_base', apiBase);
  else localStorage.removeItem('api_base');
  localStorage.setItem('deepseek_api_key', key);
  localStorage.setItem('deepseek_api_url', apiUrl || 'https://api.deepseek.com');
  localStorage.setItem('deepseek_model', model || 'deepseek-chat');

  apiPost('/api/llm/config', {
    api_key: key || null,
    base_url: apiUrl || 'https://api.deepseek.com',
    model: model || 'deepseek-chat',
  }).catch(function () { /* 后端离线时仅保存本地 */ });

  var saved = document.getElementById('settingsSaved');
  if (saved) {
    saved.hidden = false;
    setTimeout(function () { saved.hidden = true; }, 2500);
  }
  showToast(oldBase !== apiBase ? '后端地址已更新，刷新页面后生效' : '设置已保存', 'success');
  checkService();
}
