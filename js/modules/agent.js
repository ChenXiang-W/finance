/**
 * agent.js — AI 智能体对话引擎
 */

var agentMessages = [];

function resetAgentContext() {
  agentMessages = [{ role: 'system', content: AGENT_SYSTEM_PROMPT }];
}
resetAgentContext();

function callDeepSeekAPI(messages) {
  var apiKey = localStorage.getItem('deepseek_api_key');
  var apiUrl = (localStorage.getItem('deepseek_api_url') || 'https://api.deepseek.com').replace(/\/+$/, '');
  var model = localStorage.getItem('deepseek_model') || 'deepseek-chat';

  if (!apiKey) {
    return Promise.reject(new Error('请先在左侧「系统设置」中配置 DeepSeek API Key'));
  }

  return fetch(apiUrl + '/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
    body: JSON.stringify({ model: model, messages: messages, temperature: 0.7, max_tokens: 2048, stream: false }),
  }).then(function (resp) {
    if (!resp.ok) {
      return resp.json().catch(function () { return {}; }).then(function (err) {
        throw new Error(err.error && err.error.message || 'API 请求失败 (HTTP ' + resp.status + ')');
      });
    }
    return resp.json();
  }).then(function (data) {
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      throw new Error('API 返回格式异常');
    }
    return data.choices[0].message.content;
  });
}

function formatAgentContent(text) {
  if (!text) return '';
  var escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  escaped = escaped.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  escaped = escaped.replace(/\*(.+?)\*/g, '<i>$1</i>');
  var paragraphs = escaped.split(/\n\n+/);
  var result = '';
  for (var i = 0; i < paragraphs.length; i++) {
    var p = paragraphs[i].trim();
    if (!p) continue;
    p = p.replace(/\n/g, '<br>');
    result += '<p>' + p + '</p>';
  }
  return result || '<p>' + escaped + '</p>';
}

function appendAgentMessage(role, content, animate) {
  var container = document.getElementById('agentMessages');
  var div = document.createElement('div');
  div.className = 'agent-msg agent-msg-' + (role === 'user' ? 'user' : 'agent');
  var avatarEmoji = role === 'user' ? '👤' : '🛡️';
  div.innerHTML = '<div class="agent-avatar">' + avatarEmoji + '</div>' +
    '<div class="agent-bubble"><div class="agent-bubble-text">' + formatAgentContent(content) + '</div></div>';

  if (animate) {
    div.style.opacity = '0'; div.style.transform = 'translateY(8px)';
    container.appendChild(div);
    requestAnimationFrame(function () {
      div.style.transition = 'all 0.3s ease-out';
      div.style.opacity = '1'; div.style.transform = 'translateY(0)';
    });
  } else {
    container.appendChild(div);
  }
  container.scrollTop = container.scrollHeight;
  return div;
}

function showAgentTyping() {
  var container = document.getElementById('agentMessages');
  var div = document.createElement('div');
  div.className = 'agent-msg agent-msg-agent';
  div.id = 'agentTyping';
  div.innerHTML = '<div class="agent-avatar">🛡️</div><div class="agent-bubble typing-cursor" style="color:var(--text-dim);">分析中</div>';
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function removeAgentTyping() {
  var el = document.getElementById('agentTyping');
  if (el) el.remove();
}

function sendAgentMessage(text) {
  if (!text) text = document.getElementById('agentInput').value.trim();
  if (!text) return;

  if (!localStorage.getItem('deepseek_api_key')) {
    showToast('请先在左侧「系统设置」中配置 DeepSeek API Key', 'error');
    expandSidebar('settings');
    return;
  }

  appendAgentMessage('user', text, true);
  document.getElementById('agentInput').value = '';
  document.getElementById('agentSendBtn').disabled = true;
  agentMessages.push({ role: 'user', content: text });
  showAgentTyping();

  callDeepSeekAPI(agentMessages)
    .then(function (reply) {
      removeAgentTyping();
      agentMessages.push({ role: 'assistant', content: reply });
      appendAgentMessage('agent', reply, true);
      document.getElementById('agentSendBtn').disabled = false;
    })
    .catch(function (err) {
      removeAgentTyping();
      appendAgentMessage('agent', '⚠️ ' + err.message, true);
      document.getElementById('agentSendBtn').disabled = false;
    });
}

function handleAgentKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendAgentMessage();
  }
}
