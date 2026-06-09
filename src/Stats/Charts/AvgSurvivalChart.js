const FossilRecord = require("../FossilRecord");
const ChartController = require("./ChartController");

class AvgSurvivalChart extends ChartController {
    constructor() {
        super("Average Survival Rate", "Average Lifetime (ticks)", "Average lifetime of living prey and predators over time");
    }

    setData() {
        this.clear();
        this.data.push({
            type: "line",
            markerType: "none",
            color: 'green',
            showInLegend: true,
            name: "Prey Avg Lifespan",
            legendText: "Prey Avg Lifespan",
            dataPoints: []
        });
        this.data.push({
            type: "line",
            markerType: "none",
            color: 'orange',
            showInLegend: true,
            name: "Predator Avg Lifespan",
            legendText: "Predator Avg Lifespan",
            dataPoints: []
        });
        this.addAllDataPoints();
    }

    addDataPoint(i) {
        var t = FossilRecord.tick_record[i];
        this.data[0].dataPoints.push({ x: t, y: FossilRecord.prey_avg_lifespan[i] });
        this.data[1].dataPoints.push({ x: t, y: FossilRecord.predator_avg_lifespan[i] });
    }
}

module.exports = AvgSurvivalChart;
