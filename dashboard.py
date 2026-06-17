import streamlit as st
import json
import pandas as pd
import plotly.graph_objects as go
import plotly.express as px
from pathlib import Path

st.set_page_config(
    page_title="Altruism Simulation Dashboard",
    page_icon="🧬",
    layout="wide"
)

st.title("🧬 ALife Simulation Dashboard")
st.markdown("Upload simulation run files to compare results across experiments.")

# ── File upload ──────────────────────────────────────────────────────────────
uploaded_files = st.file_uploader(
    "Upload simulation JSON exports",
    type="json",
    accept_multiple_files=True
)

if not uploaded_files:
    st.info("Upload one or more simulation JSON files to get started.")
    st.stop()

# ── Load and parse data ───────────────────────────────────────────────────────
@st.cache_data
def load_run(file_bytes, filename):
    data = json.loads(file_bytes)
    records = data.get("records", data)  # handle both raw and wrapped format
    return {
        "name": filename.replace(".json", ""),
        "ticks": records.get("tick_record", []),
        "pop": records.get("pop_counts", []),
        "prey": records.get("prey_counts", []),
        "predators": records.get("predator_counts", []),
        "prey_lifespan": records.get("prey_avg_lifespan", []),
        "predator_lifespan": records.get("predator_avg_lifespan", []),
        "alarm_prob": records.get("av_alarm_probs", []),
        "mut_rates": records.get("av_mut_rates", []),
        "species": records.get("species_counts", []),
    }

runs = []
for f in uploaded_files:
    run = load_run(f.read(), f.name)
    runs.append(run)

st.success(f"Loaded {len(runs)} run(s): {', '.join(r['name'] for r in runs)}")

# ── Sidebar controls ──────────────────────────────────────────────────────────
st.sidebar.header("Display Options")
selected_runs = st.sidebar.multiselect(
    "Select runs to display",
    options=[r["name"] for r in runs],
    default=[r["name"] for r in runs]
)
runs = [r for r in runs if r["name"] in selected_runs]

smooth = st.sidebar.slider("Smoothing window", 1, 50, 5)

def smooth_series(series, window):
    if window <= 1:
        return series
    s = pd.Series(series)
    return s.rolling(window, min_periods=1).mean().tolist()

# ── Summary stats ─────────────────────────────────────────────────────────────
st.header("Summary Statistics")

summary_data = []

for run in runs:
    summary_data.append({
        "Run": run["name"],
        "Ticks": run["ticks"][-1] if run["ticks"] else 0,
        "Peak Prey": max(run["prey"]) if run["prey"] else 0,
        "Peak Predators": max(run["predators"]) if run["predators"] else 0,
        "Final Prey": run["prey"][-1] if run["prey"] else 0,
        "Final Predators": run["predators"][-1] if run["predators"] else 0,
        "Final Alarm p": round(run["alarm_prob"][-1], 3)
            if run["alarm_prob"] else 0
    })

st.dataframe(
    pd.DataFrame(summary_data),
    use_container_width=True,
    hide_index=True
)

# ── Population chart ──────────────────────────────────────────────────────────
st.header("Population Over Time")
tab1, tab2, tab3 = st.tabs(["Prey", "Predators", "Both"])

colors_prey = px.colors.qualitative.Set2
colors_pred = px.colors.qualitative.Set1

with tab1:
    fig = go.Figure()
    for i, run in enumerate(runs):
        fig.add_trace(go.Scatter(
            x=run["ticks"],
            y=smooth_series(run["prey"], smooth),
            name=run["name"],
            line=dict(color=colors_prey[i % len(colors_prey)])
        ))
    fig.update_layout(
        xaxis_title="Tick", yaxis_title="Prey population",
        hovermode="x unified", height=400
    )
    st.plotly_chart(fig, use_container_width=True)

