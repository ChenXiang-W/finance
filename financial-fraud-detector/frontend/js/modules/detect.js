/**
 * detect.js — 检测流程 + 报告渲染 + 输入区（composer）状态机
 * 输入区是常驻的：无报告时是「检测」，有报告时是「追问智能体」。
 * 批量 / URL 是 composer 的模式开关（chip），不是独立页面。
 */
var currentResult = null;
var composerMode = 'detect';   // detect | batch | url | agent
var batchMode = false;
var urlMode = false;
var busy = false;

/* ---------------- 引擎 ---------------- */

function getEngine() {
  var e = localStorage.getItem('engine');
  return (e === 'deepseek' || e === 'local') ? e : 'auto';
}

function engineName(e) {
  return { auto: '自动', deepseek: 'DeepSeek 深度', local: '本地微调' }[e] || '自动';
}

function engineUsedName(used) {
  return { deepseek: 'DeepSeek 深度分析', finetuned: '本地微调模型', none: '规则预筛' }[used] || '规则预筛';
}

function setEngine(e) {
  localStorage.setItem('engine', e);
  var btns = document.querySelectorAll('#engines .engine');
  for (var i = 0; i < btns.length; i++) {
    btns[i].setAttribute('aria-checked', btns[i].getAttribute('data-engine') === e ? 'true' : 'false');
  }
  updateSurfaceMeta();
}

/* ---------------- 输入区状态 ---------------- */

function autoGrow() {
  var ta = document.getElementById('textInput');
  if (!ta) return;
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight, 180) + 'px';
}

function updateCharCount() {
  var ta = document.getElementById('textInput');
  var el = document.getElementById('charCount');
  if (ta && el) el.textContent = ta.value.length + ' / 10000';
  autoGrow();
}

function setBusy(on) {
  busy = !!on;
  var btn = document.getElementById('btnSend');
  if (btn) btn.disabled = !!on;
  var note = document.getElementById('composerNote');
  if (note && on) { note.hidden = false; note.textContent = '分析中…'; }
  if (note && !on) { note.hidden = true; note.textContent = ''; }
}

function updateSurfaceMeta() {
  var title = document.getElementById('surfaceTitle');
  var meta = document.getElementById('surfaceMeta');
  if (!title || !meta) return;
  if (currentResult) {
    var ri = currentResult.basic_info || {};
    title.textContent = (ri.fraud_category || '未分类') + ' · ' + (ri.risk_level || '');
    meta.textContent = engineUsedName(ri.engine_used) + ' · ' + fmtWhen(ri.detected_at || currentResult.generated_at);
  } else {
    title.textContent = '新检测';
    meta.textContent = '引擎：' + engineName(getEngine());
  }
}

function updateComposer() {
  var ta = document.getElementById('textInput');
  var modeEl = document.getElementById('composerMode');
  var note = document.getElementById('composerNote');
  var chipBatch = document.getElementById('chipBatch');
  var chipUrl = document.getElementById('chipUrl');
  var chipNew = document.getElementById('chipNew');
  var send = document.getElementById('btnSend');
  if (!ta) return;

  composerMode = urlMode ? 'url' : (batchMode ? 'batch' : (currentResult ? 'agent' : 'detect'));

  if (chipBatch) chipBatch.setAttribute('aria-pressed', batchMode ? 'true' : 'false');
  if (chipUrl) chipUrl.setAttribute('aria-pressed', urlMode ? 'true' : 'false');
  if (chipNew) chipNew.hidden = !currentResult;

  if (!busy) {
    if (composerMode === 'url') {
      ta.placeholder = '粘贴要抓取正文的 URL…';
      if (modeEl) modeEl.textContent = 'URL 抓取';
      if (note) { note.hidden = false; note.textContent = '抓取网页正文后自动检测。'; }
    } else if (composerMode === 'batch') {
      ta.placeholder = '批量模式：每行一条文本（最多 20 条）…';
      if (modeEl) modeEl.textContent = '批量';
      if (note) { note.hidden = false; note.textContent = '每行一条，串行检测，结果汇总为一张表。'; }
    } else if (composerMode === 'agent') {
      ta.placeholder = '追问智能体，例如「这类诈骗的资金怎么流转」…';
      if (modeEl) modeEl.textContent = '追问';
      if (note) { note.hidden = true; note.textContent = ''; }
    } else {
      ta.placeholder = '粘贴短信、聊天记录、邮件或广告文案…';
      if (modeEl) modeEl.textContent = '检测';
      if (note) { note.hidden = true; note.textContent = ''; }
    }
  }
  if (send) send.setAttribute('aria-label', composerMode === 'agent' ? '发送追问' : '开始检测');
}

