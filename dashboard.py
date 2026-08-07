import streamlit as st
import json
import pandas as pd
import plotly.graph_objects as go
import plotly.express as px
import numpy as np
import re
from pathlib import Path

st.set_page_config(
    page_title="Altruism Simulation Dashboard",
    page_icon="🧬",
    layout="wide"
)

st.title("🧬 ALife Simulation Dashboard")
st.markdown("Upload simulation run files. Files should be named like `control_seed1_run3.json` or `p0.5_seed2_run7.json`.")

# ── File upload ───────────────────────────────────────────────────────────────
uploaded_files = st.file_uploader(
    "Upload simulation JSON exports",
    type="json",
    accept_multiple_files=True
)

if not uploaded_files:
    st.info("Upload one or more simulation JSON files to get started.")
    st.stop()

# ── Parse filename into group/seed/run ────────────────────────────────────────
def parse_filename(filename):
    name = filename.replace(".json", "")
    seed_match = re.search(r'seed(\d+)', name)
    run_match = re.search(r'run(\d+)', name)
    seed = int(seed_match.group(1)) if seed_match else 0
    run = int(run_match.group(1)) if run_match else 0
    group = name.split("_seed")[0] if "_seed" in name else name
    return group, seed, run

# ── Load data ─────────────────────────────────────────────────────────────────
@st.cache_data
def load_run(file_bytes, filename):
    data = json.loads(file_bytes)
    records = data.get("records", data)
    group, seed, run = parse_filename(filename)
    return {
        "filename": filename,
        "name": filename.replace(".json", ""),
        "group": group,
        "seed": seed,
        "run": run,
        "ticks": records.get("tick_record", []),
        "pop": records.get("pop_counts", []),
        "prey": records.get("prey_counts", []),
        "predators": records.get("predator_counts", []),
        "prey_lifespan": records.get("prey_avg_lifespan", []),
        "predator_lifespan": records.get("predator_avg_lifespan", []),
        "alarm_prob": records.get("av_alarm_probs", []),
        "species": records.get("species_counts", []),
    }

runs = []
for f in uploaded_files:
    run = load_run(f.read(), f.name)
    runs.append(run)

all_groups = sorted(set(r["group"] for r in runs))
all_seeds = sorted(set(r["seed"] for r in runs))
group_names = all_groups

st.success(f"Loaded {len(runs)} run(s) across {len(all_groups)} group(s) and {len(all_seeds)} seed(s).")

# ── Sidebar controls ──────────────────────────────────────────────────────────
st.sidebar.header("Display Options")

view_mode = st.sidebar.radio(
    "View mode",
    ["Group comparison (averaged)", "Per-seed comparison", "Individual runs"]
)

selected_groups = st.sidebar.multiselect(
    "Groups to show",
    options=all_groups,
    default=all_groups
)

selected_seeds = st.sidebar.multiselect(
    "Seeds to show",
    options=all_seeds,
    default=all_seeds
)

smooth = st.sidebar.slider("Smoothing window", 1, 100, 1)

def smooth_series(series, window):
    if window <= 1 or not series:
        return series
    s = pd.Series(series)
    return s.rolling(window, min_periods=1).mean().tolist()

def avg(series):
    return round(sum(series) / len(series), 2) if series else 0

# ── Color helpers ─────────────────────────────────────────────────────────────
colors = px.colors.qualitative.Set2
colors_pred = px.colors.qualitative.Set1

group_color_map = {group: colors[i % len(colors)] for i, group in enumerate(all_groups)}

def get_group_color(group):
    return group_color_map.get(group, "#888888")

def get_color(name, index, pred=False):
    palette = colors_pred if pred else colors
    return palette[index % len(palette)]

def get_experiment_group(run_name):
    for g in all_groups:
        if run_name.startswith(g):
            return g
    return run_name.split("_seed")[0] if "_seed" in run_name else run_name

# ── Interpolation helpers ─────────────────────────────────────────────────────
def interpolate_to_ticks(ticks, values, target_ticks):
    if not ticks or not values:
        return [None] * len(target_ticks)
    tick_val_pairs = {}
    for t, v in zip(ticks, values):
        tick_val_pairs[t] = v
    clean_ticks = list(tick_val_pairs.keys())
    clean_values = list(tick_val_pairs.values())
    s = pd.Series(clean_values, index=clean_ticks)
    s = s.reindex(s.index.union(target_ticks)).interpolate(method='index').reindex(target_ticks)
    return s.tolist()

