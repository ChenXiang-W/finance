/**
 * api.js — 后端通信层
 */

function _request(path, options) {
  return fetch(API_BASE + path, options).then(function (resp) {
    if (!resp.ok) {
      return resp.json().catch(function () { return { detail: resp.statusText }; })
        .then(function (err) { throw new Error(err.detail || ('HTTP ' + resp.status)); });
    }
    return resp.json();
  });
}

function apiGet(path) { return _request(path, { method: 'GET' }); }

function apiPost(path, data) {
  return _request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data || {}),
  });
}

function apiDelete(path) { return _request(path, { method: 'DELETE' }); }

/** 服务状态：写入设置页与智能体标题 */
function checkService() {
  var svc = document.getElementById('svcStatus');
  var agent = document.getElementById('agentStatus');
  var hasKey = !!localStorage.getItem('deepseek_api_key');
  if (agent) agent.textContent = hasKey ? '已配置 Key' : '未配置 Key';
  return fetch(API_BASE + '/api/health')
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(function (d) {
      if (svc) svc.textContent = '服务在线 · ' + (d.service || '后端') + ' v' + (d.version || '');
      return true;
    })
    .catch(function () {
      if (svc) svc.textContent = '后端离线 · 仅本地规则与智能体直连';
      return false;
    });
}
