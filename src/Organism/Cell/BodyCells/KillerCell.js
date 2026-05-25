const CellStates = require("../CellStates");
const BodyCell = require("./BodyCell");
const Hyperparams = require("../../../Hyperparameters");

class KillerCell extends BodyCell{
    constructor(org, loc_col, loc_row){
        super(CellStates.killer, org, loc_col, loc_row);
    }

    performFunction() {
        var env = this.org.env;
        var c = this.getRealCol();
        var r = this.getRealRow();
        for (var loc of Hyperparams.killableNeighbors) {
            var cell = env.grid_map.cellAt(c+loc[0], r+loc[1]);
            this.killNeighbor(cell);
        }
    }

    killNeighbor(n_cell) {
        if(n_cell == null || n_cell.owner == null || n_cell.owner == this.org || !n_cell.owner.living || n_cell.state == CellStates.armor || n_cell.state == CellStates.killer)
            return;
        var targetOrg = n_cell.owner;
        if (targetOrg.role !== "prey")
            return;
        if (Hyperparams.dontKillSameSpecies && targetOrg.species.name === this.org.species.name)
            return;
        if (this.org.env.isInSafeZone(n_cell.col, n_cell.row))
            return;
        targetOrg.harm();
        if (!targetOrg.living) {
            this.org.food_collected += targetOrg.anatomy.cells.length;
            this.org.ticksSinceMeal = 0;
            //console.log(`Predator at (${this.org.c}, ${this.org.r}) reset starvation after kill; ticksSinceMeal=${this.org.ticksSinceMeal}`);
        }
    }
}

module.exports = KillerCell;
