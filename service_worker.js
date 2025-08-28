
const SETTINGS_KEY = 'aura_settings';

chrome.runtime.onInstalled.addListener(() => {
  console.log('Aura Phase 3 installed');
});

async function ensureInjectedAndToggle(tabId) {
  try { await chrome.scripting.insertCSS({ target: { tabId }, files: ["panel.css"] }); } catch {}
  try { await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] }); } catch {}
  try { await chrome.tabs.sendMessage(tabId, { type: "aura:toggle" }); } catch (e) {
    console.warn("Toggle message failed:", e);
  }
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.id) return;
  await ensureInjectedAndToggle(tab.id);
});

chrome.commands.onCommand.addListener(async (cmd) => {
  if (cmd !== "toggle-aura") return;
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!active?.id) return;
  await ensureInjectedAndToggle(active.id);
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg?.type === 'aura:getSettings') {
        const data = await chrome.storage.local.get(SETTINGS_KEY);
        sendResponse(data[SETTINGS_KEY] || { provider:'groq', apiKey:'', model:'llama3-8b-8192', mock:true });
      } else if (msg?.type === 'aura:setSettings') {
        const current = (await chrome.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY] || {};
        const next = { ...current, ...(msg.payload || {}) };
        await chrome.storage.local.set({ [SETTINGS_KEY]: next });
        sendResponse({ ok:true, settings: next });
      } else if (msg?.type === 'aura:chat') {
        const { prompt, context, mode='quick' } = msg.payload || {};
        const result = await handleChat({ prompt, context, mode });
        sendResponse({ ok:true, result });
      }
    } catch (e) {
      console.error('Aura SW error:', e);
      sendResponse({ ok:false, error:String(e) });
    }
  })();
  return true;
});

async function handleChat({ prompt, context = {}, mode }) {
  const defaults = { provider:'groq', apiKey:'', model:'llama3-8b-8192', mock:true };
  const { [SETTINGS_KEY]: settings = defaults } = await chrome.storage.local.get(SETTINGS_KEY);
  const cfg = { ...defaults, ...settings };

  if (cfg.mock || !cfg.apiKey) {
    const header = mode === 'deep' ? 'Structured Answer' : 'Quick Answer';
    return { provider:'mock', text:`**${header}**\n${prompt}\n\n_(Connect an API key in Settings for live answers.)_` };
  }
  if (cfg.provider === 'groq') return await callGroq({ ...cfg, prompt, context, mode });
  return { provider:'mock', text:`Quick Answer (mock): ${prompt}` };
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
