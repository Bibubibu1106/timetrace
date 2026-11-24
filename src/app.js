// 时光待办 · 视图交互主控制器
(function () {
  const S = window.TimeTraceStore;
  const Sync = window.TimeTraceSync;

  let store = S.loadStore();
  let cfg = S.loadConfig();

  let activeTab = 'todo';          // 'todo' | 'timeline' | 'settings'
  let filterCat = 'all';           // 'all' | categoryId
  let filterStatus = 'all';        // 'all' | 'open' | 'done'
  let searchQuery = '';
  let newCatId = 'cat_work';
  let newDueDate = '';             // '' (默认长期) or 'YYYY-MM-DD'
  let pickedCatColor = S.PALETTE[0];
  const initNow = new Date();
  let timelineDate = '';           // '' (全部日期) or 'YYYY-MM-DD'
  let calYear = initNow.getFullYear();
  let calMonth = initNow.getMonth(); // 0-11
  let editingTaskId = null;
  let toastTimer = null;
  let autoSyncTimer = null;
  let isSyncing = false;

  const $ = (id) => document.getElementById(id);

  function showToast(msg) {
    const el = $('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2000);
  }

  function applyTheme() {
    const isDark = cfg.theme === 'dark';
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) metaTheme.setAttribute('content', isDark ? '#0b091e' : '#2b1e54');
    if (window.AndroidBridge && typeof window.AndroidBridge.setStatusBarDark === 'function') {
      window.AndroidBridge.setStatusBarDark(isDark);
    }
  }

  function activeCategories() {
    return (store.categories || []).filter((c) => !c.deletedAt);
  }

  function activeTasks() {
    return (store.tasks || []).filter((t) => !t.deletedAt);
  }

  function getCat(catId) {
    return activeCategories().find((c) => c.id === catId) || { id: 'none', name: '默认', color: '#2da4c8' };
  }

  function esc(str) {
    return String(str || '').replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
  }

  function scheduleAutoSync() {
    const ready = (cfg.mode === 'gitee' && cfg.giteeToken && cfg.gistId) ||
                  (cfg.mode === 'server' && cfg.serverUrl);
    if (!ready) return;
    if (autoSyncTimer) clearTimeout(autoSyncTimer);
    autoSyncTimer = setTimeout(() => triggerSync(true), 2200);
  }

  function renderComposerCats() {
    const cats = activeCategories();
    if (!cats.some((c) => c.id === newCatId) && cats.length) newCatId = cats[0].id;
    $('composerCats').innerHTML = cats.map((c) => `
      <button type="button" class="chip ${c.id === newCatId ? 'active' : ''}" data-pick-cat="${esc(c.id)}">
        <span class="cat-dot" style="background:${esc(c.color)}"></span>${esc(c.name)}
      </button>
    `).join('');
  }

  function renderFilterCats() {
    const cats = activeCategories();
    const allCount = activeTasks().filter((t) => !t.completedAt).length;
    let html = `<button type="button" class="chip ${filterCat === 'all' ? 'active' : ''}" data-filter-cat="all">全部 (${allCount})</button>`;
    html += cats.map((c) => {
      const cnt = activeTasks().filter((t) => t.categoryId === c.id && !t.completedAt).length;
      return `<button type="button" class="chip ${filterCat === c.id ? 'active' : ''}" data-filter-cat="${esc(c.id)}">
        <span class="cat-dot" style="background:${esc(c.color)}"></span>${esc(c.name)} (${cnt})
      </button>`;
    }).join('');
    $('filterCats').innerHTML = html;

    const sideEl = $('sidebarCats');
    if (sideEl) {
      let sHtml = `<button type="button" class="side-nav-btn ${activeTab === 'todo' && filterCat === 'all' ? 'active' : ''}" data-filter-cat="all">
        <span class="side-nav-left"><span class="cat-dot" style="background:var(--primary)"></span>全部事项</span>
        <span class="side-cnt">${allCount}</span>
      </button>`;
      sHtml += cats.map((c) => {
        const cnt = activeTasks().filter((t) => t.categoryId === c.id && !t.completedAt).length;
        return `<button type="button" class="side-nav-btn ${activeTab === 'todo' && filterCat === c.id ? 'active' : ''}" data-filter-cat="${esc(c.id)}">
          <span class="side-nav-left"><span class="cat-dot" style="background:${esc(c.color)}"></span>${esc(c.name)}</span>
          <span class="side-cnt">${cnt}</span>
        </button>`;
      }).join('');
      sideEl.innerHTML = sHtml;
    }
  }

  function formatDdlBadge(t, todayKey) {
    if (!t.dueDate) return '';
    const nowYear = String(new Date().getFullYear());
    const shortDue = t.dueDate.startsWith(nowYear + '-') ? t.dueDate.slice(5) : t.dueDate;
    if (t.completedAt) {
      return `<span class="meta-badge badge-cat">DDL ${esc(shortDue)}</span>`;
    }
    const tMs = new Date(todayKey.replace(/-/g, '/') + ' 00:00:00').getTime();
    const dMs = new Date(t.dueDate.replace(/-/g, '/') + ' 00:00:00').getTime();
    const diffDays = Math.round((dMs - tMs) / 86400000);
    if (diffDays < 0) return `<span class="meta-badge badge-ddl-overdue">DDL ${esc(shortDue)} · 超期${Math.abs(diffDays)}天</span>`;
    if (diffDays === 0) return `<span class="meta-badge badge-ddl-soon">DDL 今天截止</span>`;
    if (diffDays <= 3) return `<span class="meta-badge badge-ddl-soon">DDL ${esc(shortDue)} · 剩${diffDays}天</span>`;
    return `<span class="meta-badge badge-ddl">DDL ${esc(shortDue)} · 剩${diffDays}天</span>`;
  }

  function renderNewDdlPill() {
    const pill = $('newDdlPill');
    const txt = $('newDdlText');
    const clr = $('clearNewDdlBtn');
    if (!pill || !txt || !clr) return;
    if (newDueDate) {
      const nowYear = String(new Date().getFullYear());
      const shortDue = newDueDate.startsWith(nowYear + '-') ? newDueDate.slice(5) : newDueDate;
      pill.classList.add('has-ddl');
      txt.textContent = 'DDL ' + shortDue;
      clr.classList.remove('hidden');
    } else {
      pill.classList.remove('has-ddl');
      txt.textContent = '默认长期 · 设DDL';
      clr.classList.add('hidden');
      if ($('newDueInput')) $('newDueInput').value = '';
    }
  }

  function renderTaskList() {
    let list = activeTasks();
    if (filterCat !== 'all') list = list.filter((t) => t.categoryId === filterCat);
    if (filterStatus === 'open') list = list.filter((t) => !t.completedAt);
    if (filterStatus === 'done') list = list.filter((t) => !!t.completedAt);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter((t) => (t.title || '').toLowerCase().includes(q) || (t.note || '').toLowerCase().includes(q));
    }

    list.sort((a, b) => {
      const aDone = !!a.completedAt;
      const bDone = !!b.completedAt;
      if (aDone !== bDone) return aDone ? 1 : -1;
      if (!aDone) {
        const aHasDue = !!a.dueDate;
        const bHasDue = !!b.dueDate;
        if (aHasDue !== bHasDue) return aHasDue ? -1 : 1;
        if (aHasDue && a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1;
        return (b.createdAt || 0) - (a.createdAt || 0);
      }
      return (b.completedAt || 0) - (a.completedAt || 0);
    });

    const box = $('taskList');
    if (!list.length) {
      box.innerHTML = `<div class="glass-card empty-box">
        <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" style="opacity:0.48">
          <circle cx="12" cy="12" r="9"/><path d="M9 12l2 2 4-4"/>
        </svg>
        <p>当前筛选下暂无待办事项，在上方记下一件事吧</p>
      </div>`;
      return;
    }

    const todayKey = S.formatDateKey(Date.now());
    const nowMs = Date.now();
    box.innerHTML = list.map((t) => {
      const done = !!t.completedAt;
      const cat = getCat(t.categoryId);
      const dur = done ? S.formatDuration(t.createdAt, t.completedAt) : '';
      const waitDays = (!done && t.createdAt) ? Math.floor((nowMs - t.createdAt) / 86400000) : 0;
      const ddlBadge = formatDdlBadge(t, todayKey);
      return `<div class="task-swipe-wrap" data-swipe-id="${esc(t.id)}">
        <div class="swipe-bg">
          <span class="swipe-hint swipe-hint-left">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
            <em class="swipe-left-txt" style="font-style:normal">${done ? '恢复待办' : '完成'}</em>
          </span>
          <span class="swipe-hint swipe-hint-right">
            <em class="swipe-right-txt" style="font-style:normal">删除</em>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path></svg>
          </span>
        </div>
        <div class="glass-card task-item ${done ? 'done' : ''}" data-task-id="${esc(t.id)}">
          <button type="button" class="check-btn" data-toggle-id="${esc(t.id)}" aria-label="切换完成状态">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </button>
          <div class="task-body">
            <div class="task-top">
              <div class="task-title">${esc(t.title)}</div>
            </div>
            ${t.note ? `<div class="task-note">${esc(t.note)}</div>` : ''}
            <div class="time-meta-row">
              <span class="meta-badge badge-cat"><span class="cat-dot" style="background:${esc(cat.color)}"></span>${esc(cat.name)}</span>
              ${ddlBadge}
              <span class="meta-badge badge-created">创建 ${esc(S.formatShortTime(t.createdAt))}</span>
              ${(!done && !t.dueDate && waitDays >= 1) ? `<span class="meta-badge badge-cat">已记下 ${waitDays}天</span>` : ''}
              ${done ? `<span class="meta-badge badge-completed">完成 ${esc(S.formatShortTime(t.completedAt))}</span>` : ''}
              ${dur ? `<span class="meta-badge badge-duration">时隔 ${esc(dur)}</span>` : ''}
            </div>
          </div>
        </div>
      </div>`;
    }).join('');
  }

  function pad2(n) { return n < 10 ? '0' + n : '' + n; }

  function renderCalendar(dayMap, todayKey) {
    $('calMonthTitle').textContent = calYear + '年 ' + pad2(calMonth + 1) + '月';
    $('clearDateBtn').classList.toggle('active', !timelineDate);
    $('calHintText').textContent = timelineDate ? ('当前筛选：' + timelineDate + '（再点取消）') : '左右滑动切月 · 点日期筛选';

    const firstDay = new Date(calYear, calMonth, 1);
    const startOffset = (firstDay.getDay() + 6) % 7; // 周一为首列 (0..6)
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;

    let cellsHtml = '';
    for (let i = 0; i < totalCells; i++) {
      const cellDate = new Date(calYear, calMonth, 1 - startOffset + i);
      const y = cellDate.getFullYear();
      const m = cellDate.getMonth();
      const d = cellDate.getDate();
      const dKey = y + '-' + pad2(m + 1) + '-' + pad2(d);
      const isOther = m !== calMonth;
      const info = dayMap.get(dKey);
      const hasData = !!(info && (info.ddl || info.create || info.finish));

      let dots = '';
      if (info) {
        if (info.ddl > 0) dots += '<i class="cal-dot ddl" title="有待办DDL截止"></i>';
        if (info.create > 0) dots += '<i class="cal-dot create" title="有新建记录"></i>';
        if (info.finish > 0) dots += '<i class="cal-dot finish" title="有完成记录"></i>';
      }

      const cls = [
        'cal-cell',
        isOther ? 'other-month' : '',
        hasData ? 'has-data' : '',
        dKey === todayKey ? 'is-today' : '',
        dKey === timelineDate ? 'selected' : ''
      ].filter(Boolean).join(' ');

      cellsHtml += `<button type="button" class="${cls}" data-cal-date="${dKey}" data-cal-y="${y}" data-cal-m="${m}">
        <span class="cal-day-num">${d}</span>
        <span class="cal-dots">${dots}</span>
      </button>`;
    }
    $('calGrid').innerHTML = cellsHtml;
  }

  function shiftMonth(delta) {
    const grid = $('calGrid');
    if (grid) {
      grid.style.transform = delta > 0 ? 'translateX(-14px)' : 'translateX(14px)';
      grid.style.opacity = '0.45';
      setTimeout(() => { grid.style.transform = ''; grid.style.opacity = '1'; }, 150);
    }
    const next = new Date(calYear, calMonth + delta, 1);
    calYear = next.getFullYear();
    calMonth = next.getMonth();
    renderTimeline();
  }

  function renderTimeline() {
    const tasks = activeTasks();
    const todayKey = S.formatDateKey(Date.now());
    const monthPrefix = calYear + '-' + pad2(calMonth + 1) + '-';

    const events = [];
    const dayMap = new Map();
    const ensureDay = (k) => {
      if (!dayMap.has(k)) dayMap.set(k, { ddl: 0, create: 0, finish: 0 });
      return dayMap.get(k);
    };

    tasks.forEach((t) => {
      if (t.createdAt) {
        const ck = S.formatDateKey(t.createdAt);
        events.push({ ts: t.createdAt, type: 'create', task: t, dateKey: ck });
        ensureDay(ck).create++;
      }
      if (t.completedAt) {
        const fk = S.formatDateKey(t.completedAt);
        events.push({ ts: t.completedAt, type: 'finish', task: t, dateKey: fk });
        ensureDay(fk).finish++;
      }
      if (t.dueDate) {
        const dueEndTs = new Date(t.dueDate.replace(/-/g, '/') + ' 23:59:00').getTime();
        events.push({ ts: dueEndTs, type: 'ddl', task: t, dateKey: t.dueDate });
        if (!t.completedAt) ensureDay(t.dueDate).ddl++;
      }
    });

    renderCalendar(dayMap, todayKey);

    const filtered = timelineDate
      ? events.filter((e) => e.dateKey === timelineDate)
      : events.filter((e) => e.dateKey.startsWith(monthPrefix));
    filtered.sort((a, b) => b.ts - a.ts);

    const container = $('timelineContainer');
    if (!filtered.length) {
      const emptyMsg = timelineDate
        ? (timelineDate + ' 当天暂无创建或完成记录')
        : (calYear + '年' + (calMonth + 1) + '月暂无记录，可左右滑动切换其他月份');
      container.innerHTML = `<div class="glass-card empty-box"><p>${esc(emptyMsg)}</p></div>`;
      return;
    }

    const groups = new Map();
    filtered.forEach((ev) => {
      if (!groups.has(ev.dateKey)) groups.set(ev.dateKey, []);
      groups.get(ev.dateKey).push(ev);
    });

    const weekNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    let html = '';
    groups.forEach((evList, dKey) => {
      const dObj = new Date(dKey.replace(/-/g, '/') + ' 00:00:00');
      const wk = weekNames[dObj.getDay()] || '';
      const createCnt = evList.filter((e) => e.type === 'create').length;
      const finishCnt = evList.filter((e) => e.type === 'finish').length;
      const ddlCnt = evList.filter((e) => e.type === 'ddl' && !e.task.completedAt).length;
      const tagLabel = dKey === todayKey ? dKey + ' · 今天 (' + wk + ')' : dKey + ' (' + wk + ')';
      const rightSummary = (ddlCnt ? ('DDL ' + ddlCnt + ' · ') : '') + '新建 ' + createCnt + ' · 完成 ' + finishCnt;

      html += `<div class="day-group">
        <div class="day-header">
          <span>${esc(tagLabel)}</span>
          <span>${esc(rightSummary)}</span>
        </div>
        <div class="glass-card timeline-card">
          ${evList.map((ev) => {
            const cat = getCat(ev.task.categoryId);
            const dur = ev.type === 'finish' ? S.formatDuration(ev.task.createdAt, ev.task.completedAt) : '';
            const timeLabel = ev.type === 'ddl' ? '全天' : S.formatClock(ev.ts);
            const typeText = ev.type === 'finish' ? '完成' : (ev.type === 'ddl' ? 'DDL' : '创建');
            return `<div class="tl-row" data-task-id="${esc(ev.task.id)}">
              <div class="tl-time">${esc(timeLabel)}</div>
              <span class="tl-tag ${ev.type}">${typeText}</span>
              <div style="flex:1;min-width:0">
                <div style="font-size:14px;font-weight:550;word-break:break-word">${esc(ev.task.title)}</div>
                <div class="time-meta-row" style="margin-top:4px">
                  <span class="meta-badge badge-cat"><span class="cat-dot" style="background:${esc(cat.color)}"></span>${esc(cat.name)}</span>
                  ${ev.type === 'ddl' ? `<span class="meta-badge ${ev.task.completedAt ? 'badge-completed' : 'badge-ddl-soon'}">${ev.task.completedAt ? '已完成' : '待完成'}</span>` : ''}
                  ${dur ? `<span class="meta-badge badge-duration">时隔 ${esc(dur)}</span>` : ''}
                </div>
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>`;
    });
    container.innerHTML = html;
  }

  function renderSettings() {
    const tasks = activeTasks();
    const nowObj = new Date();
    const curPrefix = nowObj.getFullYear() + '-' + pad2(nowObj.getMonth() + 1) + '-';
    const doneTasks = tasks.filter((t) => !!t.completedAt);
    const openCnt = tasks.length - doneTasks.length;
    const monthCreate = tasks.filter((t) => t.createdAt && S.formatDateKey(t.createdAt).startsWith(curPrefix)).length;
    const monthDone = doneTasks.filter((t) => S.formatDateKey(t.completedAt).startsWith(curPrefix)).length;

    $('statMonthCreate').textContent = monthCreate;
    $('statMonthDone').textContent = monthDone;
    $('statTotalAll').textContent = tasks.length;
    $('myStatsSub').textContent = `当前待办 ${openCnt} 项 · 累计已完成 ${doneTasks.length} 项`;

    $('syncModeSelect').value = cfg.mode || 'gitee';
    $('giteeBox').classList.toggle('hidden', cfg.mode === 'server');
    $('serverBox').classList.toggle('hidden', cfg.mode !== 'server');
    $('giteeTokenInput').value = cfg.giteeToken || '';
    $('gistIdInput').value = cfg.gistId || '';
    $('serverUrlInput').value = cfg.serverUrl || '';
    $('serverTokenInput').value = cfg.serverToken || '';
    const isBound = (cfg.mode === 'gitee' && cfg.giteeToken && cfg.gistId) || (cfg.mode === 'server' && cfg.serverUrl);
    if (isBound && !$('pairCodeInput').value) {
      try { $('pairCodeInput').value = Sync.encodePairCode(cfg); } catch (e) {}
    }
    $('lastSyncText').textContent = isBound
      ? ('已永久绑定本机 · ' + (cfg.lastSyncAt ? ('上次同步：' + S.formatFullTime(cfg.lastSyncAt)) : '改动后自动静默同步'))
      : '尚未绑定云同步（绑定一次即可永久自动同步）';
    if ($('createVaultBtn')) {
      $('createVaultBtn').textContent = cfg.gistId ? '已创建同步库（无需再点）' : '首台设备：一键创建同步库';
    }

    const linksEl = $('quickLinksList');
    if (linksEl) {
      const p = 'https:/';
      const memoLinks = [
        { name: '时光待办网页版（新设备打开 / 添加到主屏幕）', url: [p, 'bibubibu1106.github.io', 'timetrace', ''].join('/') },
        { name: 'GitHub 界面代码仓库', url: [p, 'github.com', 'Bibubibu1106', 'timetrace'].join('/') },
        { name: '码云 Gitee 私人令牌管理页', url: [p, 'gitee.com', 'profile', 'personal_access_tokens'].join('/') },
        { name: '码云 Gitee 我的云端代码片段', url: [p, 'gitee.com', 'dashboard', 'codes'].join('/') }
      ];
      linksEl.innerHTML = memoLinks.map((lk) => `
        <div class="link-row">
          <div class="link-info">
            <div class="link-name">${esc(lk.name)}</div>
            <div class="link-url">${esc(lk.url)}</div>
          </div>
          <div class="link-actions">
            <button type="button" class="link-mini-btn" data-copy-url="${esc(lk.url)}">复制</button>
            <button type="button" class="link-mini-btn" data-open-url="${esc(lk.url)}">打开</button>
          </div>
        </div>
      `).join('');
    }

    const cats = activeCategories();
    $('manageCatsList').innerHTML = cats.map((c) => `
      <span class="chip" data-recolor-cat="${esc(c.id)}" title="点击切换该标签圆点颜色">
        <span class="cat-dot" style="background:${esc(c.color)}"></span>${esc(c.name)}
        ${cats.length > 1 ? `<button type="button" data-del-cat="${esc(c.id)}" style="border:none;background:none;color:var(--danger);cursor:pointer;padding:0 0 0 4px;font-size:14px">×</button>` : ''}
      </span>
    `).join('');

    const swEl = $('catColorSwatches');
    if (swEl) {
      swEl.innerHTML = S.PALETTE.map((col) => `
        <button type="button" class="swatch-btn ${col === pickedCatColor ? 'active' : ''}" data-pick-swatch="${esc(col)}" style="background:${esc(col)}" aria-label="选择颜色"></button>
      `).join('');
    }
  }

  function updateSyncBadge(state, text) {
    ['syncDot', 'sideSyncDot'].forEach((id) => { if ($(id)) $(id).className = 'sync-dot ' + (state || ''); });
    ['syncLabel', 'sideSyncLabel'].forEach((id) => { if ($(id)) $(id).textContent = text; });
  }

  async function triggerSync(silent) {
    if (isSyncing) return;
    const readyGitee = cfg.mode === 'gitee' && cfg.giteeToken && cfg.gistId;
    const readySrv = cfg.mode === 'server' && cfg.serverUrl;
    if (!readyGitee && !readySrv) {
      if (!silent) {
        switchTab('settings');
        showToast('请先在「我的」页面配置云同步或粘贴配对码');
      }
      return;
    }
    isSyncing = true;
    updateSyncBadge('busy', '同步中');
    try {
      const merged = cfg.mode === 'server'
        ? await Sync.syncCustomServer(cfg, store)
        : await Sync.syncGitee(cfg, store);
      store = merged;
      S.saveStore(store);
      cfg.lastSyncAt = Date.now();
      S.saveConfig(cfg);
      updateSyncBadge('ok', '已同步');
      renderAll();
      if (!silent) showToast('多端数据同步成功');
    } catch (err) {
      updateSyncBadge('err', '同步异常');
      if (!silent) showToast(err.message || '同步失败');
    } finally {
      isSyncing = false;
    }
  }

  function saveSyncInputsQuietly() {
    if (!$('syncModeSelect')) return;
    cfg.mode = $('syncModeSelect').value;
    cfg.giteeToken = $('giteeTokenInput').value.trim();
    cfg.gistId = $('gistIdInput').value.trim();
    cfg.serverUrl = $('serverUrlInput').value.trim();
    cfg.serverToken = $('serverTokenInput').value.trim();
    S.saveConfig(cfg);
  }

  function switchTab(tab) {
    activeTab = tab;
    ['todo', 'timeline', 'settings'].forEach((k) => {
      $('view-' + k).classList.toggle('hidden', k !== tab);
      document.querySelectorAll(`[data-tab="${k}"]`).forEach((btn) => btn.classList.toggle('active', k === tab));
    });
    renderAll();
  }

  function syncModalPickerState() {
    const hasDue = !!$('editDueDate').value;
    const hasDone = !!$('editCompletedAt').value;
    $('dueFieldWrap').classList.toggle('is-empty', !hasDue);
    $('clearEditDueBtn').classList.toggle('hidden', !hasDue);
    $('doneFieldWrap').classList.toggle('is-empty', !hasDone);
    $('clearEditDoneBtn').classList.toggle('hidden', !hasDone);
  }

  function openTaskModal(taskId) {
    const t = activeTasks().find((x) => x.id === taskId);
    if (!t) return;
    editingTaskId = taskId;
    $('editTitle').value = t.title || '';
    $('editNote').value = t.note || '';
    $('editCat').innerHTML = activeCategories().map((c) =>
      `<option value="${esc(c.id)}" ${c.id === t.categoryId ? 'selected' : ''}>${esc(c.name)}</option>`
    ).join('');
    $('editDueDate').value = t.dueDate || '';
    $('editCreatedAt').value = S.toDatetimeLocal(t.createdAt);
    $('editCompletedAt').value = t.completedAt ? S.toDatetimeLocal(t.completedAt) : '';
    syncModalPickerState();

    let lines = `<div class="detail-line"><span class="detail-k">创建记录</span><span class="detail-v">${esc(S.formatFullTime(t.createdAt))}</span></div>`;
    lines += `<div class="detail-line"><span class="detail-k">截止期限</span><span class="detail-v">${t.dueDate ? ('DDL ' + esc(t.dueDate)) : '长期有效'}</span></div>`;
    if (t.completedAt) {
      lines += `<div class="detail-line"><span class="detail-k">完成记录</span><span class="detail-v">${esc(S.formatFullTime(t.completedAt))}（时隔 ${esc(S.formatDuration(t.createdAt, t.completedAt))}）</span></div>`;
    }
    $('detailFullTime').innerHTML = lines;
    $('taskModal').classList.add('open');
  }

  function closeTaskModal() {
    editingTaskId = null;
    $('taskModal').classList.remove('open');
  }

  function renderAll() {
    const openCnt = activeTasks().filter((t) => !t.completedAt).length;
    const doneCnt = activeTasks().filter((t) => !!t.completedAt).length;
    const subText = `待办 ${openCnt} 项 · 已完成 ${doneCnt} 项`;
    $('brandSubtitle').textContent = subText;
    if ($('sideBrandSub')) $('sideBrandSub').textContent = subText;
    renderComposerCats();
    renderNewDdlPill();
    renderFilterCats();
    renderTaskList();
    if (activeTab === 'timeline') renderTimeline();
    if (activeTab === 'settings') renderSettings();
  }

  window.TimeTraceApp = { triggerSync, switchTab, showToast, openTaskModal, closeTaskModal, renderAll, getState: () => ({ store, cfg }) };

  document.addEventListener('DOMContentLoaded', () => {
    applyTheme();
    renderSettings();
    if ((cfg.mode === 'gitee' && cfg.giteeToken && cfg.gistId) || (cfg.mode === 'server' && cfg.serverUrl)) {
      updateSyncBadge('ok', '已绑定');
      triggerSync(true);
    } else {
      updateSyncBadge('', '本地模式');
    }
    renderAll();

    // 新建栏 DDL 选择与恢复长期
    $('newDueInput').addEventListener('change', (e) => {
      newDueDate = e.target.value || '';
      renderNewDdlPill();
    });
    $('newDdlPill').addEventListener('click', () => {
      const inp = $('newDueInput');
      if (inp && typeof inp.showPicker === 'function') {
        try { inp.showPicker(); } catch (err) {}
      }
    });
    $('clearNewDdlBtn').addEventListener('click', () => {
      newDueDate = '';
      renderNewDdlPill();
    });

    // 添加事项
    $('composerForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const title = $('newTaskInput').value.trim();
      if (!title) return;
      const now = Date.now();
      store.tasks.unshift({
        id: S.uid('task'),
        title,
        note: '',
        categoryId: newCatId,
        dueDate: newDueDate || null,
        createdAt: now,
        completedAt: null,
        updatedAt: now,
        deletedAt: null
      });
      $('newTaskInput').value = '';
      newDueDate = '';
      S.saveStore(store);
      renderAll();
      showToast('已记录创建时间 ' + S.formatClock(now));
      scheduleAutoSync();
    });

    let swipeBlockedClickUntil = 0;

    function toggleTaskCompleteById(id) {
      const t = store.tasks.find((x) => x.id === id);
      if (!t) return;
      const now = Date.now();
      t.completedAt = t.completedAt ? null : now;
      t.updatedAt = now;
      S.saveStore(store);
      renderAll();
      showToast(t.completedAt ? ('已完成 · 时隔 ' + S.formatDuration(t.createdAt, t.completedAt)) : '已恢复为待办');
      scheduleAutoSync();
    }

    function quickDeleteTaskById(id) {
      const t = store.tasks.find((x) => x.id === id);
      if (!t) return;
      t.deletedAt = Date.now();
      t.updatedAt = Date.now();
      S.saveStore(store);
      renderAll();
      showToast('已快捷删除「' + (t.title || '').slice(0, 10) + '」');
      scheduleAutoSync();
    }

    // 事项卡片双向渐进滑动手势：左拉一点提示删除、继续左拉快捷删除；右拉一点提示完成、继续右拉快捷完成
    (function setupTaskSwipeGesture() {
      const TRIGGER_PX = 104;
      const MAX_PULL_PX = 165;
      let wrap = null, card = null, bg = null, leftTxt = null, rightTxt = null, taskId = '';
      let isDoneTask = false;
      let startX = 0, startY = 0, curDx = 0, lockedAxis = '';

      function onStart(clientX, clientY, target) {
        if (target.closest('.check-btn')) return;
        const w = target.closest('.task-swipe-wrap');
        if (!w) return;
        wrap = w;
        taskId = w.dataset.swipeId || '';
        card = w.querySelector('.task-item');
        bg = w.querySelector('.swipe-bg');
        leftTxt = w.querySelector('.swipe-left-txt');
        rightTxt = w.querySelector('.swipe-right-txt');
        const tObj = store.tasks.find((x) => x.id === taskId);
        isDoneTask = !!(tObj && tObj.completedAt);
        startX = clientX;
        startY = clientY;
        curDx = 0;
        lockedAxis = '';
      }

      function onMove(clientX, clientY, ev) {
        if (!wrap || !card) return;
        const dx = clientX - startX;
        const dy = clientY - startY;
        if (!lockedAxis) {
          if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
          lockedAxis = Math.abs(dx) > Math.abs(dy) * 1.15 ? 'x' : 'y';
          if (lockedAxis === 'x') card.classList.add('dragging');
        }
        if (lockedAxis !== 'x') return;
        if (ev && ev.cancelable) ev.preventDefault();

        const sign = dx >= 0 ? 1 : -1;
        const abs = Math.abs(dx);
        const damped = abs <= TRIGGER_PX ? abs : (TRIGGER_PX + (abs - TRIGGER_PX) * 0.42);
        curDx = sign * Math.min(MAX_PULL_PX, damped);
        card.style.transform = `translateX(${curDx.toFixed(1)}px)`;

        const armed = Math.abs(dx) >= TRIGGER_PX;
        if (dx > 6) {
          bg.className = 'swipe-bg show-right' + (armed ? ' armed' : '');
          if (leftTxt) leftTxt.textContent = armed ? (isDoneTask ? '松手恢复待办' : '松手完成') : (isDoneTask ? '继续右拉恢复' : '继续右拉完成');
        } else if (dx < -6) {
          bg.className = 'swipe-bg show-left' + (armed ? ' armed' : '');
          if (rightTxt) rightTxt.textContent = armed ? '松手删除' : '继续左拉删除';
        } else {
          bg.className = 'swipe-bg';
        }
      }

      function onEnd(clientX) {
        if (!wrap || !card) return;
        const totalDx = (typeof clientX === 'number') ? (clientX - startX) : curDx;
        const wasHorizontal = lockedAxis === 'x';
        const targetCard = card;
        const targetBg = bg;
        const targetId = taskId;
        wrap = null; card = null; bg = null; leftTxt = null; rightTxt = null; taskId = ''; lockedAxis = '';

        targetCard.classList.remove('dragging');
        if (!wasHorizontal) return;
        swipeBlockedClickUntil = Date.now() + 320;

        if (totalDx >= TRIGGER_PX) {
          targetCard.style.transform = 'translateX(120%)';
          setTimeout(() => toggleTaskCompleteById(targetId), 140);
        } else if (totalDx <= -TRIGGER_PX) {
          targetCard.style.transform = 'translateX(-120%)';
          targetCard.style.opacity = '0';
          setTimeout(() => quickDeleteTaskById(targetId), 150);
        } else {
          targetCard.style.transform = '';
          setTimeout(() => { if (targetBg) targetBg.className = 'swipe-bg'; }, 180);
        }
      }

      const listEl = $('taskList');
      listEl.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) onStart(e.touches[0].clientX, e.touches[0].clientY, e.target);
      }, { passive: true });
      listEl.addEventListener('touchmove', (e) => {
        if (e.touches.length === 1) onMove(e.touches[0].clientX, e.touches[0].clientY, e);
      }, { passive: false });
      listEl.addEventListener('touchend', (e) => {
        onEnd(e.changedTouches && e.changedTouches[0] ? e.changedTouches[0].clientX : undefined);
      });
      listEl.addEventListener('touchcancel', () => onEnd(0));

      let mouseDown = false;
      listEl.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        mouseDown = true;
        onStart(e.clientX, e.clientY, e.target);
      });
      window.addEventListener('mousemove', (e) => {
        if (mouseDown) onMove(e.clientX, e.clientY, e);
      });
      window.addEventListener('mouseup', (e) => {
        if (!mouseDown) return;
        mouseDown = false;
        onEnd(e.clientX);
      });
    })();

    // 全局事件委托
    document.body.addEventListener('click', async (e) => {
      const pickBtn = e.target.closest('[data-pick-cat]');
      if (pickBtn) { newCatId = pickBtn.dataset.pickCat; renderComposerCats(); return; }

      const fCatBtn = e.target.closest('[data-filter-cat]');
      if (fCatBtn) {
        filterCat = fCatBtn.dataset.filterCat;
        if (activeTab !== 'todo') switchTab('todo');
        else { renderFilterCats(); renderTaskList(); }
        return;
      }

      const fStatBtn = e.target.closest('[data-status]');
      if (fStatBtn) {
        filterStatus = fStatBtn.dataset.status;
        document.querySelectorAll('[data-status]').forEach((b) => b.classList.toggle('active', b === fStatBtn));
        renderTaskList();
        return;
      }

      const toggleBtn = e.target.closest('[data-toggle-id]');
      if (toggleBtn) {
        e.stopPropagation();
        toggleTaskCompleteById(toggleBtn.dataset.toggleId);
        return;
      }

      const card = e.target.closest('[data-task-id]');
      if (card) {
        if (Date.now() < swipeBlockedClickUntil) return;
        openTaskModal(card.dataset.taskId);
        return;
      }

      const calBtn = e.target.closest('[data-cal-date]');
      if (calBtn) {
        const dk = calBtn.dataset.calDate;
        calYear = Number(calBtn.dataset.calY);
        calMonth = Number(calBtn.dataset.calM);
        timelineDate = (timelineDate === dk) ? '' : dk;
        renderTimeline();
        return;
      }

      const tabBtn = e.target.closest('[data-tab]');
      if (tabBtn) { switchTab(tabBtn.dataset.tab); return; }

      const delCatBtn = e.target.closest('[data-del-cat]');
      if (delCatBtn) {
        e.stopPropagation();
        const cid = delCatBtn.dataset.delCat;
        const c = store.categories.find((x) => x.id === cid);
        if (c) { c.deletedAt = Date.now(); c.updatedAt = Date.now(); S.saveStore(store); renderAll(); scheduleAutoSync(); }
        return;
      }

      const copyUrlBtn = e.target.closest('[data-copy-url]');
      if (copyUrlBtn) {
        const u = copyUrlBtn.dataset.copyUrl;
        try { await navigator.clipboard.writeText(u); showToast('网址已复制'); }
        catch (err) { showToast(u); }
        return;
      }

      const openUrlBtn = e.target.closest('[data-open-url]');
      if (openUrlBtn) {
        const u = openUrlBtn.dataset.openUrl;
        if (window.AndroidBridge && typeof window.AndroidBridge.openExternalUrl === 'function') {
          window.AndroidBridge.openExternalUrl(u);
        } else {
          window.open(u, '_blank', 'noopener,noreferrer');
        }
        return;
      }

      const swBtn = e.target.closest('[data-pick-swatch]');
      if (swBtn) {
        pickedCatColor = swBtn.dataset.pickSwatch;
        renderSettings();
        return;
      }

      const recolorChip = e.target.closest('[data-recolor-cat]');
      if (recolorChip) {
        const c = store.categories.find((x) => x.id === recolorChip.dataset.recolorCat);
        if (c) {
          const idx = S.PALETTE.indexOf(c.color);
          c.color = S.PALETTE[(idx + 1) % S.PALETTE.length];
          c.updatedAt = Date.now();
          S.saveStore(store);
          renderAll();
          showToast('已切换「' + c.name + '」圆点颜色');
          scheduleAutoSync();
        }
      }
    });

    $('searchInput').addEventListener('input', (e) => { searchQuery = e.target.value.trim(); renderTaskList(); });
    const toggleTheme = () => { cfg.theme = cfg.theme === 'dark' ? 'light' : 'dark'; S.saveConfig(cfg); applyTheme(); };
    $('themeBtn').addEventListener('click', toggleTheme);
    if ($('sideThemeBtn')) $('sideThemeBtn').addEventListener('click', toggleTheme);
    $('syncBtn').addEventListener('click', () => triggerSync(false));
    if ($('sideSyncBtn')) $('sideSyncBtn').addEventListener('click', () => triggerSync(false));

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && $('taskModal').classList.contains('open')) { closeTaskModal(); return; }
      const tag = (document.activeElement && document.activeElement.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'n' || e.key === 'N') { e.preventDefault(); switchTab('todo'); $('newTaskInput').focus(); }
      if (e.key === '/') { e.preventDefault(); switchTab('todo'); $('searchInput').focus(); }
    });
    $('calPrevBtn').addEventListener('click', () => shiftMonth(-1));
    $('calNextBtn').addEventListener('click', () => shiftMonth(1));
    $('calTodayBtn').addEventListener('click', () => {
      const n = new Date();
      calYear = n.getFullYear();
      calMonth = n.getMonth();
      timelineDate = S.formatDateKey(Date.now());
      renderTimeline();
    });
    $('clearDateBtn').addEventListener('click', () => { timelineDate = ''; renderTimeline(); });

    // 日历卡片支持手机/平板左右滑动与电脑触控板拖拽切月
    let swipeX = null, swipeY = null;
    const calCard = $('calendarCard');
    calCard.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) { swipeX = e.touches[0].clientX; swipeY = e.touches[0].clientY; }
    }, { passive: true });
    calCard.addEventListener('touchend', (e) => {
      if (swipeX === null || !e.changedTouches.length) return;
      const dx = e.changedTouches[0].clientX - swipeX;
      const dy = e.changedTouches[0].clientY - swipeY;
      swipeX = null; swipeY = null;
      if (Math.abs(dx) > 42 && Math.abs(dx) > Math.abs(dy) * 1.2) {
        shiftMonth(dx < 0 ? 1 : -1);
      }
    }, { passive: true });
    let mouseDragX = null;
    calCard.addEventListener('mousedown', (e) => { mouseDragX = e.clientX; });
    calCard.addEventListener('mouseup', (e) => {
      if (mouseDragX === null) return;
      const dx = e.clientX - mouseDragX;
      mouseDragX = null;
      if (Math.abs(dx) > 55) shiftMonth(dx < 0 ? 1 : -1);
    });

    // 弹窗保存与删除
    $('closeModalBtn').addEventListener('click', closeTaskModal);
    $('taskModal').addEventListener('click', (e) => { if (e.target === $('taskModal')) closeTaskModal(); });
    $('editDueDate').addEventListener('change', syncModalPickerState);
    $('editCompletedAt').addEventListener('change', syncModalPickerState);
    $('dueFieldWrap').addEventListener('click', () => {
      if (typeof $('editDueDate').showPicker === 'function') {
        try { $('editDueDate').showPicker(); } catch (e) {}
      }
    });
    $('doneFieldWrap').addEventListener('click', () => {
      if (typeof $('editCompletedAt').showPicker === 'function') {
        try { $('editCompletedAt').showPicker(); } catch (e) {}
      }
    });
    $('clearEditDueBtn').addEventListener('click', () => { $('editDueDate').value = ''; syncModalPickerState(); });
    $('clearEditDoneBtn').addEventListener('click', () => { $('editCompletedAt').value = ''; syncModalPickerState(); });
    $('saveTaskBtn').addEventListener('click', () => {
      const t = store.tasks.find((x) => x.id === editingTaskId);
      if (!t) return;
      const title = $('editTitle').value.trim();
      if (!title) { showToast('标题不能为空'); return; }
      t.title = title;
      t.note = $('editNote').value.trim();
      t.categoryId = $('editCat').value;
      t.dueDate = $('editDueDate').value || null;
      if ($('editCreatedAt').value) t.createdAt = new Date($('editCreatedAt').value).getTime();
      t.completedAt = $('editCompletedAt').value ? new Date($('editCompletedAt').value).getTime() : null;
      t.updatedAt = Date.now();
      S.saveStore(store);
      closeTaskModal();
      renderAll();
      showToast('修改已保存');
      scheduleAutoSync();
    });
    $('deleteTaskBtn').addEventListener('click', () => {
      const t = store.tasks.find((x) => x.id === editingTaskId);
      if (!t) return;
      t.deletedAt = Date.now();
      t.updatedAt = Date.now();
      S.saveStore(store);
      closeTaskModal();
      renderAll();
      showToast('事项已删除');
      scheduleAutoSync();
    });

    // 设置页：分类、云同步、配对码、备份导入导出
    $('addCatBtn').addEventListener('click', () => {
      const name = $('newCatInput').value.trim();
      if (!name) return;
      const color = pickedCatColor || S.PALETTE[activeCategories().length % S.PALETTE.length];
      store.categories.push({ id: S.uid('cat'), name, color, updatedAt: Date.now(), deletedAt: null });
      pickedCatColor = S.PALETTE[(S.PALETTE.indexOf(color) + 1) % S.PALETTE.length];
      $('newCatInput').value = '';
      S.saveStore(store);
      renderAll();
      showToast('已添加分类「' + name + '」');
      scheduleAutoSync();
    });

    $('syncModeSelect').addEventListener('change', () => { saveSyncInputsQuietly(); renderSettings(); });
    $('createVaultBtn').addEventListener('click', async () => {
      try {
        const existingGist = ($('gistIdInput').value || cfg.gistId || '').trim();
        if (existingGist) {
          const ok = window.confirm(
            '当前已绑定云端同步库 ID（' + existingGist.slice(0, 8) + '...），无需重复创建！\n\n' +
            '如果继续新建，会产生另一个全新的同步库，其他设备需要重新粘贴新配对码才能互通。\n确定仍要新建吗？'
          );
          if (!ok) return;
        }
        saveSyncInputsQuietly();
        showToast('正在创建私有同步库...');
        const gistId = await Sync.createGiteeVault(cfg.giteeToken, store);
        cfg.gistId = gistId;
        cfg.lastSyncAt = Date.now();
        S.saveConfig(cfg);
        $('pairCodeInput').value = Sync.encodePairCode(cfg);
        renderSettings();
        updateSyncBadge('ok', '已同步');
        showToast('创建成功！已自动生成同步库 ID');
      } catch (err) { showToast(err.message); }
    });
    $('saveAndSyncBtn').addEventListener('click', () => {
      saveSyncInputsQuietly();
      triggerSync(false);
    });
    if ($('serverSyncBtn')) {
      $('serverSyncBtn').addEventListener('click', () => {
        saveSyncInputsQuietly();
        triggerSync(false);
      });
    }
    $('copyPairBtn').addEventListener('click', async () => {
      saveSyncInputsQuietly();
      const code = Sync.encodePairCode(cfg);
      $('pairCodeInput').value = code;
      try { await navigator.clipboard.writeText(code); showToast('云同步配对码已复制'); }
      catch (e) { showToast('已生成配对码，请长按复制'); }
    });
    $('applyPairBtn').addEventListener('click', () => {
      try {
        const parsed = Sync.decodePairCode($('pairCodeInput').value);
        Object.assign(cfg, parsed);
        S.saveConfig(cfg);
        renderSettings();
        showToast('配对码已永久保存，正在同步...');
        triggerSync(false);
      } catch (err) { showToast(err.message); }
    });

    $('exportJsonBtn').addEventListener('click', () => {
      const fn = '时光待办备份_' + S.formatDateKey(Date.now()) + '.json';
      const where = Sync.exportFile(fn, JSON.stringify(store, null, 2), 'application/json;charset=utf-8');
      showToast(where === 'android_downloads' ? ('已保存至手机 Download/' + fn) : '备份文件已导出');
    });
    $('exportCsvBtn').addEventListener('click', () => {
      const rows = [['事项名称', '分类', '状态', '截止日期(DDL)', '创建时间', '完成时间', '时隔跨度', '备注']];
      activeTasks().forEach((t) => {
        rows.push([
          t.title, getCat(t.categoryId).name, t.completedAt ? '已完成' : '待完成',
          t.dueDate || '长期有效',
          S.formatFullTime(t.createdAt), t.completedAt ? S.formatFullTime(t.completedAt) : '',
          t.completedAt ? S.formatDuration(t.createdAt, t.completedAt) : '', t.note || ''
        ]);
      });
      const csv = '\uFEFF' + rows.map((r) => r.map((v) => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\n');
      const fn = '时光待办清单_' + S.formatDateKey(Date.now()) + '.csv';
      const where = Sync.exportFile(fn, csv, 'text/csv;charset=utf-8');
      showToast(where === 'android_downloads' ? ('表格已保存至 Download/' + fn) : 'CSV 表格已导出');
    });
    $('importJsonBtn').addEventListener('click', () => $('importFileInput').click());
    $('importFileInput').addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const imported = JSON.parse(String(reader.result || '{}'));
          if (!Array.isArray(imported.tasks)) throw new Error('备份文件格式不正确');
          store = Sync.mergeStores(store, imported);
          S.saveStore(store);
          renderAll();
          showToast('备份已合并导入（共 ' + activeTasks().length + ' 条事项）');
          scheduleAutoSync();
        } catch (err) { showToast(err.message || '导入失败'); }
        e.target.value = '';
      };
      reader.readAsText(file);
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') triggerSync(true);
    });
  });
})();
