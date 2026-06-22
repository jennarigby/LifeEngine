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
        org.alarmProbability = 0.75;

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
        const margin = 6;

        const clusterOffsets = [
            [0, 0], [0, 3], [0, 6], [0, 9], [0, 12],
            [3, 0], [3, 3], [3, 6], [3, 9], [3, 12]
        ];

        const clusterAnchors = [
            [margin + 3, margin + 3],
            [width - margin - 5, margin + 3],
            [margin + 3, height - margin - 15],
            [width - margin - 5, height - margin - 15],
            [Math.floor(width / 2) - 1, Math.floor(height / 2) - 7]
        ];

        for (let clusterIndex = 0; clusterIndex < clusterAnchors.length; clusterIndex++) {
            let [anchorC, anchorR] = clusterAnchors[clusterIndex];
            let founder = this.createPrey(env, anchorC, anchorR);
            founder.id = founder.generateId ? founder.generateId() : `founder_${Date.now()}_${Math.random()}`;
            founder.lineageId = `lineage_${clusterIndex + 1}`;
            founder.generation = 0;
            founder.ancestors = [];

            const preyPerCluster = Math.min(10, clusterOffsets.length); // cap at 10 per family

            let placedInCluster = 0;
            for (let i = 0; i < preyPerCluster; i++) {
                let [dx, dy] = clusterOffsets[i];
                const c = anchorC + dx;
                const r = anchorR + dy;

                if (c < 1 || c > width - 2 || r < 1 || r > height - 2) continue;

                let sibling = new (require('./Organism'))(c, r, env, founder);
                if (this.tryAddOrganism(env, sibling, c, r)) {
                    spawned++;
                    placedInCluster++;
                }
            }
            console.log(`Family at (${anchorC}, ${anchorR}) — placed ${placedInCluster} siblings`);
        }
    



        // Fixed predator positions, separated from prey clusters
        const predatorPositions = [
            [Math.floor(width / 2), margin + 2],
            [Math.floor(width / 2), height - margin - 3],
            [margin + 2, Math.floor(height / 4)],
            [width - margin - 3, Math.floor((height * 3) / 4)],
            [margin + 2, Math.floor((height * 3) / 4)]
        ];

        const fallbackOffsets = [
            [1, 0], [-1, 0], [0, 1], [0, -1],
            [2, 0], [-2, 0], [0, 2], [0, -2]
        ];

        for (let i = 0; i < Math.min(numPredators, predatorPositions.length); i++) {
            let [c, r] = predatorPositions[i];
            let predator = this.createPredator(env, c, r);
            if (this.tryAddOrganism(env, predator, c, r)) {
                spawned++;
                continue;
            }

            // try nearby deterministic alternate spots if the anchor is occupied
            for (let [dx, dy] of fallbackOffsets) {
                let fc = Math.max(0, Math.min(width - 1, c + dx));
                let fr = Math.max(0, Math.min(height - 1, r + dy));
                let predator2 = this.createPredator(env, fc, fr);
                if (this.tryAddOrganism(env, predator2, fc, fr)) {
                    spawned++;
                    break;
                }
            }
        }

        if (spawned < numPrey + numPredators) {
            console.warn(`Spawned only ${spawned} organisms out of requested ${numPrey + numPredators}`);
        }
        console.log("Spawned organisms:", spawned);
    }
}

module.exports = CustomOrganismGenerator;