/**
 * admin.js — 管理后台 Vue 实例
 *
 * 六大模块：
 *   仪表盘   — 数据统计 + 系统状态 + 模型状态
 *   训练数据 — 数据来源/类型分布/生成训练集/批量导入
 *   模型训练 — 四步流水线（生成集→微调→合并→评测）+ 实时日志 + 模型版本热加载
 *   案例管理 — 训练数据的增删改查 + 启用训练开关
 *   用户管理 — 查看/编辑/删除用户
 *   系统监控 — 服务器资源 + API Key + 检测日志
 *
 * 依赖：Vue 2.7 + Element UI 2.15（本地 vendor 加载）
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
        { key: 'dataset',   label: '训练数据', icon: '▦' },
        { key: 'model',     label: '模型训练', icon: '◈' },
        { key: 'cases',     label: '案例管理', icon: '◆' },
        { key: 'users',     label: '用户管理', icon: '◉' },
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

      // ---- 训练数据 ----
      dataset: {},
      preparing: false,

      // ---- 模型训练 ----
      train: { state: 'idle', step: null, running: false, message: '', progress: {}, log_file: '' },
      trainForm: { epochs: 3, model: '' },
      trainLog: '',
      models: [],
      modelsState: { active_path: '', model_loaded: false },
      pollTimer: null,
      elapsedTimer: null,
      nowTs: Date.now(),

      // ---- 批量导入 ----
      importDlg: false,
      importText: '',
      importing: false,

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
    // 活动训练步骤数（激活的训练案例）
    activeCaseCount: function () {
      return this.cases.filter(function (c) { return c.is_active; }).length;
    },

    // ---- 训练状态展示 ----
    trainStateText: function () {
      var map = { idle: '待运行', running: '运行中', done: '已完成', failed: '失败', interrupted: '被中断' };
      return map[this.train.state] || '待运行';
    },
    trainTagType: function () {
      return ({ running: 'warning', done: 'success', failed: 'danger', interrupted: 'info' })[this.train.state] || 'info';
    },
    elapsedText: function () {
      if (!this.train.started_at) return '—';
      var start = new Date(this.train.started_at.replace(/-/g, '/')).getTime();
      var end;
      if (this.train.running) end = this.nowTs;
      else if (this.train.finished_at) end = new Date(this.train.finished_at.replace(/-/g, '/')).getTime();
      else end = this.nowTs;
      var s = Math.max(0, Math.round((end - start) / 1000));
      var m = Math.floor(s / 60);
      return (m > 0 ? m + ' 分 ' : '') + (s % 60) + ' 秒';
    },
    importParsed: function () {
      var raw = (this.importText || '').trim();
      if (!raw) return 0;
      if (raw.charAt(0) === '[') {
        try { return JSON.parse(raw).length; } catch (e) { return 0; }
      }
      return raw.split('\n').filter(function (l) { return l.trim(); }).length;
    },
    // 四步流水线定义
    pipeline: function () {
      return [
        { step: 'prepare',  title: '① 生成训练集', desc: '合并案例库与 JSONL，去重后划分 train/val', action: '生成' },
        { step: 'finetune', title: '② LoRA 微调',   desc: '4-bit 量化训练垂直模型（GPU 优先）',       action: '开始微调' },
        { step: 'export',   title: '③ 合并模型',    desc: '把 LoRA 权重合并进基座，得到可推理模型', action: '合并' },
        { step: 'evaluate', title: '④ 评测入库',    desc: '用验证集算准确率/MAE 并写入模型版本',    action: '评测' },
      ];
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

  /** 离开页面时清理轮询定时器，避免后台请求泄漏 */
  beforeDestroy: function () {
    this.stopPoll();
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
     * @param {string} v — 视图 key（dashboard/dataset/model/cases/users/system）
     */
    switchView: function (v) {
      this.currentView = v;
      if (v === 'dashboard') { this.loadStats(); this.loadSysInfo(); this.loadModelInfo(); }
      if (v === 'dataset') { this.loadDataset(); }
      if (v === 'users' && this.users.length === 0) this.loadUsers();
      if (v === 'cases' && this.cases.length === 0) this.loadCases();
      if (v === 'model') {
        this.loadModelInfo();
        this.loadDataset();
        this.loadModels();
        this.refreshTrainStatus();
      }
      if (v === 'system') { this.loadSysInfo(); if (this.logs.length === 0) this.loadLogs(); if (this.apiKeys.length === 0) this.loadApiKeys(); }
      if (v !== 'model') this.stopPoll();
    },

    // ============================================================
    // 训练数据
    // ============================================================

    loadDataset: function () {
      var s = this;
      return this.api('GET', '/api/admin/dataset')
        .then(function (d) {
          s.dataset = d;
          if (d.runner && d.runner.running) { s.train = d.runner; s.trainLog = s.trainLog || ''; }
        })
        .catch(function () {});
    },

    distPct: function (count) {
      var list = (this.dataset.cases && this.dataset.cases.by_type) || [];
      var max = 1;
      list.forEach(function (t) { if (t.count > max) max = t.count; });
      return Math.max(4, Math.round((count / max) * 100));
    },
    distColor: function (name) {
      var map = {
        '冒充客服': '#4f6ef7', '虚假投资': '#ff6b35', '冒充公检法': '#ff2244',
        '信贷诈骗': '#fdcb6e', '正常': '#00cc55', '待分类': '#888888',
      };
      return map[name] || '#5aa9e6';
    },

    /** 运行 prepare_data.py：案例库 + JSONL → train/val */
    prepareDataset: function () {
      var s = this;
      this.preparing = true;
      this.api('POST', '/api/admin/dataset/prepare')
        .then(function (d) {
          var sm = d.summary || {};
          s.$message.success('训练集已生成：' + (sm.train != null ? sm.train : '?') + ' 条训练 / ' +
            (sm.val != null ? sm.val : '?') + ' 条验证');
          s.loadDataset();
        })
        .catch(function (e) { s.$message.error(e.message || '生成失败'); })
        .finally(function () { s.preparing = false; });
    },

    // ============================================================
    // 批量导入案例
    // ============================================================
    openImportDialog: function () {
      this.importText = '';
      this.importDlg = true;
    },
    fillImportSample: function () {
      this.importText = [
        JSON.stringify({ text: '您好，我是京东金融客服，检测到您开通了金条服务，需下载会议软件共享屏幕注销，否则影响征信。', fraud_type: '冒充客服', risk_level: 'high', risk_score: 0.85, analysis: '冒充客服+屏幕共享话术' }),
        JSON.stringify({ text: '老师带你做短线，日收益30%，稳赚不赔，先交888元服务费进内部群。', fraud_type: '虚假投资', risk_level: 'high', risk_score: 0.8, analysis: '虚假投资+荐股' }),
      ].join('\n');
    },
    doImport: function () {
      var s = this;
      this.importing = true;
      this.api('POST', '/api/admin/cases/import', { data: this.importText })
        .then(function (d) {
          s.$message.success('导入完成：新增 ' + d.created + ' 条，跳过 ' + d.skipped + ' 条');
          s.importDlg = false;
          s.loadCases();
          s.loadDataset();
          s.loadStats();
        })
        .catch(function (e) { s.$message.error(e.message || '导入失败'); })
        .finally(function () { s.importing = false; });
    },

    /** 案例「启用训练」开关：直接改 is_active，下次生成训练集生效 */
    toggleCaseActive: function (row) {
      var s = this;
      this.api('PUT', '/api/admin/cases/' + row.id, { is_active: row.is_active })
        .then(function () {
          s.$message.success(row.is_active ? '已启用训练' : '已移出训练集');
          s.loadDataset();
        })
        .catch(function (e) { s.$message.error(e.message || '更新失败'); row.is_active = !row.is_active; });
    },

    // ============================================================
    // 训练任务
    // ============================================================
    stepLabel: function (step) {
      return ({ prepare: '生成训练集', finetune: 'LoRA 微调', export: '合并模型', evaluate: '评测入库' })[step] || step || '';
    },
    stepDone: function (step) {
      var d = this.dataset || {};
      if (step === 'prepare') return !!(d.generated && d.generated.train > 0);
      if (step === 'finetune') return !!(d.artifacts && d.artifacts.adapter && d.artifacts.adapter.exists);
      if (step === 'export') return !!(d.artifacts && d.artifacts.merged && d.artifacts.merged.exists);
      if (step === 'evaluate') return this.models.length > 0;
      return false;
    },
    stepStateText: function (step) {
      if (this.train.running && this.train.step === step) return '运行中…';
      if (this.train.step === step && this.train.state === 'failed') return '上次失败';
      return this.stepDone(step) ? '已完成' : '待运行';
    },

    startStep: function (step) {
      var s = this;
      var tip = step === 'finetune'
        ? '微调会用 GPU 跑，样本少时约 1–3 分钟，样本多可能数小时。确定开始？'
        : '确定运行「' + this.stepLabel(step) + '」？';
      this.$confirm(tip, '确认', { confirmButtonText: '开始', cancelButtonText: '取消', type: 'warning' })
        .then(function () {
          return s.api('POST', '/api/admin/train/start', {
            step: step,
            epochs: s.trainForm.epochs,
            model: s.trainForm.model || undefined,
          });
        })
        .then(function (d) {
          s.train = d.state;
          s.$message.success('已启动：' + s.stepLabel(step));
          s.startPoll();
          s.refreshTrainStatus();
        })
        .catch(function (e) { if (e && e !== 'cancel') s.$message.error(e.message || '启动失败'); });
    },

    stopTrain: function () {
      var s = this;
      this.$confirm('确定停止当前训练任务？已产生的权重可能不完整。', '确认', { type: 'warning' })
        .then(function () { return s.api('POST', '/api/admin/train/stop'); })
        .then(function () { s.$message.success('已停止'); s.refreshTrainStatus(); s.loadDataset(); })
        .catch(function () {});
    },

    refreshTrainStatus: function () {
      var s = this;
      return this.api('GET', '/api/admin/train/status?lines=150')
        .then(function (d) {
          s.train = d;
          s.trainLog = d.log_tail || '';
          if (d.running) s.startPoll(); else s.stopPoll();
          s.$nextTick(function () { s.scrollLog(); });
        })
        .catch(function () {});
    },

    startPoll: function () {
      var s = this;
      if (!this.pollTimer) {
        this.pollTimer = setInterval(function () { s.refreshTrainStatus(); }, 2500);
      }
      if (!this.elapsedTimer) {
        this.elapsedTimer = setInterval(function () { s.nowTs = Date.now(); }, 1000);
      }
    },
    stopPoll: function () {
      if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
      if (this.elapsedTimer) { clearInterval(this.elapsedTimer); this.elapsedTimer = null; }
    },
    scrollLog: function () {
      var el = this.$refs.logConsole;
      if (el) el.scrollTop = el.scrollHeight;
    },
    downloadTrainLog: function () {
      if (!this.trainLog) return;
      var blob = new Blob([this.trainLog], { type: 'text/plain;charset=utf-8' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'train-' + (this.train.step || 'log') + '.log';
      a.click();
      URL.revokeObjectURL(a.href);
    },

    // ============================================================
    // 模型版本
    // ============================================================
    loadModels: function () {
      var s = this;
      return this.api('GET', '/api/admin/models')
        .then(function (d) { s.models = d.items || []; s.modelsState = d; })
        .catch(function () {});
    },
    activateModel: function (row) {
      var s = this;
      this.$confirm('启用「' + row.version_name + '」？会热加载进后端（3B 模型约 30–60 秒，后台进行）。', '确认', { type: 'warning' })
        .then(function () { return s.api('POST', '/api/admin/models/' + row.id + '/activate'); })
        .then(function (d) {
          s.$message.success(d.message || '已切换');
          s.loadModels();
        })
        .catch(function (e) { if (e && e !== 'cancel') s.$message.error(e.message || '启用失败'); });
    },
    deactivateModel: function () {
      var s = this;
      this.$confirm('停用微调模型？检测将回退到纯 DeepSeek 分析，并释放显存。', '确认', { type: 'warning' })
        .then(function () { return s.api('POST', '/api/admin/models/deactivate'); })
        .then(function (d) { s.$message.success(d.message || '已停用'); s.loadModels(); })
        .catch(function () {});
    },
    delModel: function (row) {
      var s = this;
      this.$confirm('删除版本记录「' + row.version_name + '」？（不会删除磁盘上的模型文件）', '确认', { type: 'warning' })
        .then(function () { return s.api('DELETE', '/api/admin/models/' + row.id); })
        .then(function () { s.$message.success('已删除'); s.loadModels(); })
        .catch(function () {});
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
      var self = this;
      // 动态 API 地址：与主界面一致，适配本机/局域网（file:// 回退 127.0.0.1）
      // 可用 localStorage.api_base 覆盖（例如后端换到别的端口/机器）
      var base = (localStorage.getItem('api_base') || '').replace(/\/+$/, '') ||
        (window.location.protocol + '//' + (window.location.hostname || '127.0.0.1') + ':8000');
      var o = {
        method: m,
        headers: { 'Content-Type': 'application/json' },
      };
      if (this.token) o.headers['Authorization'] = 'Bearer ' + this.token;
      if (d) o.body = JSON.stringify(d);
      return fetch(base + p, o).then(function (r) {
        // 401 = token 过期，强制退出
        if (r.status === 401) { self.loggedIn = false; self.token = ''; localStorage.removeItem('admin_token'); throw new Error('登录过期'); }
        if (!r.ok) return r.json().then(function (e) { throw new Error(e.detail || 'HTTP ' + r.status); });
        return r.json();
      });
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

    /** 页面加载时检查 localStorage 中的 token，并向后端真实校验有效性 */
    checkLogin: function () {
      var t = localStorage.getItem('admin_token');
      var u = localStorage.getItem('admin_user');
      if (!t || !u) return;
      var self = this;
      this.token = t;
      this.adminUser = u;
      // 真实校验：调用 /api/admin/verify-token，token 无效则回到登录页
      this.api('GET', '/api/admin/verify-token')
        .then(function () {
          self.loggedIn = true;
          self.loadStats();
          self.loadSysInfo();
          self.loadModelInfo();
        })
        .catch(function () {
          self.loggedIn = false;
          self.token = '';
          localStorage.removeItem('admin_token');
          localStorage.removeItem('admin_user');
        });
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
