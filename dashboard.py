import streamlit as st
import json
import pandas as pd
import plotly.graph_objects as go
import numpy as np
import re
from pathlib import Path
from scipy import stats

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

# ── Group label formatting ────────────────────────────────────────────────────
def format_group_label(group):
    """Display group names that start with 'r' followed by digits (e.g. 'r0',
    'r025', 'r05', 'r1') as a relatedness-threshold label like 'r >= 0' or
    'r >= 0.25'. Any group name that doesn't match this pattern (e.g.
    'control') is returned unchanged."""
    m = re.match(r'^r(\d+)$', group)
    if not m:
        return group
    digits = m.group(1)
    if digits == "0":
        val = "0"
    elif len(digits) == 1:
        val = digits
    else:
        stripped = digits.lstrip("0")
        val = "0." + digits if not stripped else "0." + stripped if digits.startswith("0") else digits
    return f"r >= {val}"

# ── Sidebar controls ──────────────────────────────────────────────────────────
st.sidebar.header("Display Options")

view_mode = st.sidebar.radio(
    "View mode",
    ["Group comparison (averaged)", "Per-seed comparison", "Individual runs"]
)

selected_groups = st.sidebar.multiselect(
    "Groups to show",
    options=all_groups,
    default=all_groups,
    format_func=format_group_label
)

selected_seeds = st.sidebar.multiselect(
    "Seeds to show",
    options=all_seeds,
    default=all_seeds
)

smooth = st.sidebar.slider("Smoothing window", 1, 100, 1)

_control_candidates = [g for g in all_groups if g.lower() == "control"]
_default_ref_index = all_groups.index(_control_candidates[0]) if _control_candidates else 0
reference_group = st.sidebar.selectbox(
    "Reference group for pairwise comparisons",
    options=all_groups,
    index=_default_ref_index,
    format_func=format_group_label,
    help="Every other selected group is compared back to this one in the "
         "Pairwise Comparisons table below (e.g. each relatedness threshold vs. control)."
)

exclude_extinct = st.sidebar.checkbox(
    "Exclude predator-extinction runs from summary stats",
    value=False,
    help="Runs where the predator population hit zero at some point represent a "
         "different selective regime (no predation pressure). Toggle this to see "
         "summary stats computed only over runs where predators persisted throughout."
)

def smooth_series(series, window):
    if window <= 1 or not series:
        return series
    s = pd.Series(series)
    return s.rolling(window, min_periods=1).mean().tolist()

def avg(series):
    return round(sum(series) / len(series), 2) if series else 0

def format_run(run):
    """Display a run number as e.g. 'r>=0125' (zero-padded to 4 digits)."""
    return f"r>={run:04d}"

# ── Thesis-grade styling ───────────────────────────────────────────────────────
# Okabe–Ito colors, but reordered so that adjacent indices (the order groups
# actually get assigned in) alternate dark/light. The original left-to-right
# order put three mid-tone colors (pink, sky blue, orange) next to each other
# — they have almost identical grayscale luminance (~150-162) and were
# indistinguishable once desaturated. This order maximizes the luminance gap
# between consecutive groups, so the most common case (2-4 groups) still
# reads clearly in black-and-white.
PALETTE = ["#000000", "#F0E442", "#0072B2", "#E69F00",
           "#009E73", "#CC79A7", "#D55E00", "#56B4E9"]

# Color alone collapses under greyscale printing/photocopying, so bar, box,
# and scatter charts get a distinct marker symbol or fill pattern per group.
# Line charts (population, lifespan, alarm strength) stay solid — with many
# overlapping run/seed/group logs on one axis, dash patterns just added
# visual noise, so those rely on the (grayscale-safe) color palette alone,
# plus a separate shade per prey/predator series where both appear together.
GROUP_SYMBOLS = ["circle", "square", "diamond", "triangle-up", "x", "cross", "star", "triangle-down"]
GROUP_PATTERNS = ["", "/", "\\", "x", "-", "|", "+", "."]

# Fixed chart footprint used across the whole dashboard so every figure has
# the same, thesis-friendly proportions instead of being a thin wide strip
# (but not a perfect square either).
CHART_HEIGHT = 460

