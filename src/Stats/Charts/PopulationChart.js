const FossilRecord = require("../FossilRecord");
const ChartController = require("./ChartController");

class PopulationChart extends ChartController {
    constructor() {
        super("Population");
    }

    setData() {
        this.clear();
        this.data.push({
            type: "line",
            markerType: "none",
            color: 'black',
            showInLegend: true,
            name: "pop1",
            legendText: "Total Population",
            dataPoints: []
        }
        );
        this.data.push({
            type: "line", markerType: "none", color: 'blue',
            showInLegend: true, legendText: "Prey",
            dataPoints: []
        });
        this.data.push({
            type: "line", markerType: "none", color: 'red',
            showInLegend: true, legendText: "Predators",
            dataPoints: []
        });
        this.addAllDataPoints();
    }

    addDataPoint(i) {
        var t = FossilRecord.tick_record[i];
        var p = FossilRecord.pop_counts[i];
        this.data[0].dataPoints.push({ x: t, y: p });
        this.data[1].dataPoints.push({ x: t, y: FossilRecord.prey_counts[i] });
        this.data[2].dataPoints.push({ x: t, y: FossilRecord.predator_counts[i] });
    }

}

module.exports = PopulationChart;