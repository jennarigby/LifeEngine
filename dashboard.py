import streamlit as st # type: ignore
import json
import pandas as pd # type: ignore
import plotly.graph_objects as go  # type: ignore
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
    records = data.get("records", data)
    return {
        "name": filename.replace(".json", ""),
        "ticks": records.get("tick_record", []),
        "pop": records.get("pop_counts", []),
        "prey": records.get("prey_counts", []),
        "predators": records.get("predator_counts", []),
        "prey_lifespan": records.get("prey_avg_lifespan", []),
        "predator_lifespan": records.get("predator_avg_lifespan", []),
        "alarm_prob": records.get("av_alarm_probs", []),
        "alarm_calls": records.get("alarm_call_counts", []),
        "alarm_call_ticks": records.get("alarm_call_ticks", records.get("tick_record", [])),
        "mut_rates": records.get("av_mut_rates", []),
        "species": records.get("species_counts", []),
        "lineage_counts": records.get("lineage_counts", []),
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
show_individual_runs = st.sidebar.checkbox("Show individual runs", value=True)
show_avg_pop = st.sidebar.checkbox("Show average line (Population)", value=False)
show_avg_lifespan = st.sidebar.checkbox("Show average line (Lifespan)", value=False)

# ── Helper functions ──────────────────────────────────────────────────────────
def smooth_series(series, window):
    if window <= 1:
        return series
    s = pd.Series(series)
    return s.rolling(window, min_periods=1).mean().tolist()

def avg(series):
    return sum(series) / len(series) if series else 0

def compute_avg_series(runs, key):
    if not runs:
        return []
    max_len = max(len(r[key]) for r in runs if r[key])
    result = []
    for i in range(max_len):
        vals = [r[key][i] for r in runs if r[key] and i < len(r[key])]
        result.append(sum(vals) / len(vals) if vals else 0)
    return result

def downsample(series, ticks, n=1000):
    series = list(series)
    ticks = list(ticks)
    if len(series) <= n:
        return ticks, series
    step = max(1, len(series) // n)
    return ticks[::step], series[::step]

def avg_trace(runs, key, smooth_window):
    avg_series = compute_avg_series(runs, key)
    ticks = list(runs[0]["ticks"][:len(avg_series)])
    smoothed = smooth_series(avg_series, smooth_window)
    ds_ticks, ds_series = downsample(smoothed, ticks)
    return ds_ticks, ds_series

def run_trace(run, key, smooth_window):
    ds_ticks, ds_series = downsample(
        smooth_series(run[key], smooth_window),
        list(run["ticks"])
    )
    return ds_ticks, ds_series

lineage_colors = [
    '#333333', '#1f77b4', '#ff7f0e', '#2ca02c', '#f48fb1',
    '#9467bd', '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf'
]

def get_series_color(index):
    return lineage_colors[index % len(lineage_colors)]

# ── Summary stats ─────────────────────────────────────────────────────────────
st.header("Summary Statistics")

summary_data = []
for run in runs:
    summary_data.append({
        "Run": run["name"],
        "Avg Prey": round(avg(run["prey"]), 1),
        "Peak Prey": max(run["prey"]) if run["prey"] else 0,
        "Avg Prey Lifespan": round(avg(run["prey_lifespan"]), 1)
            if run["prey_lifespan"] else 0,
        "Avg Alarm p": round(avg(run["alarm_prob"]), 3)
            if run.get("alarm_prob") else 0,
        "Final Alarm p": round(run["alarm_prob"][-1], 3)
            if run["alarm_prob"] else 0,
        "Total Alarm Calls": sum(run["alarm_calls"]) if run.get("alarm_calls") else 0
    })

summary_df = pd.DataFrame(summary_data)
st.dataframe(summary_df, use_container_width=True, hide_index=True)

# ── Comparison bar charts ─────────────────────────────────────────────────────
st.header("Run Comparison (Averages Across All Runs)")

avg_prey = avg(summary_df["Avg Prey"].tolist())
avg_prey_lifespan = avg(summary_df["Avg Prey Lifespan"].tolist())
avg_peak_prey = avg(summary_df["Peak Prey"].tolist())

fig = go.Figure(go.Bar(
    x=["Avg Prey Population", "Avg Prey Lifespan in ticks", "Peak Prey Population"],
    y=[avg_prey, avg_prey_lifespan, avg_peak_prey],
    text=[f"{avg_prey:.1f}", f"{avg_prey_lifespan:.1f}", f"{avg_peak_prey:.1f}"],
    textposition="outside",
    marker_color=["#1f77b4", "#ff7f0e", "#2ca02c"]
))
fig.update_layout(yaxis_title="Value", hovermode="x", height=400)
st.plotly_chart(fig, use_container_width=True, key="chart_1")

# Alarm Probability Bar Chart
st.header("Alarm Probability per Run")
fig = go.Figure()
fig.add_trace(go.Bar(
    name="Avg Alarm p",
    x=summary_df["Run"],
    y=summary_df["Avg Alarm p"],
    marker_color="#1f77b4"
))
fig.add_trace(go.Bar(
    name="Final Alarm p",
    x=summary_df["Run"],
    y=summary_df["Final Alarm p"],
    marker_color="#ff7f0e"
))
fig.update_layout(
    barmode="group",
    xaxis_title="Run",
    yaxis_title="Alarm p",
    yaxis=dict(range=[0, 1]),
    hovermode="x",
    height=400
)
st.plotly_chart(fig, use_container_width=True, key="chart_alarm_p")

st.header("Surviving Lineage per Run")
surviving_lineages = []
for run in runs:
    if run["lineage_counts"] and run["lineage_counts"][-1]:
        last = run["lineage_counts"][-1]
        surviving = max(last, key=last.get)
    else:
        surviving = "unknown"
    surviving_lineages.append(surviving)

# get all lineage ids in sorted order to match the lineage chart colours
all_lineage_ids = sorted({lid for run in runs if run["lineage_counts"] 
                          for record in run["lineage_counts"] for lid in record.keys()})

def lineage_color(lineage_id):
    if lineage_id in all_lineage_ids:
        return lineage_colors[all_lineage_ids.index(lineage_id) % len(lineage_colors)]
    return "#cccccc"

fig = go.Figure(go.Bar(
    x=summary_df["Run"],
    y=[1] * len(runs),
    marker_color=[lineage_color(lid) for lid in surviving_lineages],
    text=surviving_lineages,
    textposition="inside",
    hovertext=surviving_lineages,
    hoverinfo="text+x"
))
fig.update_layout(
    xaxis_title="Run",
    yaxis=dict(visible=False),
    height=200
)
st.plotly_chart(fig, use_container_width=True, key="chart_surviving_lineage")

# ── Population chart ──────────────────────────────────────────────────────────
st.header("Population Over Time")
tab1, tab2, tab3 = st.tabs(["Prey", "Predators", "Both"])

with tab1:
    fig = go.Figure()
    if show_individual_runs:
        for i, run in enumerate(runs):
            ds_ticks, ds_series = run_trace(run, "prey", smooth)
            fig.add_trace(go.Scatter(
                x=ds_ticks, y=ds_series,
                name=run["name"],
                mode="lines",
                line=dict(color=get_series_color(i))
            ))
    if show_avg_pop and runs:
        ds_ticks, ds_series = avg_trace(runs, "prey", smooth)
        fig.add_trace(go.Scatter(
            x=ds_ticks, y=ds_series,
            name="Average",
            line=dict(color="black", width=2, dash="solid")
        ))
    fig.update_layout(
        xaxis_title="Tick", yaxis_title="Prey population",
        hovermode="x unified", height=400
    )
    st.plotly_chart(fig, use_container_width=True, key="chart_3")

with tab2:
    fig = go.Figure()
    if show_individual_runs:
        for i, run in enumerate(runs):
            ds_ticks, ds_series = run_trace(run, "predators", smooth)
            fig.add_trace(go.Scatter(
                x=ds_ticks, y=ds_series,
                name=run["name"],
                mode="lines",
                line=dict(color=get_series_color(i))
            ))
    if show_avg_pop and runs:
        ds_ticks, ds_series = avg_trace(runs, "predators", smooth)
        fig.add_trace(go.Scatter(
            x=ds_ticks, y=ds_series,
            name="Average",
            line=dict(color="black", width=2, dash="solid")
        ))
    fig.update_layout(
        xaxis_title="Tick", yaxis_title="Predator population",
        hovermode="x unified", height=400
    )
    st.plotly_chart(fig, use_container_width=True, key="chart_4")

with tab3:
    fig = go.Figure()
    if show_individual_runs:
        for i, run in enumerate(runs):
            ds_ticks_prey, ds_series_prey = run_trace(run, "prey", smooth)
            ds_ticks_pred, ds_series_pred = run_trace(run, "predators", smooth)
            fig.add_trace(go.Scatter(
                x=ds_ticks_prey, y=ds_series_prey,
                name=f"{run['name']} — prey",
                line=dict(color=get_series_color(i))
            ))
            fig.add_trace(go.Scatter(
                x=ds_ticks_pred, y=ds_series_pred,
                name=f"{run['name']} — predators",
                line=dict(color=get_series_color(i), dash="solid")
            ))
    if show_avg_pop and runs:
        ds_ticks_prey, ds_series_prey = avg_trace(runs, "prey", smooth)
        ds_ticks_pred, ds_series_pred = avg_trace(runs, "predators", smooth)
        fig.add_trace(go.Scatter(
            x=ds_ticks_prey, y=ds_series_prey,
            name="Average — prey",
            line=dict(color="black", width=2)
        ))
        fig.add_trace(go.Scatter(
            x=ds_ticks_pred, y=ds_series_pred,
            name="Average — predators",
            line=dict(color="black", width=2, dash="solid")
        ))
    fig.update_layout(
        xaxis_title="Tick", yaxis_title="Population",
        hovermode="x unified", height=400
    )
    st.plotly_chart(fig, use_container_width=True, key="chart_5")

# ── Lifespan chart ────────────────────────────────────────────────────────────
st.header("Average Lifespan Over Time")
tab4, tab5 = st.tabs(["Prey lifespan", "Predator lifespan"])

with tab4:
    fig = go.Figure()
    if show_individual_runs:
        for i, run in enumerate(runs):
            ds_ticks, ds_series = run_trace(run, "prey_lifespan", smooth)
            fig.add_trace(go.Scatter(
                x=ds_ticks, y=ds_series,
                name=run["name"],
                mode="lines",
                line=dict(color=get_series_color(i))
            ))
    if show_avg_lifespan and runs:
        ds_ticks, ds_series = avg_trace(runs, "prey_lifespan", smooth)
        fig.add_trace(go.Scatter(
            x=ds_ticks, y=ds_series,
            name="Average",
            line=dict(color="black", width=2, dash="solid")
        ))
    fig.update_layout(
        xaxis_title="Tick", yaxis_title="Avg lifespan (ticks)",
        hovermode="x unified", height=400
    )
    st.plotly_chart(fig, use_container_width=True, key="chart_6")

with tab5:
    fig = go.Figure()
    if show_individual_runs:
        for i, run in enumerate(runs):
            ds_ticks, ds_series = run_trace(run, "predator_lifespan", smooth)
            fig.add_trace(go.Scatter(
                x=ds_ticks, y=ds_series,
                name=run["name"],
                mode="lines",
                line=dict(color=get_series_color(i))
            ))
    if show_avg_lifespan and runs:
        ds_ticks, ds_series = avg_trace(runs, "predator_lifespan", smooth)
        fig.add_trace(go.Scatter(
            x=ds_ticks, y=ds_series,
            name="Average",
            line=dict(color="black", width=2, dash="solid")
        ))
    fig.update_layout(
        xaxis_title="Tick", yaxis_title="Avg lifespan (ticks)",
        hovermode="x unified", height=400
    )
    st.plotly_chart(fig, use_container_width=True, key="chart_7")

# ── Alarm probability chart ───────────────────────────────────────────────────
st.header("Average Alarm Probability (p) Over Time")
fig = go.Figure()
for i, run in enumerate(runs):
    if run["alarm_prob"]:
        ds_ticks, ds_series = run_trace(run, "alarm_prob", smooth)
        fig.add_trace(go.Scatter(
            x=ds_ticks, y=ds_series,
            name=run["name"],
            mode="lines",
            line=dict(color=get_series_color(i))
        ))
fig.add_hline(y=0.5, line_dash="dot", line_color="gray",
              annotation_text="Starting p=0.5")
fig.update_layout(
    xaxis_title="Tick", yaxis_title="Average p",
    yaxis=dict(range=[0, 1]),
    hovermode="x unified", height=400
)
st.plotly_chart(fig, use_container_width=True, key="chart_8")

# ── Alarm calls chart ─────────────────────────────────────────────────────────
st.header("Alarm Calls Over Time")
fig = go.Figure()
for i, run in enumerate(runs):
    if run["alarm_calls"] and run["alarm_call_ticks"]:
        ds_ticks, ds_series = downsample(
            smooth_series(run["alarm_calls"], smooth),
            list(run["alarm_call_ticks"])
        )
        fig.add_trace(go.Scatter(
            x=ds_ticks, y=ds_series,
            name=run["name"],
            mode="lines",
            line=dict(color=get_series_color(i))
        ))
fig.update_layout(
    xaxis_title="Tick", yaxis_title="Alarm calls per window",
    hovermode="x unified", height=400
)
st.plotly_chart(fig, use_container_width=True, key="chart_9")

# ── Lineage population chart ──────────────────────────────────────────────────
st.header("Lineage Population Over Time")
if any(run["lineage_counts"] for run in runs):
    lineage_tabs = st.tabs([run["name"] for run in runs])
    for tab_idx, (tab, run) in enumerate(zip(lineage_tabs, runs)):
        with tab:
            if not run["lineage_counts"]:
                st.info("No lineage counts available for this run.")
                continue
            lineage_ids = sorted({lid for record in run["lineage_counts"] for lid in record.keys()})
            fig = go.Figure()
            for i, lid in enumerate(lineage_ids):
                series = [record.get(lid, 0) for record in run["lineage_counts"]]
                ds_ticks, ds_series = downsample(
                    smooth_series(series, smooth),
                    list(run["ticks"])
                )
                fig.add_trace(go.Scatter(
                    x=ds_ticks, y=ds_series,
                    name=f"{lid}",
                    line=dict(color=get_series_color(i))
                ))
            fig.update_layout(
                xaxis_title="Tick", yaxis_title="Organisms",
                hovermode="x unified", height=400
            )
            st.plotly_chart(fig, use_container_width=True, key=f"chart_lineage_{tab_idx}")
else:
    st.info("No lineage population data available in uploaded runs.")

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