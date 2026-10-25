// 金盾智眼小程序入口
App({
  onLaunch() {
    // 会话 ID：与 Web 端同一套后端接口约定
    let sid = wx.getStorageSync('fraud_session_id')
    if (!sid) {
      sid = 'session_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)
      wx.setStorageSync('fraud_session_id', sid)
    }
    this.globalData.sessionId = sid
  },
  globalData: {
    sessionId: ''
  },
})
