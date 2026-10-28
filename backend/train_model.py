"""
Traffic Congestion Predictor - training script
Run once:  python train_model.py
Output  :  traffic_model_pipeline.pkl  (used by app.py)
"""
import joblib
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

DATA_PATH = "Metro_Interstate_Traffic_Volume.csv"
CATEGORICAL = ["weather_main", "weather_description", "holiday"]


# ----------------------------------------------------------------------
# 1. Congestion categories (single definition, used by training AND app)
# ----------------------------------------------------------------------
def get_congestion_category(volume):
    """Low <1500 | Moderate <3000 | Heavy <4500 | Severe >=4500 (vehicles/hour)."""
    if volume is None or not isinstance(volume, (int, float, np.number)) or np.isnan(volume):
        return "Invalid Input"
    volume = max(0.0, float(volume))
    if volume < 1500:
        return "Low"
    if volume < 3000:
        return "Moderate"
    if volume < 4500:
        return "Heavy"
    return "Severe"


# ----------------------------------------------------------------------
# 2. Load, clean and engineer features
# ----------------------------------------------------------------------
def load_and_clean(path):
    df = pd.read_csv(path)
    df["date_time"] = pd.to_datetime(df["date_time"])
    df = df.sort_values("date_time").reset_index(drop=True)

    df["holiday"] = df["holiday"].fillna("None")

    # 0 Kelvin is physically impossible -> replace with median temperature
    median_temp = df.loc[df["temp"] > 0, "temp"].median()
    df["temp"] = df["temp"].replace(0, median_temp)

    # Time-based features ('year' is intentionally NOT used: tree models cannot
    # extrapolate to years they never saw, so it only hurts future predictions)
    df["hour"] = df["date_time"].dt.hour
    df["day_of_week"] = df["date_time"].dt.dayofweek
    df["month"] = df["date_time"].dt.month
    df["is_weekend"] = (df["day_of_week"] >= 5).astype(int)
    return df, median_temp


def build_features(df):
    encoded = pd.get_dummies(df.drop(columns=["date_time"]), columns=CATEGORICAL, drop_first=True)
    X = encoded.drop(columns=["traffic_volume"])
    y = encoded["traffic_volume"]
    return X, y


def metrics(y_true, y_pred):
    return (
        mean_absolute_error(y_true, y_pred),
        np.sqrt(mean_squared_error(y_true, y_pred)),
        r2_score(y_true, y_pred),
    )


# ----------------------------------------------------------------------
# 3. Evaluate with a chronological split + historical-median baseline
# ----------------------------------------------------------------------
def evaluate(X, y):
    split = int(len(X) * 0.8)
    X_tr, X_te = X.iloc[:split], X.iloc[split:]
    y_tr, y_te = y.iloc[:split], y.iloc[split:]

    model = HistGradientBoostingRegressor(random_state=42, max_iter=100)
    model.fit(X_tr, y_tr)
    y_pred = np.clip(model.predict(X_te), 0, None)

    # Baseline: median traffic for the same (hour, day_of_week) in the training period
    lookup = (
        pd.DataFrame({"hour": X_tr["hour"], "day_of_week": X_tr["day_of_week"], "t": y_tr})
        .groupby(["hour", "day_of_week"])["t"].median().reset_index()
    )
    base = X_te[["hour", "day_of_week"]].merge(lookup, on=["hour", "day_of_week"], how="left")
    y_base = base["t"].fillna(y_tr.median()).values

    mae, rmse, r2 = metrics(y_te, y_pred)
    mae_b, rmse_b, r2_b = metrics(y_te, y_base)
    print("=== Chronological split: Model vs Historical-Median Baseline ===")
    print(f"Model    -> MAE: {mae:.2f} | RMSE: {rmse:.2f} | R2: {r2:.4f}")
    print(f"Baseline -> MAE: {mae_b:.2f} | RMSE: {rmse_b:.2f} | R2: {r2_b:.4f}")

    # Visualisation: first 150 hours of the test period
    sns.set_theme(style="whitegrid")
    plt.figure(figsize=(15, 6))
    n = 150
    plt.plot(y_te.iloc[:n].values, label="Actual", color="black", linewidth=1.5)
    plt.plot(y_pred[:n], label="Predicted (HistGradientBoosting)", color="blue", linestyle="--")
    plt.plot(y_base[:n], label="Historical median baseline", color="red", linestyle=":", alpha=0.6)
    plt.title("Actual vs Predicted Traffic Volume (150-hour sample)")
    plt.xlabel("Hourly samples (chronological)")
    plt.ylabel("Vehicles / hour")
    plt.legend()
    plt.tight_layout()
    plt.savefig("actual_vs_predicted.png", dpi=120)
    plt.show()


# ----------------------------------------------------------------------
# 4. Train the final model on ALL data and save everything the app needs
# ----------------------------------------------------------------------
def main():
    df, median_temp = load_and_clean(DATA_PATH)
    X, y = build_features(df)

    evaluate(X, y)

    final_model = HistGradientBoostingRegressor(random_state=42, max_iter=100)
    final_model.fit(X, y)

    # weather_main -> list of valid weather_description values (for app dropdowns)
    weather_map = df.groupby("weather_main")["weather_description"].unique().apply(sorted).to_dict()

    payload = {
        "model": final_model,
        "feature_names": list(X.columns),
        "median_temp": median_temp,
        "weather_map": weather_map,
        "holidays": sorted(df["holiday"].unique()),
    }
    joblib.dump(payload, "traffic_model_pipeline.pkl")
    print("Saved 'traffic_model_pipeline.pkl'")

    # Quick sanity check: Wed 5 PM, scattered clouds, no holiday
    row = pd.DataFrame([{**{c: 0 for c in X.columns},
                         "temp": 290.0, "clouds_all": 40, "hour": 17,
                         "day_of_week": 2, "month": 10,
                         "weather_main_Clouds": 1,
                         "weather_description_scattered clouds": 1}])[X.columns]
    vol = final_model.predict(row)[0]
    print(f"Test scenario -> {vol:.0f} vehicles/hour ({get_congestion_category(vol)})")


if __name__ == "__main__":
    main()