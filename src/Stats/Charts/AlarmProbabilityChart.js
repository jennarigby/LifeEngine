const FossilRecord = require("../FossilRecord");
const ChartController = require("./ChartController");

class AlarmProbabilityChart extends ChartController {
    constructor() {
        super("Average Prey Alarm Probability", "Probability", "Average alarm signalling probability among living prey over time");
    }

    setData() {
        this.clear();
        this.data.push({
            type: "line",
            markerType: "none",
            color: 'purple',
            showInLegend: true,
            name: "Alarm Probability",
            legendText: "Average Prey Alarm Probability",
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

module.exports = AlarmProbabilityChart;
