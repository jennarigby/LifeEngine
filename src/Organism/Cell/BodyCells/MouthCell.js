const CellStates = require("../CellStates");
const BodyCell = require("./BodyCell");
const Hyperparams = require("../../../Hyperparameters");

class MouthCell extends BodyCell{
    constructor(org, loc_col, loc_row){
        super(CellStates.mouth, org, loc_col, loc_row);
    }

    performFunction() {
        var env = this.org.env;
        var real_c = this.getRealCol();
        var real_r = this.getRealRow();
        
        let foodFound = false;
        for (var loc of Hyperparams.edibleNeighbors){
            var cell = env.grid_map.cellAt(real_c+loc[0], real_r+loc[1]);
            if (cell && cell.state == CellStates.food && this.org.role === "prey") {
                foodFound = true;
            }
            this.eatNeighbor(cell, env);
        }
        
        // Debug: log when prey checks for food but finds none
        // if (!foodFound && this.org.role === "prey") {
        //     console.log(`[PREY][SEARCH] Organism at (${this.org.c}, ${this.org.r}) searching for food - none found nearby`);
        // }
    }

    eatNeighbor(n_cell, env) {
        if (n_cell == null)
            return;
        if (n_cell.state == CellStates.food && this.org.role === "prey"){
            env.changeCell(n_cell.col, n_cell.row, CellStates.empty, null);
            this.org.food_collected++;
            // Log prey food consumption and progress towards reproduction
            const foodNeeded = this.org.foodNeeded();
            const progress = ((this.org.food_collected / foodNeeded) * 100).toFixed(1);
            //console.log(`[PREY][EAT] Organism at (${this.org.c}, ${this.org.r}) - Food: ${this.org.food_collected}/${foodNeeded} (${progress}% to reproduce)`);
        }
    }
}

module.exports = MouthCell;