group_color_map = {group: PALETTE[i % len(PALETTE)] for i, group in enumerate(all_groups)}
group_symbol_map = {group: GROUP_SYMBOLS[i % len(GROUP_SYMBOLS)] for i, group in enumerate(all_groups)}
group_pattern_map = {group: GROUP_PATTERNS[i % len(GROUP_PATTERNS)] for i, group in enumerate(all_groups)}

def get_group_color(group):
    return group_color_map.get(group, "#555555")

def get_group_symbol(group):
    return group_symbol_map.get(group, "circle")

def get_group_pattern(group):
    return group_pattern_map.get(group, "")

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

def style_figure(fig, height=CHART_HEIGHT, y_range=None, title=None, legend_pad=0.15):
    """Apply one consistent, thesis-ready look to every chart: professional
    palette already applied per-trace, axes boxed and anchored at the
    origin/corner, matching size, and a clean white background suitable for
    print.

    `title`, if given, sets the chart's title text. Charts that already set
    their own title text (via an earlier update_layout call) don't need to
    pass this — it merges with, rather than blanks out, whatever text is
    already there.

    `legend_pad`, when y_range isn't explicitly given, adds headroom above
    the highest data point so the top-right legend (see the legend block
    below) has empty space to sit in instead of overlapping the traces.
    Set to 0/None to disable and fall back to a tight tozero range."""
    title_dict = dict(font=dict(size=15, color="#000000"))
    if title is not None:
        title_dict["text"] = title
    fig.update_layout(
        height=height,
        plot_bgcolor="white",
        paper_bgcolor="white",
        font=dict(family="Arial", size=13, color="#000000"),
        title=title_dict,
        legend=dict(
            bgcolor="rgba(255,255,255,0.85)",
            bordercolor="#999999",
            borderwidth=1,
            font=dict(size=11, color="#000000"),
            x=0.99,
            y=0.99,
            xanchor="right",
            yanchor="top",
        ),
        margin=dict(l=70, r=30, t=60, b=60),
    )
    axis_kwargs = dict(
        showgrid=True,
        gridcolor="#e6e6e6",
        gridwidth=1,
        showline=True,
        linewidth=1,
        linecolor="#000000",
        zeroline=True,
        zerolinecolor="#000000",
        zerolinewidth=1,
        mirror=True,
        ticks="outside",
        tickcolor="#000000",
        tickfont=dict(color="#000000"),
        title_font=dict(color="#000000"),
    )
    fig.update_xaxes(rangemode="tozero", **axis_kwargs)
    if y_range is not None:
        fig.update_yaxes(range=y_range, **axis_kwargs)
    elif legend_pad:
        data_max = 0.0
        data_min = 0.0
        for trace in fig.data:
            ys = getattr(trace, "y", None)
            if ys is None:
                continue
            nums = [v for v in ys if isinstance(v, (int, float))]
            if nums:
                data_max = max(data_max, max(nums))
                data_min = min(data_min, min(nums))
        if data_max > 0:
            fig.update_yaxes(range=[data_min, data_max * (1 + legend_pad)], **axis_kwargs)
        else:
            fig.update_yaxes(rangemode="tozero", **axis_kwargs)
    else:
        fig.update_yaxes(rangemode="tozero", **axis_kwargs)
    return fig

def show_chart(fig, key=None):
    """Render a chart inside a constrained center column so the fixed height
    isn't stretched into a thin panoramic strip across the full wide layout."""
    left, mid, right = st.columns([1, 6, 1])
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

def get_common_ticks(run_list, max_points=2000):
    """Build a shared set of x-axis ticks to interpolate every run onto.

    Previously the step size came from just the first gap between two
    recorded ticks in a run. If a run logs densely early on (e.g. while
    the population is still establishing) and coarsens later, that small
    early gap got locked in as the step for the whole run — so on a
    10-million-tick run this could generate millions of target points,
    which silently truncates when handed to Plotly/the browser instead of
    erroring. Bounding the point count guarantees the grid always reaches
    max_tick regardless of how any individual run was logged.
    """
    if not run_list:
        return []
    max_tick = max(r["ticks"][-1] for r in run_list if r["ticks"])
    if max_tick <= 0:
        return [0]
    step = max(1, max_tick / max_points)
    ticks = np.arange(0, max_tick + step, step)
    if ticks[-1] < max_tick:
        ticks = np.append(ticks, max_tick)
    return ticks.tolist()

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