/** 清空工作台，回到空态（新检测） */
function resetSurface() {
  currentResult = null;
  batchMode = false;
  urlMode = false;
  var body = document.getElementById('reportBody');
  if (body) body.innerHTML = '';
  var conv = document.getElementById('conversation');
  if (conv) conv.hidden = true;
  var log = document.getElementById('agentLog');
  if (log) log.innerHTML = '';
  var welcome = document.getElementById('welcome');
  if (welcome) welcome.hidden = false;
  var surfaceBody = document.getElementById('surfaceBody');
  if (surfaceBody) surfaceBody.classList.add('is-idle');
  var copyBtn = document.getElementById('btnCopy');
  var expBtn = document.getElementById('btnExport');
  if (copyBtn) copyBtn.hidden = true;
  if (expBtn) expBtn.hidden = true;
  var ta = document.getElementById('textInput');
  if (ta) { ta.value = ''; updateCharCount(); ta.focus(); }
  updateSurfaceMeta();
  updateComposer();
}

function toggleBatch() {
  batchMode = !batchMode;
  if (batchMode) urlMode = false;
  updateComposer();
  document.getElementById('textInput').focus();
}

function toggleUrl() {
  urlMode = !urlMode;
  if (urlMode) batchMode = false;
  updateComposer();
  document.getElementById('textInput').focus();
}

function fillExample() {
  var keys = ['example1', 'example2', 'example3', 'example4'];
  var text = EXAMPLES[keys[Math.floor(Math.random() * keys.length)]];
  var ta = document.getElementById('textInput');
  if (!ta) return;
  ta.value = text;
  updateCharCount();
  ta.focus();
}

/* ---------------- 发送（唯一入口） ---------------- */

function dispatchSend() {
  if (busy) return;
  var ta = document.getElementById('textInput');
  var text = ta ? ta.value.trim() : '';
  if (composerMode === 'url') {
    if (!text) { showToast('请先粘贴 URL', 'error'); return; }
    fetchUrlAndDetect(text);
    return;
  }
  if (!text) { showToast(composerMode === 'agent' ? '请输入追问内容' : '请先粘贴需要检测的文本', 'error'); return; }
  if (composerMode === 'batch') { runBatch(text); return; }
  if (composerMode === 'agent') {
    sendAgentMessage(text);
    if (ta) { ta.value = ''; updateCharCount(); }
    return;
  }
  detectText(text);
}

/* ---------------- 报告渲染 ---------------- */

function showReportArea() {
  var welcome = document.getElementById('welcome');
  if (welcome) welcome.hidden = true;
  var surfaceBody = document.getElementById('surfaceBody');
  if (surfaceBody) surfaceBody.classList.remove('is-idle');
}

function renderLoading(label) {
  showReportArea();
  document.getElementById('reportBody').innerHTML =
    '<div class="skeleton-lines" aria-busy="true" aria-label="分析中">' +
      '<p class="hint">' + escapeHtml(label || '服务端分析中…') + '</p>' +
      '<div class="skeleton w40"></div>' +
      '<div class="skeleton w70"></div>' +
      '<div class="skeleton tall"></div>' +
      '<div class="skeleton w90"></div>' +
    '</div>';
}

function renderError(message) {
  showReportArea();
  document.getElementById('reportBody').innerHTML =
    '<div class="empty">' +
      '<h3>检测失败</h3>' +
      '<p>' + escapeHtml(message || '未知错误') + '</p>' +
      '<button class="btn" id="btnRetry">重试</button>' +
    '</div>';
  var retry = document.getElementById('btnRetry');
  if (retry) retry.onclick = function () { dispatchSend(); };
}

