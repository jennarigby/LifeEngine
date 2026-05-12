const CellStates = require("./Cell/CellStates");
const Organism = require("./Organism");

class CustomOrganismGenerator {

    // CREATE PREY
    static createPrey(env, col, row) {
        let org = new Organism(col, row, env);

        org.role = "prey";

        // Core body 
        org.anatomy.addDefaultCell(CellStates.mouth, 0, 0);

        // Movement 
        org.anatomy.addDefaultCell(CellStates.mover, 1, 0);

        // Optional features
        org.anatomy.addRandomizedCell(CellStates.eye, 0, 1);

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

        // Attack (important)
        org.anatomy.addDefaultCell(CellStates.killer, 0, 1);

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
        const baseC = Math.floor(width / 2);
        const baseR = Math.floor(height / 2);

        // Spawn prey at deterministic grid positions
        let gridSpacing = 10; // space between prey
        let preyIndex = 0;
        for (let c = gridSpacing; c < width && preyIndex < numPrey; c += gridSpacing) {
            for (let r = gridSpacing; r < height && preyIndex < numPrey; r += gridSpacing) {
                let prey = this.createPrey(env, c, r);
                if (this.tryAddOrganism(env, prey, c, r)) {
                    spawned++;
                    preyIndex++;
                }
            }
        }

        // Spawn predators at fixed positions relative to center
        const predatorPositions = [
            [baseC, baseR - 6],
            [baseC - 5, baseR],
            [baseC + 5, baseR],
            [baseC - 4, baseR + 4],
            [baseC + 4, baseR + 4]
        ];

        for (let i = 0; i < numPredators; i++) {
            let [c, r] = predatorPositions[i] || [baseC + 6 + i, baseR];
            let predator = this.createPredator(env, c, r);

            if (this.tryAddOrganism(env, predator, c, r)) {
                spawned++;
                continue;
            }

            // Fallback deterministic scan if the target spot is occupied
            let fallback = this.findValidPosition(env, 200);
            if (fallback) {
                let [fc, fr] = fallback;
                let predator2 = this.createPredator(env, fc, fr);
                if (this.tryAddOrganism(env, predator2, fc, fr)) {
                    spawned++;
                }
            }
        }

        console.log("Spawned organisms:", spawned);
    }
}

module.exports = CustomOrganismGenerator;