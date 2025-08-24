if (window.top !== window.self) {
  console.log("Aura: Skipped inside iframe");
} else {
  // ✅ Analyze Intent (Same as before)
  function analyzeIntent() {
    const url = window.location.href;
    const title = document.title || "this page";

    let metaDesc = "";
    const metaTag = document.querySelector('meta[name="description"]');
    if (metaTag) metaDesc = metaTag.content.toLowerCase();

    if (url.includes("google.com/search")) {
      const params = new URLSearchParams(window.location.search);
      const query = params.get("q") || "";
      return { text: `Looks like you are searching for "${query}" on Google.`, type: "search" };
    }

    if (
      title.toLowerCase().includes("buy") ||
      title.toLowerCase().includes("price") ||
      metaDesc.includes("buy") ||
      metaDesc.includes("price")
    ) {
      return { text: `Looks like you are shopping for "${title}".`, type: "shopping" };
    }

    if (
      url.includes("/wiki/") ||
      metaDesc.includes("definition") ||
      metaDesc.includes("history") ||
      title.toLowerCase().includes("what is")
    ) {
      return { text: `Looks like you are reading about "${title}".`, type: "article" };
    }

    return { text: `You are exploring: "${title}".`, type: "generic" };
  }

  // ✅ Generate Cards (Same as before)
  function generateCards(type) {
    let cardsHTML = "";

    if (type === "search") {
      cardsHTML = `
        <div class="card" data-action="summary">🔍 Quick Summary of Top Results</div>
        <div class="card" data-action="related">📌 Related Searches Suggestions</div>
        <div class="card" data-action="best">⭐ Highlight Best Answer</div>
      `;
    } else if (type === "shopping") {
      cardsHTML = `
        <div class="card" data-action="price">💰 Track Price History</div>
        <div class="card" data-action="reviews">📝 Summarize Reviews</div>
        <div class="card" data-action="compare">📦 Compare Similar Products</div>
      `;
    } else if (type === "article") {
      cardsHTML = `
        <div class="card" data-action="articleSummary">📰 Summarize Article</div>
        <div class="card" data-action="facts">📊 Key Facts & Dates</div>
        <div class="card" data-action="references">🔗 Check References</div>
      `;
    } else {
      cardsHTML = `
        <div class="card" data-action="save">📌 Save Page for Later</div>
        <div class="card" data-action="notes">🗒️ Add Personal Notes</div>
        <div class="card" data-action="translate">🌐 Translate Full Page</div>
      `;
    }

    return cardsHTML;
  }

  // ✅ Card Action Handler (Updated for AI Messaging)
  function handleCardAction(action) {
    const responseBox = document.getElementById("aura-chat-response");
    if (!responseBox) return;

    switch (action) {
      case "summary":
        responseBox.textContent = "Aura: Summarizing top search results... (fetching AI)";
        chrome.runtime.sendMessage(
          { type: "AI_REQUEST", prompt: `Summarize this page: ${document.title}` },
          (res) => {
            if (res && res.success) {
              responseBox.textContent = `Aura: ${res.result}`;
            } else {
              responseBox.textContent = "Aura: AI request failed.";
            }
          }
        );
        break;

      case "related":
        responseBox.textContent = "Aura: Here are some related searches... (demo)";
        break;

      case "best":
        responseBox.textContent = "Aura: Highlighting best answer... (demo)";
        break;

      case "price":
        responseBox.textContent = "Aura: Fetching price history chart... (demo)";
        break;

      case "reviews":
        responseBox.textContent = "Aura: Summarizing product reviews... (demo)";
        break;

      case "compare":
        responseBox.textContent = "Aura: Comparing similar products... (demo)";
        break;

case "articleSummary":
  responseBox.textContent = "Aura: Generating article summary... (fetching AI)";
  chrome.runtime.sendMessage(
    {
      type: "AI_REQUEST",
      model: "llama3-8b-8192", // ✅ Default Groq model
      prompt: `Summarize this article: ${document.body.innerText.slice(0, 1000)}`
    },
    (res) => {
      if (res && res.success) {
        responseBox.textContent = `Aura: ${res.result}`;
      } else {
        responseBox.textContent = "Aura: AI request failed.";
      }
    }
  );
  break;


      case "facts":
        responseBox.textContent = "Aura: Extracting key facts and dates... (demo)";
        break;

      case "references":
        responseBox.textContent = "Aura: Checking references... (demo)";
        break;

      case "save":
        responseBox.textContent = "Aura: Page saved for later (demo)";
        break;

      case "notes":
        responseBox.textContent = "Aura: You can add personal notes here (demo)";
        break;

      case "translate":
        responseBox.textContent = "Aura: Translating this page... (demo)";
        break;

      default:
        responseBox.textContent = "Aura: Action not implemented yet.";
    }
  }

  // ✅ Highlight Capture
  let selectedText = "";

  function getSelectedText() {
    const selection = window.getSelection().toString().trim();
    return selection.length > 0 ? selection : "";
  }

  document.addEventListener("mouseup", () => {
    const text = getSelectedText();
    if (text && text !== selectedText) {
      selectedText = text;
      showHighlightCard(text);
    }
  });

  function showHighlightCard(text) {
    let highlightCard = document.getElementById("aura-highlight-card");

    if (!highlightCard) {
      highlightCard = document.createElement("div");
      highlightCard.id = "aura-highlight-card";
      highlightCard.innerHTML = `
        <p class="highlight-text">"${text}"</p>
        <div class="highlight-actions">
          <button class="action-btn" onclick="window.open('https://www.google.com/search?q=${encodeURIComponent(text)}','_blank')">🔍 Search</button>
          <button class="action-btn">🌐 Translate</button>
          <button class="action-btn">📖 Meaning</button>
        </div>
      `;
      document.body.appendChild(highlightCard);
    } else {
      highlightCard.querySelector(".highlight-text").textContent = `"${text}"`;
    }

    setTimeout(() => {
      if (highlightCard) highlightCard.remove();
      selectedText = "";
    }, 5000);
  }

  // ✅ Local Memory - Save Current Page
  function saveCurrentPage() {
    try {
      const pageData = {
        title: document.title,
        url: window.location.href,
        time: new Date().toLocaleString()
      };

      if (!chrome || !chrome.storage || !chrome.storage.local) return; // ✅ Safe check

      chrome.storage.local.get({ recentPages: [] }, (data) => {
        let pages = data.recentPages || [];
        pages.unshift(pageData);
        if (pages.length > 5) pages = pages.slice(0, 5);
        chrome.storage.local.set({ recentPages: pages });
      });
    } catch (e) {
      console.warn("Aura: Cannot save page to memory", e);
    }
  }

  // ✅ Load Recent Pages
  function loadRecentPages(container) {
    if (!chrome || !chrome.storage || !chrome.storage.local) {
      container.innerHTML = `<p class="no-history">Storage not available</p>`;
      return;
    }

    chrome.storage.local.get({ recentPages: [] }, (data) => {
      if (!data || !data.recentPages || data.recentPages.length === 0) {
        container.innerHTML = `<p class="no-history">No recent pages</p>`;
        return;
      }

      container.innerHTML = data.recentPages
        .map(p => `<div class="recent-item"><a href="${p.url}" target="_blank">${p.title}</a><span class="time">${p.time}</span></div>`)
        .join("");
    });
  }

  // ✅ Save on load
  saveCurrentPage();

  // ✅ Panel Toggle
  chrome.runtime.onMessage.addListener((request) => {
    if (request.toggleAura) {
      let panel = document.getElementById("aura-panel");
      const intent = analyzeIntent();

      if (!panel) {
        panel = document.createElement("div");
        panel.id = "aura-panel";
        panel.innerHTML = `
          <div class="aura-header">
            <span class="aura-logo">Aura</span>
            <button id="aura-close">✕</button>
          </div>
          <div class="aura-body">
            <p class="intent-text">${intent.text}</p>
            <div class="cards-container">${generateCards(intent.type)}</div>
            <div class="recent-section">
              <h4>🕘 Recently Visited</h4>
              <div class="recent-list"></div>
            </div>
          </div>
          <div class="aura-chat">
            <input id="aura-chat-input" placeholder="Ask Aura..." />
            <button id="aura-chat-send">Send</button>
          </div>
          <div id="aura-chat-response"></div>
        `;
        document.body.appendChild(panel);

        requestAnimationFrame(() => panel.classList.add("active"));

        document.getElementById("aura-close").addEventListener("click", () => {
          panel.classList.remove("active");
          setTimeout(() => panel.remove(), 400);
        });

        const recentContainer = panel.querySelector(".recent-list");
        loadRecentPages(recentContainer);

        panel.querySelectorAll(".card").forEach(card => {
          card.addEventListener("click", () => handleCardAction(card.dataset.action));
        });

      } else {
        panel.classList.toggle("active");

        const recentContainer = panel.querySelector(".recent-list");
        if (recentContainer) loadRecentPages(recentContainer);
      }
    }
  });
}
