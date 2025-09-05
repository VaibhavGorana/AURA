
const SETTINGS_KEY = 'aura_settings';
const SYNC = chrome.storage.sync;
const LOCAL = chrome.storage.local;

function jpath(o, p){ return p.split('.').reduce((x,k)=> (x&&k in x)?x[k]:undefined, o); }

async function getCfg(){
  const defaults = { theme:'auto', accent:'blue', dock:'right', 
    provider:'groq',
    model:'llama3-8b-8192',
    mock:true,
    toolbar:true,
    mode:'quick',
    fallback:false,
    groqKey:'',
    openaiKey:'',
    debug:false,
    aiRefine:true,
    autoSummary:false,
    allowProductMulti:true, theme:'auto', accent:'blue', dock:'right'
  };
  const syncData = (await SYNC.get(SETTINGS_KEY))[SETTINGS_KEY] || {};
  const localData = (await LOCAL.get(SETTINGS_KEY))[SETTINGS_KEY] || {};
  const merged = { ...defaults, ...localData, ...syncData };
  if (!merged.groqKey && !merged.openaiKey && merged.apiKey) {
    if ((merged.provider||'groq') === 'openai') merged.openaiKey = merged.apiKey; else merged.groqKey = merged.apiKey;
  }
  return merged;
}
async function setCfg(next){ try { await SYNC.set({ [SETTINGS_KEY]: next }); } catch {} try { await LOCAL.set({ [SETTINGS_KEY]: next }); } catch {} }

// Install + context menu
chrome.runtime.onInstalled.addListener(() => {
  try {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({ id:'aura', title:'Aura', contexts:['selection'] });
      chrome.contextMenus.create({ id:'aura_explain', parentId:'aura', title:'Explain selection', contexts:['selection'] });
      chrome.contextMenus.create({ id:'aura_summarize', parentId:'aura', title:'Summarize selection', contexts:['selection'] });
      chrome.contextMenus.create({ id:'aura_translate', parentId:'aura', title:'Translate selection', contexts:['selection'] });
      chrome.contextMenus.create({ id:'aura_save', parentId:'aura', title:'Save selection to Notes', contexts:['selection'] });
    });
  } catch (e) { console.warn('ContextMenus init failed', e); }
});
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!info || !tab || !tab.id) return;
  const sel = info.selectionText || '';
  const map = { 'aura_explain':'explain', 'aura_summarize':'summarize', 'aura_translate':'translate', 'aura_save':'save' };
  const act = map[info.menuItemId];
  if (!act) return;
  try { await chrome.tabs.sendMessage(tab.id, { type:'aura:fromContextMenu', act, selection: sel }); } catch (e) { console.warn('CM send failed', e); }
});

async function ensureInjectedAndToggle(tabId) {
  try { await chrome.scripting.insertCSS({ target: { tabId }, files: ["panel.css"] }); } catch {}
  try { await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] }); } catch {}
  try { await chrome.tabs.sendMessage(tabId, { type: "aura:toggle" }); } catch (e) { console.warn("Toggle message failed:", e); }
}
chrome.action.onClicked.addListener(async (tab) => { if (tab?.id) await ensureInjectedAndToggle(tab.id); });
chrome.commands.onCommand.addListener(async (cmd) => {
  if (cmd !== "toggle-aura") return;
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (active?.id) await ensureInjectedAndToggle(active.id);
});

