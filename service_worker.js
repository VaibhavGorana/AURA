
const SETTINGS_KEY = 'aura_settings';

// ---------- Helpers (top-level) ----------
function tryParseJson(txt){
  try { return JSON.parse(txt); } catch {}
  const m = txt && txt.match && txt.match(/```(?:json)?\n([\s\S]*?)\n```/i);
  if (m) { try { return JSON.parse(m[1]); } catch {} }
  return null;
}

async function getCfg(){
  const defaults = { provider:'groq', apiKey:'', model:'llama3-8b-8192', mock:true, toolbar:true, mode:'quick' };
  const { [SETTINGS_KEY]: settings = defaults } = await chrome.storage.local.get(SETTINGS_KEY);
  return { ...defaults, ...settings };
}

async function smartChips(context){
  const cfg = await getCfg();
  if (cfg.mock || !cfg.apiKey) return [];
  const prompt = `Given this page context, propose 3-5 short action chips as JSON array of {\"label\": string, \"template\": string}. No prose.\n\nContext:\n${JSON.stringify(context).slice(0,1500)}`;
  try {
    const res = await callGroq({ ...cfg, prompt, context: {}, mode: 'quick' });
    const arr = tryParseJson(res.text) || [];
    return Array.isArray(arr) ? arr.filter(o=>o && o.label && o.template).slice(0,5) : [];
  } catch (e) { return []; }
}

// ---------- Lifecycle ----------
chrome.runtime.onInstalled.addListener(() => {
  console.log('Aura Phase 6.4 installed');
  // Context menu for selection
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

// ---------- Messaging ----------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg?.type === 'aura:getSettings') {
        const data = await chrome.storage.local.get(SETTINGS_KEY);
        sendResponse(data[SETTINGS_KEY] || { provider:'groq', apiKey:'', model:'llama3-8b-8192', mock:true, toolbar:true, mode:'quick' });
      } else if (msg?.type === 'aura:setSettings') {
        const current = (await chrome.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY] || {};
        const next = { ...current, ...(msg.payload || {}) };
        await chrome.storage.local.set({ [SETTINGS_KEY]: next });
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

// ---------- LLM calls ----------
async function handleChat({ prompt, context = {}, mode }) {
  const cfg = await getCfg();
  if (cfg.mock || !cfg.apiKey) {
    const header = mode === 'deep' ? 'Structured Answer' : 'Quick Answer';
    return { provider:'mock', text:`**${header}**\n${prompt}\n\n_(Connect an API key in Settings for live answers.)_` };
  }
  if (cfg.provider === 'groq') return await callGroq({ ...cfg, prompt, context, mode });
  // Future: openai etc.
  return { provider:'mock', text:`Quick Answer (mock): ${prompt}` };
}

async function testProvider() {
  const cfg = await getCfg();
  if (!cfg.apiKey || cfg.mock) return false;
  try { const res = await callGroq({ ...cfg, prompt: 'ping', context: {}, mode: 'quick' }); return !!res?.text; } catch { return false; }
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
