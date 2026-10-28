"""FastAPI service for the existing traffic volume prediction model."""

from datetime import datetime
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict, Field

BASE_DIR = Path(__file__).resolve().parent
PIPELINE_PATH = BASE_DIR / "traffic_model_pipeline.pkl"
EVALUATION_CHART_PATH = BASE_DIR / "actual_vs_predicted.png"

pipeline: dict[str, Any] = joblib.load(PIPELINE_PATH)

app = FastAPI(title="Traffic Congestion Prediction API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


class PredictionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    datetime: datetime
    temp_c: float = Field(ge=-30, le=40)
    rain_1h: float = Field(ge=0, le=100)
    snow_1h: float = Field(ge=0, le=10)
    clouds_all: int = Field(ge=0, le=100)
    weather_main: str = Field(min_length=1)
    weather_description: str = Field(min_length=1)
    holiday: str = Field(min_length=1)


def build_input_row(request: PredictionRequest) -> pd.DataFrame:
    """Build the exact ordered feature row expected by the saved model."""
    weather_map = pipeline["weather_map"]
    if request.weather_main not in weather_map:
        raise HTTPException(status_code=422, detail="Unknown weather category.")
    if request.weather_description not in weather_map[request.weather_main]:
        raise HTTPException(
            status_code=422,
            detail="Weather detail does not match the selected weather category.",
        )
    if request.holiday not in pipeline["holidays"]:
        raise HTTPException(status_code=422, detail="Unknown holiday category.")

    when = request.datetime
    row = {
        "temp": request.temp_c + 273.15,
        "rain_1h": request.rain_1h,
        "snow_1h": request.snow_1h,
        "clouds_all": request.clouds_all,
        "hour": when.hour,
        "day_of_week": when.weekday(),
        "month": when.month,
        "is_weekend": int(when.weekday() >= 5),
        f"weather_main_{request.weather_main}": 1,
        f"weather_description_{request.weather_description}": 1,
        f"holiday_{request.holiday}": 1,
    }
    return pd.DataFrame([row]).reindex(
        columns=pipeline["feature_names"],
        fill_value=0,
    )


def get_congestion_category(volume: float) -> str:
    """Classify traffic volume using the project's existing thresholds."""
    if volume < 1500:
        return "Low"
    if volume < 3000:
        return "Moderate"
    if volume < 4500:
        return "Heavy"
    return "Severe"


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/options")
def get_options() -> dict[str, Any]:
    return {
        "weather_map": pipeline["weather_map"],
        "holidays": pipeline["holidays"],
    }


@app.post("/predict")
def predict(request: PredictionRequest) -> dict[str, Any]:
    features = build_input_row(request)
    volume = float(np.clip(pipeline["model"].predict(features)[0], 0, None))
    if not np.isfinite(volume):
        raise RuntimeError("The saved model returned a non-finite traffic prediction.")

    return {
        "predicted_traffic_volume": volume,
        "congestion_level": get_congestion_category(volume),
        "datetime": request.datetime.isoformat(timespec="minutes"),
    }


@app.get("/evaluation-chart")
def get_evaluation_chart() -> FileResponse:
    if not EVALUATION_CHART_PATH.is_file():
        raise HTTPException(
            status_code=404,
            detail="The saved model evaluation chart was not found.",
        )
    return FileResponse(
        EVALUATION_CHART_PATH,
        media_type="image/png",
    )
