import streamlit as st # type: ignore
import json
import pandas as pd # type: ignore
import plotly.graph_objects as go  # type: ignore
import numpy as np # type: ignore
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

def compute_avg_series(run_list, key):
    if not run_list:
        return []
    valid = [r for r in run_list if r[key]]
    if not valid:
        return []
    max_len = max(len(r[key]) for r in valid)
    result = []
    for i in range(max_len):
        vals = [r[key][i] for r in valid if i < len(r[key])]
        result.append(sum(vals) / len(vals) if vals else 0)
    return result

def downsample(series, ticks, n=1000):
    series = list(series)
    ticks = list(ticks)
    if len(series) <= n:
        return ticks, series
    step = max(1, len(series) // n)
    return ticks[::step], series[::step]

def avg_trace(run_list, key, smooth_window):
    avg_series = compute_avg_series(run_list, key)
    if not avg_series:
        return [], []
    ticks = list(run_list[0]["ticks"][:len(avg_series)])
    smoothed = smooth_series(avg_series, smooth_window)
    ds_ticks, ds_series = downsample(smoothed, ticks)
    return ds_ticks, ds_series

def run_trace(run, key, smooth_window):
    ds_ticks, ds_series = downsample(
        smooth_series(run[key], smooth_window),
        list(run["ticks"])
    )
    return ds_ticks, ds_series

def get_experiment_group(run_name):
    import re
    match = re.split(r'_runs?\d+$', run_name)
    return match[0] if len(match) > 1 else run_name

# ── Group runs by experiment ──────────────────────────────────────────────────
group_names = []
grouped_runs = {}
for run in runs:
    group = get_experiment_group(run["name"])
    if group not in grouped_runs:
        grouped_runs[group] = []
        group_names.append(group)
    grouped_runs[group].append(run)

lineage_colors = [
    '#333333', '#1f77b4', '#ff7f0e', '#2ca02c', '#f48fb1',
    '#9467bd', '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf'
]

def get_series_color(index):
    return lineage_colors[index % len(lineage_colors)]

def get_group_color(group_name):
    idx = group_names.index(group_name) if group_name in group_names else 0
    return get_series_color(idx)

# ── Summary stats ─────────────────────────────────────────────────────────────
st.header("Summary Statistics")

summary_data = []
for run in runs:
    summary_data.append({
        "Run": run["name"],
        "Group": get_experiment_group(run["name"]),
        "Avg Prey": round(avg(run["prey"]), 1),
        "Avg Predator": round(avg(run["predators"]), 1),
        "Peak Prey": max(run["prey"]) if run["prey"] else 0,
        "Avg Prey Lifespan": round(avg(run["prey_lifespan"]), 1)
            if run["prey_lifespan"] else 0,
        "Avg Alarm strength": round(avg(run["alarm_prob"]), 3)
            if run.get("alarm_prob") else 0,
        "Final Alarm strength": round(run["alarm_prob"][-1], 3)
            if run["alarm_prob"] else 0
        # "Total Alarm Calls": sum(run["alarm_calls"]) if run.get("alarm_calls") else 0
    })

summary_df = pd.DataFrame(summary_data)
st.dataframe(summary_df, use_container_width=True, hide_index=True)

# ── Comparison bar charts ─────────────────────────────────────────────────────
st.header("Run Comparison (Averages Across All Runs)")
tab_labels = group_names + ["📊 All Groups"]
tabs = st.tabs(tab_labels)

for i, group in enumerate(group_names):
    with tabs[i]:
        group_df = summary_df[summary_df["Group"] == group]
        avg_prey = avg(group_df["Avg Prey"].tolist())
        avg_predator = avg(group_df["Avg Predator"].tolist())
        avg_prey_lifespan = avg(group_df["Avg Prey Lifespan"].tolist())
        avg_peak_prey = avg(group_df["Peak Prey"].tolist())
        fig = go.Figure(go.Bar(
            x=["Avg Prey Population", "Avg Predator Population", "Avg Prey Lifespan in ticks", "Peak Prey Population"],
            y=[avg_prey, avg_predator, avg_prey_lifespan, avg_peak_prey],
            text=[f"{avg_prey:.1f}", f"{avg_predator:.1f}", f"{avg_prey_lifespan:.1f}", f"{avg_peak_prey:.1f}"],
            textposition="outside",
            marker_color=["#1f77b4", "#d62728", "#ff7f0e", "#2ca02c"]
        ))
        fig.update_layout(yaxis_title="Value", hovermode="x", height=400)
        st.plotly_chart(fig, use_container_width=True, key=f"chart_comparison_{i}")

with tabs[-1]:
    avg_prey = avg(summary_df["Avg Prey"].tolist())
    avg_predator = avg(summary_df["Avg Predator"].tolist())
    avg_prey_lifespan = avg(summary_df["Avg Prey Lifespan"].tolist())
    avg_peak_prey = avg(summary_df["Peak Prey"].tolist())
    fig = go.Figure(go.Bar(
        x=["Avg Prey Population", "Avg Predator Population", "Avg Prey Lifespan in ticks", "Peak Prey Population"],
        y=[avg_prey, avg_predator, avg_prey_lifespan, avg_peak_prey],
        text=[f"{avg_prey:.1f}", f"{avg_predator:.1f}", f"{avg_prey_lifespan:.1f}", f"{avg_peak_prey:.1f}"],
        textposition="outside",
        marker_color=["#1f77b4", "#d62728", "#ff7f0e", "#2ca02c"]
    ))
    fig.update_layout(yaxis_title="Value", hovermode="x", height=400)
    st.plotly_chart(fig, use_container_width=True, key="chart_comparison_all")

# ── Alarm Strength bar chart ───────────────────────────────────────────────
st.header("Alarm Signal Strength per Run")
tab_labels = group_names + ["📊 All Runs"]
tabs = st.tabs(tab_labels)

for i, group in enumerate(group_names):
    with tabs[i]:
        group_df = summary_df[summary_df["Group"] == group]
        fig = go.Figure()
        fig.add_trace(go.Bar(
            name="Avg Alarm strength",
            x=group_df["Run"],
            y=group_df["Avg Alarm strength"],
            marker_color="#1f77b4"
        ))
        fig.add_trace(go.Bar(
            name="Final Alarm strength",
            x=group_df["Run"],
            y=group_df["Final Alarm strength"],
            marker_color="#ff7f0e"
        ))
        fig.update_layout(
            barmode="group",
            xaxis_title="Run", yaxis_title="Alarm Signal Strength",
            yaxis=dict(range=[0, 1]),
            hovermode="x", height=400
        )
        st.plotly_chart(fig, use_container_width=True, key=f"chart_alarm_strength_{i}")

with tabs[-1]:
    fig = go.Figure()
    fig.add_trace(go.Bar(
        name="Avg Alarm strength",
        x=summary_df["Run"],
        y=summary_df["Avg Alarm strength"],
        marker_color="#1f77b4"
    ))
    fig.add_trace(go.Bar(
        name="Final Alarm strength",
        x=summary_df["Run"],
        y=summary_df["Final Alarm strength"],
        marker_color="#ff7f0e"
    ))
    fig.update_layout(
        barmode="group",
        xaxis_title="Run", yaxis_title="Alarm Signal Strength",
        yaxis=dict(range=[0, 1]),
        hovermode="x", height=400
    )
    st.plotly_chart(fig, use_container_width=True, key="chart_alarm_strength_all")

# ── Helper to build grouped time series chart ─────────────────────────────────
def make_grouped_chart(key, y_label, show_avg, show_individual, chart_key_prefix):
    # tabs: one per group + Compare Groups
    tab_labels = group_names + ["📊 Compare Groups"]
    tabs = st.tabs(tab_labels)

    for i, group in enumerate(group_names):
        with tabs[i]:
            fig = go.Figure()
            group_run_list = grouped_runs[group]
            if show_individual:
                for j, run in enumerate(group_run_list):
                    if not run[key]:
                        continue
                    ds_ticks, ds_series = run_trace(run, key, smooth)
                    fig.add_trace(go.Scatter(
                        x=ds_ticks, y=ds_series,
                        name=run["name"],
                        mode="lines",
                        line=dict(color=get_series_color(j))
                    ))
            if show_avg and group_run_list:
                ds_ticks, ds_series = avg_trace(group_run_list, key, smooth)
                if ds_ticks:
                    fig.add_trace(go.Scatter(
                        x=ds_ticks, y=ds_series,
                        name="Group Average",
                        mode="lines",
                        line=dict(color="black", width=2)
                    ))
            fig.update_layout(
                xaxis_title="Tick", yaxis_title=y_label,
                hovermode="x unified", height=400
            )
            st.plotly_chart(fig, use_container_width=True, key=f"{chart_key_prefix}_{i}")

    # Compare Groups tab
    with tabs[-1]:
        fig = go.Figure()
        for i, group in enumerate(group_names):
            group_run_list = grouped_runs[group]
            ds_ticks, ds_series = avg_trace(group_run_list, key, smooth)
            if ds_ticks:
                fig.add_trace(go.Scatter(
                    x=ds_ticks, y=ds_series,
                    name=group,
                    mode="lines",
                    line=dict(color=get_group_color(group), width=2)
                ))
        fig.update_layout(
            xaxis_title="Tick", yaxis_title=y_label,
            hovermode="x unified", height=400
        )
        st.plotly_chart(fig, use_container_width=True, key=f"{chart_key_prefix}_compare")

# ── Population chart ──────────────────────────────────────────────────────────
st.header("Population Over Time")
pop_tab1, pop_tab2, pop_tab3 = st.tabs(["Prey", "Predators", "Both"])

with pop_tab1:
    make_grouped_chart("prey", "Prey population", show_avg_pop, show_individual_runs, "pop_prey")

with pop_tab2:
    make_grouped_chart("predators", "Predator population", show_avg_pop, show_individual_runs, "pop_pred")

with pop_tab3:
    # Both prey and predators on same chart — handle manually
    tab_labels = group_names + ["📊 Compare Groups"]
    tabs = st.tabs(tab_labels)
    for i, group in enumerate(group_names):
        with tabs[i]:
            fig = go.Figure()
            for j, run in enumerate(grouped_runs[group]):
                if show_individual_runs:
                    ds_ticks, ds_series = run_trace(run, "prey", smooth)
                    fig.add_trace(go.Scatter(x=ds_ticks, y=ds_series, name=f"{run['name']} — prey", mode="lines", line=dict(color=get_series_color(j))))
                    ds_ticks, ds_series = run_trace(run, "predators", smooth)
                    fig.add_trace(go.Scatter(x=ds_ticks, y=ds_series, name=f"{run['name']} — predators", mode="lines", line=dict(color=get_series_color(j), dash="dot")))
            if show_avg_pop:
                ds_ticks, ds_series = avg_trace(grouped_runs[group], "prey", smooth)
                if ds_ticks:
                    fig.add_trace(go.Scatter(x=ds_ticks, y=ds_series, name="Avg prey", mode="lines", line=dict(color="black", width=2)))
                ds_ticks, ds_series = avg_trace(grouped_runs[group], "predators", smooth)
                if ds_ticks:
                    fig.add_trace(go.Scatter(x=ds_ticks, y=ds_series, name="Avg predators", mode="lines", line=dict(color="red", width=2)))
            fig.update_layout(xaxis_title="Tick", yaxis_title="Population", hovermode="x unified", height=400)
            st.plotly_chart(fig, use_container_width=True, key=f"pop_both_{i}")
    with tabs[-1]:
        fig = go.Figure()
        for i, group in enumerate(group_names):
            ds_ticks, ds_series = avg_trace(grouped_runs[group], "prey", smooth)
            if ds_ticks:
                fig.add_trace(go.Scatter(x=ds_ticks, y=ds_series, name=f"{group} — prey", mode="lines", line=dict(color=get_group_color(group), width=2)))
            ds_ticks, ds_series = avg_trace(grouped_runs[group], "predators", smooth)
            if ds_ticks:
                fig.add_trace(go.Scatter(x=ds_ticks, y=ds_series, name=f"{group} — predators", mode="lines", line=dict(color=get_group_color(group), width=2, dash="dot")))
        fig.update_layout(xaxis_title="Tick", yaxis_title="Population", hovermode="x unified", height=400)
        st.plotly_chart(fig, use_container_width=True, key="pop_both_compare")

# ── Lifespan chart ────────────────────────────────────────────────────────────
st.header("Average Lifespan Over Time")
life_tab1, life_tab2 = st.tabs(["Prey lifespan", "Predator lifespan"])

with life_tab1:
    make_grouped_chart("prey_lifespan", "Avg lifespan (ticks)", show_avg_lifespan, show_individual_runs, "lifespan_prey")

with life_tab2:
    make_grouped_chart("predator_lifespan", "Avg lifespan (ticks)", show_avg_lifespan, show_individual_runs, "lifespan_pred")

# ── Alarm Strength chart ───────────────────────────────────────────────────
st.header("Average Alarm Strength Over Time")
make_grouped_chart("alarm_prob", "Average p", False, show_individual_runs, "alarm_prob_chart")

# ── Alarm calls chart ─────────────────────────────────────────────────────────
# st.header("Alarm Calls Over Time")
# tab_labels = group_names + ["📊 Compare Groups"]
# tabs = st.tabs(tab_labels)
# for i, group in enumerate(group_names):
#     with tabs[i]:
#         fig = go.Figure()
#         for j, run in enumerate(grouped_runs[group]):
#             if run["alarm_calls"] and run["alarm_call_ticks"]:
#                 ds_ticks, ds_series = downsample(
#                     smooth_series(run["alarm_calls"], smooth),
#                     list(run["alarm_call_ticks"])
#                 )
#                 fig.add_trace(go.Scatter(x=ds_ticks, y=ds_series, name=run["name"], mode="lines", line=dict(color=get_series_color(j))))
#         fig.update_layout(xaxis_title="Tick", yaxis_title="Alarm calls per window", hovermode="x unified", height=400)
#         st.plotly_chart(fig, use_container_width=True, key=f"alarm_calls_{i}")
# with tabs[-1]:
#     fig = go.Figure()
#     for i, group in enumerate(group_names):
#         group_runs_with_calls = [r for r in grouped_runs[group] if r["alarm_calls"] and r["alarm_call_ticks"]]
#         if group_runs_with_calls:
#             ds_ticks, ds_series = avg_trace(group_runs_with_calls, "alarm_calls", smooth)
#             if ds_ticks:
#                 fig.add_trace(go.Scatter(x=ds_ticks, y=ds_series, name=group, mode="lines", line=dict(color=get_group_color(group), width=2)))
#     fig.update_layout(xaxis_title="Tick", yaxis_title="Alarm calls per window", hovermode="x unified", height=400)
#     st.plotly_chart(fig, use_container_width=True, key="alarm_calls_compare")

# ── Lineage population chart ──────────────────────────────────────────────────
# st.header("Lineage Population Over Time")
# if any(run["lineage_counts"] for run in runs):
#     lineage_tabs = st.tabs([run["name"] for run in runs])
#     for tab_idx, (tab, run) in enumerate(zip(lineage_tabs, runs)):
#         with tab:
#             if not run["lineage_counts"]:
#                 st.info("No lineage counts available for this run.")
#                 continue
#             lineage_ids = sorted({lid for record in run["lineage_counts"] for lid in record.keys()})
#             fig = go.Figure()
#             for i, lid in enumerate(lineage_ids):
#                 series = [record.get(lid, 0) for record in run["lineage_counts"]]
#                 ds_ticks, ds_series = downsample(smooth_series(series, smooth), list(run["ticks"]))
#                 fig.add_trace(go.Scatter(x=ds_ticks, y=ds_series, name=f"{lid}", mode="lines", line=dict(color=get_series_color(i))))
#             fig.update_layout(xaxis_title="Tick", yaxis_title="Organisms", hovermode="x unified", height=400)
#             st.plotly_chart(fig, use_container_width=True, key=f"chart_lineage_{tab_idx}")
# else:
#     st.info("No lineage population data available in uploaded runs.")

# ── Box plot of final alarm Strength ───────────────────────────────────────
st.header("Final Alarm Strength Distribution by Experiment")

groups_box = {}
for run in runs:
    group = get_experiment_group(run["name"])
    if group not in groups_box:
        groups_box[group] = []
    if run["alarm_prob"]:
        groups_box[group].append(run["alarm_prob"][-1])

if groups_box:
    fig = go.Figure()
    for i, (group, values) in enumerate(groups_box.items()):
        fig.add_trace(go.Box(
            y=values,
            name=group,
            marker_color=get_group_color(group),
            boxpoints="all",
            jitter=0.3,
            pointpos=-1.8
        ))
    fig.update_layout(yaxis_title="Final Alarm p", yaxis=dict(range=[0, 1]), hovermode="closest", height=400)
    st.plotly_chart(fig, use_container_width=True, key="chart_box_alarm_p")

# ── Scatter: avg alarm strength vs prey lifespan ──────────────────────────
st.header("Average Alarm Strength vs Prey Lifespan")

scatter_x, scatter_y, scatter_names, scatter_colors = [], [], [], []
for i, run in enumerate(runs):
    if run["alarm_prob"] and run["prey_lifespan"]:
        scatter_x.append(round(avg(run["alarm_prob"]), 3))
        scatter_y.append(round(avg(run["prey_lifespan"]), 1))
        scatter_names.append(run["name"])
        scatter_colors.append(get_group_color(get_experiment_group(run["name"])))

if scatter_x:
    fig = go.Figure()
    
    # plot one trace per group so legend shows group names
    for i, group in enumerate(group_names):
        gx, gy, gnames = [], [], []
        for j, run in enumerate(runs):
            if get_experiment_group(run["name"]) != group:
                continue
            if run["alarm_prob"] and run["prey_lifespan"]:
                gx.append(round(avg(run["alarm_prob"]), 3))
                gy.append(round(avg(run["prey_lifespan"]), 1))
                gnames.append(run["name"])
        if gx:
            fig.add_trace(go.Scatter(
                x=gx, y=gy,
                mode="markers+text",
                name=group,
                text=gnames,
                textposition="top center",
                marker=dict(color=get_group_color(group), size=10),
                hovertemplate="<b>%{text}</b><br>Avg p: %{x}<br>Avg lifespan: %{y}<extra></extra>"
            ))

    if len(scatter_x) > 1:
        z = np.polyfit(scatter_x, scatter_y, 1)
        p_fit = np.poly1d(z)
        x_line = sorted(scatter_x)
        fig.add_trace(go.Scatter(
            x=x_line, y=[p_fit(xi) for xi in x_line],
            mode="lines", name="Trend",
            line=dict(color="gray", dash="dash", width=1)
        ))

    fig.update_layout(
        xaxis_title="Average Alarm Strenth",
        yaxis_title="Average Prey Lifespan (ticks)",
        hovermode="closest", height=400
    )
    st.plotly_chart(fig, use_container_width=True, key="chart_scatter_p_lifespan")

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
            "alarm_strength": run["alarm_prob"] if run["alarm_prob"] else [0] * len(run["ticks"])
        })
        st.dataframe(df, use_container_width=True)
        st.download_button(
            f"Download {run['name']} as CSV",
            df.to_csv(index=False),
            f"{run['name']}.csv",
            "text/csv"
        )