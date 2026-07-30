const FossilRecord = require("../FossilRecord");
const ChartController = require("./ChartController");

class alarmStrengthChart extends ChartController {
    constructor() {
        super("Average Prey Alarm Strength", "Strength", "Average alarm signalling strength among living prey over time");
    }

    setData() {
        this.clear();
        this.data.push({
            type: "line",
            markerType: "none",
            color: 'purple',
            showInLegend: true,
            name: "Alarm Strength",
            legendText: "Average Prey Alarm Strength",
            dataPoints: []
        });
        this.addAllDataPoints();
    }

    addDataPoint(i) {
        var t = FossilRecord.tick_record[i];
        var p = FossilRecord.av_alarm_probs[i];
        this.data[0].dataPoints.push({ x: t, y: p });
    }
}

module.exports = alarmStrengthChart;
