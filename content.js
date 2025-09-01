
(() => {
  if (window.__AURA_INJECTED__) return;
  window.__AURA_INJECTED__ = true;

  const K_NOTES = 'aura_notes';
  const K_TASKS = 'aura_tasks';
  const K_RECENTS = 'aura_recents';
  const THREAD_PREFIX = 'aura_thread_';

  async function getStore(key, fallback) { try { const v = await chrome.storage.local.get(key); return v[key] ?? fallback; } catch { return fallback; } }
  async function setStore(key, value) { try { await chrome.storage.local.set({ [key]: value }); } catch {} }
  function hostName(){ try { return new URL(location.href).hostname.replace(/^www\./,''); } catch { return location.hostname; } }
  function threadKey(){ return THREAD_PREFIX + hostName(); }
  function now(){ return Date.now(); }

  function escapeHtml(s=''){ return s.replace(/[&<>]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }
  function mdRender(s=''){
    s = s.replace(/```([\s\S]*?)```/g, (_, code) => `<pre class="code"><code>${escapeHtml(code.trim())}</code></pre>`);
    s = s.replace(/`([^`]+)`/g, (_, code) => `<code class="inline">${escapeHtml(code)}</code>`);
    s = s.replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>').replace(/\*(.*?)\*/g,'<em>$1</em>');
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    s = s.replace(/(^|\n)\s*-\s+(.*?)(?=\n(?!\s*-\s)|$)/g, (_, a, item)=> `${a}<ul><li>${item}</li></ul>`);
    s = s.replace(/\n/g,'<br/>');
    return s;
  }

  const root = document.createElement('div');
  root.id = 'aura-root';
  document.documentElement.appendChild(root);

  root.innerHTML = `
    <div id="aura-bubble" title="Open Aura"><span>🜁</span></div>
    <div id="aura-panel" data-open="false" role="dialog" aria-label="Aura panel">
      <div class="aura-header">
        <div class="aura-title">
          <span class="aura-dot"></span>
          <span class="title-text">Aura</span>
          <span class="aura-phase">Phase 5</span>
        </div>
        <div class="aura-mode" role="group" aria-label="Assistant mode"><button id="aura-mode-quick" class="seg active" data-mode="quick" title="Concise answers">Quick</button><button id="aura-mode-deep" class="seg" data-mode="deep" title="Structured answers">Deep</button></div><div class="aura-actions">
          <button id="aura-btn-settings" class="aura-icon-btn" aria-label="Settings">⚙</button>
          <button id="aura-btn-close" class="aura-icon-btn" aria-label="Close">✕</button>
        </div>
      </div>

      <div class="aura-tabs" role="tablist" aria-label="Aura sections">
        <button class="tab active" data-tab="assist" role="tab" aria-selected="true">Assist</button>
        <button class="tab" data-tab="notes" role="tab" aria-selected="false">Notes</button>
        <button class="tab" data-tab="tasks" role="tab" aria-selected="false">Tasks</button>
        <button class="tab" data-tab="recent" role="tab" aria-selected="false">Recent</button>
      </div>

      <div id="aura-settings" class="aura-settings" hidden>
        <div class="row"><label>Provider</label>
          <select id="aura-provider"><option value="groq">Groq (OpenAI-compatible)</option></select>
        </div>
        <div class="row"><label>Model</label><input id="aura-model" placeholder="llama3-8b-8192"/></div>
        <div class="row"><label>API Key</label><input id="aura-apikey" type="password" placeholder="sk-..." /></div>
        <div class="row"><label></label><label class="inline"><input type="checkbox" id="aura-mock" checked/> Use mock responses</label></div>
        <div class="row"><label></label><label class="inline"><input type="checkbox" id="aura-toolbar" checked/> Enable selection toolbar</label></div>
        <div class="row"><label></label>
          <button id="aura-test" class="aura-btn">Test connection</button>
          <button id="aura-save-settings" class="aura-btn primary">Save</button>
        </div>
        <div class="hint">Settings stay on your device. Don’t paste secrets on shared machines.</div>
      </div>

      <section class="tabpane" id="pane-assist" data-tab="assist">
        <div class="aura-intentbar" id="aura-intentbar" aria-live="polite">
          <div class="line" id="aura-intentline"></div>
          <div class="badges" id="aura-badges"></div>
          <div class="intent-actions">
            <button id="aura-newchat" class="linklike">New chat</button>
            <button id="aura-clear" class="linklike">Clear thread</button>
            <button id="aura-resetctx" class="linklike">Reset context</button>
          </div>
        </div>
        <div class="aura-chips" id="aura-chips"></div>
        <div id="aura-thread" class="aura-thread"></div>
        <div class="aura-footer">
          <textarea id="aura-input" rows="2" placeholder="Type a message…"></textarea>
          <div class="hint">Ctrl/⌘ + Enter</div>
          <button id="aura-send" class="aura-btn primary" aria-label="Send">Send</button>
        </div>
      </section>

      <section class="tabpane" id="pane-notes" data-tab="notes" hidden>
        <div class="pane-section">
          <div class="row"><button id="note-add-selection" class="aura-btn">Add selection → Note</button></div>
          <div class="row"><textarea id="note-input" rows="3" placeholder="Write a note… (source link auto-attached)"></textarea></div>
          <div class="row">
            <button id="note-add" class="aura-btn primary">Add Note</button>
            <button id="note-export" class="aura-btn">Export JSON</button><button id="note-export-md" class="aura-btn">Export Markdown</button>
            <button id="note-clear" class="aura-btn">Clear All</button>
          </div>
        </div>
        <ul id="notes-list" class="list"></ul>
      </section>

      <section class="tabpane" id="pane-tasks" data-tab="tasks" hidden>
        <div class="pane-section">
          <div class="row">
            <input id="task-input" placeholder="Task title (use #today, #research etc.)" />
            <button id="task-add" class="aura-btn primary">Add Task</button>
            <button id="task-clear" class="aura-btn">Clear Completed</button>
          </div>
        </div>
        <ul id="tasks-list" class="list"></ul>
      </section>

      <section class="tabpane" id="pane-recent" data-tab="recent" hidden>
        <div class="pane-section"><div class="row"><button id="recent-refresh" class="aura-btn">Refresh</button></div></div>
        <ul id="recent-list" class="list"></ul>
      </section>
    </div>

    <!-- Selection Toolbar -->
    <div id="aura-seltb" class="aura-seltb hidden" role="toolbar" aria-label="Selection actions">
      <button class="tb-btn" data-act="explain" title="Explain">Explain</button>
      <button class="tb-btn" data-act="summarize" title="Summarize">Summarize</button>
      <button class="tb-btn" data-act="translate" title="Translate">Translate</button>
      <button class="tb-btn" data-act="save" title="Save to Notes">Save</button>
    </div>
  `;

  // Core elements
  const bubble = root.querySelector('#aura-bubble');
  const panel = root.querySelector('#aura-panel');
  const closeBtn = root.querySelector('#aura-btn-close');
  const tabs = Array.from(root.querySelectorAll('.aura-tabs .tab'));
  const panes = Array.from(root.querySelectorAll('.tabpane'));

  const settingsBtn = root.querySelector('#aura-btn-settings');
  const settingsEl = root.querySelector('#aura-settings');
  const providerEl = root.querySelector('#aura-provider');
  const modelEl = root.querySelector('#aura-model');
  const apiKeyEl = root.querySelector('#aura-apikey');
  const mockEl = root.querySelector('#aura-mock');
  const toolbarEl = root.querySelector('#aura-toolbar');
  const testBtn = root.querySelector('#aura-test');
  const saveSettingsBtn = root.querySelector('#aura-save-settings');
  // Mode toggle
  const modeQuickBtn = root.querySelector('#aura-mode-quick');
  const modeDeepBtn = root.querySelector('#aura-mode-deep');
  let currentMode = 'quick';
  function updateModeUI(){
    modeQuickBtn.classList.toggle('active', currentMode === 'quick');
    modeDeepBtn.classList.toggle('active', currentMode === 'deep');
  }


  const intentline = root.querySelector('#aura-intentline');
  const badges = root.querySelector('#aura-badges');
  const chipsEl = root.querySelector('#aura-chips');
  const newChatBtn = root.querySelector('#aura-newchat');
  const clearBtn = root.querySelector('#aura-clear');
  const resetCtxBtn = root.querySelector('#aura-resetctx');

  const thread = root.querySelector('#aura-thread');
  const input = root.querySelector('#aura-input');
  const sendBtn = root.querySelector('#aura-send');

  const noteInput = root.querySelector('#note-input');
  const noteAddBtn = root.querySelector('#note-add');
  const noteAddSelBtn = root.querySelector('#note-add-selection');
  const noteExportBtn = root.querySelector('#note-export');
  const noteExportMdBtn = root.querySelector('#note-export-md');
  const noteClearBtn = root.querySelector('#note-clear');
  const notesList = root.querySelector('#notes-list');

  const taskInput = root.querySelector('#task-input');
  const taskAddBtn = root.querySelector('#task-add');
  const taskClearBtn = root.querySelector('#task-clear');
  const tasksList = root.querySelector('#tasks-list');

  const recentList = root.querySelector('#recent-list');
  const recentRefreshBtn = root.querySelector('#recent-refresh');

  const selTb = root.querySelector('#aura-seltb');

  // Panel toggle
  function togglePanel(force){ panel.dataset.open = String(force ?? (panel.dataset.open !== 'true')); }
  bubble.addEventListener('click', () => togglePanel(true));
  closeBtn.addEventListener('click', () => togglePanel(false));
  try { chrome.runtime.onMessage.addListener((msg)=>{ if (msg?.type==='aura:toggle') togglePanel(); }); } catch {}

  // Tabs
  function showTab(name){
    tabs.forEach(b => {
      const active = b.dataset.tab === name;
      b.classList.toggle('active', active);
      b.setAttribute('aria-selected', String(active));
    });
    panes.forEach(p => p.hidden = (p.dataset.tab !== name));
  }
  tabs.forEach(btn => btn.addEventListener('click', () => showTab(btn.dataset.tab)));
  modeQuickBtn.addEventListener('click', async () => {
    currentMode = 'quick'; updateModeUI();
    await chrome.runtime.sendMessage({ type:'aura:setSettings', payload: { mode: 'quick' } });
  });
  modeDeepBtn.addEventListener('click', async () => {
    currentMode = 'deep'; updateModeUI();
    await chrome.runtime.sendMessage({ type:'aura:setSettings', payload: { mode: 'deep' } });
  });


  // Settings
  settingsBtn.addEventListener('click', async () => {
    if (settingsEl.hasAttribute('hidden')) {
      // Sync settings (incl. mode)

      const resp = await chrome.runtime.sendMessage({ type:'aura:getSettings' });
      if (resp) {
        providerEl.value = resp.provider || 'groq';
        modelEl.value = resp.model || 'llama3-8b-8192';
        apiKeyEl.value = resp.apiKey || '';
        mockEl.checked = !!resp.mock;
        toolbarEl.checked = resp.toolbar !== false;
      }
      settingsEl.removeAttribute('hidden');
    } else settingsEl.setAttribute('hidden','');
  });
  saveSettingsBtn.addEventListener('click', async () => {
    const payload = { provider: providerEl.value, model: modelEl.value || 'llama3-8b-8192', apiKey: apiKeyEl.value.trim(), mock: mockEl.checked, toolbar: toolbarEl.checked };
    const res = await chrome.runtime.sendMessage({ type:'aura:setSettings', payload });
    toast(res?.ok ? 'Settings saved' : 'Failed to save settings');
    if (res?.ok) settingsEl.setAttribute('hidden','');
  });
  testBtn.addEventListener('click', async () => {
    const ok = await chrome.runtime.sendMessage({ type:'aura:testProvider' });
    toast(ok?.ok ? 'Provider OK' : 'Provider check failed (enable key & disable Mock)');
  });

  // Context (same as Phase 4)
  function estReadingTime(text){
    const words = (text || '').trim().split(/\s+/).filter(Boolean).length;
    if (!words) return null;
    const mins = Math.max(1, Math.round(words / 220));
    return `${mins} min read`;
  }
  function extractMainText(){
    try {
      const selectors = ['article','main','section','[role="main"]','.content','.post','.entry','.container'];
      let node = null;
      for (const sel of selectors) { node = document.querySelector(sel); if (node && node.innerText && node.innerText.length > 200) break; }
      const txt = (node ? node.innerText : document.body.innerText) || '';
      return txt.replace(/\s+/g, ' ').trim().slice(0, 4000);
    } catch { return ''; }
  }
  function computeContext(){
    const url = location.href;
    const title = (document.title || '').replace(/\s*[-|–].*$/, '').trim();
    const host = hostName();
    const u = new URL(url);
    const path = u.pathname || '';
    const isSearch = /(google\.[^/]+\/search|bing\.com\/search|duckduckgo\.com|search\?)/i.test(url);
    const isYouTube = /(^|\.)(youtube\.com)$/.test(host) && /\/watch/.test(path);
    const isWiki = /wikipedia\.org$/i.test(host);
    const isGitHub = /github\.com$/i.test(host);
    const isProduct = /(amazon\.[^/]+\/(dp|gp\/product)|flipkart\.com|ebay\.[^/]+\/itm|product)/i.test(url);
    const isPDF = /\.pdf(\?|$)/i.test(path);
    const readTime = estReadingTime(extractMainText());

    if (isSearch) {
      const q = u.searchParams.get('q') || u.searchParams.get('query') || '';
      const query = (q || title).trim().replace(/\s+/g, ' ').slice(0, 120);
      return { intent: query ? `It looks like you're looking for “${query}”. Want a quick answer or better phrasing?` : `It looks like you're exploring search results. Want a quick answer or better phrasing?`,
               badges:[`🔎 ${host}`], chips:[
                 { label:'Refine query', template: query ? `Improve this search query: ${query}` : 'Help me refine my search query' },
                 { label:'Quick answer', template: query ? `Give me a concise answer about: ${query}` : 'Give me a concise answer to my question' },
                 { label:'Related terms', template: query ? `Suggest related search terms for: ${query}` : 'Suggest related search terms' }
               ] };
    }
    if (isYouTube) return { intent:`It looks like you’re watching a video — “${title || host}”. Want a summary or key moments?`, badges:[`▶️ ${host}`], chips:[
      { label:'Video TL;DR', template:`Summarize the main points of this video based on its title and context.` },
      { label:'Key moments', template:`List likely key moments or chapters for this video topic.` }
    ]};
    if (isGitHub) {
      const parts = path.split('/').filter(Boolean);
      const repo = parts.length >= 2 ? `${parts[0]}/${parts[1]}` : title || host;
      return { intent:`It looks like you’re viewing a code repository — “${repo}”. Want a README or feature overview?`, badges:[`👩‍💻 ${host}`], chips:[
        { label:'Explain repo', template:`Give a high-level overview of the ${repo} repository based on its README and common patterns.` },
        { label:'Key files', template:`List likely key files or directories and what they do for ${repo}.` }
      ]};
    }
    if (isWiki) return { intent:`It looks like you’re reading a reference page — “${title || host}”. Want a concise summary or key facts?`, badges:[`📘 ${host}`, readTime && `⏱️ ${readTime}`].filter(Boolean), chips:[
      { label:'Summary', template:`Summarize the key points of this topic in 5 bullets.` },
      { label:'Key facts', template:`List the most important facts and dates about this topic.` }
    ]};
    if (isProduct) return { intent:`It looks like you’re comparing products — “${title || host}”. Want a quick features/price breakdown?`, badges:[`🛒 ${host}`], chips:[
      { label:'Compare features', template:`Create a simple feature comparison for ${title || host}.` },
      { label:'Pros & cons', template:`Provide concise pros and cons for ${title || host}.` }
    ]};
    if (isPDF) return { intent:`It looks like you’re viewing a PDF. Want an overview or bullet summary?`, badges:[`📄 ${host}`], chips:[
      { label:'Outline', template:`Provide a brief outline of the key sections in this PDF.` },
      { label:'Key takeaways', template:`List the top 5 takeaways from this PDF.` }
    ]};
    return { intent:`It looks like you’re reading about “${title || host}”. Want a TL;DR or key takeaways?`, badges:[`📰 ${host}`, (readTime && `⏱️ ${readTime}`)].filter(Boolean), chips:[
      { label:'TL;DR', template:`Give a concise TL;DR of this page.` },
      { label:'Key takeaways', template:`List 5 key takeaways from this page.` }
    ]};
  }

  let contextFrozen = false;
  let cachedContext = computeContext();
  let smartChipsLoaded = false;
  async function fetchAndAppendSmartChips(ctx){
    if (smartChipsLoaded) return; smartChipsLoaded = true;
    try {
      const payload = { context: { url: location.href, title: document.title, host: location.hostname, page: ctx.intent, badges: ctx.badges } };
      const resp = await chrome.runtime.sendMessage({ type:'aura:smartChips', payload });
      const list = resp?.result || [];
      for (const ch of list){
        const exists = Array.from(chipsEl.querySelectorAll('.chip')).some(b => b.textContent.trim().toLowerCase() === String(ch.label||'').trim().toLowerCase());
        if (exists) continue;
        const b = document.createElement('button'); b.className='chip'; b.textContent = ch.label || 'Action';
        b.addEventListener('click', ()=>{ input.value = ch.template || ''; input.focus(); });
        chipsEl.appendChild(b);
      }
    } catch {}
  }
  function renderIntentAndChips(force=false){
    if (!force && contextFrozen) return;
    const ctx = cachedContext = computeContext();
    intentline.textContent = ctx.intent;
    badges.innerHTML = ''; (ctx.badges||[]).forEach(b => { const s=document.createElement('span'); s.className='badge'; s.textContent=b; badges.appendChild(s); });
    chipsEl.innerHTML = ''; (ctx.chips||[]).forEach(ch => { const b=document.createElement('button'); b.className='chip'; b.textContent=ch.label; b.addEventListener('click', ()=>{ input.value = ch.template; input.focus(); }); chipsEl.appendChild(b); });
    smartChipsLoaded = false; fetchAndAppendSmartChips(ctx);
  }
  renderIntentAndChips(true);
  resetCtxBtn.addEventListener('click', ()=>{ contextFrozen=false; renderIntentAndChips(true); smartChipsLoaded=false; });

  // recent tracking
  async function pushRecent(){
    const rec = await getStore(K_RECENTS, []);
    const item = { url: location.href, title: document.title, ts: now() };
    const dedup = rec.filter(r=>r.url!==item.url);
    dedup.unshift(item);
    await setStore(K_RECENTS, dedup.slice(0,10));
  }

  // thread persistence
  async function loadThread(){
    const arr = await getStore(threadKey(), []);
    thread.innerHTML='';
    arr.forEach(m => appendMsg(m.role, m.text, m.ts, true));
    if (arr.length) contextFrozen = true;
  }
  async function saveThread(role, text, ts){
    const key = threadKey();
    const arr = await getStore(key, []);
    arr.push({ role, text, ts });
    await setStore(key, arr.slice(-20));
  }
  async function clearThread(){
    await setStore(threadKey(), []);
    thread.innerHTML='';
    contextFrozen = false;
    renderIntentAndChips(true);
  }

  // rendering
  function makeActions(text){
    const wrap = document.createElement('div');
    wrap.className = 'msg-actions';
    const copy = document.createElement('button');
    copy.className = 'aura-icon-btn sm'; copy.textContent = 'Copy';
    copy.addEventListener('click', async ()=>{ try { await navigator.clipboard.writeText(text); toast('Copied'); } catch { toast('Copy failed'); } });
    wrap.appendChild(copy);
    return wrap;
  }
  function appendMsg(role, text, ts = now(), skipPersist=false){
    const el = document.createElement('div'); el.className = `msg ${role}`;
    const body = document.createElement('div'); body.className = 'msg-body';
    body.innerHTML = role === 'assistant' ? mdRender(text) : escapeHtml(text).replace(/\n/g,'<br/>');
    const meta = document.createElement('div'); meta.className = 'msg-meta'; meta.textContent = new Date(ts).toLocaleString(); el.title = meta.textContent;
    el.appendChild(body); if (role === 'assistant') el.appendChild(makeActions(text)); el.appendChild(meta);
    thread.appendChild(el); thread.scrollTop = thread.scrollHeight;
    if (!skipPersist) saveThread(role, text, ts);
  }
  function appendSkeleton(){
    const el = document.createElement('div'); el.className = 'msg assistant loading'; el.innerHTML = `<div class="sk-line"></div><div class="sk-line w60"></div>`;
    thread.appendChild(el); thread.scrollTop = thread.scrollHeight; return el;
  }
  function replaceSkeleton(el, newRole, newText){ el.remove(); appendMsg(newRole, newText); }
  function replaceSkeletonWithError(el, errText, retryPayload){
    el.remove();
    const e = document.createElement('div'); e.className = 'msg assistant error'; e.innerHTML = `<div class="msg-body">${escapeHtml(errText)}</div>`;
    const actions = document.createElement('div'); actions.className='msg-actions';
    const retry = document.createElement('button'); retry.className='aura-icon-btn sm'; retry.textContent='Retry';
    retry.addEventListener('click', ()=>{ handleSend(retryPayload); });
    actions.appendChild(retry);
    e.appendChild(actions);
    const meta = document.createElement('div'); meta.className='msg-meta'; meta.textContent=new Date().toLocaleString(); e.appendChild(meta);
    thread.appendChild(e); thread.scrollTop = thread.scrollHeight;
  }

  // chat
  let sending = false;
  async function handleSend(forcePrompt){
    if (sending) return;
    const prompt = (forcePrompt ?? input.value).trim(); if (!prompt) return;
    sending = true; input.value = ''; input.disabled = true; sendBtn.disabled = true;
    appendMsg('user', prompt);
    const sk = appendSkeleton();
    const sel = String(window.getSelection()||'').trim();
    const context = { url: location.href, title: document.title, selection: sel.slice(0, 1200) };
    try {
      const res = await chrome.runtime.sendMessage({ type:'aura:chat', payload: { prompt, context, mode: currentMode } });
      if (!res?.ok) throw new Error(res?.error || 'Unknown error');
      replaceSkeleton(sk, 'assistant', res.result?.text || '(no response)');
      contextFrozen = true;
    } catch (e) {
      replaceSkeletonWithError(sk, String(e), prompt);
    } finally {
      sending = false; input.disabled = false; sendBtn.disabled = false; input.focus();
    }
  }
  sendBtn.addEventListener('click', ()=> handleSend());
  input.addEventListener('keydown', (e)=>{ if ((e.ctrlKey||e.metaKey) && e.key==='Enter') handleSend(); });

  newChatBtn.addEventListener('click', clearThread);
  clearBtn.addEventListener('click', clearThread);

  // Notes
  function esc(s=''){ return s.replace(/[&<>]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }
  function noteRow(n, idx){
    const li=document.createElement('li'); li.className='row-note';
    li.innerHTML = `<div class="note-text">${esc(n.text)}</div>
      <div class="note-meta"><a href="${esc(n.source?.url||'#')}" target="_blank">${esc(n.source?.title||'Source')}</a> · ${new Date(n.ts||Date.now()).toLocaleString()}</div>
      <div class="note-actions"><button data-idx="${idx}" class="note-del aura-btn">Delete</button></div>`;
    li.querySelector('.note-del').addEventListener('click', async (e)=>{
      const i = Number(e.currentTarget.dataset.idx);
      const notes = await getStore(K_NOTES, []);
      notes.splice(i,1); await setStore(K_NOTES, notes); renderNotes();
    });
    return li;
  }
  async function renderNotes(){
    const notes = await getStore(K_NOTES, []);
    notesList.innerHTML='';
    if (!notes.length) { const li=document.createElement('li'); li.textContent='No notes yet.'; notesList.appendChild(li); return; }
    notes.forEach((n,i)=> notesList.appendChild(noteRow(n,i)));
  }
  noteAddBtn.addEventListener('click', async ()=>{
    const text = noteInput.value.trim(); if (!text) return;
    const notes = await getStore(K_NOTES, []);
    notes.unshift({ text, source:{ url: location.href, title: document.title }, ts: now() });
    await setStore(K_NOTES, notes); noteInput.value=''; renderNotes();
  });
  noteAddSelBtn.addEventListener('click', async ()=>{
    const sel = String(window.getSelection()||'').trim(); if (!sel) { toast('No selection'); return; }
    const notes = await getStore(K_NOTES, []);
    notes.unshift({ text: sel, source:{ url: location.href, title: document.title }, ts: now() });
    await setStore(K_NOTES, notes); renderNotes();
  });
  noteExportBtn.addEventListener('click', async ()=>{
    const notes = await getStore(K_NOTES, []);
    const blob = new Blob([JSON.stringify(notes, null, 2)], { type:'application/json' });
    const url = URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='aura_notes.json'; a.click();
    setTimeout(()=>URL.revokeObjectURL(url),500);
  });
  noteExportMdBtn.addEventListener('click', async ()=>{
    const notes = await getStore(K_NOTES, []);
    let md = `# Aura Notes\n\n`;
    for (const n of notes){
      const when = new Date(n.ts||Date.now()).toLocaleString();
      const title = (n.source && n.source.title) ? n.source.title : 'Source';
      const link = (n.source && n.source.url) ? n.source.url : '';
      md += `## ${title}\n`;
      if (link) md += `[${link}](${link})\n\n`;
      md += `> ${String(n.text||'').replace(/\n/g,'\n> ')}\n\n— _${when}_\n\n`;
    }
    const blob = new Blob([md], { type:'text/markdown' });
    const url = URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='aura_notes.md'; a.click();
    setTimeout(()=>URL.revokeObjectURL(url),500);
  });
  noteClearBtn.addEventListener('click', async ()=>{ await setStore(K_NOTES, []); renderNotes(); });

  // Tasks
  function taskRow(t, idx){
    const li=document.createElement('li'); li.className='row-task';
    li.innerHTML = `<label class="task-item"><input type="checkbox" data-idx="${idx}" ${t.done?'checked':''}/> <span>${esc(t.title)}</span></label>
      <button class="task-del aura-btn" data-idx="${idx}">Delete</button>`;
    li.querySelector('.task-del').addEventListener('click', async (e)=>{
      const i = Number(e.currentTarget.dataset.idx);
      const tasks = await getStore(K_TASKS, []);
      tasks.splice(i,1); await setStore(K_TASKS, tasks); renderTasks();
    });
    li.querySelector('input[type="checkbox"]').addEventListener('change', async (e)=>{
      const i = Number(e.currentTarget.dataset.idx);
      const tasks = await getStore(K_TASKS, []);
      tasks[i].done = e.currentTarget.checked; await setStore(K_TASKS, tasks);
    });
    return li;
  }
  async function renderTasks(){
    const tasks = await getStore(K_TASKS, []);
    tasksList.innerHTML='';
    if (!tasks.length) { const li=document.createElement('li'); li.textContent='No tasks yet.'; tasksList.appendChild(li); return; }
    tasks.forEach((t,i)=> tasksList.appendChild(taskRow(t,i)));
  }
  taskAddBtn.addEventListener('click', async ()=>{
    const title = taskInput.value.trim(); if (!title) return;
    const tasks = await getStore(K_TASKS, []);
    tasks.unshift({ title, done:false, ts: now() });
    await setStore(K_TASKS, tasks); taskInput.value=''; renderTasks();
  });
  taskClearBtn.addEventListener('click', async ()=>{
    const tasks = await getStore(K_TASKS, []);
    const next = tasks.filter(t=>!t.done); await setStore(K_TASKS, next); renderTasks();
  });

  // Recent
  function recentRow(r){
    const li=document.createElement('li'); const t=new Date(r.ts||now()).toLocaleString();
    li.innerHTML = `<a href="${esc(r.url)}" target="_blank" class="recent-link">${esc(r.title || r.url)}</a> · <span class="muted">${t}</span>`;
    return li;
  }
  async function renderRecents(){
    const rec = await getStore(K_RECENTS, []);
    recentList.innerHTML='';
    if (!rec.length) { const li=document.createElement('li'); li.textContent='No recent pages yet.'; recentList.appendChild(li); return; }
    rec.forEach(r=> recentList.appendChild(recentRow(r)));
  }
  recentRefreshBtn.addEventListener('click', renderRecents);

  // ---------- Phase 5: Selection Toolbar ----------
  function withinAura(node){
    for (let n = node; n; n = n.parentNode) {
      if (n === root) return true;
      if (n.id === 'aura-root' || n.id === 'aura-panel') return true;
    }
    return false;
  }
  function editableAncestor(node){
    for (let n = node; n; n = n.parentElement) {
      const tn = n.tagName ? n.tagName.toLowerCase() : '';
      if (tn === 'input' || tn === 'textarea') return true;
      if (n.isContentEditable) return true;
      if (n.id === 'aura-root' || n.id === 'aura-panel') return true;
    }
    return false;
  }
  function getSelectionText(){
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return '';
    return String(sel).trim();
  }
  function getSelectionRect(){
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const r = sel.getRangeAt(0);
    const rect = r.getBoundingClientRect();
    if (rect && rect.width && rect.height) return rect;
    const node = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement;
    return node ? node.getBoundingClientRect() : null;
  }
  let selTimer = null;
  let toolbarEnabled = true;
  async function refreshToolbarSetting(){
    try {
      const resp = await chrome.runtime.sendMessage({ type:'aura:getSettings' });
      toolbarEnabled = !resp || resp.toolbar !== false;
    } catch { toolbarEnabled = true; }
  }
  refreshToolbarSetting();

  function hideSelTb(){ selTb.classList.add('hidden'); }
  function positionSelTb(){
    if (!toolbarEnabled) { hideSelTb(); return; }
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) { hideSelTb(); return; }
    if (!String(sel).trim() || String(sel).trim().length < 6) { hideSelTb(); return; }
    const anchor = sel.anchorNode;
    if (!anchor || editableAncestor(anchor)) { hideSelTb(); return; }
    if (withinAura(anchor)) { hideSelTb(); return; }

    const rect = getSelectionRect();
    if (!rect) { hideSelTb(); return; }
    const tb = selTb;
    const vw = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
    const vh = Math.max(document.documentElement.clientHeight, window.innerHeight || 0);
    tb.classList.remove('hidden');
    const tbWidth = tb.offsetWidth || 220;
    const tbHeight = tb.offsetHeight || 38;
    let left = rect.left + rect.width/2 - tbWidth/2;
    left = Math.max(8, Math.min(vw - tbWidth - 8, left));
    let top = rect.top - tbHeight - 8;
    if (top < 8) top = rect.bottom + 8;
    tb.style.left = `${Math.round(left)}px`;
    tb.style.top = `${Math.round(top)}px`;
  }

  document.addEventListener('selectionchange', () => {
    clearTimeout(selTimer);
    selTimer = setTimeout(positionSelTb, 120);
  }, { passive: true });
  window.addEventListener('scroll', () => { if (!selTb.classList.contains('hidden')) positionSelTb(); }, { passive: true });
  window.addEventListener('resize', () => { if (!selTb.classList.contains('hidden')) positionSelTb(); }, { passive: true });
  document.addEventListener('mousedown', (e)=> {
    if (e.target.closest('#aura-seltb')) return;
    hideSelTb();
  }, true);

  selTb.addEventListener('click', async (e) => {
    const btn = e.target.closest('.tb-btn'); if (!btn) return;
    const text = getSelectionText(); if (!text) { hideSelTb(); return; }
    const act = btn.dataset.act;
    hideSelTb();
    togglePanel(true); showTab('assist'); input.focus();
    if (act === 'save') {
      const notes = await getStore(K_NOTES, []);
      notes.unshift({ text, source:{ url: location.href, title: document.title }, ts: now() });
      await setStore(K_NOTES, notes);
      toast('Saved to Notes');
      return;
    }
    const templates = {
      explain: `Explain this selection in simple terms:\n\n${text}`,
      summarize: `Summarize this selection in 3–5 bullets:\n\n${text}`,
      translate: `Translate this into English:\n\n${text}`
    };
    handleSend(templates[act] || text);
  });

  // Init
  (async () => {
    try { const resp = await chrome.runtime.sendMessage({ type:'aura:getSettings' }); if (resp && resp.mode) { currentMode = (resp.mode === 'deep' ? 'deep' : 'quick'); updateModeUI(); } } catch {}

    await pushRecent();
    await loadThread();
    renderIntentAndChips(true);
    renderNotes();
    renderTasks();
    renderRecents();
  })();

  function toast(text){
    const t=document.createElement('div'); t.className='aura-toast'; t.textContent=text; document.body.appendChild(t);
    setTimeout(()=>t.classList.add('show'),10); setTimeout(()=>{t.classList.remove('show'); t.remove();},1800);
  }
})();
