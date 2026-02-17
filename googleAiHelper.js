// googleAiHelper.js
// Google GenAI SDK helper with function calling for OpenWeatherMap.

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
    model = genai.getGenerativeModel({ 
      model: modelName,
      tools: [
        {
          googleSearch: {}
        }
      ]
    });
    console.log(`✅ Google GenAI SDK initialized with model: ${modelName}`);
    return true;
  } catch (e) {
    console.warn("Failed to init Google SDK:", e && e.message);
    return false;
  }
}

// Tool: fetch weather data from OpenWeatherMap
async function executeWeatherTool(lat, lon) {
  console.log(`🌤️  Weather tool called: fetchWeather(${lat}, ${lon})`);
  const key = process.env.OPENWEATHER_API_KEY;
  if (!key) {
    console.warn("OpenWeather API key not configured; returning null");
    return null;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=${key}`;
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!resp.ok) {
      console.error('Weather API responded with', resp.status);
      return null;
    }
    const data = await resp.json();
    console.log(`✅ Weather fetched: temp=${data.main.temp}°C, humidity=${data.main.humidity}%`);
    return data;
  } catch (err) {
    clearTimeout(timeout);
    console.error('Weather fetch failed:', err && err.message);
    return null;
  }
}

async function callGeminiSDK(prompt, lat, lon) {
  // Calls Gemini with function calling enabled for OpenWeatherMap tool.
  if (!model) {
    console.warn("Google SDK model not initialized");
    return null;
  }

  try {
    // Build the prompt string with tool instructions
    const promptStr = typeof prompt === "string" ? prompt : JSON.stringify(prompt, null, 2);
    const enhancedPrompt = promptStr + "\n\nIMPORTANT: If you need weather data to make a decision, call the weather tool with the provided coordinates. Always include 'flag' and 'reason' fields in your response.";

    console.log(`📤 Calling Gemini with prompt (lat: ${lat}, lon: ${lon})...`);

    // Initial call
    const contents = [{ role: "user", parts: [{ text: enhancedPrompt }] }];
    let result = await model.generateContent({
      contents,
      generationConfig: {
        temperature: 0.2,
        topP: 0.8,
        topK: 40,
        maxOutputTokens: 2048,
      },
    });

    let response = result.response;
    let iterations = 0;
    const maxIterations = 3;

    // Handle function calls (tool use)
    while (response.candidates?.[0]?.content?.parts?.some(p => p.functionCall)) {
      if (iterations >= maxIterations) {
        console.warn("Max function call iterations reached");
        break;
      }
      iterations++;

      console.log(`🔄 Function call detected (iteration ${iterations})`);

      const toolUseBlock = response.candidates[0].content.parts.find(p => p.functionCall);
      if (!toolUseBlock) break;

      const { name: toolName, args: toolArgs } = toolUseBlock.functionCall;
      console.log(`🛠️  Tool: ${toolName}, Args:`, toolArgs);

      let toolResult = null;

      // Execute the appropriate tool
      if (toolName === "fetchWeather" || toolName === "weather") {
        const toolLat = toolArgs.lat || lat;
        const toolLon = toolArgs.lon || lon;
        toolResult = await executeWeatherTool(toolLat, toolLon);
      } else {
        console.warn(`Unknown tool: ${toolName}`);
        toolResult = null;
      }

      // Send tool result back to model
      contents.push({
        role: "user",
        parts: [
          {
            functionResponse: {
              name: toolName,
              response: toolResult || { error: "Tool execution failed" },
            },
          },
        ],
      });

      console.log(`📨 Sending tool result back to model...`);

      // Call model again with tool result
      result = await model.generateContent({
        contents,
        generationConfig: {
          temperature: 0.2,
          topP: 0.8,
          topK: 40,
          maxOutputTokens: 2048,
        },
      });

      response = result.response;
    }

    // Extract text response
    const text = response.text();
    console.log("✅ Gemini final response received");

    // Try to parse the response as JSON
    try {
      // Strip markdown code blocks if present
      let jsonStr = text.trim();
      if (jsonStr.startsWith("```json")) {
        jsonStr = jsonStr.replace(/^```json\n?/, "").replace(/\n?```$/, "");
      } else if (jsonStr.startsWith("```")) {
        jsonStr = jsonStr.replace(/^```\n?/, "").replace(/\n?```$/, "");
      }
      const parsed = JSON.parse(jsonStr);
      console.log("📋 Parsed response with flag:", parsed.flag, "reason:", parsed.reason);
      return parsed; // Expecting { corrected: {...}, flag: "...", reason: "..." }
    } catch (e) {
      console.warn("Response was not JSON; wrapping:", e && e.message);
      return { 
        corrected: { text },
        flag: "parse_error",
        reason: "Could not parse model response as JSON"
      };
    }
  } catch (e) {
    console.error("Gemini SDK call failed:", e && e.message);
    return null;
  }
}

export { initGoogleSDK, callGeminiSDK, executeWeatherTool };
