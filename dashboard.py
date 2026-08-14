import streamlit as st
import json
import pandas as pd
import plotly.graph_objects as go
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
@st.cache_data(show_spinner=False)
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

if "parsed_runs" not in st.session_state:
    st.session_state.parsed_runs = {}

runs = []
for f in uploaded_files:
    if f.file_id not in st.session_state.parsed_runs:
        st.session_state.parsed_runs[f.file_id] = load_run(f.read(), f.name)
    runs.append(st.session_state.parsed_runs[f.file_id])

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

# ── Thesis-grade styling ───────────────────────────────────────────────────────
# A single colorblind-safe, print-friendly palette (Okabe–Ito) used everywhere,
# so every figure in the report reads consistently.
PALETTE = ["#0072B2", "#D55E00", "#009E73", "#E69F00",
           "#CC79A7", "#56B4E9", "#F0E442", "#000000"]

# Fixed chart footprint used across the whole dashboard so every figure has
# the same, thesis-friendly proportions instead of being a thin wide strip
# (but not a perfect square either).
CHART_HEIGHT = 380

group_color_map = {group: PALETTE[i % len(PALETTE)] for i, group in enumerate(all_groups)}

def get_group_color(group):
    return group_color_map.get(group, "#555555")

def get_color(name, index, pred=False):
    # `pred=True` shifts along the same shared palette (instead of switching
    # to a completely different color set) so predator/prey series still look
    # like they belong to the same figure family.
    offset = len(all_groups) if pred else 0
    return PALETTE[(index + offset) % len(PALETTE)]

def get_experiment_group(run_name):
    for g in all_groups:
        if run_name.startswith(g):
            return g
    return run_name.split("_seed")[0] if "_seed" in run_name else run_name

def style_figure(fig, height=CHART_HEIGHT, y_range=None, title=None):
    """Apply one consistent, thesis-ready look to every chart: professional
    palette already applied per-trace, axes boxed and anchored at the
    origin/corner, matching size, and a clean white background suitable for
    print.

    `title`, if given, sets the chart's title text. Charts that already set
    their own title text (via an earlier update_layout call) don't need to
    pass this — it merges with, rather than blanks out, whatever text is
    already there."""
    title_dict = dict(font=dict(size=15, color="#222222"))
    if title is not None:
        title_dict["text"] = title
    fig.update_layout(
        height=height,
        plot_bgcolor="white",
        paper_bgcolor="white",
        font=dict(family="Arial", size=13, color="#222222"),
        title=title_dict,
        legend=dict(
            bgcolor="rgba(255,255,255,0.9)",
            bordercolor="#cccccc",
            borderwidth=1,
            font=dict(size=11)
        ),
        margin=dict(l=70, r=30, t=60, b=60),
    )
    axis_kwargs = dict(
        showgrid=True,
        gridcolor="#e6e6e6",
        gridwidth=1,
        showline=True,
        linewidth=1,
        linecolor="#333333",
        zeroline=True,
        zerolinecolor="#333333",
        zerolinewidth=1,
        mirror=True,
        ticks="outside",
        tickcolor="#333333",
    )
    fig.update_xaxes(rangemode="tozero", **axis_kwargs)
    if y_range is not None:
        fig.update_yaxes(range=y_range, **axis_kwargs)
    else:
        fig.update_yaxes(rangemode="tozero", **axis_kwargs)
    return fig

def show_chart(fig, key=None):
    """Render a chart inside a constrained center column so the fixed height
    isn't stretched into a thin panoramic strip across the full wide layout."""
    left, mid, right = st.columns([1, 8, 1])
    with mid:
        st.plotly_chart(fig, use_container_width=True, key=key)

# ── Interpolation helpers ─────────────────────────────────────────────────────
def interpolate_to_ticks(ticks, values, target_ticks):
    """Linear interpolation onto a common set of ticks.

    Uses np.interp instead of a pandas Series index-union + interpolate,
    which is noticeably faster for long tick arrays and avoids rebuilding
    a pandas index on every call. Assumes `ticks` is sorted (tick_record
    should already be monotonic).
    """
    if not ticks or not values or not target_ticks:
        return [None] * len(target_ticks)
    ticks_arr = np.asarray(ticks, dtype=float)
    values_arr = np.asarray(values, dtype=float)
    target_arr = np.asarray(target_ticks, dtype=float)
    # np.interp clamps outside the source range to the end values, which
    # matches how the old reindex/interpolate behaved for in-range points.
    return np.interp(target_arr, ticks_arr, values_arr).tolist()

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