// Messaging
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg?.type === 'aura:getSettings') {
        const data = (await SYNC.get(SETTINGS_KEY))[SETTINGS_KEY] 
          || (await LOCAL.get(SETTINGS_KEY))[SETTINGS_KEY] 
          || { provider:'groq', model:'llama3-8b-8192', mock:true, toolbar:true, mode:'quick', fallback:false, groqKey:'', openaiKey:'', debug:false, aiRefine:true, autoSummary:false, allowProductMulti:true, theme:'auto', accent:'blue', dock:'right' };
        sendResponse(data);
      } else if (msg?.type === 'aura:setSettings') {
        const current = await getCfg();
        const next = { ...current, ...(msg.payload || {}) };
        await setCfg(next);
        sendResponse({ ok:true, settings: next });
      } else if (msg?.type === 'aura:chat') {
        const { prompt, context, mode='quick' } = msg.payload || {};
        const result = await handleChat({ prompt, context, mode });
        sendResponse({ ok:true, result });
      } else if (msg?.type === 'aura:testProvider') {
        const ok = await testProvider();
        sendResponse({ ok });
      } else if (msg?.type === 'aura:smartChips') {
        const { context } = msg.payload || {};
        const result = await smartChips(context||{});
        sendResponse({ ok:true, result });
      } else if (msg?.type === 'aura:refineIntent') {
        const line = await refineIntent(msg.payload||{});
        sendResponse({ ok:true, line });
      } else if (msg?.type === 'aura:autoSummary') {
        const text = await autoSummary(msg.payload||{});
        sendResponse({ ok:true, text });
      } else if (msg?.type === 'aura:compareProducts') {
        const md = await compareProducts(msg.payload?.urls||[]);
        sendResponse({ ok:true, md });
      } else {
        sendResponse({ ok:false, error:'Unknown message type' });
      }
    } catch (e) {
      console.error('Aura SW error:', e);
      sendResponse({ ok:false, error:String(e) });
    }
  })();
  return true;
});

// LLM calls
async function handleChat({ prompt, context = {}, mode }) {
  const cfg = await getCfg();
  const key = cfg.provider === 'openai' ? cfg.openaiKey : cfg.groqKey;
  if (cfg.mock || !key) {
    const header = mode === 'deep' ? 'Structured Answer' : 'Quick Answer';
    return { provider:'mock', text:`**${header}**\n${prompt}\n\n_(Connect an API key in Settings for live answers.)_` };
  }
  try {
    if (cfg.provider === 'openai') return await callOpenAI({ apiKey: cfg.openaiKey, model: cfg.model, prompt, context, mode });
    return await callGroq({ apiKey: cfg.groqKey, model: cfg.model, prompt, context, mode });
  } catch (e) {
    if (cfg.fallback) {
      try {
        if (cfg.provider === 'openai') return await callGroq({ apiKey: cfg.groqKey, model: 'llama3-8b-8192', prompt, context, mode });
        else return await callOpenAI({ apiKey: cfg.openaiKey, model: 'gpt-4o-mini', prompt, context, mode });
      } catch (e2) {}
    }
    throw e;
  }
}
async function testProvider() {
  const cfg = await getCfg();
  if (cfg.mock) return false;
  try {
    if (cfg.provider === 'openai') { 
      if (!cfg.openaiKey) return false; 
      const res = await callOpenAI({ apiKey: cfg.openaiKey, model: cfg.model || 'gpt-4o-mini', prompt: 'ping', context: {}, mode: 'quick' }); 
      return !!res?.text; 
    } else { 
      if (!cfg.groqKey) return false; 
      const res = await callGroq({ apiKey: cfg.groqKey, model: cfg.model || 'llama3-8b-8192', prompt: 'ping', context: {}, mode: 'quick' }); 
      return !!res?.text; 
    }
  } catch { return false; }
}

async function callOpenAI({ apiKey, model, prompt, context = {}, mode }) {
  const endpoint = 'https://api.openai.com/v1/chat/completions';
  const system = mode === 'deep'
    ? 'You are Aura, a structured research copilot. Use compact sections and bullets when helpful.'
    : 'You are Aura, a crisp, in-page assistant. Be concise and relevant to the current page.';
  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: `URL: ${context.url || ''}\nTitle: ${context.title || ''}\nSelection: ${context.selection || ''}\n\nTask: ${prompt}` }
  ];
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${apiKey}` },
    body: JSON.stringify({ model: model || 'gpt-4o-mini', messages, temperature: 0.4 })
  });
  if (!res.ok) throw new Error(`OpenAI error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content?.trim() || '(no content)';
  return { provider:'openai', text };
}
async function callGroq({ apiKey, model, prompt, context = {}, mode }) {
  const endpoint = 'https://api.groq.com/openai/v1/chat/completions';
  const system = mode === 'deep'
    ? 'You are Aura, a structured research copilot. Use compact sections and bullets when helpful.'
    : 'You are Aura, a crisp, in-page assistant. Be concise and relevant to the current page.';
  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: `URL: ${context.url || ''}\nTitle: ${context.title || ''}\nSelection: ${context.selection || ''}\n\nTask: ${prompt}` }
  ];
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${apiKey}` },
    body: JSON.stringify({ model: model || 'llama3-8b-8192', messages, temperature: 0.4 })
  });
  if (!res.ok) throw new Error(`Groq error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content?.trim() || '(no content)';
  return { provider:'groq', text };
}

