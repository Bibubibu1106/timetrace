// 时光待办 · 本地状态、时间戳格式化与耗时计算模块
window.TimeTraceStore = (function () {
  const STORAGE_KEY = 'timetrace_todo_store_v1';
  const CFG_KEY = 'timetrace_todo_cfg_v1';

  const PALETTE = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];

  function defaultCategories() {
    const t = 1700000000002;
    return [
      { id: 'cat_work', name: '工作', color: '#3b82f6', updatedAt: t, deletedAt: null },
      { id: 'cat_life', name: '生活', color: '#10b981', updatedAt: t, deletedAt: null },
      { id: 'cat_shop', name: '购物', color: '#f59e0b', updatedAt: t, deletedAt: null },
      { id: 'cat_idea', name: '灵感', color: '#ec4899', updatedAt: t, deletedAt: null }
    ];
  }

  function seedSampleTasks() {
    const now = Date.now();
    return [
      {
        id: 't_welcome_1',
        title: '看朋友安利的电影《星际穿越》',
        note: '默认长期有效，不催促；哪天有空去看了再打勾，也可在上方手动设 DDL。',
        categoryId: 'cat_idea',
        dueDate: null,
        createdAt: now - 5 * 86400000 - 3 * 3600000,
        completedAt: null,
        updatedAt: now - 5 * 86400000,
        deletedAt: null
      },
      {
        id: 't_welcome_2',
        title: '拔草收藏很久的街角咖啡馆',
        note: '从随手记下到真正去做，自动记录「时隔多久」达成。',
        categoryId: 'cat_life',
        dueDate: null,
        createdAt: now - 12 * 86400000 - 2 * 3600000,
        completedAt: now - 25 * 60000,
        updatedAt: now - 25 * 60000,
        deletedAt: null
      }
    ];
  }

  function loadStore() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.tasks)) {
          if (!Array.isArray(parsed.categories) || !parsed.categories.length) {
            parsed.categories = defaultCategories();
          } else {
            const defMap = { cat_work: '#3b82f6', cat_life: '#10b981', cat_shop: '#f59e0b', cat_idea: '#ec4899' };
            parsed.categories.forEach((c) => {
              if ((c.updatedAt === 1700000000000 || c.updatedAt === 1700000000001) && defMap[c.id]) {
                c.color = defMap[c.id];
                c.updatedAt = 1700000000002;
              }
            });
          }
          return parsed;
        }
      }
    } catch (e) {}
    const init = {
      schemaVersion: 1,
      updatedAt: Date.now(),
      categories: defaultCategories(),
      tasks: seedSampleTasks()
    };
    saveStore(init);
    return init;
  }

  let memStore = null;
  let memCfg = null;

  function saveStore(store) {
    store.updatedAt = Date.now();
    memStore = store;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); } catch (e) {}
  }

  function loadConfig() {
    try {
      const raw = localStorage.getItem(CFG_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    if (memCfg) return memCfg;
    return {
      theme: 'light',
      mode: 'gitee',
      giteeToken: '',
      gistId: '',
      serverUrl: '',
      serverToken: '',
      lastSyncAt: 0
    };
  }

  function saveConfig(cfg) {
    memCfg = cfg;
    try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch (e) {}
  }

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function formatShortTime(ms) {
    if (!ms) return '';
    const d = new Date(ms);
    const nowYear = new Date().getFullYear();
    const yPrefix = d.getFullYear() !== nowYear ? d.getFullYear() + '-' : '';
    return yPrefix + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function formatFullTime(ms) {
    if (!ms) return '—';
    const d = new Date(ms);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
      ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }

  function formatDateKey(ms) {
    const d = new Date(ms);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function formatClock(ms) {
    const d = new Date(ms);
    return pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function toDatetimeLocal(ms) {
    if (!ms) return '';
    const d = new Date(ms);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
      'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function formatDuration(startMs, endMs) {
    if (startMs == null || endMs == null) return '';
    const diff = Math.max(0, endMs - startMs);
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return '<1分钟';
    if (mins < 60) return mins + '分钟';
    const hours = Math.floor(mins / 60);
    const remMins = mins % 60;
    if (hours < 24) return remMins > 0 ? (hours + '小时' + remMins + '分') : (hours + '小时');
    const days = Math.floor(hours / 24);
    if (days >= 3) return days + '天';
    const remHours = hours % 24;
    return remHours > 0 ? (days + '天' + remHours + '小时') : (days + '天');
  }

  function uid(prefix) {
    return (prefix || 'id') + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
  }

  return {
    PALETTE, loadStore, saveStore, loadConfig, saveConfig,
    formatShortTime, formatFullTime, formatDateKey, formatClock,
    toDatetimeLocal, formatDuration, uid
  };
})();
