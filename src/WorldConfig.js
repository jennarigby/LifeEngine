const WorldConfig = {
    headless: false,
    clear_walls_on_reset: false,
    auto_reset: false,
    auto_pause: false,
    // When true, the simulation will pause when total ticks reaches `stop_tick_value` (if > 0)
    stop_on_tick: true,
    // Tick value to stop at when `stop_on_tick` is true
    stop_tick_value: 10000000,
    brush_size: 2,
    seed: 5,

    grid_cols: 400,
    grid_rows: 200,
}

module.exports = WorldConfig;