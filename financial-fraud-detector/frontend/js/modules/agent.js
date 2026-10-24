/**
 * agent.js — DeepSeek 对话（多轮上下文）
 * 只负责对话引擎与 DOM 渲染，不关心页面结构以外的东西
 */
var agentMessages = [];

function resetAgentContext() {
  agentMessages = [{ role: 'system', content: AGENT_SYSTEM_PROMPT }];
}

function agentHasKey() {
  return !!localStorage.getItem('deepseek_api_key');
}

function callDeepSeekAPI(messages) {
  var apiKey = localStorage.getItem('deepseek_api_key');
  var apiUrl = (localStorage.getItem('deepseek_api_url') || 'https://api.deepseek.com').replace(/\/+$/, '');
  var model = localStorage.getItem('deepseek_model') || 'deepseek-chat';
  if (!apiKey) return Promise.reject(new Error('未配置 DeepSeek API Key'));
  return fetch(apiUrl + '/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
    body: JSON.stringify({ model: model, messages: messages, temperature: 0.7, max_tokens: 2048, stream: false }),
  }).then(function (resp) {
    if (!resp.ok) {
      return resp.json().catch(function () { return {}; }).then(function (err) {
        throw new Error((err.error && err.error.message) || ('API 请求失败 (HTTP ' + resp.status + ')'));
      });
    }
    return resp.json();
  }).then(function (data) {
    if (!data.choices || !data.choices[0] || !data.choices[0].message) throw new Error('API 返回格式异常');
    return data.choices[0].message.content;
  });
}

/** 极简 Markdown：粗体、换行；其余全部转义 */
function formatAgentText(text) {
  if (!text) return '';
  var escaped = escapeHtml(text);
  escaped = escaped.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  return escaped.replace(/\n/g, '<br>');
}

function appendAgentMessage(role, content) {
  var log = document.getElementById('agentLog');
  if (!log) return null;
  var div = document.createElement('div');
  div.className = 'msg' + (role === 'user' ? ' msg-user' : '');
  div.innerHTML =
    '<div class="msg-head">' + (role === 'user' ? '你' : '智能体') + '</div>' +
    '<div class="msg-body">' + formatAgentText(content) + '</div>';
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
  return div;
}

function showAgentTyping() {
  var log = document.getElementById('agentLog');
  if (!log) return;
  var div = document.createElement('div');
  div.className = 'msg';
  div.id = 'agentTyping';
  div.innerHTML = '<div class="msg-head">智能体</div><div class="msg-typing">分析中…</div>';
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

function removeAgentTyping() {
  var el = document.getElementById('agentTyping');
  if (el) el.remove();
}

function sendAgentMessage(text) {
  var input = document.getElementById('agentInput');
  var sendBtn = document.getElementById('agentSend');
  text = (text !== undefined ? text : (input ? input.value : '')).trim();
  if (!text) return;

  if (!agentHasKey()) {
    showToast('先在「设置」里配置 DeepSeek API Key', 'error');
    return;
  }

  var conv = document.getElementById('conversation');
  if (conv) conv.hidden = false;
  appendAgentMessage('user', text);
  if (input) input.value = '';
  if (sendBtn) sendBtn.disabled = true;
  agentMessages.push({ role: 'user', content: text });
  showAgentTyping();

  callDeepSeekAPI(agentMessages)
    .then(function (reply) {
      removeAgentTyping();
      agentMessages.push({ role: 'assistant', content: reply });
      appendAgentMessage('agent', reply);
    })
    .catch(function (err) {
      removeAgentTyping();
      appendAgentMessage('agent', '请求失败：' + err.message);
    })
    .then(function () {
      if (sendBtn) sendBtn.disabled = false;
    });
}

function handleAgentKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendAgentMessage();
  }
}
