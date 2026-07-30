const PopulationChart = require("./Charts/PopulationChart");
const SpeciesChart = require("./Charts/SpeciesChart");
const LineageChart = require("./Charts/LineageChart");
const AvgSurvivalChart = require("./Charts/AvgSurvivalChart");
const alarmStrengthChart = require("./Charts/alarmStrengthChart");
const AlarmCallsChart = require("./Charts/AlarmCallsChart");
const MutationChart = require("./Charts/MutationChart");
const CellsChart = require("./Charts/CellsChart");
const FossilRecord = require("./FossilRecord");


const ChartSelections = [PopulationChart, SpeciesChart, LineageChart, AvgSurvivalChart, alarmStrengthChart, AlarmCallsChart, CellsChart, MutationChart];

class StatsPanel {
    constructor(env) {
        this.defineControls();
        this.chart_selection = 0;
        this.setChart();
        this.env = env;
        this.last_reset_count=env.reset_count;
    }

    setChart(selection=this.chart_selection) {
        this.chart_controller = new ChartSelections[selection]();
        this.chart_controller.setData();
        this.chart_controller.render();
    }

    startAutoRender() {
        this.setChart();
        this.render_loop = setInterval(function(){this.updateChart();}.bind(this), 1000);
    }

    stopAutoRender() {
        clearInterval(this.render_loop);
    }

    defineControls() {
        $('#chart-option').change ( function() {
            this.chart_selection = $("#chart-option")[0].selectedIndex;
            this.setChart();
        }.bind(this));
    }

    updateChart() {
        if (this.last_reset_count < this.env.reset_count){
            this.reset()
        }
        this.last_reset_count = this.env.reset_count;
        this.chart_controller.updateData();
        this.chart_controller.render();
    }

    updateDetails() {
        var org_count = this.env.organisms.length;
        $('#org-count').text("Total Population: " + org_count);
        $('#species-count').text("Number of Species: " + FossilRecord.numExtantSpecies());
        let top_species = FossilRecord.getMostPopulousSpecies();
        if (top_species)
            $('#top-species').text("Most Populous Species: \"" + top_species.name + "\" (" + top_species.population + " organisms)");
        else    
            $('#top-species').text("Most Populous Species: None");
        $('#largest-org').text("Largest Organism Ever: " + this.env.largest_cell_count + " cells");
        $('#avg-mut').text("Average Mutation Rate: " + Math.round(this.env.averageMutability() * 100) / 100);
        const preyOrgs = this.env.organisms.filter(o => o.role === "prey" && o.living);
        const avgAlarm = preyOrgs.length > 0 ? preyOrgs.reduce((sum, o) => sum + o.alarmStrength, 0) / preyOrgs.length : 0;
        $('#avg-alarm').text("Average Prey Alarm Probability: " + avgAlarm.toFixed(2));
    }

    reset() {
        this.setChart();
    }
    
}

module.exports = StatsPanel;