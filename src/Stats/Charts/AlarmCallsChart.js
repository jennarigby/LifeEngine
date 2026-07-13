const FossilRecord = require("../FossilRecord");
const ChartController = require("./ChartController");

class AlarmCallsChart extends ChartController {
    constructor() {
        const windowSize = FossilRecord.alarm_call_window_size || 500;
        super(
            "Alarm Calls Sent Over Time",
            `Alarm Calls per ${windowSize} ticks`,
            `Total number of alarm calls in each ${windowSize}-tick window.`
        );
    }

    setData() {
        this.clear();
        this.data.push({
            type: "line",
            lineThickness: 2,
            markerType: "none",
            color: 'red',
            showInLegend: true,
            name: "Alarm Calls",
            legendText: "Alarm Calls per 500 Ticks",
            dataPoints: []
        });
        this.addAllDataPoints();
    }

    addAllDataPoints() {
        const ticks = FossilRecord.alarm_call_ticks;
        const calls = FossilRecord.alarm_call_counts;
        if (!ticks || ticks.length === 0) return;

        for (let i = 0; i < ticks.length; i++) {
            this.addDataPoint(i);
        }
    }

    updateData() {
        this.setData();
    }

    addDataPoint(i) {
        let t = FossilRecord.alarm_call_ticks[i];
        let calls = FossilRecord.alarm_call_counts[i] || 0;
        this.data[0].dataPoints.push({ x: t, y: calls });
    }
}

module.exports = AlarmCallsChart;