def get_common_ticks(run_list):
    if not run_list:
        return []
    max_tick = max(r["ticks"][-1] for r in run_list if r["ticks"])
    steps = [r["ticks"][1] - r["ticks"][0] for r in run_list if len(r["ticks"]) > 1]
    step = max(set(steps), key=steps.count) if steps else 100
    return list(range(0, max_tick + step, step))

def average_runs(run_list, field):
    if not run_list:
        return [], [], []
    target_ticks = get_common_ticks(run_list)
    interpolated = [interpolate_to_ticks(r["ticks"], r[field], target_ticks) for r in run_list]
    df = pd.DataFrame(interpolated).T
    avg_vals = df.mean(axis=1).tolist()
    std_vals = df.std(axis=1).tolist()
    return target_ticks, avg_vals, std_vals

# ── Filter runs ───────────────────────────────────────────────────────────────
filtered_runs = [r for r in runs if r["group"] in selected_groups and r["seed"] in selected_seeds]

# ── Summary stats ─────────────────────────────────────────────────────────────
st.header("Summary Statistics")

summary_rows = []
for r in filtered_runs:
    summary_rows.append({
        "Run": r["name"],
        "Group": r["group"],
        "Seed": r["seed"],
        "Avg Prey": avg(r["prey"]),
        "Avg Predator": avg(r["predators"]),
        "Avg Prey Lifespan": avg(r["prey_lifespan"]),
        "Peak Prey": max(r["prey"]) if r["prey"] else 0,
        "Avg Alarm strength": avg(r["alarm_prob"]) if r["alarm_prob"] else 0,
        "Final Alarm strength": round(r["alarm_prob"][-1], 3) if r["alarm_prob"] else 0,
    })
summary_df = pd.DataFrame(summary_rows)

if view_mode == "Group comparison (averaged)":
    rows = []
    for group in selected_groups:
        group_runs = [r for r in filtered_runs if r["group"] == group]
        if not group_runs:
            continue
        rows.append({
            "Group": group,
            "Runs": len(group_runs),
            "Avg Prey": avg([avg(r["prey"]) for r in group_runs if r["prey"]]),
            "Avg Predators": avg([avg(r["predators"]) for r in group_runs if r["predators"]]),
            "Peak Prey (avg)": avg([max(r["prey"]) for r in group_runs if r["prey"]]),
            "Peak Predators (avg)": avg([max(r["predators"]) for r in group_runs if r["predators"]]),
            "Avg Alarm p": avg([avg(r["alarm_prob"]) for r in group_runs if r["alarm_prob"]]),
            "Final Alarm p (avg)": avg([r["alarm_prob"][-1] for r in group_runs if r["alarm_prob"]]),
        })
    st.dataframe(pd.DataFrame(rows), use_container_width=True, hide_index=True)

elif view_mode == "Per-seed comparison":
    rows = []
    for group in selected_groups:
        for seed in selected_seeds:
            seed_runs = [r for r in filtered_runs if r["group"] == group and r["seed"] == seed]
            if not seed_runs:
                continue
            rows.append({
                "Group": group,
                "Seed": seed,
                "Runs": len(seed_runs),
                "Avg Prey": avg([avg(r["prey"]) for r in seed_runs if r["prey"]]),
                "Avg Predators": avg([avg(r["predators"]) for r in seed_runs if r["predators"]]),
                "Avg Alarm p": avg([avg(r["alarm_prob"]) for r in seed_runs if r["alarm_prob"]]),
                "Final Alarm p (avg)": avg([r["alarm_prob"][-1] for r in seed_runs if r["alarm_prob"]]),
            })
    st.dataframe(pd.DataFrame(rows), use_container_width=True, hide_index=True)

else:
    st.dataframe(summary_df, use_container_width=True, hide_index=True)

