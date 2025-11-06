import express from "express";
import bodyParser from "body-parser";

const app = express();
app.use(bodyParser.json());

app.post("/api/data", (req, res) => {
  const { temperature, humidity, airQuality, pm25, pm10 } = req.body;
  console.log("Received data:", req.body);
  // Store to DB or send to frontend via websocket
  res.status(200).send({ message: "Data received successfully" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

