# serveraa

**Overview**
- **Purpose**: simple Express backend that receives sensor readings from devices, stores history, exposes the latest reading for the frontend, and optionally uses an LLM (Gemini) to detect and correct anomalies so the frontend always shows corrected data.
- **Main file**: [server.js](server.js)

**Flow (step-by-step intent)**
- **Device → POST /api/data**: hardware (ESP8266, etc.) posts a JSON payload containing numeric fields (`temperature`, `humidity`, `mq135`, `pm25`, `pm10`).
- **Immediate validation & store**: server validates and stores a safe copy to memory (`latestData` and `allData`). This prevents data loss.
- **LLM correction attempt**: server builds a prompt including the incoming reading, recent history, and optional weather context and calls the configured LLM endpoint (`GEMINI_ENDPOINT`). If the model returns a `corrected` object, the server replaces `latestData` with the corrected values and appends to `allData` (marked `_source: 'gemini-corrected'`).
- **Fallback local correction**: if LLM isn't configured or fails, a lightweight local correction (`localDetectAndCorrect`) runs (median replacement, range clamping, simple temperature blending with weather) and updates `latestData` (marked `_source: 'local-fallback'`).
- **Frontend read**: the frontend reads the most recent corrected value from `GET /api/data` or `GET /api/data/latest` and always sees corrected data (if correction occurred).

**Where the LLM fits**
- **Intent**: the LLM is asked to "compare incoming vs shown/history and correct anomalies". If configured and returning a `corrected` object, the backend uses that as the single source of truth for the frontend.
- **Visibility**: corrected entries are flagged in memory with `_source` so you can audit whether a reading was corrected locally or by the model.

Important: LLM correction is mandatory in this setup. The server will refuse to accept/store a new reading unless the configured LLM endpoint returns a `corrected` object. Ensure `GEMINI_ENDPOINT` and `GEMINI_API_KEY` are set in your environment.

**Endpoints**
- **POST /api/data**: receive sensor reading. Body: JSON object with `temperature`, `humidity`, `mq135`, `pm25`, `pm10`. Optional query `lat` and `lon` for weather context. Stores reading and attempts correction.
- **GET /api/data**: returns the latest corrected reading if available, otherwise default values.
- **GET /api/data/latest**: returns latest reading or 404 if none.
- **GET /api/data/all**: returns full stored history array.
- **POST /api/analyze**: accept an array of readings (body = JSON array). Calls the LLM (if configured) to detect/correct anomalies and will update `latestData` when the LLM returns corrections.

**Required environment variables**
- `USE_GOOGLE_SDK`: Must be set to `1` (SDK is mandatory).
- `GOOGLE_API_KEY`: Your Google API key for GenAI (get it from [ai.google.dev](https://ai.google.dev/)).
- `GEMINI_MODEL`: Model name for Google SDK (default: `gemini-1.5-pro`).
- `OPENWEATHER_API_KEY`: (optional) OpenWeatherMap API key used for weather context in corrections.
- `WEATHER_LAT`, `WEATHER_LON`: (optional) defaults for weather lookup if device doesn't provide `lat`/`lon` query.
- `PORT`: server port (default 3000).

Sample `.env`:

```env
USE_GOOGLE_SDK=1
GOOGLE_API_KEY=your_google_api_key_here
GEMINI_MODEL=gemini-1.5-pro
OPENWEATHER_API_KEY=your_openweather_key
WEATHER_LAT=12.34
WEATHER_LON=56.78
PORT=3000
```

**Setup (Google GenAI SDK required)**
- This backend uses the official `@google/generative-ai` SDK.
- Get your Google API key from [ai.google.dev](https://ai.google.dev/) (free tier available).
- Set `USE_GOOGLE_SDK=1` and `GOOGLE_API_KEY=...` in `.env`.
- Optionally configure `GEMINI_MODEL` (default: `gemini-1.5-pro`).
- Run:
  ```bash
  npm install
  npm start
  ```

**Run & test**
- Install dependencies and start the server:

```bash
npm install
npm start
```

- Example device POST (replace host/port if needed):

```bash
curl -X POST http://localhost:3000/api/data \
  -H "Content-Type: application/json" \
  -d '{"temperature": 23.5, "humidity": 45, "mq135": 200, "pm25": 12, "pm10": 25}'
```

- Example analyze call (send array):

```bash
curl -X POST http://localhost:3000/api/analyze \
  -H "Content-Type: application/json" \
  -d '[{"temperature":1000, "humidity":-10, "mq135":null, "pm25":5000, "pm10":5000}]'
```

- Read latest corrected data:

```bash
curl http://localhost:3000/api/data/latest
```

**Where to change the behavior**
- Edit [server.js](server.js) to adjust:
  - the LLM prompt/format (`callGemini` / prompt object),
  - local correction rules in `localDetectAndCorrect` (ranges, blending),
  - how many history items are sent in prompts (`allData.slice(-20)`).

**Caveats & next steps**
- Current storage is in-memory (process restart loses history). For production, persist `allData` in a DB.
- Validate and harden the model response parsing: currently expects a `corrected` key — adapt as needed to your LLM's response format.
- Consider rate-limiting or async queueing to avoid blocking the device POST while waiting on model or weather APIs.

---

File: [server.js](server.js)

If you'd like, I can also:
- add a small `README` section showing a sample `.env` file,
- commit these changes, or
- add a tiny integration test that exercises the `/api/data` -> correction flow.
