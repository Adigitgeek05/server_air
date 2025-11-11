import express from "express";
import cors from "cors";
import bodyParser from "body-parser";

const app = express();
app.use(bodyParser.json());


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
app.post("/api/data", (req, res) => {
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
  latestData = safeData;
  allData.push(safeData);

  console.log("✅ Clean data saved:", safeData);
  res.status(200).json({ message: "Data received successfully", data: safeData });
});

// ✅ GET route (for frontend)
app.get("/api/data", (req, res) => {
  if (!latestData) {
    console.warn("⚠️ No data yet");
    return res.status(404).json({ error: "No data available yet" });
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

// ✅ Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
