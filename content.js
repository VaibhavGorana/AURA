
(() => {
  if (window.__AURA_INJECTED__) return;
  window.__AURA_INJECTED__ = true;

  const K_NOTES = 'aura_notes';
  const K_TASKS = 'aura_tasks';
  const K_RECENTS = 'aura_recents';

  async function getStore(key, fallback) {
    try { const v = await chrome.storage.local.get(key); return v[key] ?? fallback; } catch { return fallback; }
  }
  async function setStore(key, value) {
    try { await chrome.storage.local.set({ [key]: value }); } catch {}
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
          <span class="aura-phase">Phase 3</span>
        </div>
        <div class="aura-actions">
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
        <div class="row"><label>API Key</label><input id="aura-apikey" placeholder="sk-..." /></div>
        <div class="row"><label></label><label class="inline"><input type="checkbox" id="aura-mock" checked/> Use mock responses</label></div>
        <div class="row"><label></label><button id="aura-save-settings" class="aura-btn primary">Save</button></div>
        <div class="hint">Settings stay on your device. Don’t paste secrets on shared machines.</div>
      </div>

      <section class="tabpane" id="pane-assist" data-tab="assist">
        <div class="aura-intentbar" id="aura-intentbar" aria-live="polite">
          <div class="line" id="aura-intentline"></div>
          <div class="badges" id="aura-badges"></div>
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
            <button id="note-export" class="aura-btn">Export JSON</button>
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
  `;

  // Elements
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
  const saveSettingsBtn = root.querySelector('#aura-save-settings');

  // Assist elements
  const intentline = root.querySelector('#aura-intentline');
  const badges = root.querySelector('#aura-badges');
  const chipsEl = root.querySelector('#aura-chips');
  const thread = root.querySelector('#aura-thread');
  const input = root.querySelector('#aura-input');
  const sendBtn = root.querySelector('#aura-send');

  // Notes
  const noteInput = root.querySelector('#note-input');
  const noteAddBtn = root.querySelector('#note-add');
  const noteAddSelBtn = root.querySelector('#note-add-selection');
  const noteExportBtn = root.querySelector('#note-export');
  const noteClearBtn = root.querySelector('#note-clear');
  const notesList = root.querySelector('#notes-list');

  // Tasks
  const taskInput = root.querySelector('#task-input');
  const taskAddBtn = root.querySelector('#task-add');
  const taskClearBtn = root.querySelector('#task-clear');
  const tasksList = root.querySelector('#tasks-list');

  // Recent
  const recentList = root.querySelector('#recent-list');
  const recentRefreshBtn = root.querySelector('#recent-refresh');

  // Toggle
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

  // Settings
  settingsBtn.addEventListener('click', async () => {
    if (settingsEl.hasAttribute('hidden')) {
      const resp = await chrome.runtime.sendMessage({ type:'aura:getSettings' });
      if (resp) { providerEl.value = resp.provider || 'groq'; modelEl.value = resp.model || 'llama3-8b-8192'; apiKeyEl.value = resp.apiKey || ''; mockEl.checked = !!resp.mock; }
      settingsEl.removeAttribute('hidden');
    } else settingsEl.setAttribute('hidden','');
  });
  saveSettingsBtn.addEventListener('click', async () => {
    const payload = { provider: providerEl.value, model: modelEl.value || 'llama3-8b-8192', apiKey: apiKeyEl.value.trim(), mock: mockEl.checked };
    const res = await chrome.runtime.sendMessage({ type:'aura:setSettings', payload });
    toast(res?.ok ? 'Settings saved' : 'Failed to save settings');
    if (res?.ok) settingsEl.setAttribute('hidden','');
  });

  // Context detection helpers
  function getHost(){ try { return new URL(location.href).hostname.replace(/^www\./,''); } catch { return location.hostname; } }
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

  function detectContext(){
    const url = location.href;
    const title = (document.title || '').replace(/\s*[-|–].*$/, '').trim();
    const host = getHost();
    const u = new URL(url);
    const path = u.pathname || '';

    const isSearch = /(google\.[^/]+\/search|bing\.com\/search|duckduckgo\.com|search\?)/i.test(url);
    const isYouTube = /(^|\.)(youtube\.com)$/.test(host) && /\/watch/.test(path);
    const isWiki = /wikipedia\.org$/i.test(host);
    const isGitHub = /github\.com$/i.test(host);
    const isProduct = /(amazon\.[^/]+\/(dp|gp\/product)|flipkart\.com|ebay\.[^/]+\/itm|product)/i.test(url);
    const isPDF = /\.pdf(\?|$)/i.test(path);

    const readTime = estReadingTime(extractMainText());
    const sel = String(window.getSelection() || '').trim();
    const hasSel = sel && sel.length > 8;

    if (isSearch) {
      const q = u.searchParams.get('q') || u.searchParams.get('query') || '';
      const query = (q || title).trim().replace(/\s+/g, ' ').slice(0, 120);
      return {
        intent: query ? `It looks like you're looking for “${query}”. Want a quick answer or better phrasing?`
                      : `It looks like you're exploring search results. Want a quick answer or better phrasing?`,
        badges:[`🔎 ${host}`],
        chips:[
          { label:'Refine query', template: query ? `Improve this search query: ${query}` : 'Help me refine my search query' },
          { label:'Quick answer', template: query ? `Give me a concise answer about: ${query}` : 'Give me a concise answer to my question' },
          { label:'Related terms', template: query ? `Suggest related search terms for: ${query}` : 'Suggest related search terms' },
          { label:'Result summary', template: query ? `From typical top results, summarize what I should know about: ${query}` : 'Summarize common answers briefly' }
        ]
      };
    }
    if (isYouTube) {
      return {
        intent:`It looks like you’re watching a video — “${title || host}”. Want a summary or key moments?`,
        badges:[`▶️ ${host}`],
        chips:[
          { label:'Video TL;DR', template:`Summarize the main points of this video based on its title and context.` },
          { label:'Key moments', template:`List likely key moments or chapters for this video topic.` },
          { label:'Follow-up questions', template:`Suggest thoughtful follow-up questions to deepen understanding of this video.` }
        ]
      };
    }
    if (isGitHub) {
      const parts = path.split('/').filter(Boolean);
      const repo = parts.length >= 2 ? `${parts[0]}/${parts[1]}` : title || host;
      return {
        intent:`It looks like you’re viewing a code repository — “${repo}”. Want a README or feature overview?`,
        badges:[`👩‍💻 ${host}`],
        chips:[
          { label:'Explain repo', template:`Give a high-level overview of the ${repo} repository based on its README and common patterns.` },
          { label:'How to run', template:`What are typical steps to run ${repo}? Provide a concise checklist.` },
          { label:'Key files', template:`List likely key files or directories and what they do for ${repo}.` }
        ]
      };
    }
    if (isWiki) {
      return {
        intent:`It looks like you’re reading a reference page — “${title || host}”. Want a concise summary or key facts?`,
        badges:[`📘 ${host}`, readTime && `⏱️ ${readTime}`].filter(Boolean),
        chips:[
          { label:'Summary', template:`Summarize the key points of this topic in 5 bullets.` },
          { label:'Key facts', template:`List the most important facts and dates about this topic.` },
          { label:'Related topics', template:`Suggest closely related topics I should explore next.` }
        ]
      };
    }
    if (isProduct) {
      const topic = title || host;
      return {
        intent:`It looks like you’re comparing products — “${topic}”. Want a quick features/price breakdown?`,
        badges:[`🛒 ${host}`],
        chips:[
          { label:'Compare features', template:`Create a simple feature comparison for ${topic}.` },
          { label:'Pros & cons', template:`Provide concise pros and cons for ${topic}.` },
          { label:'What to check', template:`List key things to check before buying ${topic}.` }
        ]
      };
    }
    if (isPDF) {
      return {
        intent:`It looks like you’re viewing a PDF. Want an overview or bullet summary?`,
        badges:[`📄 ${host}`],
        chips:[
          { label:'Outline', template:`Provide a brief outline of the key sections in this PDF.` },
          { label:'Key takeaways', template:`List the top 5 takeaways from this PDF.` },
          { label:'Explain terms', template:`Explain jargon or complex terms mentioned in this PDF.` }
        ]
      };
    }
    const topic = title || host;
    const selectionAware = hasSel ? `You selected some text — want it explained or simplified?` : `Want a TL;DR or key takeaways?`;
    return {
      intent:`It looks like you’re reading about “${topic}”. ${selectionAware}`,
      badges:[`📰 ${host}`, (readTime && `⏱️ ${readTime}`)].filter(Boolean),
      chips: hasSel ? [
        { label:'Explain selection', template:`Explain this selection in simple terms:\n\n${sel.slice(0,700)}` },
        { label:'Translate selection', template:`Translate this into English:\n\n${sel.slice(0,700)}` },
        { label:'Summarize selection', template:`Summarize this selection in 3-5 bullets:\n\n${sel.slice(0,700)}` }
      ] : [
        { label:'TL;DR', template:`Give a concise TL;DR of this page.` },
        { label:'Key takeaways', template:`List 5 key takeaways from this page.` },
        { label:'Explain jargon', template:`Explain any jargon or complex terms on this page.` }
      ]
    };
  }

  function renderIntentAndChips(){
    const ctx = detectContext();
    intentline.textContent = ctx.intent;
    badges.innerHTML = '';
    (ctx.badges || []).forEach(b => {
      const s = document.createElement('span'); s.className = 'badge'; s.textContent = b; badges.appendChild(s);
    });
    chipsEl.innerHTML = '';
    (ctx.chips || []).forEach(ch => {
      const b = document.createElement('button'); b.className = 'chip'; b.textContent = ch.label;
      b.addEventListener('click', () => { input.value = ch.template; input.focus(); });
      chipsEl.appendChild(b);
    });
  }

  let selTimer = null;
  document.addEventListener('selectionchange', () => {
    clearTimeout(selTimer); selTimer = setTimeout(renderIntentAndChips, 250);
  });

  function esc(s=''){ return s.replace(/[&<>]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }
  function mdMini(s=''){ return esc(s).replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>').replace(/\n/g,'<br/>'); }
  function appendMsg(role, text){ const el=document.createElement('div'); el.className=`msg ${role}`; el.innerHTML=mdMini(text); thread.appendChild(el); thread.scrollTop=thread.scrollHeight; }

  async function handleSend(){
    const prompt = input.value.trim(); if (!prompt) return;
    input.value = '';
    appendMsg('user', prompt);
    appendMsg('assistant pending', '…');
    const sel = String(window.getSelection()||'').trim();
    const context = { url: location.href, title: document.title, selection: sel.slice(0, 1200) };
    const res = await chrome.runtime.sendMessage({ type:'aura:chat', payload: { prompt, context } });
    const pending = thread.querySelector('.msg.assistant.pending'); if (pending) pending.remove();
    if (!res?.ok) { appendMsg('assistant error', `Error: ${res?.error || 'unknown'}`); return; }
    appendMsg('assistant', res.result?.text || '(no response)');
  }
  sendBtn.addEventListener('click', handleSend);
  input.addEventListener('keydown', (e)=>{ if ((e.ctrlKey||e.metaKey) && e.key==='Enter') handleSend(); });

  // Notes
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
    notes.unshift({ text, source:{ url: location.href, title: document.title }, ts: Date.now() });
    await setStore(K_NOTES, notes); noteInput.value=''; renderNotes();
  });
  noteAddSelBtn.addEventListener('click', async ()=>{
    const sel = String(window.getSelection()||'').trim(); if (!sel) { toast('No selection'); return; }
    const notes = await getStore(K_NOTES, []);
    notes.unshift({ text: sel, source:{ url: location.href, title: document.title }, ts: Date.now() });
    await setStore(K_NOTES, notes); renderNotes();
  });
  noteExportBtn.addEventListener('click', async ()=>{
    const notes = await getStore(K_NOTES, []);
    const blob = new Blob([JSON.stringify(notes, null, 2)], { type:'application/json' });
    const url = URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='aura_notes.json'; a.click();
    setTimeout(()=>URL.revokeObjectURL(url), 500);
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
    tasks.unshift({ title, done:false, ts: Date.now() });
    await setStore(K_TASKS, tasks); taskInput.value=''; renderTasks();
  });
  taskClearBtn.addEventListener('click', async ()=>{
    const tasks = await getStore(K_TASKS, []);
    const next = tasks.filter(t=>!t.done); await setStore(K_TASKS, next); renderTasks();
  });

  // Recent
  async function pushRecent(){
    const rec = await getStore(K_RECENTS, []);
    const item = { url: location.href, title: document.title, ts: Date.now() };
    const dedup = rec.filter(r=>r.url!==item.url);
    dedup.unshift(item);
    await setStore(K_RECENTS, dedup.slice(0,10));
  }
  function recentRow(r){
    const li=document.createElement('li'); const t=new Date(r.ts||Date.now()).toLocaleString();
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

  // Init
  (async () => {
    await pushRecent();
    renderIntentAndChips();
    renderNotes();
    renderTasks();
    renderRecents();
  })();

  function toast(text){
    const t=document.createElement('div'); t.className='aura-toast'; t.textContent=text; document.body.appendChild(t);
    setTimeout(()=>t.classList.add('show'),10); setTimeout(()=>{t.classList.remove('show'); t.remove();},1800);
  }
})();
