# Traffic Congestion Prediction

The project now uses a React + Vite dashboard with a FastAPI backend. The backend reuses the saved `backend/traffic_model_pipeline.pkl` model and the feature names, category options, and preprocessing behavior stored alongside it. **You do not need to retrain the model to run the application.**

The saved model predicts hourly I-94 traffic volume from date/time and weather inputs. The API returns both predicted vehicles per hour and a congestion level using the project's existing thresholds: Low (< 1,500), Moderate (< 3,000), Heavy (< 4,500), and Severe (>= 4,500).

## Requirements

- Python 3.10 or newer
- Node.js 20.19 or newer (or 22.12 or newer)
- The existing model artifact at `backend/traffic_model_pipeline.pkl`
- `scikit-learn==1.5.1` is pinned to match the environment that loads the saved artifact

## Install

From the project root in PowerShell:

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

If PowerShell blocks activation, allow it for the current terminal session and activate again:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\.venv\Scripts\Activate.ps1
```

Install the frontend dependencies in another terminal:

```powershell
cd "D:\resume projects\traffic_congestion_prediction (ML)\frontend"
npm install
```

## Run the applications

Open two PowerShell terminals from the project root.

**Terminal 1 — FastAPI backend:**

```powershell
.\.venv\Scripts\Activate.ps1
python -m uvicorn app:app --app-dir backend --reload --host 127.0.0.1 --port 8000
```

The API is available at `http://127.0.0.1:8000`; interactive API documentation is at `http://127.0.0.1:8000/docs`.

**Terminal 2 — React frontend:**

```powershell
cd "D:\resume projects\traffic_congestion_prediction (ML)\frontend"
npm run dev
```

Open the Vite URL printed in the terminal, normally `http://localhost:5173`.

The frontend calls `http://127.0.0.1:8000` by default. To use a different backend URL, define `VITE_API_URL` in the frontend environment before starting Vite. CORS is enabled for the default localhost Vite origins.

## API

- `GET /health` — backend status
- `GET /options` — weather details and holiday values available in the saved artifact
- `POST /predict` — validates the supplied conditions and returns the traffic forecast
- `GET /evaluation-chart` — serves the existing saved evaluation chart

Example request body:

```json
{
  "datetime": "2026-10-28T17:00:00",
  "temp_c": 15,
  "rain_1h": 0,
  "snow_1h": 0,
  "clouds_all": 40,
  "weather_main": "Clouds",
  "weather_description": "scattered clouds",
  "holiday": "None"
}
```

The returned forecast history chart contains only predictions made in the current browser session. The historical validation chart is the existing `backend/actual_vs_predicted.png`; no sample prediction values are fabricated.

## Train the model (optional)

Training is not part of setup or startup. If you intentionally want to regenerate the artifact from the existing dataset, activate the Python environment and run:

```powershell
cd "D:\resume projects\traffic_congestion_prediction (ML)\backend"
python train_model.py
```
