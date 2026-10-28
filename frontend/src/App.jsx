import React, { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const API_URL = (import.meta.env.VITE_API_URL || "http://127.0.0.1:8000").replace(
  /\/$/,
  "",
);

const CONGESTION_STYLES = {
  Low: { color: "var(--green)" },
  Moderate: { color: "var(--yellow)" },
  Heavy: { color: "var(--orange)" },
  Severe: { color: "var(--red)" },
};

function localDateValue() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function formatPredictionError(payload) {
  if (Array.isArray(payload?.detail)) {
    return payload.detail
      .map((item) => `${item.loc?.at(-1) || "Input"}: ${item.msg}`)
      .join(" ");
  }
  return payload?.detail || "The prediction request could not be completed.";
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(
    value,
  );
}

export default function App() {
  const [options, setOptions] = useState(null);
  const [optionsError, setOptionsError] = useState("");
  const [date, setDate] = useState(localDateValue);
  const [time, setTime] = useState("17:00");
  const [tempC, setTempC] = useState("15");
  const [rain, setRain] = useState("0");
  const [snow, setSnow] = useState("0");
  const [clouds, setClouds] = useState("40");
  const [weatherMain, setWeatherMain] = useState("");
  const [weatherDescription, setWeatherDescription] = useState("");
  const [holiday, setHoliday] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [predictions, setPredictions] = useState([]);
  const latestPrediction = predictions[0] || null;

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${API_URL}/options`, { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(formatPredictionError(payload));
        }
        return payload;
      })
      .then((payload) => {
        const firstWeather = Object.keys(payload.weather_map).sort()[0] || "";
        const firstHoliday = payload.holidays.includes("None")
          ? "None"
          : payload.holidays[0] || "";
        setOptions(payload);
        setWeatherMain(firstWeather);
        setWeatherDescription(payload.weather_map[firstWeather]?.[0] || "");
        setHoliday(firstHoliday);
      })
      .catch((cause) => {
        if (cause.name !== "AbortError") {
          setOptionsError(
            `Could not connect to the prediction API. ${cause.message}`,
          );
        }
      });

    return () => controller.abort();
  }, []);

  const chartData = useMemo(
    () =>
      [...predictions]
        .reverse()
        .map((item, index) => ({
          ...item,
          label: `${new Date(item.datetime).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          })} ${item.datetime.slice(11, 16)}`,
          index: index + 1,
        })),
    [predictions],
  );

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    if (!date || !time || !weatherMain || !weatherDescription || !holiday) {
      setError("Choose a date, time, weather condition, and holiday option.");
      return;
    }

    const payload = {
      datetime: `${date}T${time}:00`,
      temp_c: Number(tempC),
      rain_1h: Number(rain),
      snow_1h: Number(snow),
      clouds_all: Number(clouds),
      weather_main: weatherMain,
      weather_description: weatherDescription,
      holiday,
    };

    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(formatPredictionError(result));
      }

      setPredictions((current) =>
        [{ ...result, id: crypto.randomUUID() }, ...current].slice(0, 12),
      );
    } catch (cause) {
      setError(cause.message || "The prediction request could not be completed.");
    } finally {
      setLoading(false);
    }
  }

  function handleWeatherChange(value) {
    setWeatherMain(value);
    setWeatherDescription(options?.weather_map[value]?.[0] || "");
  }

  const weatherDetails = options?.weather_map[weatherMain] || [];
  const level = latestPrediction?.congestion_level;
  const levelColor = CONGESTION_STYLES[level]?.color || "var(--blue)";

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#" aria-label="Traffic Forecast home">
          <span className="brand-mark" aria-hidden="true">
            <span />

          </span>
          <span>TRAFFIC<span className="brand-light">FORECAST</span></span>
        </a>
        <div className="topbar-status">
          <span className="status-dot" />
          <span>I-94 · Minneapolis–Saint Paul</span>
        </div>
      </header>

      <section className="page-heading">
        <div>
          <p className="eyebrow">TRAFFIC INTELLIGENCE / MINNESOTA</p>
          <h2>Know before <span>you go.</span></h2>
          <p className="page-description">
            Estimate hourly traffic volume from local time and weather conditions.
          </p>
        </div>
        <div className="model-badge">
          <span className="badge-icon">✳</span>
          <span><strong>Prediction model</strong><small>Existing trained model</small></span>
        </div>
      </section>

      {optionsError && (
        <div className="notice error-notice" role="alert">
          <strong>API unavailable</strong>
          <span>{optionsError} Start FastAPI, then reload this page.</span>
        </div>
      )}

      <div className="dashboard-grid">
        <section className="panel input-panel" aria-labelledby="conditions-title">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">01 / CONDITIONS</p>
              <h2 id="conditions-title">Set your conditions</h2>
            </div>
            <span className="panel-icon" aria-hidden="true">⌁</span>
          </div>

          <form onSubmit={handleSubmit}>
            <fieldset disabled={!options || loading}>
              <legend className="sr-only">Prediction inputs</legend>
              <div className="field-grid two-columns">
                <label className="field">
                  <span>Date</span>
                  <input
                    type="date"
                    value={date}
                    onChange={(event) => setDate(event.target.value)}
                    required
                  />
                </label>
                <label className="field">
                  <span>Time</span>
                  <input
                    type="time"
                    value={time}
                    onChange={(event) => setTime(event.target.value)}
                    required
                  />
                </label>
              </div>

              <div className="field-grid two-columns">
                <label className="field">
                  <span>Weather</span>
                  <select
                    value={weatherMain}
                    onChange={(event) => handleWeatherChange(event.target.value)}
                    required
                  >
                    {Object.keys(options?.weather_map || {})
                      .sort()
                      .map((item) => <option key={item}>{item}</option>)}
                  </select>
                </label>
                <label className="field">
                  <span>Weather detail</span>
                  <select
                    value={weatherDescription}
                    onChange={(event) => setWeatherDescription(event.target.value)}
                    required
                  >
                    {weatherDetails.map((item) => <option key={item}>{item}</option>)}
                  </select>
                </label>
              </div>

              <label className="field">
                <span>Holiday</span>
                <select
                  value={holiday}
                  onChange={(event) => setHoliday(event.target.value)}
                  required
                >
                  {(options?.holidays || []).map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </label>

              <div className="section-divider">
                <span>Weather measurements</span>
                <span>MODEL INPUTS</span>
              </div>

              <div className="field-grid two-columns">
                <label className="field">
                  <span>Temperature <small>°C</small></span>
                  <input
                    type="number"
                    min="-30"
                    max="40"
                    step="0.1"
                    value={tempC}
                    onChange={(event) => setTempC(event.target.value)}
                    required
                  />
                </label>
                <label className="field">
                  <span>Rain last hour <small>mm</small></span>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={rain}
                    onChange={(event) => setRain(event.target.value)}
                    required
                  />
                </label>
                <label className="field">
                  <span>Snow last hour <small>mm</small></span>
                  <input
                    type="number"
                    min="0"
                    max="10"
                    step="0.1"
                    value={snow}
                    onChange={(event) => setSnow(event.target.value)}
                    required
                  />
                </label>
                <label className="field">
                  <span>Cloud cover <small>%</small></span>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    value={clouds}
                    onChange={(event) => setClouds(event.target.value)}
                    required
                  />
                </label>
              </div>
            </fieldset>

            {error && <p className="form-error" role="alert">{error}</p>}
            <button
              className="predict-button"
              type="submit"
              disabled={!options || loading}
            >
              {loading ? (
                <><span className="spinner" /> Predicting traffic…</>
              ) : (
                <>Predict traffic <span aria-hidden="true">↗</span></>
              )}
            </button>
            {!options && !optionsError && (
              <p className="loading-options">Loading model input options…</p>
            )}
          </form>
          <p className="form-footnote">Predictions are estimates, not live traffic readings.</p>
        </section>

        <section className="results-column" aria-label="Prediction results">
          <div className="result-cards">
            <article className="panel metric-card volume-card">
              <div className="metric-header">
                <span className="metric-icon volume-icon">↗</span>
                <span className="metric-label">PREDICTED VOLUME</span>
              </div>
              {latestPrediction ? (
                <>
                  <p className="metric-value">{formatNumber(latestPrediction.predicted_traffic_volume)}</p>
                  <p className="metric-unit">vehicles per hour</p>
                </>
              ) : (
                <div className="empty-metric">—<small>Run a prediction</small></div>
              )}
              <div className="metric-rule"><span /></div>
            </article>

            <article className="panel metric-card level-card">
              <div className="metric-header">
                <span className="metric-icon level-icon">◉</span>
                <span className="metric-label">CONGESTION LEVEL</span>
              </div>
              {latestPrediction ? (
                <>
                  <p className="level-value" style={{ color: levelColor }}>{level}</p>
                  <p className="metric-unit">based on vehicles per hour</p>
                </>
              ) : (
                <div className="empty-metric">—<small>Awaiting forecast</small></div>
              )}
              <div className="level-scale" aria-label="Congestion thresholds">
                {Object.entries(CONGESTION_STYLES).map(([name, style]) => (
                  <span
                    key={name}
                    className={level === name ? "scale-segment active" : "scale-segment"}
                    style={{ "--segment-color": style.color }}
                    title={name}
                  />
                ))}
              </div>
              <div className="scale-labels"><span>Low</span><span>Severe</span></div>
            </article>
          </div>

          <section className="panel chart-panel" aria-labelledby="history-title">
            <div className="panel-heading chart-heading">
              <div>
                <p className="eyebrow">02 / YOUR FORECASTS</p>
                <h2 id="history-title">Prediction history</h2>
              </div>
              <span className="chart-caption">This session · vehicles / hour</span>
            </div>
            {chartData.length ? (
              <div className="history-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 12, right: 12, left: -12, bottom: 0 }}>
                    <defs>
                      <linearGradient id="volumeFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#2c72ef" stopOpacity={0.24} />
                        <stop offset="100%" stopColor="#2c72ef" stopOpacity={0.01} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#e9edf4" strokeDasharray="3 5" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: "#8290a4", fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                      minTickGap={22}
                    />
                    <YAxis
                      tick={{ fill: "#8290a4", fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(value) => `${value / 1000}k`}
                    />
                    <Tooltip
                      formatter={(value) => [`${formatNumber(value)} veh/hr`, "Predicted volume"]}
                      contentStyle={{ border: "1px solid #e6eaf0", borderRadius: 10, fontSize: 12 }}
                    />
                    <ReferenceLine y={1500} stroke="#39a77b" strokeDasharray="4 5" />
                    <ReferenceLine y={3000} stroke="#e3b341" strokeDasharray="4 5" />
                    <ReferenceLine y={4500} stroke="#e87545" strokeDasharray="4 5" />
                    <Area
                      type="monotone"
                      dataKey="predicted_traffic_volume"
                      name="Predicted volume"
                      stroke="#2c72ef"
                      strokeWidth={2.5}
                      fill="url(#volumeFill)"
                      activeDot={{ r: 5, strokeWidth: 0 }}
                      dot={{ r: 3, fill: "#fff", strokeWidth: 2 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="chart-empty">
                <span className="chart-empty-icon">⌁</span>
                <strong>Your forecast trend will appear here</strong>
                <span>Run a prediction to add the first point. Only results from this session are shown.</span>
              </div>
            )}
          </section>

          <section className="panel evaluation-panel" aria-labelledby="evaluation-title">
            <div className="panel-heading chart-heading">
              <div>
                <p className="eyebrow">03 / MODEL EVALUATION</p>
                <h2 id="evaluation-title">Historical validation</h2>
              </div>
              <span className="chart-caption">Existing saved evaluation</span>
            </div>
            <img
              className="evaluation-image"
              src={`${API_URL}/evaluation-chart`}
              alt="Existing model evaluation chart comparing actual traffic, model predictions, and historical median baseline on a chronological sample."
            />
            <p className="evaluation-note">
              Actual and predicted traffic from the project’s saved chronological test sample.
            </p>
          </section>
        </section>
      </div>

      <footer className="page-footer">
        <span>TRAFFIC FORECAST <span className="footer-dot">•</span> I-94 PREDICTION</span>
        <span>Predictions are generated by the project’s existing trained model.</span>
      </footer>
    </main>
  );
}
