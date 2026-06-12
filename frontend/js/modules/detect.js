/**
 * detect.js — 核心检测流程 & 结果渲染
 */

function detectText() {
  var text = document.getElementById('textInput').value.trim();
  if (!text) { showToast('请输入需要检测的文本内容', 'error'); return; }

  if (!localStorage.getItem('deepseek_api_key')) {
    showToast('请先在左侧「系统设置」中配置 DeepSeek API Key', 'error');
    expandSidebar('settings');
    return;
  }

  document.getElementById('resultContent').style.display = 'none';
  document.getElementById('resultEmpty').style.display = 'none';
  document.getElementById('loadingOverlay').classList.add('active');
  document.getElementById('detectBtn').disabled = true;
  document.getElementById('detectBtn').classList.add('loading');
  document.getElementById('resultActions').style.display = 'none';
  resetAgentContext();

  var useBackend = true;
  apiPost('/api/detect', { text: text, session_id: sessionId, use_llm: true })
    .catch(function () { useBackend = false; return null; })
    .then(function (backendResult) {
      if (backendResult && backendResult.data) {
        currentResult = backendResult.data;
        renderResult(currentResult);
        triggerAgentAnalysis(text, currentResult, useBackend);
      } else {
        currentResult = buildBasicResult(text);
        renderResult(currentResult);
        triggerAgentAnalysis(text, currentResult, false);
      }
      loadHistory();
      updateStats();
    })
    .catch(function (err) {
      document.getElementById('loadingOverlay').classList.remove('active');
      document.getElementById('resultEmpty').style.display = 'none';
      document.getElementById('resultContent').style.display = 'block';
      document.getElementById('resultActions').style.display = 'none';
      document.getElementById('resultContent').innerHTML =
        '<div class="error-card">' +
          '<div class="error-icon">⚠️</div>' +
          '<div class="error-title">检测失败</div>' +
          '<div class="error-desc">' + err.message + '</div>' +
          '<button class="btn btn-primary btn-sm" onclick="detectText()">🔄 重试</button>' +
        '</div>';
      showToast('检测失败: ' + err.message, 'error');
      document.getElementById('detectBtn').disabled = false;
      document.getElementById('detectBtn').classList.remove('loading');
    });
}

function buildBasicResult(text) {
  return {
    report_id: 'RPT-' + Date.now(),
    generated_at: new Date().toISOString(),
    basic_info: { risk_score: 0, risk_level: '待分析', fraud_category: '分析中', confidence: 0, detected_at: new Date().toISOString() },
    text_analysis: { text_length: text.length, text_preview: text.slice(0, 120) },
    risk_factors: [],
    suggestions: ['请查看智能体深度分析获取完整评估'],
    summary: '已交由金融反欺诈智能体进行深度分析…',
    llm_analysis: '',
  };
}

function triggerAgentAnalysis(text, result, hasBackend) {
  resetAgentContext();
  var prompt;
  if (hasBackend && result && result.basic_info) {
    var ri = result.basic_info;
    prompt = '请对以下文本进行全面的金融欺诈分析：\n\n【待检测文本】\n' + text + '\n\n（系统预筛：风险评分 ' + ri.risk_score.toFixed(2) + '，等级 ' + ri.risk_level + '，初步分类 ' + ri.fraud_category + '）\n\n请按你的 6 维度分析框架进行全面深度分析。';
  } else {
    prompt = '请对以下文本进行全面的金融欺诈分析：\n\n【待检测文本】\n' + text + '\n\n请按你的 6 维度分析框架进行全面深度分析。';
  }
  agentMessages.push({ role: 'user', content: prompt });

  var msgContainer = document.getElementById('agentMessages');
  msgContainer.innerHTML = '';
  showAgentTyping();

  callDeepSeekAPI(agentMessages)
    .then(function (reply) {
      removeAgentTyping();
      agentMessages.push({ role: 'assistant', content: reply });
      appendAgentMessage('agent', reply, true);
      if (currentResult) currentResult.llm_analysis = reply;
      document.getElementById('loadingOverlay').classList.remove('active');
      document.getElementById('detectBtn').disabled = false;
      document.getElementById('detectBtn').classList.remove('loading');
      showToast('智能体分析完成', 'success');
    })
    .catch(function (err) {
      removeAgentTyping();
      appendAgentMessage('agent', '⚠️ 智能体调用失败: ' + err.message, true);
      document.getElementById('loadingOverlay').classList.remove('active');
      document.getElementById('detectBtn').disabled = false;
      document.getElementById('detectBtn').classList.remove('loading');
    });
}