function dimsFromResult(data) {
  var factors = (data && data.risk_factors) || [];
  var rows = [];
  factors.forEach(function (f) {
    if (!f || typeof f.score !== 'number') return;
    var s = Math.max(0, Math.min(1, f.score));
    rows.push({
      label: f.category || '维度',
      value: s,
      text: s.toFixed(2),
      cls: s >= 0.6 ? 'hi' : (s >= 0.3 ? 'mid' : 'lo'),
    });
  });
  return rows;
}

function renderReport(data, opts) {
  opts = opts || {};
  showReportArea();
  var body = document.getElementById('reportBody');
  var ri = data.basic_info || {};
  var score = Number(ri.risk_score);
  var tier = riskTier(score);
  var dims = dimsFromResult(data);
  var suggestions = data.suggestions || [];
  var when = ri.detected_at || data.generated_at;
  var cfgText = (ri.confidence != null) ? Math.round(ri.confidence * 100) + '%' : '-';
  // 分析失败/未完成时不能显示「低风险」：如实标注
  var failed = String(ri.risk_level || '').indexOf('失败') >= 0;

  var html = '';

  // 结论行：等级 + 分类 + 实际引擎 + 报告号 + 时间
  html += '<div class="report-head">' +
    (failed
      ? '<span class="pill">未完成分析</span>'
      : '<span class="pill ' + pillClass(tier) + '">' + tierText(tier) + '</span>') +
    '<span class="mono" style="color:var(--muted)">' + escapeHtml(ri.fraud_category || '未分类') + '</span>' +
    '<span class="mono report-id">' + escapeHtml(engineUsedName(ri.engine_used)) + '</span>' +
    (data.demo ? '<span class="pill">示例数据</span>' : '') +
    '<span class="spacer"></span>' +
    '<span class="mono report-id">' + escapeHtml(data.report_id || '-') + '</span>' +
    '<span class="mono report-id">' + escapeHtml(fmtWhen(when)) + '</span>' +
  '</div>';

  // 主结论：评分 + 风险刻度
  html += '<div class="lead">' +
    '<div class="lead-figure">' +
      '<div class="lead-label">风险评分</div>' +
      '<div class="lead-value mono">' + (failed ? '-' : fmtScore(score)) + '<span class="of"> / 1.00</span></div>' +
      '<div class="lead-meta">' + (failed ? '未产生评分' : '置信度 ' + cfgText) + '</div>' +
    '</div>' +
    riskScale(score, { title: '风险刻度' }) +
  '</div>';

  // 两栏：六维 | 诊断 + 建议
  var left = '';
  if (dims.length) {
    left += '<div class="dims">' + barList(dims, { wide: true }) + '</div>';
  } else {
    left += '<p class="hint">六维明细需要深度分析；当前引擎未返回维度数据。</p>';
  }

  var right = '<div class="report-section"><h3>初步诊断</h3><p>' +
    escapeHtml(data.summary || '暂无诊断结论。') + '</p></div>';
  if (suggestions.length) {
    right += '<div class="report-section"><h3>防范建议</h3><ol>';
    suggestions.forEach(function (s) { right += '<li>' + escapeHtml(s) + '</li>'; });
    right += '</ol></div>';
  }

  html += '<div class="report-cols"><div class="report-main">' + left +
    '</div><div class="report-side">' + right + '</div></div>';

  body.innerHTML = html;

  // 条形入场
  var fills = body.querySelectorAll('.dim-fill');
  for (var i = 0; i < fills.length; i++) {
    (function (el) {
      var target = el.style.width;
      if (prefersReducedMotion()) return;
      el.style.width = '0%';
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { el.style.width = target; });
      });
    })(fills[i]);
  }

  currentResult = data;
  var copyBtn = document.getElementById('btnCopy');
  var expBtn = document.getElementById('btnExport');
  if (copyBtn) copyBtn.hidden = false;
  if (expBtn) expBtn.hidden = false;
  updateSurfaceMeta();
  updateComposer();

  if (opts.agentPrompt && agentHasKey()) triggerAgentAnalysis(opts.agentPrompt, data);
  refreshAfterDetect();
}

function refreshAfterDetect() {
  if (typeof renderKpis === 'function') renderKpis();
  if (typeof renderRecent === 'function') renderRecent();
  if (typeof renderPinned === 'function') renderPinned();
  if (typeof currentView !== 'undefined' && currentView === 'history' && typeof renderHistory === 'function') renderHistory();
  if (typeof currentView !== 'undefined' && currentView === 'stats' && typeof renderStats === 'function') renderStats();
}

