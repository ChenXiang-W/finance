/**
 * api.js — 后端通信层
 */

function apiPost(path, data) {
  return fetch(API_BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }).then(function (resp) {
    if (!resp.ok) {
      return resp.json().catch(function () { return { detail: resp.statusText }; })
        .then(function (err) { throw new Error(err.detail || 'HTTP ' + resp.status); });
    }
    return resp.json();
  });
}

function apiGet(path) {
  return fetch(API_BASE + path).then(function (resp) {
    if (!resp.ok) {
      return resp.json().catch(function () { return { detail: resp.statusText }; })
        .then(function (err) { throw new Error(err.detail || 'HTTP ' + resp.status); });
    }
    return resp.json();
  });
}

function apiDelete(path) {
  return fetch(API_BASE + path, { method: 'DELETE' }).then(function (resp) {
    if (!resp.ok) {
      return resp.json().catch(function () { return { detail: resp.statusText }; })
        .then(function (err) { throw new Error(err.detail || 'HTTP ' + resp.status); });
    }
    return resp.json();
  });
}

function checkApiStatus() {
  var statusEl = document.getElementById('apiStatus');
  var dotEl = document.querySelector('.status-dot');
  fetch(API_BASE + '/api/health')
    .then(function (resp) {
      if (resp.ok) {
        statusEl.textContent = '系统就绪'; statusEl.style.color = '';
        if (dotEl) { dotEl.style.background = 'var(--success)'; dotEl.style.boxShadow = '0 0 8px var(--success)'; }
      } else {
        statusEl.textContent = '服务异常'; statusEl.style.color = '#fdcb6e';
        if (dotEl) { dotEl.style.background = '#fdcb6e'; dotEl.style.boxShadow = '0 0 8px #fdcb6e'; }
      }
    })
    .catch(function () {
      statusEl.textContent = '后端离线 · 纯智能体模式'; statusEl.style.color = '#fdcb6e';
      if (dotEl) { dotEl.style.background = '#fdcb6e'; dotEl.style.boxShadow = '0 0 8px #fdcb6e'; }
    });
}
