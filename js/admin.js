/**
 * admin.js — 管理后台 Vue 实例
 * Vue2 + Element UI
 */
var API = 'http://localhost:8000';

new Vue({
  el: '#admin-app',
  data: function () {
    return {
      // ---- 登录 ----
      loggedIn: false,
      adminUser: '',
      token: '',
      loginForm: { username: 'admin', password: '' },
      loginRules: {
        username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
        password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
      },
      loginLoading: false,
      loginError: '',

      // ---- 导航 ----
      currentView: 'dashboard',
      menu: [
        { key: 'dashboard', label: '统计面板', icon: '▣' },
        { key: 'cases', label: '案例管理', icon: '◆' },
        { key: 'users', label: '用户管理', icon: '◉' },
        { key: 'logs', label: '检测日志', icon: '◈' },
      ],
      now: '',

      // ---- 统计 ----
      stats: {},

      // ---- 案例 ----
      cases: [], caseTotal: 0, casePage: 1, caseLoading: false,
      caseSearch: '', caseFilterType: '',
      caseDialogVisible: false, caseDialogTitle: '新增案例', editingCaseId: null,
      caseForm: { text: '', fraud_type: '冒充客服', risk_level: 'medium', risk_score: 0.5, analysis: '', tags: '', is_active: true },
      caseSaving: false,

      // ---- 用户 ----
      users: [], userTotal: 0, userPage: 1, userLoading: false,
      userDialogVisible: false, editingUserId: null,
      userForm: { username: '', email: '', role: 'analyst' },
      userSaving: false,

      // ---- 日志 ----
      logs: [], logTotal: 0, logPage: 1, logLoading: false,
    };
  },

  computed: {
    currentTitle: function () {
      var m = this.menu.find(function (x) { return x.key === this.currentView; }, this);
      return m ? m.label : '';
    },
    statsCards: function () {
      var s = this.stats;
      return [
        { value: s.total_detections || 0, label: '检测总数', color: '#4f6ef7' },
        { value: s.total_cases || 0, label: '训练案例', color: '#00f0ff' },
        { value: s.total_users || 0, label: '用户数', color: '#00ff66' },
        { value: s.high_risk_count || 0, label: '高危告警', color: '#ff4444' },
      ];
    },
  },

  created: function () {
    var self = this;
    this.updateClock();
    setInterval(function () { self.updateClock(); }, 1000);
  },

  methods: {
    // ---- 时钟 ----
    updateClock: function () {
      var d = new Date();
      this.now = d.getHours().toString().padStart(2,'0') + ':' +
                 d.getMinutes().toString().padStart(2,'0') + ':' +
                 d.getSeconds().toString().padStart(2,'0');
    },

    // ---- API 封装 ----
    api: function (method, path, data) {
      var opts = {
        method: method,
        headers: { 'Content-Type': 'application/json' },
      };
      if (this.token) opts.headers['Authorization'] = 'Bearer ' + this.token;
      if (data) opts.body = JSON.stringify(data);
      return fetch(API + path, opts).then(function (r) {
        if (r.status === 401) { this.loggedIn = false; this.token = ''; throw new Error('登录已过期'); }
        if (!r.ok) return r.json().then(function (e) { throw new Error(e.detail || 'HTTP ' + r.status); });
        return r.json();
      }.bind(this));
    },

    // ---- 登录 ----
    doLogin: function () {
      var self = this;
      this.$refs.loginFormRef.validate(function (valid) {
        if (!valid) return;
        self.loginLoading = true;
        self.loginError = '';
        self.api('POST', '/api/admin/login', self.loginForm)
          .then(function (data) {
            self.token = data.access_token;
            self.adminUser = data.username;
            self.loggedIn = true;
            localStorage.setItem('admin_token', data.access_token);
            localStorage.setItem('admin_user', data.username);
            self.loadStats();
          })
          .catch(function (e) { self.loginError = e.message; })
          .finally(function () { self.loginLoading = false; });
      });
    },

    logout: function () {
      this.loggedIn = false;
      this.token = '';
      localStorage.removeItem('admin_token');
      localStorage.removeItem('admin_user');
    },

    checkStoredLogin: function () {
      var t = localStorage.getItem('admin_token');
      var u = localStorage.getItem('admin_user');
      if (t && u) { this.token = t; this.adminUser = u; this.loggedIn = true; this.loadStats(); }
    },

    // ---- 统计 ----
    loadStats: function () {
      var self = this;
      this.api('GET', '/api/admin/stats')
        .then(function (d) { self.stats = d; })
        .catch(function () {});
    },

    // ---- 案例 CRUD ----
    loadCases: function (page) {
      if (page) this.casePage = page;
      var self = this;
      this.caseLoading = true;
      var params = '?page=' + this.casePage + '&page_size=20';
      if (this.caseSearch) params += '&search=' + encodeURIComponent(this.caseSearch);
      if (this.caseFilterType) params += '&fraud_type=' + encodeURIComponent(this.caseFilterType);
      this.api('GET', '/api/admin/cases' + params)
        .then(function (d) { self.cases = d.items; self.caseTotal = d.total; })
        .catch(function () {})
        .finally(function () { self.caseLoading = false; });
    },

    openCaseDialog: function (row) {
      if (row) {
        this.caseDialogTitle = '编辑案例';
        this.editingCaseId = row.id;
        this.caseForm = {
          text: row.text, fraud_type: row.fraud_type, risk_level: row.risk_level,
          risk_score: row.risk_score, analysis: row.analysis || '',
          tags: row.tags || '', is_active: row.is_active,
        };
      } else {
        this.caseDialogTitle = '新增案例';
        this.editingCaseId = null;
        this.caseForm = { text: '', fraud_type: '冒充客服', risk_level: 'medium', risk_score: 0.5, analysis: '', tags: '', is_active: true };
      }
      this.caseDialogVisible = true;
    },

    saveCase: function () {
      var self = this;
      this.caseSaving = true;
      var promise = this.editingCaseId
        ? this.api('PUT', '/api/admin/cases/' + this.editingCaseId, this.caseForm)
        : this.api('POST', '/api/admin/cases', this.caseForm);
      promise
        .then(function () { self.caseDialogVisible = false; self.loadCases(); self.loadStats(); })
        .catch(function (e) { self.$message.error(e.message); })
        .finally(function () { self.caseSaving = false; });
    },

    deleteCase: function (id) {
      var self = this;
      this.$confirm('确认删除该案例？', '提示', { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' })
        .then(function () {
          return self.api('DELETE', '/api/admin/cases/' + id);
        })
        .then(function () { self.loadCases(); self.loadStats(); self.$message.success('已删除'); })
        .catch(function () {});
    },

    // ---- 用户管理 ----
    loadUsers: function (page) {
      if (page) this.userPage = page;
      var self = this;
      this.userLoading = true;
      this.api('GET', '/api/admin/users?page=' + this.userPage)
        .then(function (d) { self.users = d.items; self.userTotal = d.total; })
        .catch(function () {})
        .finally(function () { self.userLoading = false; });
    },

    openUserDialog: function (row) {
      this.editingUserId = row.id;
      this.userForm = { username: row.username, email: row.email || '', role: row.role };
      this.userDialogVisible = true;
    },

    saveUser: function () {
      var self = this;
      this.userSaving = true;
      this.api('PUT', '/api/admin/users/' + this.editingUserId, this.userForm)
        .then(function () { self.userDialogVisible = false; self.loadUsers(); })
        .catch(function (e) { self.$message.error(e.message); })
        .finally(function () { self.userSaving = false; });
    },

    deleteUser: function (id) {
      var self = this;
      this.$confirm('确认删除该用户？', '提示', { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' })
        .then(function () { return self.api('DELETE', '/api/admin/users/' + id); })
        .then(function () { self.loadUsers(); self.$message.success('已删除'); })
        .catch(function () {});
    },

    // ---- 日志 ----
    loadLogs: function (page) {
      if (page) this.logPage = page;
      var self = this;
      this.logLoading = true;
      this.api('GET', '/api/admin/logs?page=' + this.logPage)
        .then(function (d) { self.logs = d.items; self.logTotal = d.total; })
        .catch(function () {})
        .finally(function () { self.logLoading = false; });
    },

    // ---- 工具 ----
    formatTime: function (t) {
      if (!t) return '-';
      return new Date(t).toLocaleString('zh-CN');
    },

    typeTag: function (t) {
      var map = { '冒充客服': 'primary', '虚假投资': 'danger', '冒充公检法': 'warning', '信贷诈骗': 'info', '正常': 'success' };
      return map[t] || '';
    },

    levelTag: function (l) {
      var map = { 'low': 'success', 'medium': 'warning', 'high': 'danger', 'critical': 'danger' };
      return map[l] || '';
    },
  },

  watch: {
    currentView: function (v) {
      if (v === 'dashboard') this.loadStats();
      if (v === 'cases' && this.cases.length === 0) this.loadCases();
      if (v === 'users' && this.users.length === 0) this.loadUsers();
      if (v === 'logs' && this.logs.length === 0) this.loadLogs();
    },
    loggedIn: function (v) {
      if (v) { this.loadStats(); this.currentView = 'dashboard'; }
    },
  },

  mounted: function () {
    this.checkStoredLogin();
  },
});
