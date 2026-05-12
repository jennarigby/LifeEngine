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
        const width = env.grid_map.cols;
        const height = env.grid_map.rows;
        const baseC = Math.floor(width / 2);
        const baseR = Math.floor(height / 2);

        // Spawn prey in deterministic clusters around center
        let clusterSize = 5; // prey per cluster
        let numClusters = Math.ceil(numPrey / clusterSize);
        let angleStep = (2 * Math.PI) / Math.max(numClusters, 1);

        for (let i = 0; i < numClusters; i++) {
            let angle = i * angleStep;
            let radius = 6 + Math.floor(i / 3) * 2;
            let c = baseC + Math.round(Math.cos(angle) * radius);
            let r = baseR + Math.round(Math.sin(angle) * radius);

            spawned += this.spawnPreyCluster(env, c, r, clusterSize);
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

    static spawnPreyCluster(env, centerC, centerR, size = 5) {
        let spawned = 0;
        const offsets = [
            [0, 0],
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
            [2, 0],
            [-2, 0],
            [0, 2],
            [0, -2],
            [1, 1],
            [-1, -1],
            [1, -1],
            [-1, 1]
        ];

        for (let i = 0; i < size && i < offsets.length; i++) {
            let [offsetC, offsetR] = offsets[i];
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