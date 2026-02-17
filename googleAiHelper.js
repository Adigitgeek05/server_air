// googleAiHelper.js
// Optional Google GenAI SDK helper for calling Gemini.
// Set USE_GOOGLE_SDK=1 in .env to enable this; otherwise falls back to generic fetch.

let genai = null;
let model = null;

async function initGoogleSDK() {
  try {
    const { GoogleGenerativeAI } = await import("@google/generative-ai");
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      console.warn("USE_GOOGLE_SDK=1 but GOOGLE_API_KEY not set; SDK init skipped");
      return false;
    }
    genai = new GoogleGenerativeAI(apiKey);
    const modelName = process.env.GEMINI_MODEL || "gemini-2.5-flash";
    model = genai.getGenerativeModel({ model: modelName });
    console.log(`✅ Google GenAI SDK initialized with model: ${modelName}`);
    return true;
  } catch (e) {
    console.warn("Failed to init Google SDK:", e && e.message);
    return false;
  }
}

async function callGeminiSDK(prompt) {
  // Calls Gemini using the official Google GenAI SDK.
  if (!model) {
    console.warn("Google SDK model not initialized");
    return null;
  }

  try {
    // Build the prompt string
    const promptStr = typeof prompt === "string" ? prompt : JSON.stringify(prompt, null, 2);

    // Call the model and get response
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: promptStr }] }],
      generationConfig: {
        temperature: 0.2, // Lower temp for consistency in correction tasks
        topP: 0.8,
        topK: 40,
        maxOutputTokens: 1024,
      },
    });

    const resp = result.response;
    if (!resp || !resp.text) {
      console.error("Gemini returned empty response");
      return null;
    }

    const text = resp.text();
    console.log("Gemini response text:", text);

    // Try to parse the response as JSON
    try {
      // Strip markdown code blocks if present (```json ... ```)
      let jsonStr = text.trim();
      if (jsonStr.startsWith("```json")) {
        jsonStr = jsonStr.replace(/^```json\n?/, "").replace(/\n?```$/, "");
      } else if (jsonStr.startsWith("```")) {
        jsonStr = jsonStr.replace(/^```\n?/, "").replace(/\n?```$/, "");
      }
      const parsed = JSON.parse(jsonStr);
      return parsed; // Expecting { corrected: {...} }
    } catch (e) {
      // If it's not JSON, wrap it in a response object
      console.warn("Gemini response was not JSON; wrapping:", e && e.message);
      return { corrected: { text } };
    }
  } catch (e) {
    console.error("Gemini SDK call failed:", e && e.message);
    return null;
  }
}

export { initGoogleSDK, callGeminiSDK };
