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
  const { temperature, humidity, mq135, pm25, pm10 } = req.body;

  // Log received data
  console.log("Received data from ESP8266:", req.body);

  // Validate fields (ESP can sometimes send null or NaN)
  if (
    temperature === undefined ||
    humidity === undefined ||
    mq135 === undefined ||
    pm25 === undefined ||
    pm10 === undefined
  ) {
    return res.status(400).json({ error: "Missing one or more fields" });
  }

  // Optional: sanitize bad numeric values
  const safeData = {
    temperature: isNaN(temperature) ? 0 : temperature,
    humidity: isNaN(humidity) ? 0 : humidity,
    mq135: isNaN(mq135) ? 0 : mq135,
    pm25: isNaN(pm25) ? 0 : pm25,
    pm10: isNaN(pm10) ? 0 : pm10,
  };

  console.log("Clean data:", safeData);

  // TODO: Save safeData to DB or forward to frontend
  res.status(200).json({ message: "Data received successfully" });
});

// ✅ Fix syntax in your listen() function
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));