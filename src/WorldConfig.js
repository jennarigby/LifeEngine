const WorldConfig = {
    headless: false,
    clear_walls_on_reset: false,
    auto_reset: false,
    auto_pause: false,
    // When true, the simulation will pause when total ticks reaches `stop_tick_value` (if > 0)
    stop_on_tick: false,
    // Tick value to stop at when `stop_on_tick` is true
    stop_tick_value: 0,
    brush_size: 2,
}

module.exports = WorldConfig;