# ── Chart helper ──────────────────────────────────────────────────────────────
def make_chart(field, ylabel, title, show_std=True):
    fig = go.Figure()

    if view_mode == "Group comparison (averaged)":
        for i, group in enumerate(selected_groups):
            group_runs = [r for r in filtered_runs if r["group"] == group]
            if not group_runs:
                continue
            ticks, avg_vals, std_vals = average_runs(group_runs, field)
            smoothed = smooth_series(avg_vals, smooth)
            color = get_color(group, i)
            fig.add_trace(go.Scatter(x=ticks, y=smoothed, name=group, line=dict(color=color)))
            if show_std and std_vals:
                upper = [a + s if a is not None and s is not None else None for a, s in zip(smoothed, std_vals)]
                lower = [a - s if a is not None and s is not None else None for a, s in zip(smoothed, std_vals)]
                fig.add_trace(go.Scatter(
                    x=ticks + ticks[::-1], y=upper + lower[::-1],
                    fill='toself', fillcolor=color, opacity=0.15,
                    line=dict(width=0), showlegend=False, name=f"{group} ± std"
                ))

    elif view_mode == "Per-seed comparison":
        for i, group in enumerate(selected_groups):
            for j, seed in enumerate(selected_seeds):
                seed_runs = [r for r in filtered_runs if r["group"] == group and r["seed"] == seed]
                if not seed_runs:
                    continue
                ticks, avg_vals, _ = average_runs(seed_runs, field)
                smoothed = smooth_series(avg_vals, smooth)
                color = get_color(group, i)
                fig.add_trace(go.Scatter(
                    x=ticks, y=smoothed,
                    name=f"{group} seed{seed}",
                    line=dict(color=color, dash=["solid", "dash", "dot", "dashdot"][j % 4])
                ))

    else:
        for i, r in enumerate(filtered_runs):
            smoothed = smooth_series(r[field], smooth)
            fig.add_trace(go.Scatter(
                x=r["ticks"], y=smoothed,
                name=f"{r['group']} s{r['seed']} r{r['run']}",
                line=dict(color=get_color(r["group"], all_groups.index(r["group"])))
            ))

    fig.update_layout(title=title, xaxis_title="Tick", yaxis_title=ylabel,
                      hovermode="x unified", height=420)
    return fig

# ── Population charts ─────────────────────────────────────────────────────────
st.header("Population Over Time")
tab1, tab2, tab3 = st.tabs(["Prey", "Predators", "Both"])

with tab1:
    st.plotly_chart(make_chart("prey", "Prey population", "Prey Population Over Time"), use_container_width=True)

with tab2:
    st.plotly_chart(make_chart("predators", "Predator population", "Predator Population Over Time"), use_container_width=True)

with tab3:
    fig = go.Figure()
    if view_mode == "Group comparison (averaged)":
        for i, group in enumerate(selected_groups):
            group_runs = [r for r in filtered_runs if r["group"] == group]
            if not group_runs:
                continue
            ticks, prey_avg, _ = average_runs(group_runs, "prey")
            _, pred_avg, _ = average_runs(group_runs, "predators")
            color = get_color(group, i)
            fig.add_trace(go.Scatter(x=ticks, y=smooth_series(prey_avg, smooth),
                                     name=f"{group} — prey", line=dict(color=color)))
            fig.add_trace(go.Scatter(x=ticks, y=smooth_series(pred_avg, smooth),
                                     name=f"{group} — predators", line=dict(color=color, dash="dash")))
    elif view_mode == "Per-seed comparison":
        for i, group in enumerate(selected_groups):
            for j, seed in enumerate(selected_seeds):
                seed_runs = [r for r in filtered_runs if r["group"] == group and r["seed"] == seed]
                if not seed_runs:
                    continue
                ticks, prey_avg, _ = average_runs(seed_runs, "prey")
                _, pred_avg, _ = average_runs(seed_runs, "predators")
                color = get_color(group, i)
                dash = ["solid", "dash", "dot", "dashdot"][j % 4]
                fig.add_trace(go.Scatter(x=ticks, y=smooth_series(prey_avg, smooth),
                                         name=f"{group} s{seed} — prey", line=dict(color=color, dash=dash)))
                fig.add_trace(go.Scatter(x=ticks, y=smooth_series(pred_avg, smooth),
                                         name=f"{group} s{seed} — pred", line=dict(color=color, dash="dot")))
    else:
        for i, r in enumerate(filtered_runs):
            color = get_color(r["group"], all_groups.index(r["group"]))
            fig.add_trace(go.Scatter(x=r["ticks"], y=smooth_series(r["prey"], smooth),
                                     name=f"{r['group']} s{r['seed']} r{r['run']} — prey", line=dict(color=color)))
            fig.add_trace(go.Scatter(x=r["ticks"], y=smooth_series(r["predators"], smooth),
                                     name=f"{r['group']} s{r['seed']} r{r['run']} — pred",
                                     line=dict(color=color, dash="dash")))
    fig.update_layout(xaxis_title="Tick", yaxis_title="Population", hovermode="x unified", height=420)
    st.plotly_chart(fig, use_container_width=True)

# ── Lifespan chart ────────────────────────────────────────────────────────────
st.header("Average Lifespan Over Time")
tab_ls1, tab_ls2, tab_ls3 = st.tabs(["Prey", "Predators", "Both"])