# ── Per-run extinction flag ───────────────────────────────────────────────────
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

for r in runs:
    r["extinct"] = went_extinct(r["predators"])

# ── Statistics helpers ────────────────────────────────────────────────────────
def summary_stats(values):
    """Mean, sample SD, SEM, and a 95% CI (t-distribution) for a list of
    per-run values. Returns a dict of rounded figures, or all-zero/NaN
    placeholders if there isn't enough data to compute spread."""
    values = [v for v in values if v is not None]
    n = len(values)
    if n == 0:
        return {"n": 0, "mean": 0.0, "sd": 0.0, "sem": 0.0, "ci_lo": 0.0, "ci_hi": 0.0}
    mean = float(np.mean(values))
    if n < 2:
        return {"n": n, "mean": round(mean, 2), "sd": 0.0, "sem": 0.0,
                "ci_lo": round(mean, 2), "ci_hi": round(mean, 2)}
    sd = float(np.std(values, ddof=1))
    sem = sd / np.sqrt(n)
    # t critical value (two-tailed, 95%) rather than the z=1.96 normal
    # approximation, since n=50 per condition is on the small side for
    # that approximation to be exact.
    t_crit = stats.t.ppf(0.975, df=n - 1)
    margin = t_crit * sem
    return {
        "n": n,
        "mean": round(mean, 2),
        "sd": round(sd, 2),
        "sem": round(sem, 2),
        "ci_lo": round(mean - margin, 2),
        "ci_hi": round(mean + margin, 2),
    }

def compare_groups(values_a, values_b):
    """Two-sided Mann-Whitney U test between two independent samples.
    Mann-Whitney (rather than an independent t-test) is used because
    predator-extinction runs introduce skew/outliers into several metrics
    (flagged qualitatively in the paper's Results section), so normality
    of per-run values isn't a safe assumption. Falls back gracefully when
    a group has too few runs or zero variance to compute the effect size.
    """
    a = np.array([v for v in values_a if v is not None], dtype=float)
    b = np.array([v for v in values_b if v is not None], dtype=float)
    if len(a) < 2 or len(b) < 2:
        return None
    try:
        u_stat, p_val = stats.mannwhitneyu(a, b, alternative="two-sided")
    except ValueError:
        # All values identical in both samples — Mann-Whitney is undefined.
        return None
    # Rank-biserial correlation as a distribution-free effect size
    # (0 = no difference, ±1 = complete separation of the two samples).
    n1, n2 = len(a), len(b)
    effect_size = 1 - (2 * u_stat) / (n1 * n2)
    return {"u": float(u_stat), "p": float(p_val), "effect": round(effect_size, 3),
            "n1": n1, "n2": n2}

def format_p(p):
    if p is None:
        return "—"
    if p < 0.001:
        return "<0.001"
    return f"{p:.3f}"

# ── Filter runs ───────────────────────────────────────────────────────────────
filtered_runs = [r for r in runs if r["group"] in selected_groups and r["seed"] in selected_seeds]
if exclude_extinct:
    filtered_runs = [r for r in filtered_runs if not r["extinct"]]

# ── Summary stats ─────────────────────────────────────────────────────────────
st.header("Summary Statistics")
if exclude_extinct:
    st.caption("Predator-extinction runs are excluded from every table and test below "
               "(toggle in the sidebar).")

summary_rows = []
for r in filtered_runs:
    summary_rows.append({
        "Run": r["name"],
        "Group": format_group_label(r["group"]),
        "Seed": r["seed"],
        "Extinct": "Yes" if r["extinct"] else "No",
        "Avg Prey": avg(r["prey"]),
        "Avg Predator": avg(r["predators"]),
        "Avg Prey Lifespan": avg(r["prey_lifespan"]),
        "Peak Prey": max(r["prey"]) if r["prey"] else 0,
        "Avg Alarm strength": avg(r["alarm_prob"]) if r["alarm_prob"] else 0,
        "Final Alarm strength": round(r["alarm_prob"][-1], 3) if r["alarm_prob"] else 0,
    })
summary_df = pd.DataFrame(summary_rows)