function triggerAgentAnalysis(text, data) {
  var conv = document.getElementById('conversation');
  if (conv) conv.hidden = false;
  resetAgentContext();
  var ri = data.basic_info || {};
  var prompt = '请对以下文本进行金融欺诈分析：\n\n【待检测文本】\n' + text +
    '\n\n（系统预筛：风险评分 ' + fmtScore(ri.risk_score) + '，等级 ' + (ri.risk_level || '未知') +
    '，初步分类 ' + (ri.fraud_category || '未分类') + '）\n\n请按 6 维度框架分析。';
  sendAgentMessage(prompt);
}

/* ---------------- 检测主流程 ---------------- */

function detectText(text) {
  if (busy) return;
  setBusy(true);
  renderLoading('服务端分析中…');
  resetAgentContext();

  apiPost('/api/detect', {
    text: text,
    session_id: sessionId,
    use_llm: true,
    engine: getEngine(),
  })
    .then(function (res) {
      // /api/detect 直接返回报告对象（不包 data）
      var payload = (res && res.data) ? res.data : res;
      if (!payload || !payload.basic_info) throw new Error('后端返回为空');
      renderReport(payload, { agentPrompt: text });
    })
    .catch(function (err) {
      if (agentHasKey()) {
        renderLoading('后端不可用，转由智能体直连分析…');
        resetAgentContext();
        callDeepSeekAPI([
          { role: 'system', content: AGENT_SYSTEM_PROMPT },
          { role: 'user', content: '请按 6 维度分析以下文本，并在最后给出 0.00-1.00 的风险评分与等级：\n\n' + text },
        ]).then(function (reply) {
          var conv = document.getElementById('conversation');
          if (conv) conv.hidden = false;
          appendAgentMessage('agent', reply);
          renderError('后端不可用：分析已由对话区给出，没有结构化评分。启动后端可获得完整报告。');
        }).catch(function (e2) {
          renderError('检测失败：' + (e2.message || err.message));
        });
      } else {
        renderError('后端不可用，且未配置 DeepSeek Key。请先运行 启动服务.py，或在「设置」里配置 Key。');
      }
    })
    .then(function () { setBusy(false); });
}

/* ---------------- 批量 ---------------- */

function runBatch(raw) {
  var lines = (raw || '').split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
  if (!lines.length) { showToast('请至少输入一条文本', 'error'); return; }
  if (lines.length > 20) { showToast('单次最多 20 条', 'error'); return; }

  setBusy(true);
  var results = [];
  var idx = 0;

  function next() {
    if (idx >= lines.length) return finish();
    renderLoading('批量检测：' + (idx + 1) + ' / ' + lines.length);
    apiPost('/api/detect', {
      text: lines[idx], session_id: sessionId, use_llm: true, engine: getEngine(),
    })
      .then(function (res) { results.push({ text: lines[idx], data: (res && res.data) ? res.data : res }); })
      .catch(function () { results.push({ text: lines[idx], data: null }); })
      .then(function () { idx++; next(); });
  }

  function finish() {
    renderBatchResults(results);
    setBusy(false);
    refreshAfterDetect();
    showToast('批量完成：' + results.length + ' 条', 'success');
  }

  next();
}

function renderBatchResults(results) {
  showReportArea();
  var ok = results.filter(function (r) { return r.data; });
  var high = ok.filter(function (r) { return riskTier(r.data.basic_info.risk_score) === 'high'; }).length;
  var rows = results.map(function (r, i) {
    var d = r.data;
    if (!d) {
      return '<tr><td class="mono">' + (i + 1) + '</td><td class="truncate">' + escapeHtml(r.text) +
        '</td><td>-</td><td><span class="pill">失败</span></td><td class="n mono">-</td></tr>';
    }
    var ri = d.basic_info || {};
    var tier = riskTier(ri.risk_score);
    return '<tr><td class="mono">' + (i + 1) + '</td>' +
      '<td class="truncate" title="' + escapeHtml(r.text) + '">' + escapeHtml(r.text) + '</td>' +
      '<td class="truncate">' + escapeHtml(ri.fraud_category || '-') + '</td>' +
      '<td><span class="pill ' + pillClass(tier) + '">' + tierText(tier) + '</span></td>' +
      '<td class="n mono">' + fmtScore(ri.risk_score) + '</td></tr>';
  }).join('');

  document.getElementById('reportBody').innerHTML =
    '<p class="hint">共 ' + results.length + ' 条 · 成功 ' + ok.length + ' 条 · 高风险 ' + high + ' 条</p>' +
    '<div class="table-wrap"><table><thead><tr>' +
      '<th style="width:44px;">#</th><th>文本</th><th style="width:120px;">类型</th>' +
      '<th style="width:92px;">等级</th><th class="n" style="width:72px;">评分</th>' +
    '</tr></thead><tbody>' + rows + '</tbody></table></div>';
  currentResult = null;
  updateSurfaceMeta();
}

