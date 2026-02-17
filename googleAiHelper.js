import { GoogleGenerativeAI } from "@google/generative-ai";

let genai = null;
let model = null;

async function initGoogleSDK() {
  try {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) return false;

    genai = new GoogleGenerativeAI(apiKey);
    
    const modelName = process.env.GEMINI_MODEL || "gemini-2.5-flash";

    // ✅ No tools in config - keep it simple
    model = genai.getGenerativeModel({
      model: modelName,
      systemInstruction: "You are an IoT sensor anomaly detection expert. Analyze sensor readings for anomalies and corrections. ALWAYS respond ONLY with valid JSON (no markdown, no extra text) in this exact format: {\"corrected\": {\"temperature\": number, \"humidity\": number, \"mq135\": number, \"pm25\": number, \"pm10\": number}, \"flag\": \"anomaly_detected|weather_adjusted|no_change|error\", \"reason\": \"brief explanation of correction\"}",
    });

    console.log(`✅ SDK Ready: ${modelName}`);
    return true;
  } catch (e) {
    console.error("Init Error:", e);
    return false;
  }
}

async function callGeminiSDK(prompt, lat, lon, weather) {
  if (!model) return null;

  try {
    // Build prompt with weather context included
    let promptStr = typeof prompt === "string" ? prompt : JSON.stringify(prompt, null, 2);

    // Append weather data if available
    if (weather && weather.main) {
      promptStr += `\n\n🌤️ Current Weather Context:\nTemperature: ${weather.main.temp}°C\nHumidity: ${weather.main.humidity}%\nDescription: ${weather.weather?.[0]?.main || 'N/A'}\n\nUse this weather data to validate sensor readings.`;
    }

    console.log(`📤 Sending prompt to Gemini...`);

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: promptStr }] }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 1024,
      },
    });

    const response = result.response;
    const text = response.text();
    console.log(`📥 AI response received`, text);
    console.log(`📋 Raw response: ${text.substring(0, 200)}...`);
    
    // Clean JSON: remove markdown code blocks and extract JSON object
    let cleanJson = text.trim();
    
    // Remove markdown wrappers
    if (cleanJson.startsWith("```json")) {
      cleanJson = cleanJson.substring(7); // Remove ```json
    } else if (cleanJson.startsWith("```")) {
      cleanJson = cleanJson.substring(3); // Remove ```
    }
    
    if (cleanJson.endsWith("```")) {
      cleanJson = cleanJson.substring(0, cleanJson.length - 3); // Remove trailing ```
    }
    
    cleanJson = cleanJson.trim();
    
    // Extract JSON object { ... } from text (handles extra text before/after)
    const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn("Could not find JSON object in response");
      return {
        corrected: {},
        flag: "parse_error",
        reason: "No JSON object found in response"
      };
    }
    
    const jsonStr = jsonMatch[0];
    console.log(`🔍 Extracted JSON: ${jsonStr.substring(0, 100)}...`);
    
    const parsed = JSON.parse(jsonStr);
    
    console.log(`✅ Parsed: flag=${parsed.flag}, reason=${parsed.reason}`);
    return parsed;

  } catch (e) {
    console.error("Gemini Flow Error:", e.message);
    return null;
  }
}

async function executeWeatherTool(lat, lon) {
  console.log(`🌤️ Weather tool called: fetchWeather(${lat}, ${lon})`);
  
  const key = process.env.OPENWEATHER_API_KEY;
  if (!key) {
    console.warn("OpenWeather API key not configured");
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=${key}`;
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!resp.ok) {
      console.error("Weather API error:", resp.status);
      return null;
    }

    const data = await resp.json();
    console.log(`✅ Weather: temp=${data.main?.temp}°C, humidity=${data.main?.humidity}%`);
    return data;
  } catch (err) {
    clearTimeout(timeout);
    console.error("Weather fetch failed:", err?.message);
    return null;
  }
}

export { initGoogleSDK, callGeminiSDK, executeWeatherTool };