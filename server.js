import express from "express";
import bodyParser from "body-parser";

const app = express();
app.use(bodyParser.json());

// ✅ Handle JSON parsing errors gracefully
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    console.error("Bad JSON from client:", err);
    return res.status(400).json({ error: "Invalid JSON format" });
  }
  next();
});

// ✅ Middleware to fix non-standard JSON (like NaN)
app.use(express.text({ type: "application/json" }));

app.use((req, res, next) => {
  if (typeof req.body === "string") {
    try {
      // Replace invalid JSON tokens like NaN or Infinity
      const safe = req.body
        .replace(/\bNaN\b/gi, "null")
        .replace(/\bInfinity\b/gi, "null")
        .replace(/\bundefined\b/gi, "null");
      req.body = JSON.parse(safe);
    } catch (e) {
      console.error("Failed to parse fixed JSON:", e);
      return res.status(400).json({ error: "Invalid JSON data" });
    }
  }
  next();
});

// ✅ Main route for ESP8266 data
app.post("/api/data", (req, res) => {
  const { temperature, humidity, mq135, pm25, pm10 } = req.body;

  console.log("Received data from ESP8266:", req.body);

  // Validate fields
  if (
    temperature === undefined ||
    humidity === undefined ||
    mq135 === undefined ||
    pm25 === undefined ||
    pm10 === undefined
  ) {
    return res.status(400).json({ error: "Missing one or more fields" });
  }

  const safeData = {
    temperature: Number(temperature) || 0,
    humidity: Number(humidity) || 0,
    mq135: Number(mq135) || 0,
    pm25: Number(pm25) || 0,
    pm10: Number(pm10) || 0,
  };

  console.log("Clean data:", safeData);

  // TODO: Save safeData to DB or forward to frontend
  res.status(200).json({ message: "Data received successfully", data: safeData });
});

// ✅ Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