// Smart chips
function tryParseJson(txt){
  try { return JSON.parse(txt); } catch {}
  const m = txt && txt.match && txt.match(/```(?:json)?\n([\s\S]*?)\n```/i);
  if (m) { try { return JSON.parse(m[1]); } catch {} }
  return null;
}
async function smartChips(context){
  const cfg = await getCfg();
  const key = cfg.provider === 'openai' ? cfg.openaiKey : cfg.groqKey;
  if (cfg.mock || !key) return [];
  const prompt = `Given this page context, propose 3-5 short action chips as JSON array of {"label": string, "template": string}. No prose.\nContext:\n${JSON.stringify(context).slice(0,1500)}`;
  try {
    const fn = cfg.provider === 'openai' ? callOpenAI : callGroq;
    const res = await fn({ apiKey: key, model: cfg.model, prompt, context: {}, mode: 'quick' });
    const arr = tryParseJson(res.text) || [];
    return Array.isArray(arr) ? arr.filter(o=>o && o.label && o.template).slice(0,5) : [];
  } catch (e) { return []; }
}

// Dynamic intent refine
async function refineIntent(ctx){
  const cfg = await getCfg();
  const key = cfg.provider === 'openai' ? cfg.openaiKey : cfg.groqKey;
  if (cfg.mock || !key || cfg.aiRefine === false) return null;
  const prompt = `Rewrite this as a single, helpful intent line (<= 18 words), specific to the page. Avoid emojis.\n\nInput:\n${JSON.stringify({host:ctx.host,title:ctx.title,pageType:ctx.pageType,query:ctx.query}).slice(0,600)}`;
  try {
    const fn = cfg.provider === 'openai' ? callOpenAI : callGroq;
    const res = await fn({ apiKey: key, model: cfg.model, prompt, context: {}, mode: 'quick' });
    const line = (res.text||'').trim().split('\n')[0];
    if (!line) return null;
    if (line.length > 140 || /^#+\s/.test(line)) return null;
    return line;
  } catch { return null; }
}

// Auto-summary
async function autoSummary(payload){
  const cfg = await getCfg();
  const key = cfg.provider === 'openai' ? cfg.openaiKey : cfg.groqKey;
  if (cfg.mock || !key || cfg.autoSummary === false) return null;
  const txt = String(payload?.text||'').slice(0,3500);
  if (!txt) return null;
  const prompt = `Create a compact TL;DR in 5 bullets for the following article text. Avoid fluff. Use plain text bullets.\n\n${txt}`;
  try {
    const fn = cfg.provider === 'openai' ? callOpenAI : callGroq;
    const res = await fn({ apiKey: key, model: cfg.model, prompt, context: {}, mode: 'deep' });
    return (res.text||'').trim();
  } catch { return null; }
}

// Product compare (multi-URL)
async function compareProducts(urls){
  const cfg = await getCfg();
  const key = cfg.provider === 'openai' ? cfg.openaiKey : cfg.groqKey;
  if (cfg.mock || !key) return 'Connect a provider key and disable Mock to compare products.';
  async function fetchTitle(u){
    try {
      const r = await fetch(u, { method:'GET' });
      const html = await r.text();
      const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      const title = m ? m[1].replace(/\s+/g,' ').trim() : u;
      let desc = ''; const dd = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i); if (dd) desc = dd[1];
      return { url:u, title, desc: desc.slice(0,200) };
    } catch { return { url:u, title:u, desc:'' }; }
  }
  const basics = [];
  for (const u of urls.slice(0,3)) basics.push(await fetchTitle(u));
  const prompt = `Given these product pages (title and optional description), build a concise markdown table comparing top features/specs and a short pros/cons list per product. Keep it compact.\n\n${JSON.stringify(basics)}`;
  try {
    const fn = cfg.provider === 'openai' ? callOpenAI : callGroq;
    const res = await fn({ apiKey: key, model: cfg.model, prompt, context: {}, mode: 'deep' });
    return (res.text||'').trim();
  } catch (e) { return 'Comparison failed.'; }
}
