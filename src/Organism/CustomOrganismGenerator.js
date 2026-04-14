const CellStates = require("./Cell/CellStates");
const Organism = require("./Organism");

class CustomOrganismGenerator {

    // CREATE PREY
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

        // Spawn prey in clusters 
        let clusterSize = 5; // prey per cluster
        let numClusters = Math.ceil(numPrey / clusterSize);

        for (let i = 0; i < numClusters; i++) {
            let pos = this.findValidPosition(env);
            if (!pos) continue;

            let [c, r] = pos;

            spawned += this.spawnPreyCluster(env, c, r, clusterSize, 2);
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

    static spawnPreyCluster(env, centerC, centerR, size = 5, spread = 2) {
        let spawned = 0;

        for (let i = 0; i < size; i++) {
            let offsetC = Math.floor(Math.random() * (2 * spread + 1)) - spread;
            let offsetR = Math.floor(Math.random() * (2 * spread + 1)) - spread;

            let c = centerC + offsetC;
            let r = centerR + offsetR;

            let prey = this.createPrey(env, c, r);

            if (this.tryAddOrganism(env, prey, c, r)) {
                spawned++;
            }
        }

        return spawned;
    }
}

module.exports = CustomOrganismGenerator;