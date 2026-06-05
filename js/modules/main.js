/**
 * main.js — 初始化入口 & 全局快捷键
 */

document.addEventListener('DOMContentLoaded', function () {
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
