import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import { initGoogleSDK, callGeminiSDK,  } from "./googleAiHelper.js";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(bodyParser.json());

// Initialize Google GenAI SDK if USE_GOOGLE_SDK=1
const useGoogleSDK = process.env.USE_GOOGLE_SDK === "1";
if (useGoogleSDK) {
  (async () => {
    await initGoogleSDK();
  })().catch(e => console.error("SDK init failed:", e));
}

app.use(cors()); // Add this before your routes

// ✅ In-memory storage (temporary)
let latestData = null;
let allData = [];

// ✅ Handle JSON parsing errors gracefully
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    console.error("Bad JSON from client:", err);
    return res.status(400).json({ error: "Invalid JSON format" });
  }
  next();
});

// ✅ POST route for ESP8266 (saves latest data)
app.post("/api/data", async (req, res) => {
  // Receive raw sensor payload from device and require LLM correction before updating "latestData".
  let { temperature, humidity, mq135, pm25, pm10 } = req.body;

  console.log("📩 Raw data received:", req.body);

  temperature = parseFloat(temperature);
  humidity = parseFloat(humidity);
  mq135 = parseFloat(mq135);
  pm25 = parseFloat(pm25);
  pm10 = parseFloat(pm10);

  if ([temperature, humidity, mq135, pm25, pm10].some(v => isNaN(v))) {
    return res.status(400).json({ error: "Invalid or missing data fields" });
  }

  const safeData = { temperature, humidity, mq135, pm25, pm10, timestamp: new Date() };

  // LLM correction is mandatory. Verify SDK is initialized.
  if (!useGoogleSDK) {
    console.error('LLM required but USE_GOOGLE_SDK is not enabled or SDK init failed');
    return res.status(503).json({ error: 'Google GenAI SDK required but not configured' });
  }

  try {
    const lat = req.query.lat || process.env.WEATHER_LAT;
    const lon = req.query.lon || process.env.WEATHER_LON;

    // Fetch weather data if available
    let weather = null;
    if (lat && lon) {
      weather = await fetchWeather(lat, lon);
    }

    // Use previous latest and recent history (do not overwrite before correction)
    const prevLatest = latestData;
    const prompt = {
      instruction: 'Compare the newly received sensor reading ("incoming") with the data currently stored/shown ("latest") and recent history. Detect if the incoming reading is anomalous or corrupted. Provide a corrected reading. Return a JSON object with: { "corrected": {...sensor fields...}, "flag": "anomaly_detected|weather_adjusted|no_change|error", "reason": "explanation of what was corrected" }. Do not include extra text.',
      incoming: safeData,
      latest: prevLatest,
      history: allData.slice(-20)
    };

    console.log(`📡 Calling Gemini for anomaly detection (lat: ${lat}, lon: ${lon})...`);
    const modelResp = await callGemini(prompt, lat, lon, weather);
    if (!modelResp || !modelResp.corrected || typeof modelResp.corrected !== 'object') {
      console.error('LLM did not return corrected data or call failed');
      return res.status(502).json({ error: 'LLM did not return corrected data' });
    }

    const corrected = modelResp.corrected;
    const flag = modelResp.flag || "no_change";
    const reason = modelResp.reason || "Data processed by LLM";

    // Ensure numeric types and timestamp
    corrected.temperature = parseFloat(corrected.temperature) || safeData.temperature;
    corrected.humidity = parseFloat(corrected.humidity) || safeData.humidity;
    corrected.mq135 = parseFloat(corrected.mq135) || safeData.mq135;
    corrected.pm25 = parseFloat(corrected.pm25) || safeData.pm25;
    corrected.pm10 = parseFloat(corrected.pm10) || safeData.pm10;
    corrected.timestamp = new Date();

    // Update latestData and history with LLM-corrected values and metadata.
    latestData = { ...corrected, _source: 'gemini-corrected', flag, reason };
    allData.push(latestData);

    console.log(`🧠 Gemini result: flag=${flag}, reason=${reason}`);
    console.log('✅ Corrected reading:', latestData);
    return res.status(200).json({ message: 'Data received and corrected', data: latestData, flag, reason });
  } catch (e) {
    console.error('LLM correction failed:', e && e.message);
    return res.status(500).json({ error: 'LLM correction failed' });
  }
});

// ✅ GET route (for frontend)
// ✅ GET route (for frontend) - Modified to return default data
app.get("/api/data", (req, res) => {
  if (!latestData) {
    console.warn("⚠️ No data yet, returning default values");
    // Return default data instead of 404
    const defaultData = {
      temperature: 25,
      humidity: 60,
      mq135: 250,
      pm25: 15,
      pm10: 35,
      timestamp: new Date()
    };
    return res.json(defaultData);
  }
  res.json(latestData);
});
// ✅ GET route for latest (optional)
app.get("/api/data/latest", (req, res) => {
  if (!latestData) return res.status(404).json({ error: "No data available yet" });
  res.json(latestData);
});