# Memoize average_runs within a single script run: several charts (e.g. the
# "Both" population/lifespan views) ask for the same (runs, field) combo that
# another chart just computed. Without this, that work happens twice per
# rerun; with several groups/seeds it adds up fast.
_avg_cache = {}
def average_runs_cached(run_list, field):
    key = (tuple(sorted(r["name"] for r in run_list)), field)
    if key not in _avg_cache:
        _avg_cache[key] = average_runs(run_list, field)
    return _avg_cache[key]

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
            "Avg Prey Lifespan": avg([avg(r["prey_lifespan"]) for r in group_runs if r["prey_lifespan"]]),
            "Avg Alarm strength": avg([avg(r["alarm_prob"]) for r in group_runs if r["alarm_prob"]]),
            "Final Alarm strength (avg)": avg([r["alarm_prob"][-1] for r in group_runs if r["alarm_prob"]]),
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

# ── Predator extinction events ────────────────────────────────────────────────
st.header("Predator Extinction Events")
st.caption("A run counts as an extinction if the predator population hits zero at any point during the run, not just at the end.")

def went_extinct(predator_counts):
    """True if predators established (count > 0 at some point) and later
    dropped back to zero. Ignores the leading zeros at the start of a run
    before predators are introduced."""
    if not predator_counts:
        return False
    established = False
    for p in predator_counts:
        if not established:
            if p > 0:
                established = True
            continue
        if p == 0:
            return True
    return False

extinction_rows = []
for group in selected_groups:
    group_runs = [r for r in filtered_runs if r["group"] == group]
    if not group_runs:
        continue
    extinct_runs = [r for r in group_runs if went_extinct(r["predators"])]
    extinction_rows.append({
        "Group": group,
        "Runs": len(group_runs),
        "Extinctions": len(extinct_runs),
        "Extinction Rate": round(len(extinct_runs) / len(group_runs), 2) if group_runs else 0,
    })

extinction_df = pd.DataFrame(extinction_rows)
st.dataframe(extinction_df, use_container_width=True, hide_index=True)

if not extinction_df.empty:
    fig = go.Figure(go.Bar(
        x=extinction_df["Group"],
        y=extinction_df["Extinctions"],
        text=extinction_df["Extinctions"],
        textposition="outside",
        marker_color=[get_group_color(g) for g in extinction_df["Group"]]
    ))
    fig.update_layout(xaxis_title="Group", yaxis_title="Runs with a predator extinction")
    style_figure(fig, title="Predator Extinctions by Group")
    show_chart(fig, key="chart_predator_extinction")

# ── Chart helper ──────────────────────────────────────────────────────────────
def make_chart(field, ylabel, title, show_std=False, y_range=None):
    fig = go.Figure()

    if view_mode == "Group comparison (averaged)":
        for i, group in enumerate(selected_groups):
            group_runs = [r for r in filtered_runs if r["group"] == group]
            if not group_runs:
                continue
            ticks, avg_vals, std_vals = average_runs_cached(group_runs, field)
            smoothed = smooth_series(avg_vals, smooth)
            color = get_color(group, i)
            fig.add_trace(go.Scatter(
                x=ticks, y=smoothed, name=group,
                line=dict(color=color, width=2)
            ))
            if show_std and std_vals:
                upper = [a + s if a is not None and s is not None else None
                         for a, s in zip(smoothed, std_vals)]
                lower = [a - s if a is not None and s is not None else None
                         for a, s in zip(smoothed, std_vals)]
                fig.add_trace(go.Scatter(
                    x=ticks + ticks[::-1],
                    y=upper + lower[::-1],
                    fill='toself',
                    fillcolor=color,
                    opacity=0.08,
                    line=dict(width=0),
                    showlegend=False,
                    name=f"{group} ± std"
                ))

    elif view_mode == "Per-seed comparison":
        for i, group in enumerate(selected_groups):
            for j, seed in enumerate(selected_seeds):
                seed_runs = [r for r in filtered_runs if r["group"] == group and r["seed"] == seed]
                if not seed_runs:
                    continue
                ticks, avg_vals, _ = average_runs_cached(seed_runs, field)
                smoothed = smooth_series(avg_vals, smooth)
                color = get_color(group, i)
                fig.add_trace(go.Scatter(
                    x=ticks, y=smoothed,
                    name=f"{group} seed{seed}",
                    line=dict(color=color, width=2,
                              dash=["solid", "dash", "dot", "dashdot"][j % 4])
                ))

    else:
        for i, r in enumerate(filtered_runs):
            smoothed = smooth_series(r[field], smooth)
            fig.add_trace(go.Scatter(
                x=r["ticks"], y=smoothed,
                name=f"{r['group']} s{r['seed']} r{r['run']}",
                line=dict(color=get_color(r["group"], all_groups.index(r["group"])), width=2)
            ))

    fig.update_layout(
        title=dict(text=title),
        xaxis_title="Tick",
        yaxis_title=ylabel,
        hovermode="x unified",
    )
    style_figure(fig, y_range=y_range)
    return fig

