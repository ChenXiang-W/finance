/**
 * 小程序后端通信层
 *
 * 本机开发：微信开发者工具 → 详情 → 本地设置 → 勾选「不校验合法域名」，
 *           后端跑在本机 8000 端口即可直连。
 * 真机预览：手机与电脑同一局域网，把 BASE 改成电脑的局域网 IP，
 *           例如 'http://192.168.1.100:8000'（同样需要打开调试模式）。
 * 正式上线：必须换成 https 备案域名。
 */
const BASE = 'http://127.0.0.1:8000'

function sessionId() {
  return getApp().globalData.sessionId
}

function request(path, method, data, timeout) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: BASE + path,
      method: method || 'GET',
      data: data || {},
      timeout: timeout || 300000,
      header: { 'Content-Type': 'application/json' },
      success(r) {
        if (r.statusCode >= 200 && r.statusCode < 300) resolve(r.data)
        else reject(new Error((r.data && r.data.detail) || 'HTTP ' + r.statusCode))
      },
      fail(e) {
        reject(new Error(e.errMsg || '网络请求失败（请确认后端已启动）'))
      },
    })
  })
}

module.exports = { BASE, sessionId, request }