# Fields shown with full spread/CI stats in the "Group comparison" table.
# Each entry maps a display label to (per-run field name, per-run
# aggregator) — the aggregator turns one run's time series (or, for "final
# alarm strength", its last value) into the single number that feeds the
# group's mean/SD/CI, matching how each column is already computed elsewhere
# in the dashboard.
STAT_FIELDS = {
    "Avg Prey": ("prey", lambda r: avg(r["prey"]) if r["prey"] else None),
    "Avg Prey Lifespan": ("prey_lifespan", lambda r: avg(r["prey_lifespan"]) if r["prey_lifespan"] else None),
    "Avg Alarm strength": ("alarm_prob", lambda r: avg(r["alarm_prob"]) if r["alarm_prob"] else None),
    "Final Alarm strength": ("alarm_prob", lambda r: r["alarm_prob"][-1] if r["alarm_prob"] else None),
    "Avg Predators": ("predators", lambda r: avg(r["predators"]) if r["predators"] else None),
    "Avg Predator Lifespan": ("predator_lifespan", lambda r: avg(r["predator_lifespan"]) if r["predator_lifespan"] else None),
}

if view_mode == "Group comparison (averaged)":
    rows = []
    per_group_values = {}  # group -> {stat label: [per-run values]}, reused below for significance tests
    for group in selected_groups:
        group_runs = [r for r in filtered_runs if r["group"] == group]
        if not group_runs:
            continue
        per_group_values[group] = {
            label: [agg(r) for r in group_runs] for label, (_, agg) in STAT_FIELDS.items()
        }
        row = {
            "Group": format_group_label(group),
            "Runs": len(group_runs),
            "Extinctions": sum(1 for r in group_runs if r["extinct"]),
            "Avg Prey": avg([avg(r["prey"]) for r in group_runs if r["prey"]]),
            "Avg Predators": avg([avg(r["predators"]) for r in group_runs if r["predators"]]),
            "Peak Prey (avg)": avg([max(r["prey"]) for r in group_runs if r["prey"]]),
            "Peak Predators (avg)": avg([max(r["predators"]) for r in group_runs if r["predators"]]),
            "Avg Prey Lifespan": avg([avg(r["prey_lifespan"]) for r in group_runs if r["prey_lifespan"]]),
            "Avg Alarm strength": avg([avg(r["alarm_prob"]) for r in group_runs if r["alarm_prob"]]),
            "Final Alarm strength (avg)": avg([r["alarm_prob"][-1] for r in group_runs if r["alarm_prob"]]),
        }
        # Attach SD and 95% CI for each of the stat fields, e.g.
        # "Avg Prey Lifespan SD" / "Avg Prey Lifespan 95% CI".
        for label in STAT_FIELDS:
            stats_dict = summary_stats(per_group_values[group][label])
            row[f"{label} SD"] = stats_dict["sd"]
            row[f"{label} 95% CI"] = f"[{stats_dict['ci_lo']}, {stats_dict['ci_hi']}]"
        rows.append(row)
    st.dataframe(pd.DataFrame(rows), use_container_width=True, hide_index=True)

    # ── Pairwise significance tests ───────────────────────────────────────
    st.subheader("Pairwise Comparisons (Mann-Whitney U)")
    st.caption(
        "Each row compares two groups' per-run values on one metric. Mann-Whitney U "
        "is used instead of a t-test because predator-extinction runs introduce skew "
        "into several metrics. Effect size is the rank-biserial correlation "
        "(0 = no difference, ±1 = complete separation)."
    )
    if reference_group not in per_group_values:
        st.info(f"Reference group '{format_group_label(reference_group)}' has no runs in the "
                f"current selection — pick a different reference group in the sidebar, or add "
                f"more seeds/groups to the filter.")
    elif len(per_group_values) >= 2:
        group_list = [g for g in per_group_values if g != reference_group]
        # Compare every other selected group back to the explicit reference
        # group chosen in the sidebar (defaults to "control" if present),
        # rather than every possible pair, so the table stays a manageable
        # size and always reports the comparison you actually want (e.g.
        # each relatedness threshold vs. control).
        reference = reference_group
        test_rows = []
        for label in STAT_FIELDS:
            for group in group_list:
                result = compare_groups(
                    per_group_values[reference][label],
                    per_group_values[group][label],
                )
                if result is None:
                    continue
                test_rows.append({
                    "Metric": label,
                    "Group A (reference)": format_group_label(reference),
                    "Group B": format_group_label(group),
                    "n (A, B)": f"{result['n1']}, {result['n2']}",
                    "U": round(result["u"], 1),
                    "p-value": format_p(result["p"]),
                    "Significant (p<0.05)": "Yes" if result["p"] < 0.05 else "No",
                    "Effect size (r)": result["effect"],
                })
        if test_rows:
            st.dataframe(pd.DataFrame(test_rows), use_container_width=True, hide_index=True)
        else:
            st.info("Not enough runs per group to compute a test (need at least 2 per group).")
    else:
        st.info("Select at least two groups to compare.")