# ── Population charts ─────────────────────────────────────────────────────────
st.header("Population Over Time")
pop_choice = st.radio("Show", ["Prey", "Predators", "Both"], horizontal=True, key="pop_choice")

if pop_choice == "Prey":
    show_chart(make_chart("prey", "Prey population", "Prey Population Over Time"), key="chart_pop_prey")

elif pop_choice == "Predators":
    show_chart(make_chart("predators", "Predator population", "Predator Population Over Time"), key="chart_pop_pred")

else:
    fig = go.Figure()
    if view_mode == "Group comparison (averaged)":
        for i, group in enumerate(selected_groups):
            group_runs = [r for r in filtered_runs if r["group"] == group]
            if not group_runs:
                continue
            ticks, prey_avg, _ = average_runs_cached(group_runs, "prey")
            _, pred_avg, _ = average_runs_cached(group_runs, "predators")
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
                ticks, prey_avg, _ = average_runs_cached(seed_runs, "prey")
                _, pred_avg, _ = average_runs_cached(seed_runs, "predators")
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
    fig.update_layout(xaxis_title="Tick", yaxis_title="Population", hovermode="x unified")
    style_figure(fig, title="Prey and Predator Population Over Time")
    show_chart(fig, key="chart_pop_both")

# ── Lifespan chart ────────────────────────────────────────────────────────────
st.header("Average Lifespan Over Time")
lifespan_choice = st.radio("Show", ["Prey", "Predators", "Both"], horizontal=True, key="lifespan_choice")

def make_lifespan_fig(field, ylabel):
    fig = go.Figure()
    if view_mode == "Group comparison (averaged)":
        for i, group in enumerate(selected_groups):
            group_runs = [r for r in filtered_runs if r["group"] == group]
            if not group_runs:
                continue
            ticks, avg_vals, _ = average_runs_cached(group_runs, field)
            color = get_color(group, i, pred=(field == "predator_lifespan"))
            fig.add_trace(go.Scatter(x=ticks, y=smooth_series(avg_vals, smooth),
                                     name=group, line=dict(color=color)))
    elif view_mode == "Per-seed comparison":
        for i, group in enumerate(selected_groups):
            for j, seed in enumerate(selected_seeds):
                seed_runs = [r for r in filtered_runs if r["group"] == group and r["seed"] == seed]
                if not seed_runs:
                    continue
                ticks, avg_vals, _ = average_runs_cached(seed_runs, field)
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
    fig.update_layout(xaxis_title="Tick", yaxis_title=ylabel, hovermode="x unified")
    style_figure(fig)
    return fig

if lifespan_choice == "Prey":
    fig = make_lifespan_fig("prey_lifespan", "Avg prey lifespan (ticks)")
    fig.update_layout(title=dict(text="Average Prey Lifespan Over Time"))
    show_chart(fig, key="chart_life_prey")

elif lifespan_choice == "Predators":
    fig = make_lifespan_fig("predator_lifespan", "Avg predator lifespan (ticks)")
    fig.update_layout(title=dict(text="Average Predator Lifespan Over Time"))
    show_chart(fig, key="chart_life_pred")

else:
    fig = go.Figure()
    if view_mode == "Group comparison (averaged)":
        for i, group in enumerate(selected_groups):
            group_runs = [r for r in filtered_runs if r["group"] == group]
            if not group_runs:
                continue
            ticks, prey_avg, _ = average_runs_cached(group_runs, "prey_lifespan")
            _, pred_avg, _ = average_runs_cached(group_runs, "predator_lifespan")
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
                ticks, prey_avg, _ = average_runs_cached(seed_runs, "prey_lifespan")
                _, pred_avg, _ = average_runs_cached(seed_runs, "predator_lifespan")
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
    fig.update_layout(xaxis_title="Tick", yaxis_title="Avg lifespan (ticks)", hovermode="x unified")
    style_figure(fig, title="Average Prey and Predator Lifespan Over Time")
    show_chart(fig, key="chart_life_both")

