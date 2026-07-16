const FossilRecord = require("../FossilRecord");
const ChartController = require("./ChartController");

class LineageChart extends ChartController {
    constructor() {
        super("Lineage Populations", "Organisms");
        this.lineageIds = [];
    }

    setData() {
        this.clear();
        this.lineageIds = this.getAllLineages();
        if (this.lineageIds.length === 0) {
            this.data.push({
                type: "line",
                markerType: "none",
                color: 'black',
                showInLegend: true,
                legendText: "No lineages yet",
                dataPoints: []
            });
            return;
        }

        for (let i = 0; i < this.lineageIds.length; i++) {
            this.data.push({
                type: "line",
                markerType: "none",
                color: this.getColor(i),
                showInLegend: true,
                name: this.lineageIds[i],
                legendText: `Lineage ${i + 1}`,
                dataPoints: []
            });
        }

        this.addAllDataPoints();
    }

    getAllLineages() {
        const ids = new Set();
        for (let record of FossilRecord.lineage_counts) {
            for (let id in record) {
                ids.add(id);
            }
        }
        return Array.from(ids).sort();
    }

    addDataPoint(i) {
        const t = FossilRecord.tick_record[i];
        const lineageCounts = FossilRecord.lineage_counts[i] || {};
        for (let series of this.data) {
            const population = lineageCounts[series.name] || 0;
            series.dataPoints.push({ x: t, y: population });
        }
    }

    updateData() {
        this.setData();
    }

    getColor(index) {
        const colors = [
            '#333333', '#1f77b4', '#ff7f0e', '#2ca02c', '#f48fb1', '#9467bd', '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf'
        ];
        if (index < colors.length) {
            return colors[index];
        }
        const hue = (index * 42) % 360;
        return `hsl(${hue}, 65%, 45%)`;
    }
}

module.exports = LineageChart;