elif view_mode == "Per-seed comparison":
    rows = []
    for group in selected_groups:
        for seed in selected_seeds:
            seed_runs = [r for r in filtered_runs if r["group"] == group and r["seed"] == seed]
            if not seed_runs:
                continue
            rows.append({
                "Group": format_group_label(group),
                "Seed": seed,
                "Runs": len(seed_runs),
                "Extinctions": sum(1 for r in seed_runs if r["extinct"]),
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

extinction_rows = []
for group in selected_groups:
    # NOTE: this section always looks at every run in the group regardless
    # of the "exclude extinction runs" toggle above, since it exists
    # specifically to report the extinction rate itself.
    group_runs = [r for r in runs if r["group"] == group and r["seed"] in selected_seeds]
    if not group_runs:
        continue
    extinct_runs = [r for r in group_runs if r["extinct"]]
    extinction_rows.append({
        "GroupKey": group,
        "Group": format_group_label(group),
        "Runs": len(group_runs),
        "Extinctions": len(extinct_runs),
        "Extinction Rate": round(len(extinct_runs) / len(group_runs), 2) if group_runs else 0,
    })

extinction_df = pd.DataFrame(extinction_rows)
st.dataframe(extinction_df.drop(columns=["GroupKey"], errors="ignore"), use_container_width=True, hide_index=True)

if not extinction_df.empty:
    fig = go.Figure(go.Bar(
        x=extinction_df["Group"],
        y=extinction_df["Extinctions"],
        text=extinction_df["Extinctions"],
        textposition="outside",
        marker_color=[get_group_color(g) for g in extinction_df["GroupKey"]],
        marker_pattern_shape=[get_group_pattern(g) for g in extinction_df["GroupKey"]],
        marker_pattern=dict(fgcolor="#000000", size=6, solidity=0.35)
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
            color = get_color(group, all_groups.index(group))
            fig.add_trace(go.Scatter(
                x=ticks, y=smoothed, name=format_group_label(group),
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
                    name=f"{format_group_label(group)} ± std"
                ))

    elif view_mode == "Per-seed comparison":
        for i, group in enumerate(selected_groups):
            for j, seed in enumerate(selected_seeds):
                seed_runs = [r for r in filtered_runs if r["group"] == group and r["seed"] == seed]
                if not seed_runs:
                    continue
                ticks, avg_vals, _ = average_runs_cached(seed_runs, field)
                smoothed = smooth_series(avg_vals, smooth)
                color = get_color(group, all_groups.index(group))
                fig.add_trace(go.Scatter(
                    x=ticks, y=smoothed,
                    name=f"{format_group_label(group)} seed{seed}",
                    line=dict(color=color, width=2)
                ))

    else:
        for i, r in enumerate(filtered_runs):
            smoothed = smooth_series(r[field], smooth)
            fig.add_trace(go.Scatter(
                x=r["ticks"], y=smoothed,
                name=f"{format_group_label(r['group'])} s{r['seed']} {format_run(r['run'])}",
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
            color = get_color(group, all_groups.index(group))
            color_pred = get_color(group, all_groups.index(group), pred=True)
            fig.add_trace(go.Scatter(x=ticks, y=smooth_series(prey_avg, smooth),
                                     name=f"{format_group_label(group)} — prey", line=dict(color=color)))
            fig.add_trace(go.Scatter(x=ticks, y=smooth_series(pred_avg, smooth),
                                     name=f"{format_group_label(group)} — predators", line=dict(color=color_pred)))
    elif view_mode == "Per-seed comparison":
        for i, group in enumerate(selected_groups):
            for j, seed in enumerate(selected_seeds):
                seed_runs = [r for r in filtered_runs if r["group"] == group and r["seed"] == seed]
                if not seed_runs:
                    continue
                ticks, prey_avg, _ = average_runs_cached(seed_runs, "prey")
                _, pred_avg, _ = average_runs_cached(seed_runs, "predators")
                color = get_color(group, all_groups.index(group))
                color_pred = get_color(group, all_groups.index(group), pred=True)
                fig.add_trace(go.Scatter(x=ticks, y=smooth_series(prey_avg, smooth),
                                         name=f"{format_group_label(group)} s{seed} — prey", line=dict(color=color)))
                fig.add_trace(go.Scatter(x=ticks, y=smooth_series(pred_avg, smooth),
                                         name=f"{format_group_label(group)} s{seed} — pred", line=dict(color=color_pred)))
    else:
        for i, r in enumerate(filtered_runs):
            color = get_color(r["group"], all_groups.index(r["group"]))
            color_pred = get_color(r["group"], all_groups.index(r["group"]), pred=True)
            fig.add_trace(go.Scatter(x=r["ticks"], y=smooth_series(r["prey"], smooth),
                                     name=f"{format_group_label(r['group'])} s{r['seed']} {format_run(r['run'])} — prey", line=dict(color=color)))
            fig.add_trace(go.Scatter(x=r["ticks"], y=smooth_series(r["predators"], smooth),
                                     name=f"{format_group_label(r['group'])} s{r['seed']} {format_run(r['run'])} — pred",
                                     line=dict(color=color_pred)))
    fig.update_layout(xaxis_title="Tick", yaxis_title="Population", hovermode="x unified")
    style_figure(fig, title="Prey and Predator Population Over Time")
    show_chart(fig, key="chart_pop_both")

# ── Lifespan chart ────────────────────────────────────────────────────────────
st.header("Average Lifespan Over Time")
lifespan_choice = st.radio("Show", ["Prey", "Predators", "Both"], horizontal=True, key="lifespan_choice")

MAX_PREY_LIFESPAN = 5000
MAX_PREDATOR_LIFESPAN = 6000

def make_lifespan_fig(field, ylabel, normalize_by=None):
    fig = go.Figure()
    if view_mode == "Group comparison (averaged)":
        for i, group in enumerate(selected_groups):
            group_runs = [r for r in filtered_runs if r["group"] == group]
            if not group_runs:
                continue
            ticks, avg_vals, _ = average_runs_cached(group_runs, field)
            if normalize_by:
                avg_vals = [v / normalize_by for v in avg_vals]
            color = get_color(group, all_groups.index(group))
            fig.add_trace(go.Scatter(x=ticks, y=smooth_series(avg_vals, smooth),
                                     name=format_group_label(group), line=dict(color=color)))
    elif view_mode == "Per-seed comparison":
        for i, group in enumerate(selected_groups):
            for j, seed in enumerate(selected_seeds):
                seed_runs = [r for r in filtered_runs if r["group"] == group and r["seed"] == seed]
                if not seed_runs:
                    continue
                ticks, avg_vals, _ = average_runs_cached(seed_runs, field)
                if normalize_by:
                    avg_vals = [v / normalize_by for v in avg_vals]
                color = get_color(group, all_groups.index(group))
                fig.add_trace(go.Scatter(x=ticks, y=smooth_series(avg_vals, smooth),
                                         name=f"{format_group_label(group)} seed{seed}",
                                         line=dict(color=color)))
    else:
        for i, r in enumerate(filtered_runs):
            color = get_color(r["group"], all_groups.index(r["group"]))
            vals = r[field]
            if normalize_by:
                vals = [v / normalize_by for v in vals]
            fig.add_trace(go.Scatter(x=r["ticks"], y=smooth_series(vals, smooth),
                                     name=f"{format_group_label(r['group'])} s{r['seed']} {format_run(r['run'])}",
                                     line=dict(color=color)))
    fig.update_layout(xaxis_title="Tick", yaxis_title=ylabel,
                      yaxis_tickformat=".2f" if normalize_by else None,
                      hovermode="x unified")
    style_figure(fig)
    return fig

if lifespan_choice == "Prey":
    fig = make_lifespan_fig("prey_lifespan", "Avg prey lifespan (fraction of max)", normalize_by=MAX_PREY_LIFESPAN)
    fig.update_layout(title=dict(text="Average Prey Lifespan Over Time"))
    show_chart(fig, key="chart_life_prey")

elif lifespan_choice == "Predators":
    fig = make_lifespan_fig("predator_lifespan", "Avg predator lifespan (fraction of max)", normalize_by=MAX_PREDATOR_LIFESPAN)
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
            prey_avg = [v / MAX_PREY_LIFESPAN for v in prey_avg]
            _, pred_avg, _ = average_runs_cached(group_runs, "predator_lifespan")
            pred_avg = [v / MAX_PREDATOR_LIFESPAN for v in pred_avg]
            color_p = get_color(group, all_groups.index(group))
            color_pred = get_color(group, all_groups.index(group), pred=True)
            fig.add_trace(go.Scatter(x=ticks, y=smooth_series(prey_avg, smooth),
                                     name=f"{format_group_label(group)} — prey", line=dict(color=color_p)))
            fig.add_trace(go.Scatter(x=ticks, y=smooth_series(pred_avg, smooth),
                                     name=f"{format_group_label(group)} — predators", line=dict(color=color_pred)))
    elif view_mode == "Per-seed comparison":
        for i, group in enumerate(selected_groups):
            for j, seed in enumerate(selected_seeds):
                seed_runs = [r for r in filtered_runs if r["group"] == group and r["seed"] == seed]
                if not seed_runs:
                    continue
                ticks, prey_avg, _ = average_runs_cached(seed_runs, "prey_lifespan")
                prey_avg = [v / MAX_PREY_LIFESPAN for v in prey_avg]
                _, pred_avg, _ = average_runs_cached(seed_runs, "predator_lifespan")
                pred_avg = [v / MAX_PREDATOR_LIFESPAN for v in pred_avg]
                color = get_color(group, all_groups.index(group))
                color_pred = get_color(group, all_groups.index(group), pred=True)
                fig.add_trace(go.Scatter(x=ticks, y=smooth_series(prey_avg, smooth),
                                         name=f"{format_group_label(group)} s{seed} — prey", line=dict(color=color)))
                fig.add_trace(go.Scatter(x=ticks, y=smooth_series(pred_avg, smooth),
                                         name=f"{format_group_label(group)} s{seed} — pred", line=dict(color=color_pred)))
    else:
        for i, r in enumerate(filtered_runs):
            color = get_color(r["group"], all_groups.index(r["group"]))
            color_pred = get_color(r["group"], all_groups.index(r["group"]), pred=True)
            prey_vals = [v / MAX_PREY_LIFESPAN for v in r["prey_lifespan"]]
            pred_vals = [v / MAX_PREDATOR_LIFESPAN for v in r["predator_lifespan"]]
            fig.add_trace(go.Scatter(x=r["ticks"], y=smooth_series(prey_vals, smooth),
                                     name=f"{format_group_label(r['group'])} s{r['seed']} {format_run(r['run'])} — prey",
                                     line=dict(color=color)))
            fig.add_trace(go.Scatter(x=r["ticks"], y=smooth_series(pred_vals, smooth),
                                     name=f"{format_group_label(r['group'])} s{r['seed']} {format_run(r['run'])} — pred",
                                     line=dict(color=color_pred)))
    fig.update_layout(xaxis_title="Tick", yaxis_title="Avg lifespan (fraction of max)",
                      yaxis_tickformat=".2f",
                      hovermode="x unified")
    style_figure(fig, title="Average Prey and Predator Lifespan Over Time")
    show_chart(fig, key="chart_life_both")

# ── Alarm probability chart ───────────────────────────────────────────────────
st.header("Average Alarm Strength Over Time")
fig = make_chart("alarm_prob", "Average strength", "Alarm Strength Over Time",
                  show_std=False, y_range=[0, 1])
fig.add_hline(y=0.5, line_dash="dot", line_color="#000000", annotation_text="Starting s=0.5",
              annotation_font_color="#000000")
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
            name=format_group_label(group),
            marker=dict(color=get_group_color(group), symbol=get_group_symbol(group), size=6),
            line=dict(color=get_group_color(group)),
            boxpoints="all",
            jitter=0.3,
            pointpos=-1.8
        ))
    fig.update_layout(yaxis_title="Final Alarm Strength", hovermode="closest", showlegend=False)
    style_figure(fig, y_range=[0, 1], title="Final Alarm Strength Distribution by Group")
    show_chart(fig, key="chart_box_alarm_p")

# ── Scatter: avg alarm strength vs prey lifespan ──────────────────────────────
st.header("Average Alarm Strength vs Prey Lifespan")

MAX_LIFESPAN = 5000

scatter_x, scatter_y, scatter_names = [], [], []
for r in filtered_runs:
    if r["alarm_prob"] and r["prey_lifespan"]:
        scatter_x.append(round(avg(r["alarm_prob"]), 3))
        scatter_y.append(round(avg(r["prey_lifespan"]) / MAX_LIFESPAN, 3))
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
                gy.append(round(avg(r["prey_lifespan"]) / MAX_LIFESPAN, 3))
                gnames.append(r["name"])
        if gx:
            fig.add_trace(go.Scatter(
            x=gx, y=gy,
            mode="markers",
            name=format_group_label(group),
            marker=dict(color=get_group_color(group), size=11, symbol=get_group_symbol(group),
                        line=dict(color="#000000", width=1)),
            hovertemplate="<b>%{text}</b><br>Avg p: %{x}<br>Avg lifespan: %{y:.2f}<extra></extra>",
            text=gnames
        ))

    if len(scatter_x) > 1:
        z = np.polyfit(scatter_x, scatter_y, 1)
        p_fit = np.poly1d(z)
        x_line = sorted(scatter_x)
        fig.add_trace(go.Scatter(
            x=x_line, y=[p_fit(xi) for xi in x_line],
            mode="lines", name="Trend",
            line=dict(color="#000000", dash="dash", width=1.5)
        ))

    fig.update_layout(xaxis_title="Average Alarm Strength",
                      yaxis_title="Average Prey Lifespan (fraction of max)",
                      yaxis_tickformat=".2f",
                      hovermode="closest")
    style_figure(fig, title="Average Alarm Strength vs Prey Lifespan")
    show_chart(fig, key="chart_scatter_p_lifespan")

# ── Scatter: avg alarm strength vs prey population ──────────────────────────
st.header("Average Alarm Strength vs Prey Population")

scatter_x, scatter_y, scatter_names = [], [], []

for r in filtered_runs:
    if r["alarm_prob"] and r["prey"]:
        scatter_x.append(round(avg(r["alarm_prob"]), 3))
        scatter_y.append(round(avg(r["prey"]), 1))
        scatter_names.append(r["name"])

if scatter_x:
    fig = go.Figure()

    for group in selected_groups:
        gx, gy, gnames = [], [], []

        for r in filtered_runs:
            if r["group"] != group:
                continue

            if r["alarm_prob"] and r["prey"]:
                gx.append(round(avg(r["alarm_prob"]), 3))
                gy.append(round(avg(r["prey"]), 1))
                gnames.append(r["name"])

        if gx:
            fig.add_trace(go.Scatter(
                x=gx,
                y=gy,
                mode="markers",
                name=format_group_label(group),
                marker=dict(
                    color=get_group_color(group),
                    size=11,
                    symbol=get_group_symbol(group),
                    line=dict(
                        color="#000000",
                        width=1
                    )
                ),
                hovertemplate=(
                    "<b>%{text}</b><br>"
                    "Avg alarm strength: %{x}<br>"
                    "Avg prey population: %{y}"
                    "<extra></extra>"
                ),
                text=gnames
            ))

    # Linear trend line
    if len(scatter_x) > 1:
        z = np.polyfit(scatter_x, scatter_y, 1)
        p_fit = np.poly1d(z)

        x_line = sorted(scatter_x)

        fig.add_trace(go.Scatter(
            x=x_line,
            y=[p_fit(xi) for xi in x_line],
            mode="lines",
            name="Trend",
            line=dict(
                color="#000000",
                dash="dash",
                width=1.5
            )
        ))

    fig.update_layout(
        xaxis_title="Average Alarm Strength",
        yaxis_title="Average Prey Population",
        hovermode="closest"
    )

    style_figure(
        fig,
        title="Average Alarm Strength vs Prey Population"
    )

    show_chart(
        fig,
        key="chart_scatter_p_population"
    )
