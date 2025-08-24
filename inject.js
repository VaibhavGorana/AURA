let auraActive = false;
let auraPanel = null;

// 👇 Function to detect intent from Groq AI
function detectIntentFromAI() {
  const prompt = `
You are an intent detection assistant. Based on the content below, generate a **clear and concise user intent** in less than 15 words. No explanations. Only the intent line.

Content:
${document.body.innerText.slice(0, 5000)}
`;

  chrome.runtime.sendMessage(
    {
      type: "AI_REQUEST",
      model: "llama3-8b-8192",
      prompt: prompt,
    },
    (response) => {
      if (response?.success && response.result) {
        const intentText = response.result.trim();
        updateIntentPanel(intentText);
      } else {
        updateIntentPanel("Could not detect intent.");
      }
    }
  );
}

// 👇 Create or update the floating panel
function createAuraPanel() {
  auraPanel = document.createElement("div");
  auraPanel.id = "aura-intent-panel";
  auraPanel.style.position = "fixed";
  auraPanel.style.bottom = "20px";
  auraPanel.style.right = "20px";
  auraPanel.style.zIndex = "999999";
  auraPanel.style.backgroundColor = "white";
  auraPanel.style.padding = "15px";
  auraPanel.style.border = "1px solid #ccc";
  auraPanel.style.borderRadius = "10px";
  auraPanel.style.boxShadow = "0 4px 8px rgba(0,0,0,0.2)";
  auraPanel.style.fontSize = "14px";
  auraPanel.style.maxWidth = "300px";
  auraPanel.style.fontFamily = "Arial, sans-serif";
  auraPanel.innerText = "Detecting intent...";

  document.body.appendChild(auraPanel);

  detectIntentFromAI(); // 🚀 Trigger Groq AI intent
}

// 👇 Update intent panel content
function updateIntentPanel(intentText) {
  if (auraPanel) {
    auraPanel.innerHTML = `
      <strong>Intent:</strong><br>
      <div style="margin: 5px 0 10px 0;">${intentText}</div>
      <button id="aura-action-btn" style="padding:5px 10px;border:none;background:#007bff;color:#fff;border-radius:5px;cursor:pointer;">Take Action</button>
    `;

    document.getElementById("aura-action-btn").onclick = () => {
      alert("Feature coming soon. Action based on: " + intentText);
    };
  }
}

// 👇 Destroy panel
function removeAuraPanel() {
  if (auraPanel) {
    auraPanel.remove();
    auraPanel = null;
  }
}

// 👇 Toggle logic
function toggleAura() {
  auraActive = !auraActive;
  if (auraActive) {
    createAuraPanel();
  } else {
    removeAuraPanel();
  }
}

// 👂 Listen to background toggle
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.toggleAura) {
    toggleAura();
  }
});
