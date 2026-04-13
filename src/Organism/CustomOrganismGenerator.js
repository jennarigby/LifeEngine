const CellStates = require("./Cell/CellStates");
const Organism = require("./Organism");

class CustomOrganismGenerator {

    // =========================
    // CREATE PREY
    // =========================
    static createPrey(env, col, row) {
        let org = new Organism(col, row, env);

        org.role = "prey";

        // Core body (MUST exist)
        org.anatomy.addDefaultCell(CellStates.mouth, 0, 0);

        // Movement (MUST exist)
        org.anatomy.addDefaultCell(CellStates.mover, 1, 0);

        // Optional features (safe to randomize)
        org.anatomy.addRandomizedCell(CellStates.eye, 0, 1);

        return org;
    }

    // =========================
    // CREATE PREDATOR
    // =========================
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

    // =========================
    // FIND VALID POSITION
    // =========================
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
            addPop: () => {},
            decreasePop: () => {}
        };

        env.addOrganism(org);
        return true;
    }

    // =========================
    // SPAWN POPULATION
    // =========================
    static spawnPopulation(env, numPrey, numPredators) {

        let spawned = 0;

        // Spawn prey
        for (let i = 0; i < numPrey; i++) {
            let pos = this.findValidPosition(env);
            if (!pos) continue;

            let [c, r] = pos;
            let prey = this.createPrey(env, c, r);

            if (this.tryAddOrganism(env, prey, c, r)) {
                spawned++;
            }
        }

        // Spawn predators
        for (let i = 0; i < numPredators; i++) {
            let pos = this.findValidPosition(env);
            if (!pos) continue;

            let [c, r] = pos;
            let predator = this.createPredator(env, c, r);

            if (this.tryAddOrganism(env, predator, c, r)) {
                spawned++;
            }
        }

        console.log("Spawned organisms:", spawned);
    }
}

module.exports = CustomOrganismGenerator;