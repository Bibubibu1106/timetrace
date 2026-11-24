// 时光待办 · 多端无冲突云同步与备份引擎 (Gitee 免服务器云同步 + 私有云接口 + 本地备份)
window.TimeTraceSync = (function () {
  const GIST_FILENAME = 'timetrace_todo_sync_v1.json';
  const GITEE_GISTS_API = ['https:/', 'gitee.com', 'api', 'v5', 'gists'].join('/');

  function mergeById(listA, listB) {
    const map = new Map();
    (listA || []).forEach((it) => { if (it && it.id) map.set(it.id, it); });
    (listB || []).forEach((it) => {
      if (!it || !it.id) return;
      const cur = map.get(it.id);
      if (!cur || (Number(it.updatedAt) || 0) >= (Number(cur.updatedAt) || 0)) {
        map.set(it.id, it);
      }
    });
    return Array.from(map.values());
  }

  function mergeStores(localStore, remoteStore) {
    return {
      schemaVersion: 1,
      updatedAt: Date.now(),
      tasks: mergeById(localStore.tasks, remoteStore.tasks),
      categories: mergeById(localStore.categories, remoteStore.categories)
    };
  }

  function encodePairCode(cfg) {
    const payload = JSON.stringify({
      m: cfg.mode,
      t: cfg.giteeToken || '',
      g: cfg.gistId || '',
      u: cfg.serverUrl || '',
      k: cfg.serverToken || ''
    });
    return 'TT1-' + btoa(unescape(encodeURIComponent(payload)));
  }

  function decodePairCode(code) {
    const clean = (code || '').trim();
    if (!clean.startsWith('TT1-')) throw new Error('配对码格式不正确（需以 TT1- 开头）');
    const obj = JSON.parse(decodeURIComponent(escape(atob(clean.slice(4)))));
    return {
      mode: obj.m || 'gitee',
      giteeToken: obj.t || '',
      gistId: obj.g || '',
      serverUrl: obj.u || '',
      serverToken: obj.k || ''
    };
  }

  async function createGiteeVault(token, initialStore) {
    const cleanToken = (token || '').trim();
    if (!cleanToken) throw new Error('请先填写 Gitee 私人令牌');
    const res = await fetch(GITEE_GISTS_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json;charset=UTF-8' },
      body: JSON.stringify({
        access_token: cleanToken,
        description: 'TimeTrace Todo 多端加密同步库 (请勿手动删除)',
        public: false,
        files: { [GIST_FILENAME]: { content: JSON.stringify(initialStore, null, 2) } }
      })
    });
    if (!res.ok) throw new Error('创建云端同步库失败 (' + res.status + ')，请检查令牌是否勾选 gists 权限');
    const data = await res.json();
    return data.id;
  }

  async function syncGitee(cfg, localStore) {
    const token = (cfg.giteeToken || '').trim();
    const gistId = (cfg.gistId || '').trim();
    if (!token || !gistId) throw new Error('请先完善令牌与同步库 ID，或粘贴配对码');

    const getUrl = GITEE_GISTS_API + '/' + encodeURIComponent(gistId) + '?access_token=' + encodeURIComponent(token) + '&_t=' + Date.now();
    const getRes = await fetch(getUrl);
    if (!getRes.ok) throw new Error('读取云端失败 (' + getRes.status + ')');
    const gistObj = await getRes.json();
    let remoteStore = { tasks: [], categories: [] };
    if (gistObj.files && gistObj.files[GIST_FILENAME] && gistObj.files[GIST_FILENAME].content) {
      try { remoteStore = JSON.parse(gistObj.files[GIST_FILENAME].content); } catch (e) {}
    }

    const merged = mergeStores(localStore, remoteStore);
    const patchRes = await fetch(GITEE_GISTS_API + '/' + encodeURIComponent(gistId), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json;charset=UTF-8' },
      body: JSON.stringify({
        access_token: token,
        files: { [GIST_FILENAME]: { content: JSON.stringify(merged) } }
      })
    });
    if (!patchRes.ok) throw new Error('回写云端失败 (' + patchRes.status + ')');
    return merged;
  }

  async function syncCustomServer(cfg, localStore) {
    let base = (cfg.serverUrl || '').trim().replace(/\/+$/, '');
    if (!base) throw new Error('请填写私有服务器地址');
    const endpoint = base.endsWith('/api/sync') ? base : base + '/api/sync';
    const headers = { 'Content-Type': 'application/json' };
    if (cfg.serverToken) headers['X-Sync-Token'] = cfg.serverToken.trim();

    const res = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(localStore) });
    if (!res.ok) throw new Error('私有云同步失败 (' + res.status + ')');
    const json = await res.json();
    if (!json.ok || !json.data) throw new Error(json.error || '返回格式异常');
    return mergeStores(localStore, json.data);
  }

  function exportFile(filename, content, mimeType) {
    if (window.AndroidBridge && typeof window.AndroidBridge.saveBackupFile === 'function') {
      const ok = window.AndroidBridge.saveBackupFile(filename, content);
      if (ok) return 'android_downloads';
    }
    const blob = new Blob([content], { type: mimeType || 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 400);
    return 'browser_download';
  }

  return { mergeStores, encodePairCode, decodePairCode, createGiteeVault, syncGitee, syncCustomServer, exportFile };
})();