# ── Alarm probability chart ───────────────────────────────────────────────────
st.header("Average Alarm Strength Over Time")
fig = make_chart("alarm_prob", "Average strength", "Alarm Strength Over Time",
                  show_std=True, y_range=[0, 1])
fig.add_hline(y=0.5, line_dash="dot", line_color="gray", annotation_text="Starting p=0.5")
show_chart(fig, key="chart_alarm_over_time")

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
    fig.update_layout(yaxis_title="Final Alarm p", hovermode="closest")
    style_figure(fig, y_range=[0, 1], title="Final Alarm Strength Distribution by Group")
    show_chart(fig, key="chart_box_alarm_p")

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
            mode="markers",
            name=group,
            marker=dict(color=get_group_color(group), size=10,
                        line=dict(color="#333333", width=1)),
            hovertemplate="<b>%{text}</b><br>Avg p: %{x}<br>Avg lifespan: %{y}<extra></extra>",
            text=gnames
        ))

    if len(scatter_x) > 1:
        z = np.polyfit(scatter_x, scatter_y, 1)
        p_fit = np.poly1d(z)
        x_line = sorted(scatter_x)
        fig.add_trace(go.Scatter(
            x=x_line, y=[p_fit(xi) for xi in x_line],
            mode="lines", name="Trend",
            line=dict(color="#555555", dash="dash", width=1.5)
        ))

    fig.update_layout(xaxis_title="Average Alarm Strength",
                      yaxis_title="Average Prey Lifespan (ticks)",
                      hovermode="closest")
    style_figure(fig, title="Average Alarm Strength vs Prey Lifespan")
    show_chart(fig, key="chart_scatter_p_lifespan")

# ── Comparison bar charts ─────────────────────────────────────────────────────
st.header("Run Comparison (Averages Across All Runs)")
comparison_group_choice = st.selectbox(
    "Group", selected_groups + ["📊 All Groups"], key="comparison_group_choice"
)

def render_comparison_bar(df, key, title):
    avg_prey = avg(df["Avg Prey"].tolist())
    avg_predator = avg(df["Avg Predator"].tolist())
    avg_prey_lifespan = avg(df["Avg Prey Lifespan"].tolist())
    avg_peak_prey = avg(df["Peak Prey"].tolist())
    fig = go.Figure(go.Bar(
        x=["Avg Prey Population", "Avg Predator Population", "Avg Prey Lifespan (ticks)", "Peak Prey Population"],
        y=[avg_prey, avg_predator, avg_prey_lifespan, avg_peak_prey],
        text=[f"{avg_prey:.1f}", f"{avg_predator:.1f}", f"{avg_prey_lifespan:.1f}", f"{avg_peak_prey:.1f}"],
        textposition="outside",
        marker_color=[PALETTE[0], PALETTE[1], PALETTE[2], PALETTE[3]]
    ))
    fig.update_layout(yaxis_title="Value", hovermode="x")
    style_figure(fig, title=title)
    show_chart(fig, key=key)

if comparison_group_choice == "📊 All Groups":
    render_comparison_bar(summary_df, "chart_comparison_all", "Run Comparison — All Groups")
else:
    render_comparison_bar(summary_df[summary_df["Group"] == comparison_group_choice],
                          "chart_comparison_group", f"Run Comparison — {comparison_group_choice}")

# ── Alarm strength bar chart ──────────────────────────────────────────────────
st.header("Alarm Signal Strength per Run")
alarm_group_choice = st.selectbox(
    "Group", selected_groups + ["📊 All Runs"], key="alarm_group_choice"
)

def render_alarm_bar(df, key, title):
    fig = go.Figure()
    fig.add_trace(go.Bar(
        name="Avg Alarm strength",
        x=df["Run"],
        y=df["Avg Alarm strength"],
        marker_color=PALETTE[0]
    ))
    fig.add_trace(go.Bar(
        name="Final Alarm strength",
        x=df["Run"],
        y=df["Final Alarm strength"],
        marker_color=PALETTE[1]
    ))
    fig.update_layout(barmode="group", xaxis_title="Run",
                      yaxis_title="Alarm Signal Strength", hovermode="x")
    style_figure(fig, y_range=[0, 1], title=title)
    show_chart(fig, key=key)

if alarm_group_choice == "📊 All Runs":
    render_alarm_bar(summary_df, "chart_alarm_strength_all", "Alarm Signal Strength — All Runs")
else:
    render_alarm_bar(summary_df[summary_df["Group"] == alarm_group_choice],
                     "chart_alarm_strength_group", f"Alarm Signal Strength — {alarm_group_choice}")