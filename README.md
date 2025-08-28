# Aura – Phase 2 (Tabs: Assist / Notes / Tasks / Recent)

What’s new from Phase 1:
- **Tabs** below the header: Assist, Notes, Tasks, Recent
- **Notes**: add from selection or text, export JSON, clear
- **Tasks**: add, complete, delete, clear completed
- **Recent**: tracks last 10 visited pages (per-site injection), refresh list
- Keeps **natural intent line + chips** in Assist tab

### Load
1) `chrome://extensions` → Developer mode → Load unpacked → select this folder  
2) On any normal website, click the toolbar icon (or press **Alt+A**)

### Storage keys
- `aura_notes`, `aura_tasks`, `aura_recents` (all in `chrome.storage.local`)

> This is a UI/structure phase. Selection toolbar and autosummaries come next.