with tab2:
    fig = go.Figure()
    for i, run in enumerate(runs):
        fig.add_trace(go.Scatter(
            x=run["ticks"],
            y=smooth_series(run["predators"], smooth),
            name=run["name"],
            line=dict(color=colors_pred[i % len(colors_pred)])
        ))
    fig.update_layout(
        xaxis_title="Tick", yaxis_title="Predator population",
        hovermode="x unified", height=400
    )
    st.plotly_chart(fig, use_container_width=True)

with tab3:
    fig = go.Figure()
    for i, run in enumerate(runs):
        fig.add_trace(go.Scatter(
            x=run["ticks"],
            y=smooth_series(run["prey"], smooth),
            name=f"{run['name']} — prey",
            line=dict(color=colors_prey[i % len(colors_prey)])
        ))
        fig.add_trace(go.Scatter(
            x=run["ticks"],
            y=smooth_series(run["predators"], smooth),
            name=f"{run['name']} — predators",
            line=dict(color=colors_pred[i % len(colors_pred)], dash="dash")
        ))
    fig.update_layout(
        xaxis_title="Tick", yaxis_title="Population",
        hovermode="x unified", height=400
    )
    st.plotly_chart(fig, use_container_width=True)

# ── Lifespan chart ────────────────────────────────────────────────────────────
st.header("Average Lifespan Over Time")
tab4, tab5 = st.tabs(["Prey lifespan", "Predator lifespan"])

with tab4:
    fig = go.Figure()
    for i, run in enumerate(runs):
        fig.add_trace(go.Scatter(
            x=run["ticks"],
            y=smooth_series(run["prey_lifespan"], smooth),
            name=run["name"],
            line=dict(color=colors_prey[i % len(colors_prey)])
        ))
    fig.update_layout(
        xaxis_title="Tick", yaxis_title="Avg lifespan (ticks)",
        hovermode="x unified", height=400
    )
    st.plotly_chart(fig, use_container_width=True)

with tab5:
    fig = go.Figure()
    for i, run in enumerate(runs):
        fig.add_trace(go.Scatter(
            x=run["ticks"],
            y=smooth_series(run["predator_lifespan"], smooth),
            name=run["name"],
            line=dict(color=colors_pred[i % len(colors_pred)])
        ))
    fig.update_layout(
        xaxis_title="Tick", yaxis_title="Avg lifespan (ticks)",
        hovermode="x unified", height=400
    )
    st.plotly_chart(fig, use_container_width=True)

# ── Alarm probability chart ───────────────────────────────────────────────────
st.header("Average Alarm Probability (p) Over Time")
fig = go.Figure()
for i, run in enumerate(runs):
    if run["alarm_prob"]:
        fig.add_trace(go.Scatter(
            x=run["ticks"],
            y=smooth_series(run["alarm_prob"], smooth),
            name=run["name"],
            line=dict(color=colors_prey[i % len(colors_prey)])
        ))
fig.add_hline(y=0.5, line_dash="dot", line_color="gray",
              annotation_text="Starting p=0.5")
fig.update_layout(
    xaxis_title="Tick", yaxis_title="Average p",
    yaxis=dict(range=[0, 1]),
    hovermode="x unified", height=400
)
st.plotly_chart(fig, use_container_width=True)

# ── Raw data table ────────────────────────────────────────────────────────────
st.header("Raw Data")
for run in runs:
    with st.expander(f"Raw data — {run['name']}"):
        df = pd.DataFrame({
            "tick": run["ticks"],
            "prey": run["prey"],
            "predators": run["predators"],
            "prey_lifespan": run["prey_lifespan"],
            "predator_lifespan": run["predator_lifespan"],
            "alarm_probability": run["alarm_prob"] if run["alarm_prob"] else [0] * len(run["ticks"])
        })
        st.dataframe(df, use_container_width=True)
        st.download_button(
            f"Download {run['name']} as CSV",
            df.to_csv(index=False),
            f"{run['name']}.csv",
            "text/csv"
        )