def make_lifespan_fig(field, ylabel):
    fig = go.Figure()
    if view_mode == "Group comparison (averaged)":
        for i, group in enumerate(selected_groups):
            group_runs = [r for r in filtered_runs if r["group"] == group]
            if not group_runs:
                continue
            ticks, avg_vals, _ = average_runs(group_runs, field)
            color = get_color(group, i, pred=(field == "predator_lifespan"))
            fig.add_trace(go.Scatter(x=ticks, y=smooth_series(avg_vals, smooth),
                                     name=group, line=dict(color=color)))
    elif view_mode == "Per-seed comparison":
        for i, group in enumerate(selected_groups):
            for j, seed in enumerate(selected_seeds):
                seed_runs = [r for r in filtered_runs if r["group"] == group and r["seed"] == seed]
                if not seed_runs:
                    continue
                ticks, avg_vals, _ = average_runs(seed_runs, field)
                color = get_color(group, i, pred=(field == "predator_lifespan"))
                fig.add_trace(go.Scatter(x=ticks, y=smooth_series(avg_vals, smooth),
                                         name=f"{group} seed{seed}",
                                         line=dict(color=color, dash=["solid", "dash", "dot", "dashdot"][j % 4])))
    else:
        for i, r in enumerate(filtered_runs):
            color = get_color(r["group"], all_groups.index(r["group"]), pred=(field == "predator_lifespan"))
            fig.add_trace(go.Scatter(x=r["ticks"], y=smooth_series(r[field], smooth),
                                     name=f"{r['group']} s{r['seed']} r{r['run']}",
                                     line=dict(color=color)))
    fig.update_layout(xaxis_title="Tick", yaxis_title=ylabel, hovermode="x unified", height=420)
    return fig

with tab_ls1:
    st.plotly_chart(make_lifespan_fig("prey_lifespan", "Avg prey lifespan (ticks)"), use_container_width=True)

with tab_ls2:
    st.plotly_chart(make_lifespan_fig("predator_lifespan", "Avg predator lifespan (ticks)"), use_container_width=True)

with tab_ls3:
    fig = go.Figure()
    if view_mode == "Group comparison (averaged)":
        for i, group in enumerate(selected_groups):
            group_runs = [r for r in filtered_runs if r["group"] == group]
            if not group_runs:
                continue
            ticks, prey_avg, _ = average_runs(group_runs, "prey_lifespan")
            _, pred_avg, _ = average_runs(group_runs, "predator_lifespan")
            color_p = get_color(group, i)
            color_pred = get_color(group, i, pred=True)
            fig.add_trace(go.Scatter(x=ticks, y=smooth_series(prey_avg, smooth),
                                     name=f"{group} — prey", line=dict(color=color_p)))
            fig.add_trace(go.Scatter(x=ticks, y=smooth_series(pred_avg, smooth),
                                     name=f"{group} — predators", line=dict(color=color_pred, dash="dash")))
    elif view_mode == "Per-seed comparison":
        for i, group in enumerate(selected_groups):
            for j, seed in enumerate(selected_seeds):
                seed_runs = [r for r in filtered_runs if r["group"] == group and r["seed"] == seed]
                if not seed_runs:
                    continue
                ticks, prey_avg, _ = average_runs(seed_runs, "prey_lifespan")
                _, pred_avg, _ = average_runs(seed_runs, "predator_lifespan")
                color = get_color(group, i)
                dash = ["solid", "dash", "dot", "dashdot"][j % 4]
                fig.add_trace(go.Scatter(x=ticks, y=smooth_series(prey_avg, smooth),
                                         name=f"{group} s{seed} — prey", line=dict(color=color, dash=dash)))
                fig.add_trace(go.Scatter(x=ticks, y=smooth_series(pred_avg, smooth),
                                         name=f"{group} s{seed} — pred", line=dict(color=color, dash="dot")))
    else:
        for i, r in enumerate(filtered_runs):
            color = get_color(r["group"], all_groups.index(r["group"]))
            fig.add_trace(go.Scatter(x=r["ticks"], y=smooth_series(r["prey_lifespan"], smooth),
                                     name=f"{r['group']} s{r['seed']} r{r['run']} — prey",
                                     line=dict(color=color)))
            fig.add_trace(go.Scatter(x=r["ticks"], y=smooth_series(r["predator_lifespan"], smooth),
                                     name=f"{r['group']} s{r['seed']} r{r['run']} — pred",
                                     line=dict(color=color, dash="dash")))
    fig.update_layout(xaxis_title="Tick", yaxis_title="Avg lifespan (ticks)", hovermode="x unified", height=420)
    st.plotly_chart(fig, use_container_width=True)

