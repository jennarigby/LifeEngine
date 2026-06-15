const CellStates = require("./Cell/CellStates");
const Organism = require("./Organism");
const Directions = require('./Directions');

class CustomOrganismGenerator {

    static createPrey(env, col, row) {
        let org = new Organism(col, row, env);
        org.role = "prey";

        // Core body
        org.anatomy.addDefaultCell(CellStates.mouth, 0, 0);

        // Movement
        org.anatomy.addDefaultCell(CellStates.mover, 1, 0);

        // Four eyes facing all directions
        org.anatomy.addDefaultCell(CellStates.eye, 0, -1);
        org.anatomy.addDefaultCell(CellStates.eye, 0, 1);
        org.anatomy.addDefaultCell(CellStates.eye, -1, 0);
        

        // Set eye directions
        const eyeDirections = [Directions.up, Directions.down, Directions.left, Directions.right];
        let eyeIndex = 0;
        for (let cell of org.anatomy.cells) {
            if (cell.state.name === CellStates.eye.name) {
                cell.direction = eyeDirections[eyeIndex++];
            }
        }
        org.alarmProbability = 0.5;

        return org;
    }

    // CREATE PREDATOR
    static createPredator(env, col, row) {
        let org = new Organism(col, row, env);

        org.role = "predator";

        // Core body
        org.anatomy.addDefaultCell(CellStates.mouth, 0, 0);

        // Movement
        org.anatomy.addDefaultCell(CellStates.mover, 1, 0);

        // Attack 
        org.anatomy.addDefaultCell(CellStates.killer, 0, 1);
        org.anatomy.addDefaultCell(CellStates.killer, 0, -1);

        // Vision
        org.anatomy.addRandomizedCell(CellStates.eye, -1, 0);

        return org;
    }

    // FIND VALID POSITION
    static findValidPosition(env, maxAttempts = 50) {
        const width = env.grid_map.cols;
        const height = env.grid_map.rows;

        for (let i = 0; i < maxAttempts; i++) {
            let c = Math.floor(Math.random() * width);
            let r = Math.floor(Math.random() * height);

            let cell = env.grid_map.cellAt(c, r);

            if (cell && cell.state === CellStates.empty) {
                return [c, r];
            }
        }

        return null; // failed to find space
    }

    // =========================
    // ADD ORGANISM SAFELY
    // =========================
    static tryAddOrganism(env, org, c, r) {
        // Ensure placement is valid
        if (!org.isClear(c, r)) return false;

        // Temporary species fix (prevents crashes)
        org.species = {
            name: org.role,
            addPop: () => { },
            decreasePop: () => { }
        };

        env.addOrganism(org);
        return true;
    }


    // SPAWN POPULATION
    static spawnPopulation(env, numPrey, numPredators) {
        let spawned = 0;
        const width = env.grid_map.cols;
        const height = env.grid_map.rows;
        const halfWidth = Math.floor(width / 2);
        const gridSpacing = 10;
        const margin = 5;

        // Calculate grid positions symmetrically
        const cols = Math.floor((halfWidth - margin) / gridSpacing);
        const rows = Math.floor((height - margin * 2) / gridSpacing);
        let preyIndex = 0;

        for (let ci = 0; ci < cols && preyIndex < numPrey; ci++) {
            for (let ri = 0; ri < rows && preyIndex < numPrey; ri++) {
                let r = margin + ri * gridSpacing;

                // Left side position
                let cLeft = margin + ci * gridSpacing;
                // Mirror on right side
                let cRight = width - margin - ci * gridSpacing;

                let preyLeft = this.createPrey(env, cLeft, r);
                if (this.tryAddOrganism(env, preyLeft, cLeft, r)) {
                    spawned++;
                    preyIndex++;
                }

                if (preyIndex < numPrey) {
                    let preyRight = this.createPrey(env, cRight, r);
                    if (this.tryAddOrganism(env, preyRight, cRight, r)) {
                        spawned++;
                        preyIndex++;
                    }
                }
            }
        }

        // One predator in each corner
        const cornerPositions = [
            [margin, margin],
            [width - margin, margin],
            [margin, height - margin],
            [width - margin, height - margin],
        ];

        for (let i = 0; i < Math.min(numPredators, cornerPositions.length); i++) {
            let [c, r] = cornerPositions[i];
            let predator = this.createPredator(env, c, r);
            if (this.tryAddOrganism(env, predator, c, r)) {
                spawned++;
                continue;
            }
            let fallback = this.findValidPosition(env, 200);
            if (fallback) {
                let [fc, fr] = fallback;
                let predator2 = this.createPredator(env, fc, fr);
                if (this.tryAddOrganism(env, predator2, fc, fr)) spawned++;
            }
        }

        console.log("Spawned organisms:", spawned);
    }
}

module.exports = CustomOrganismGenerator;