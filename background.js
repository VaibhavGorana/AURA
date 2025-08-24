
chrome.action.onClicked.addListener((tab) => {
  chrome.tabs.sendMessage(tab.id, { toggleAura: true });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "AI_REQUEST") {
    const apiKey = 'VSS'; // 🔑 Replace with actual key
    const model = request.model || "llama3-8b-8192";
    const prompt = request.prompt;

    fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: "user", content: prompt }
        ]
      })
    })
    .then(response => response.json())
    .then(data => {
      const result = data.choices?.[0]?.message?.content || "No response from Groq AI.";
      sendResponse({ success: true, result });
    })
    .catch(error => {
      console.error("Aura BG Error:", error);
      sendResponse({ success: false, error: error.message });
    });

    return true; // Important: keeps message channel open for async response
  }
});