# ── Alarm probability chart ───────────────────────────────────────────────────
st.header("Average Alarm Strength  Over Time")
fig = make_chart("alarm_prob", "Average strength", "Alarm Strength Over Time", show_std=True)
fig.add_hline(y=0.5, line_dash="dot", line_color="gray", annotation_text="Starting p=0.5")
fig.update_layout(yaxis=dict(range=[0, 1]))
st.plotly_chart(fig, use_container_width=True)

# ── Box plot of final alarm strength ─────────────────────────────────────────
st.header("Final Alarm Strength Distribution by Group")

groups_box = {}
for run in filtered_runs:
    group = run["group"]
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
    fig.update_layout(yaxis_title="Final Alarm p", yaxis=dict(range=[0, 1]),
                      hovermode="closest", height=400)
    st.plotly_chart(fig, use_container_width=True, key="chart_box_alarm_p")

# ── Scatter: avg alarm strength vs prey lifespan ──────────────────────────────
st.header("Average Alarm Strength vs Prey Lifespan")

scatter_x, scatter_y, scatter_names = [], [], []
for r in filtered_runs:
    if r["alarm_prob"] and r["prey_lifespan"]:
        scatter_x.append(round(avg(r["alarm_prob"]), 3))
        scatter_y.append(round(avg(r["prey_lifespan"]), 1))
        scatter_names.append(r["name"])

if scatter_x:
    fig = go.Figure()
    for i, group in enumerate(selected_groups):
        gx, gy, gnames = [], [], []
        for r in filtered_runs:
            if r["group"] != group:
                continue
            if r["alarm_prob"] and r["prey_lifespan"]:
                gx.append(round(avg(r["alarm_prob"]), 3))
                gy.append(round(avg(r["prey_lifespan"]), 1))
                gnames.append(r["name"])
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

    fig.update_layout(xaxis_title="Average Alarm Strength",
                      yaxis_title="Average Prey Lifespan (ticks)",
                      hovermode="closest", height=400)
    st.plotly_chart(fig, use_container_width=True, key="chart_scatter_p_lifespan")

# ── Comparison bar charts ─────────────────────────────────────────────────────
st.header("Run Comparison (Averages Across All Runs)")
tab_labels = [g for g in selected_groups] + ["📊 All Groups"]
tabs = st.tabs(tab_labels)

for i, group in enumerate(selected_groups):
    with tabs[i]:
        group_df = summary_df[summary_df["Group"] == group]
        avg_prey = avg(group_df["Avg Prey"].tolist())
        avg_predator = avg(group_df["Avg Predator"].tolist())
        avg_prey_lifespan = avg(group_df["Avg Prey Lifespan"].tolist())
        avg_peak_prey = avg(group_df["Peak Prey"].tolist())
        fig = go.Figure(go.Bar(
            x=["Avg Prey Population", "Avg Predator Population", "Avg Prey Lifespan (ticks)", "Peak Prey Population"],
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
        x=["Avg Prey Population", "Avg Predator Population", "Avg Prey Lifespan (ticks)", "Peak Prey Population"],
        y=[avg_prey, avg_predator, avg_prey_lifespan, avg_peak_prey],
        text=[f"{avg_prey:.1f}", f"{avg_predator:.1f}", f"{avg_prey_lifespan:.1f}", f"{avg_peak_prey:.1f}"],
        textposition="outside",
        marker_color=["#1f77b4", "#d62728", "#ff7f0e", "#2ca02c"]
    ))
    fig.update_layout(yaxis_title="Value", hovermode="x", height=400)
    st.plotly_chart(fig, use_container_width=True, key="chart_comparison_all")

# ── Alarm strength bar chart ──────────────────────────────────────────────────
st.header("Alarm Signal Strength per Run")
tab_labels = [g for g in selected_groups] + ["📊 All Runs"]
tabs = st.tabs(tab_labels)

for i, group in enumerate(selected_groups):
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
        fig.update_layout(barmode="group", xaxis_title="Run",
                          yaxis_title="Alarm Signal Strength",
                          yaxis=dict(range=[0, 1]), hovermode="x", height=400)
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
    fig.update_layout(barmode="group", xaxis_title="Run",
                      yaxis_title="Alarm Signal Strength",
                      yaxis=dict(range=[0, 1]), hovermode="x", height=400)
    st.plotly_chart(fig, use_container_width=True, key="chart_alarm_strength_all")

