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

// ✅ Main route for ESP8266 data
app.post("/api/data", (req, res) => {
  let { temperature, humidity, mq135, pm25, pm10 } = req.body;

  console.log("📩 Raw data received:", req.body);

  // ✅ Convert all to numbers (in case they arrive as strings)
  temperature = parseFloat(temperature);
  humidity = parseFloat(humidity);
  mq135 = parseFloat(mq135);
  pm25 = parseFloat(pm25);
  pm10 = parseFloat(pm10);

  // ✅ Validate
  if (
    [temperature, humidity, mq135, pm25, pm10].some(
      (val) => isNaN(val) || val === undefined
    )
  ) {
    console.error("❌ Invalid data received:", req.body);
    return res.status(400).json({ error: "Invalid or missing data fields" });
  }

  const safeData = { temperature, humidity, mq135, pm25, pm10 };
  console.log("✅ Clean data:", safeData);

  // TODO: Save safeData to database or cache here
  res.status(200).json({ message: "Data received successfully", data: safeData });
});

// ✅ Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
