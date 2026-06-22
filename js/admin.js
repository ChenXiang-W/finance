/**
 * admin.js — 管理后台 Vue 实例
 *
 * 五大模块：
 *   仪表盘   — 数据统计 + 系统状态 + 模型状态
 *   用户管理 — 查看/编辑/删除用户
 *   案例管理 — 训练数据的增删改查
 *   模型管理 — 微调触发 + 数据集统计
 *   系统监控 — 服务器资源 + 检测日志
 *
 * 依赖：Vue 2.7 + Element UI 2.15（CDN 加载）
 * 后端：FastAPI localhost:8000
 */
new Vue({
  el: '#admin-app',

  // ============================================================
  // 全局响应式数据
  // ============================================================
  data: function () {
    return {
      // ---- 登录状态 ----
      loggedIn: false,          // 是否已登录
      adminUser: '',            // 当前管理员用户名
      token: '',                // JWT 令牌
      loginForm: { username: 'admin', password: '' },
      loginRules: {
        username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
        password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
      },
      loginLoading: false,
      loginError: '',

      // ---- 导航 ----
      currentView: 'dashboard', // 当前激活的视图
      now: '',                  // 顶栏时钟
      menu: [
        { key: 'dashboard', label: '仪表盘',   icon: '▣' },
        { key: 'users',     label: '用户管理', icon: '◉' },
        { key: 'cases',     label: '案例管理', icon: '◆' },
        { key: 'model',     label: '模型管理', icon: '◈' },
        { key: 'system',    label: '系统监控', icon: '⏣' },
      ],

      // ---- 仪表盘数据 ----
      stats: {},                // /api/admin/stats 返回的统计数据
      sysInfo: {},              // /api/admin/system-info 系统运行状态
      modelInfo: {              // /api/admin/model-info 模型状态
        metrics: {},
        base_model: 'Qwen/Qwen2.5-7B-Instruct',
      },

      // ---- 用户管理 ----
      users: [], userTotal: 0, userPage: 1, userLoading: false,
      userDlg: false, editingUserId: null,
      userForm: { username: '', email: '', role: 'analyst' }, userSaving: false,

      // ---- 案例管理 ----
      cases: [], caseTotal: 0, casePage: 1, caseLoading: false,
      caseSearch: '', caseFilterType: '',
      caseDlg: false, caseDlgTitle: '新增案例', editingCaseId: null,
      caseForm: {
        text: '', fraud_type: '冒充客服', risk_level: 'medium',
        risk_score: 0.5, analysis: '', tags: '', is_active: true,
      },
      caseSaving: false,

      // ---- 模型管理 ----
      ftLoading: false,         // 微调按钮加载态
      ftMsg: '',                // 微调结果消息
      ftOk: false,              // 微调是否成功
      datasetStats: [           // 训练数据集各类型统计（柱状图数据）
        { type: '冒充客服',   count: 0, pct: 0, color: '#4f6ef7' },
        { type: '虚假投资',   count: 0, pct: 0, color: '#ff6b35' },
        { type: '冒充公检法', count: 0, pct: 0, color: '#ff2244' },
        { type: '信贷诈骗',   count: 0, pct: 0, color: '#fdcb6e' },
        { type: '正常',       count: 0, pct: 0, color: '#00ff66' },
      ],

      // ---- API Key 管理 ----
      apiKeys: [],
      apiKeyDlg: false, editingApiKeyId: null,
      apiKeyForm: { api_key: '' },

      // ---- 系统监控/日志 ----
      logs: [], logTotal: 0, logPage: 1, logLoading: false,
    };
  },

  // ============================================================
  // 计算属性
  // ============================================================
  computed: {
    // 当前视图标题（从 menu 数组中取）
    currentTitle: function () {
      var m = this.menu.find(function (x) { return x.key === this.currentView; }, this);
      return m ? m.label : '';
    },
    // 仪表盘顶部统计卡片数据
    statsCards: function () {
      var s = this.stats;
      return [
        { value: s.total_detections || 0, label: '检测总数', color: '#4f6ef7' },
        { value: s.total_cases || 0,      label: '训练案例', color: '#00f0ff' },
        { value: s.total_users || 0,      label: '用户数',   color: '#00ff66' },
        { value: s.high_risk_count || 0,  label: '高危告警', color: '#ff4444' },
      ];
    },
    // 模型管理页：激活的训练案例数
    activeCaseCount: function () {
      return this.cases.filter(function (c) { return c.is_active; }).length;
    },
  },

  // ============================================================
  // 生命周期
  // ============================================================
  created: function () {
    var self = this;
    this.tick();
    // 每秒更新顶栏时钟
    setInterval(function () { self.tick(); }, 1000);
  },

  mounted: function () {
    this.checkLogin();    // 检查 localStorage 中是否有缓存的 token
    this.initParticles(); // 启动背景粒子动画
  },

  // ============================================================
  // 方法
  // ============================================================
  methods: {
    // ---- 工具函数 ----

    /** 更新顶栏数字时钟 */
    tick: function () {
      var d = new Date();
      this.now = ('0' + d.getHours()).slice(-2) + ':' +
                 ('0' + d.getMinutes()).slice(-2) + ':' +
                 ('0' + d.getSeconds()).slice(-2);
    },

    /** 格式化 ISO 时间为中文格式 */
    fmt: function (t) {
      if (!t) return '-';
      return new Date(t).toLocaleString('zh-CN');
    },

    /** 欺诈类型 → Element UI tag 颜色 */
    tagType: function (t) {
      return {
        '冒充客服': 'primary', '虚假投资': 'danger',
        '冒充公检法': 'warning', '信贷诈骗': 'info', '正常': 'success',
      }[t] || '';
    },

    /** 风险等级 → Element UI tag 颜色 */
    lvlTag: function (l) {
      return {
        'low': 'success', 'medium': 'warning',
        'high': 'danger', 'critical': 'danger',
      }[l] || '';
    },

    // ---- 视图切换（懒加载） ----

    /**
     * 切换到指定视图，首次进入时自动加载数据
     * @param {string} v — 视图 key（dashboard/users/cases/model/system）
     */
    switchView: function (v) {
      this.currentView = v;
      if (v === 'dashboard') { this.loadStats(); this.loadSysInfo(); this.loadModelInfo(); }
      if (v === 'users' && this.users.length === 0) this.loadUsers();
      if (v === 'cases' && this.cases.length === 0) this.loadCases();
      if (v === 'model') {
        this.loadModelInfo(); this.loadStats();
        if (this.cases.length === 0) this.loadCases();
        else this.updateDatasetStats();
      }
      if (v === 'system') { this.loadSysInfo(); if (this.logs.length === 0) this.loadLogs(); if (this.apiKeys.length === 0) this.loadApiKeys(); }
    },

    /** 从已加载的案例数据计算各欺诈类型的数量占比 */
    updateDatasetStats: function () {
      var counts = {};
      var total = this.cases.length;
      this.cases.forEach(function (c) {
        counts[c.fraud_type] = (counts[c.fraud_type] || 0) + 1;
      });
      var colors = {
        '冒充客服': '#4f6ef7', '虚假投资': '#ff6b35',
        '冒充公检法': '#ff2244', '信贷诈骗': '#fdcb6e', '正常': '#00cc55',
      };
      this.datasetStats = Object.keys(counts).map(function (k) {
        return {
          type: k,
          count: counts[k],
          pct: total ? Math.round(counts[k] / total * 100) : 0,
          color: colors[k] || '#888',
        };
      });
    },

    // ---- 后端 API 封装 ----

    /**
     * 统一 HTTP 请求封装
     * @param {string} m — 方法 GET/POST/PUT/DELETE
     * @param {string} p — 路径（如 /api/admin/stats）
     * @param {object} d — 请求体（可选）
     * @returns {Promise} 解析后的 JSON 响应
     */
    api: function (m, p, d) {
      var o = {
        method: m,
        headers: { 'Content-Type': 'application/json' },
      };
      if (this.token) o.headers['Authorization'] = 'Bearer ' + this.token;
      if (d) o.body = JSON.stringify(d);
      return fetch('http://localhost:8000' + p, o).then(function (r) {
        // 401 = token 过期，强制退出
        if (r.status === 401) { this.loggedIn = false; this.token = ''; throw new Error('登录过期'); }
        if (!r.ok) return r.json().then(function (e) { throw new Error(e.detail || 'HTTP ' + r.status); });
        return r.json();
      }.bind(this));
    },

    // ---- 登录/登出 ----

    /** 提交登录表单 */
    doLogin: function () {
      var self = this;
      this.$refs.loginFormRef.validate(function (ok) {
        if (!ok) return;
        self.loginLoading = true;
        self.loginError = '';
        self.api('POST', '/api/admin/login', self.loginForm)
          .then(function (d) {
            self.token = d.access_token;
            self.adminUser = d.username;
            self.loggedIn = true;
            // 缓存 token 到 localStorage，刷新页面不需重新登录
            localStorage.setItem('admin_token', d.access_token);
            localStorage.setItem('admin_user', d.username);
            self.loadStats();
            self.loadSysInfo();
            self.loadModelInfo();
          })
          .catch(function (e) { self.loginError = e.message; })
          .finally(function () { self.loginLoading = false; });
      });
    },

    /** 退出登录，清除缓存 */
    logout: function () {
      this.loggedIn = false;
      this.token = '';
      localStorage.removeItem('admin_token');
      localStorage.removeItem('admin_user');
    },

    /** 页面加载时检查 localStorage 中是否有有效 token */
    checkLogin: function () {
      var t = localStorage.getItem('admin_token');
      var u = localStorage.getItem('admin_user');
      if (t && u) {
        this.token = t;
        this.adminUser = u;
        this.loggedIn = true;
        this.loadStats();
        this.loadSysInfo();
        this.loadModelInfo();
      }
    },

    // ---- 仪表盘 API ----
    loadStats:     function () { var s = this; this.api('GET', '/api/admin/stats').then(function (d) { s.stats = d; }).catch(function () {}); },
    loadSysInfo:   function () { var s = this; this.api('GET', '/api/admin/system-info').then(function (d) { s.sysInfo = d; }).catch(function () {}); },
    loadModelInfo: function () { var s = this; this.api('GET', '/api/admin/model-info').then(function (d) { s.modelInfo = d; }).catch(function () {}); },

    // ---- 用户管理 CRUD ----
    loadUsers: function (p) {
      if (p) this.userPage = p;
      var s = this; this.userLoading = true;
      this.api('GET', '/api/admin/users?page=' + this.userPage)
        .then(function (d) { s.users = d.items; s.userTotal = d.total; })
        .catch(function () {})
        .finally(function () { s.userLoading = false; });
    },
    openUserDialog: function (r) {
      this.editingUserId = r.id;
      this.userForm = { username: r.username, email: r.email || '', role: r.role };
      this.userDlg = true;
    },
    saveUser: function () {
      var s = this; this.userSaving = true;
      this.api('PUT', '/api/admin/users/' + this.editingUserId, this.userForm)
        .then(function () { s.userDlg = false; s.loadUsers(); })
        .catch(function (e) { s.$message.error(e.message); })
        .finally(function () { s.userSaving = false; });
    },
    delUser: function (id) {
      var s = this;
      this.$confirm('确认删除该用户？', '提示', { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' })
        .then(function () { return s.api('DELETE', '/api/admin/users/' + id); })
        .then(function () { s.loadUsers(); s.$message.success('已删除'); })
        .catch(function () {});
    },

    // ---- 案例管理 CRUD ----
    loadCases: function (p) {
      if (p) this.casePage = p;
      var s = this; this.caseLoading = true;
      var q = '?page=' + this.casePage + '&page_size=20';
      if (this.caseSearch) q += '&search=' + encodeURIComponent(this.caseSearch);
      if (this.caseFilterType) q += '&fraud_type=' + encodeURIComponent(this.caseFilterType);
      this.api('GET', '/api/admin/cases' + q)
        .then(function (d) { s.cases = d.items; s.caseTotal = d.total; })
        .catch(function () {})
        .finally(function () { s.caseLoading = false; });
    },
    openCaseDialog: function (r) {
      if (r) {
        // 编辑模式：回填现有数据
        this.caseDlgTitle = '编辑案例';
        this.editingCaseId = r.id;
        this.caseForm = {
          text: r.text, fraud_type: r.fraud_type, risk_level: r.risk_level,
          risk_score: r.risk_score, analysis: r.analysis || '',
          tags: r.tags || '', is_active: r.is_active,
        };
      } else {
        // 新增模式：重置表单
        this.caseDlgTitle = '新增案例';
        this.editingCaseId = null;
        this.caseForm = {
          text: '', fraud_type: '冒充客服', risk_level: 'medium',
          risk_score: 0.5, analysis: '', tags: '', is_active: true,
        };
      }
      this.caseDlg = true;
    },
    saveCase: function () {
      var s = this; this.caseSaving = true;
      // 有 editingCaseId → PUT 更新，否则 → POST 新建
      var p = this.editingCaseId
        ? this.api('PUT', '/api/admin/cases/' + this.editingCaseId, this.caseForm)
        : this.api('POST', '/api/admin/cases', this.caseForm);
      p.then(function () { s.caseDlg = false; s.loadCases(); s.loadStats(); })
       .catch(function (e) { s.$message.error(e.message); })
       .finally(function () { s.caseSaving = false; });
    },
    delCase: function (id) {
      var s = this;
      this.$confirm('确认删除该案例？', '提示', { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' })
        .then(function () { return s.api('DELETE', '/api/admin/cases/' + id); })
        .then(function () { s.loadCases(); s.loadStats(); s.$message.success('已删除'); })
        .catch(function () {});
    },

    // ---- 模型管理 ----

    /** 触发 LoRA 微调训练（异步后台执行） */
    startFinetune: function () {
      var s = this;
      this.$confirm(
        '将使用当前训练数据启动 LoRA 微调，可能需要数小时。确定继续？',
        '确认微调',
        { confirmButtonText: '开始训练', cancelButtonText: '取消', type: 'warning' }
      )
        .then(function () {
          s.ftLoading = true; s.ftMsg = '';
          return s.api('POST', '/api/admin/model-finetune');
        })
        .then(function (d) { s.ftMsg = d.message || '已启动'; s.ftOk = d.ok; })
        .catch(function (e) {
          if (e !== 'cancel') { s.ftMsg = e.message || '启动失败'; s.ftOk = false; }
        })
        .finally(function () { s.ftLoading = false; });
    },

    // ---- API Key 管理 ----
    loadApiKeys: function () {
      var s = this;
      this.api('GET', '/api/admin/api-keys')
        .then(function (d) { s.apiKeys = d.items; })
        .catch(function () {});
    },
    editApiKey: function (row) {
      this.editingApiKeyId = row.id;
      this.apiKeyForm.api_key = row.api_key || '';
      this.apiKeyDlg = true;
    },
    saveApiKey: function () {
      var s = this;
      this.api('PUT', '/api/admin/api-keys/' + this.editingApiKeyId, this.apiKeyForm)
        .then(function () { s.apiKeyDlg = false; s.loadApiKeys(); s.$message.success('已更新'); })
        .catch(function (e) { s.$message.error(e.message); });
    },

    // ---- 系统监控/日志 ----
    loadLogs: function (p) {
      if (p) this.logPage = p;
      var s = this; this.logLoading = true;
      this.api('GET', '/api/admin/logs?page=' + this.logPage)
        .then(function (d) { s.logs = d.items; s.logTotal = d.total; })
        .catch(function () {})
        .finally(function () { s.logLoading = false; });
    },

    // ---- 赛博朋克粒子背景 ----

    /**
     * Canvas 粒子系统：青色 + 洋红双色粒子漂浮
     * 渲染在 #adminParticles 画布上
     */
    initParticles: function () {
      var canvas = document.getElementById('adminParticles');
      if (!canvas) return;
      var ctx = canvas.getContext('2d'), w, h, pts = [];
      var colors = ['rgba(0,240,255,', 'rgba(255,0,170,'];

      // 响应窗口大小变化
      function rs() {
        w = canvas.width = window.innerWidth;
        h = canvas.height = window.innerHeight;
      }
      rs();
      window.addEventListener('resize', rs);

      // 初始化 40 个粒子（随机位置、速度、颜色）
      for (var i = 0; i < 40; i++) {
        pts.push({
          x: Math.random() * w,
          y: Math.random() * h,
          r: Math.random() * 0.8 + 0.2,        // 半径 0.2~1.0
          vx: (Math.random() - 0.5) * 0.1,     // 水平速度
          vy: (Math.random() - 0.5) * 0.1,     // 垂直速度
          o: Math.random() * 0.2 + 0.04,       // 透明度
          c: colors[Math.floor(Math.random() * 2)], // 随机青/洋红
        });
      }

      // 动画循环
      (function draw() {
        ctx.clearRect(0, 0, w, h);
        for (var i = 0; i < pts.length; i++) {
          var p = pts[i];
          p.x += p.vx; p.y += p.vy;
          // 边界循环（穿出右边从左边回来）
          if (p.x < 0) p.x = w; if (p.x > w) p.x = 0;
          if (p.y < 0) p.y = h; if (p.y > h) p.y = 0;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fillStyle = p.c + p.o + ')';
          ctx.fill();
        }
        requestAnimationFrame(draw);
      })();
    },
  },
});