function renderResult(data) {
  document.getElementById('loadingOverlay').classList.remove('active');
  document.getElementById('resultEmpty').style.display = 'none';
  document.getElementById('resultContent').style.display = 'block';
  document.getElementById('resultActions').style.display = 'flex';

  var ri = data.basic_info || {};
  var score = ri.risk_score || 0;
  var level = ri.risk_level || '分析中';
  var category = ri.fraud_category || '分析中';
  var detectedAt = ri.detected_at || new Date().toISOString();

  var color = score >= 0.8 ? '#d63031' : score >= 0.6 ? '#e17055' : score >= 0.4 ? '#fdcb6e' : score > 0 ? '#00cec9' : '#636e72';
  var categoryTag = (category.indexOf('冒充') !== -1) ? 'tag-purple' : (category.indexOf('投资') !== -1) ? 'tag-red' : (category.indexOf('信贷') !== -1 || category.indexOf('贷款') !== -1) ? 'tag-orange' : 'tag-green';

  var gaugeHtml = drawGauge(score);
  var dimensions = extractDimensions(data);
  var radarHtml = drawRadarChart(dimensions);
  var pieData = [
    { label: category, value: 30, color: color },
    { label: '冒充客服', value: category === '冒充客服' ? 0 : 15, color: '#6c5ce7' },
    { label: '虚假投资', value: category === '虚假投资' ? 0 : 15, color: '#e17055' },
    { label: '其他类型', value: category === '正常' ? 30 : 15, color: '#b2bec3' },
  ].filter(function (d) { return d.value > 0; });
  var pieHtml = drawCategoryPie(pieData);

  document.getElementById('gaugeRow').innerHTML = gaugeHtml;
  setTimeout(function () {
    var scoreEl = document.querySelector('.gauge-score');
    if (scoreEl) animateScore(scoreEl, score);
  }, 150);

  document.getElementById('chartsRow').innerHTML =
    '<div class="chart-card fade-in"><div class="chart-title">📊 风险维度分析</div>' + radarHtml + '</div>' +
    '<div class="chart-card fade-in" style="animation-delay:0.1s;"><div class="chart-title">🎯 欺诈类型分布</div>' + pieHtml + '</div>';

  document.getElementById('riskIndicator').innerHTML =
    '<div class="risk-indicator-inner" style="background:rgba(' + (score >= 0.6 ? '255,34,68' : score >= 0.4 ? '253,203,110' : '0,206,201') + ',0.06);border:1px solid ' + color + ';">' +
      '<div class="risk-info-compact">' +
        '<span class="risk-level-text" style="color:' + color + ';">' + level + '</span>' +
        '<span class="risk-divider">|</span>' +
        '<span>分类：<span class="tag ' + categoryTag + '">' + category + '</span></span>' +
        '<span class="risk-divider">|</span>' +
        '<span class="risk-time">检测时间：' + formatTime(detectedAt) + '</span>' +
      '</div>' +
    '</div>';

  var factorsHtml = '';
  if (data.risk_factors && data.risk_factors.length > 0) {
    factorsHtml = '<div class="risk-factors-list">';
    data.risk_factors.forEach(function (rf) {
      var barColor = rf.score >= 0.6 ? '#d63031' : rf.score >= 0.3 ? '#fdcb6e' : '#00cec9';
      var pct = (rf.score * 100).toFixed(0);
      factorsHtml +=
        '<div class="risk-factor-item">' +
          '<div class="risk-factor-label">' + rf.category + '</div>' +
          '<div class="risk-factor-bar"><div class="risk-factor-fill" style="width:' + pct + '%;background:' + barColor + ';"></div></div>' +
          '<div class="risk-factor-score" style="color:' + barColor + ';">' + rf.score.toFixed(2) + '</div>' +
        '</div>';
    });
    factorsHtml += '</div>';
  }
  document.getElementById('riskFactorsSection').innerHTML =
    '<h4>⚠ 风险因子</h4>' + (factorsHtml || '<p style="color:var(--text-dim);font-size:13px;">详见右侧智能体深度分析</p>');

  document.getElementById('summarySection').innerHTML =
    '<h4>📋 初步诊断</h4><p>' + (data.summary || '请查看右侧智能体的多维度深度分析') + '</p>';

  var suggestionsHtml = '';
  if (data.suggestions && data.suggestions.length > 0) {
    suggestionsHtml = '<ul class="suggestions-list">';
    data.suggestions.forEach(function (s) { suggestionsHtml += '<li>' + s + '</li>'; });
    suggestionsHtml += '</ul>';
  }
  document.getElementById('suggestionsSection').innerHTML =
    '<h4>🛡 初步建议</h4>' + (suggestionsHtml || '<p style="color:var(--text-dim);font-size:13px;">请查看右侧智能体的详细防范建议</p>');

  var els = document.querySelectorAll('#resultContent .fade-in');
  for (var i = 0; i < els.length; i++) { els[i].style.animationDelay = (i * 0.06) + 's'; }
}

function copyResult() {
  if (!currentResult) return;
  var ri = currentResult.basic_info || {};
  var text = '风险等级: ' + (ri.risk_level || 'N/A') + '\n风险评分: ' + (ri.risk_score || 'N/A') + '\n欺诈分类: ' + (ri.fraud_category || 'N/A') + '\n' + (currentResult.summary || '');
  navigator.clipboard.writeText(text).then(function () { showToast('已复制到剪贴板', 'success'); }).catch(function () { showToast('复制失败', 'error'); });
}

function downloadReport() {
  if (!currentResult) return;
  var ri = currentResult.basic_info || {};
  var content = '═══════════════════════════════\n  金融欺诈风险分析报告\n═══════════════════════════════\n\n' +
    '报告编号: ' + (currentResult.report_id || 'N/A') + '\n生成时间: ' + formatTime(currentResult.generated_at || new Date().toISOString()) + '\n' +
    '风险评分: ' + (ri.risk_score || 'N/A') + '\n风险等级: ' + (ri.risk_level || 'N/A') + '\n欺诈分类: ' + (ri.fraud_category || 'N/A') + '\n\n' +
    '───────────────\nAI 智能体深度分析\n───────────────\n\n' + (currentResult.llm_analysis || '暂无') + '\n\n本报告由金融反欺诈智能体自动生成\n';
  var blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = '欺诈风险分析报告_' + (currentResult.report_id || Date.now()) + '.txt';
  a.click();
  URL.revokeObjectURL(url);
  showToast('报告已下载', 'success');
}