// ✅ GET route for all history (optional)
app.get("/api/data/all", (req, res) => {
  if (allData.length === 0) return res.status(404).json({ error: "No data available yet" });
  res.json(allData);
});

// Helper: fetch weather data (OpenWeatherMap) using global fetch.
async function fetchWeather(lat, lon) {
  const key = process.env.OPENWEATHER_API_KEY;
  if (!key) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=${key}`;
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!resp.ok) return null;
    return await resp.json();
  } catch (err) {
    console.error('Weather fetch failed', err && err.message);
    return null;
  }
}

// Helper: call Gemini (placeholder). If GEMINI_ENDPOINT and GEMINI_API_KEY are set, we'll POST the prompt.
async function callGemini(prompt, lat, lon, weather) {
  // Use Google GenAI SDK (weather context passed in prompt).
  return await callGeminiSDK(prompt, lat, lon, weather);
}

// Fallback local anomaly detection & simple correction
function localDetectAndCorrect(dataArray, weather) {
  // Simple rules: clamp values to plausible ranges and replace NaN / null with median
  const clones = JSON.parse(JSON.stringify(dataArray));
  const numericKeys = ['temperature','humidity','mq135','pm25','pm10'];
  const medians = {};
  for (const k of numericKeys) {
    const vals = clones.map(d => parseFloat(d[k])).filter(v => !isNaN(v));
    if (vals.length === 0) medians[k] = null;
    else {
      vals.sort((a,b)=>a-b);
      const mid = Math.floor(vals.length/2);
      medians[k] = vals.length%2 ? vals[mid] : (vals[mid-1]+vals[mid])/2;
    }
  }

  // plausible ranges (basic)
  const ranges = {
    temperature: {min: -50, max: 60},
    humidity: {min: 0, max: 100},
    mq135: {min: 0, max: 1000},
    pm25: {min: 0, max: 1000},
    pm10: {min: 0, max: 1000}
  };

  for (const row of clones) {
    for (const k of numericKeys) {
      let v = parseFloat(row[k]);
      if (isNaN(v) || v === null) {
        if (medians[k] !== null) row[k] = medians[k];
        continue;
      }
      if (v < ranges[k].min) row[k] = ranges[k].min;
      else if (v > ranges[k].max) row[k] = ranges[k].max;
      else row[k] = v;
    }
    // if weather is available, prefer its temperature as a guide if sensor is far off
    if (weather && weather.main && typeof weather.main.temp === 'number') {
      const wt = weather.main.temp;
      const t = parseFloat(row.temperature);
      if (!isNaN(t) && Math.abs(t - wt) > 15) {
        row.temperature = (t + wt) / 2; // blend
      }
    }
    row.timestamp = row.timestamp || new Date();
  }
  return clones;
}

// POST /api/analyze - accepts an array of data points, sends to Gemini (if configured) to detect anomalies
// and corrects using weather data when available. Body: JSON array. Optional query: lat, lon for weather lookup.
app.post('/api/analyze', async (req, res) => {
  try {
    const dataArray = req.body;
    if (!Array.isArray(dataArray) || dataArray.length === 0) {
      return res.status(400).json({ error: 'Expected a non-empty JSON array in request body' });
    }

    // Determine location for weather lookup
    const lat = req.query.lat || process.env.WEATHER_LAT;
    const lon = req.query.lon || process.env.WEATHER_LON;
    let weather = null;
    if (lat && lon) {
      weather = await fetchWeather(lat, lon);
    }

    // Try calling Gemini (if configured)
    const prompt = {
      instruction: 'Detect anomalies in this sensor data array and return corrected array. Use weather context when helpful. Respond only with JSON array of corrected objects.',
      data: dataArray,
      weather
    };

    const modelResp = await callGemini(prompt);
    if (modelResp && modelResp.corrected) {
      // If Gemini returns corrected data, update latestData so frontend always shows corrected values.
      const corrected = modelResp.corrected;
      const flag = modelResp.flag || "no_change";
      const reason = modelResp.reason || "Batch analysis by LLM";
      
      // Accept either an array of corrected objects or single object.
      if (Array.isArray(corrected) && corrected.length > 0) {
        const last = corrected[corrected.length - 1];
        latestData = { ...last, _source: 'gemini-corrected', flag, reason };
        allData.push(latestData);
      } else if (typeof corrected === 'object') {
        latestData = { ...corrected, _source: 'gemini-corrected', flag, reason };
        allData.push(latestData);
      }
      console.log(`🔍 Analyze: flag=${flag}, reason=${reason}`);
      return res.json({ corrected: modelResp.corrected, source: 'gemini', flag, reason });
    }

    // Fallback to local simple detection/correction
    const corrected = localDetectAndCorrect(dataArray, weather);
    return res.json({ corrected, source: 'local-fallback', weather });
  } catch (err) {
    console.error('Analyze endpoint error', err && err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ✅ Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
