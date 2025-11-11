import express from "express";
import bodyParser from "body-parser";

const app = express();
app.use(bodyParser.json());

// ✅ Add this route so GET /api/data also works
app.get("/api/data", (req, res) => {
  if (!latestData) {
    return res.status(404).json({ error: "No data available yet" });
  }
  res.json(latestData);
});

// Temporary in-memory storage (for demo)
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

// ✅ POST route for ESP8266 data
app.post("/api/data", (req, res) => {
  let { temperature, humidity, mq135, pm25, pm10 } = req.body;

  console.log("📩 Raw data received:", req.body);

  // Convert to numbers
  temperature = parseFloat(temperature);
  humidity = parseFloat(humidity);
  mq135 = parseFloat(mq135);
  pm25 = parseFloat(pm25);
  pm10 = parseFloat(pm10);

  // Validate
  if ([temperature, humidity, mq135, pm25, pm10].some(v => isNaN(v))) {
    console.error("Invalid data received:", req.body);
    return res.status(400).json({ error: "Invalid or missing data fields" });
  }

  const safeData = { temperature, humidity, mq135, pm25, pm10, timestamp: new Date() };
  latestData = safeData;       // store latest data
  allData.push(safeData);      // store all data

  console.log("✅ Clean data saved:", safeData);
  res.status(200).json({ message: "Data received successfully", data: safeData });
});

// ✅ GET route to fetch latest data
app.get("/api/data/latest", (req, res) => {
  if (!latestData) return res.status(404).json({ error: "No data available yet" });
  res.json(latestData);
});

// ✅ GET route to fetch all data
app.get("/api/data/all", (req, res) => {
  if (allData.length === 0) return res.status(404).json({ error: "No data available yet" });
  res.json(allData);
});

// ✅ Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