/* ---------------- URL 抓取 ---------------- */

function fetchUrlAndDetect(url) {
  setBusy(true);
  renderLoading('抓取网页正文…');
  apiPost('/api/fetch-url', { url: url })
    .then(function (res) {
      if (!res || !res.ok || !res.text) throw new Error((res && res.error) || '抓取失败');
      setBusy(false);
      urlMode = false;
      updateComposer();
      detectText(res.text);
    })
    .catch(function (err) {
      setBusy(false);
      renderError('抓取失败：' + err.message);
    });
}

/* ---------------- 示例报告（明确标注示例数据） ---------------- */

function runDemoPreview() {
  renderReport({
    report_id: 'DEMO-' + Date.now(),
    generated_at: new Date().toISOString(),
    demo: true,
    basic_info: {
      risk_score: 0.78,
      risk_level: '高风险',
      fraud_category: '冒充客服',
      confidence: 0.88,
      detected_at: new Date().toISOString(),
      engine_used: 'deepseek',
    },
    risk_factors: [
      { category: '欺诈手法', score: 0.92 },
      { category: '心理操控', score: 0.86 },
      { category: '资金风险', score: 0.80 },
      { category: '法律风险', score: 0.62 },
      { category: '社会危害', score: 0.70 },
      { category: '紧急程度', score: 0.88 },
    ],
    suggestions: [
      '任何要求「屏幕共享」的客服都是诈骗，立即挂断',
      '官方客服不会引导你把资金转入「安全账户」',
      '若已共享屏幕：立刻断网、挂失银行卡、修改支付密码',
      '保留通话与聊天记录，拨打 96110 或到就近派出所报案',
    ],
    summary: '典型冒充客服话术：以「征信受影响」制造紧迫感，诱导下载会议软件并屏幕共享，从而直接操作受害者银行账户。',
  });
}

/* ---------------- 复制 / 导出 ---------------- */

function copyResult() {
  if (!currentResult) { showToast('还没有可复制的结果', 'error'); return; }
  var ri = currentResult.basic_info || {};
  var text = '风险评分 ' + fmtScore(ri.risk_score) + ' / 1.00\n等级 ' + (ri.risk_level || '') +
    '\n分类 ' + (ri.fraud_category || '') + '\n报告 ' + (currentResult.report_id || '') +
    '\n\n' + (currentResult.summary || '');
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(function () { showToast('已复制', 'success'); });
  } else {
    showToast('当前浏览器不支持剪贴板', 'error');
  }
}

function exportReport() {
  if (!currentResult) { showToast('还没有可导出的结果', 'error'); return; }
  var ri = currentResult.basic_info || {};
  var lines = [
    '金盾智眼 · 金融欺诈风险报告',
    '报告编号: ' + (currentResult.report_id || 'N/A'),
    '生成时间: ' + (currentResult.generated_at || ''),
    '分析引擎: ' + engineUsedName(ri.engine_used),
    '风险评分: ' + fmtScore(ri.risk_score) + ' / 1.00',
    '风险等级: ' + (ri.risk_level || ''),
    '欺诈分类: ' + (ri.fraud_category || ''),
    '',
    '初步诊断',
    (currentResult.summary || ''),
    '',
    '防范建议',
  ];
  (currentResult.suggestions || []).forEach(function (s, i) { lines.push((i + 1) + '. ' + s); });
  var blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = '欺诈风险报告_' + (currentResult.report_id || Date.now()) + '.txt';
  a.click();
  URL.revokeObjectURL(a.href);
  showToast('报告已导出', 'success');
}
