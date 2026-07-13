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
        const margin = 6;

        const clusterAnchors = [
            [margin + 3, margin + 3],
            [width - margin - 5, margin + 3],
            [margin + 3, height - margin - 15],
            [width - margin - 5, height - margin - 15],
            [Math.floor(width / 2) - 1, Math.floor(height / 2) - 7]
        ];

        const lineageOffsetGroups = [
            [[0, 0], [0, 4]],
            [[4, 0], [4, 4]],
            [[0, -4], [4, -4]],
            [[-4, 0], [-4, 4]],
            [[-4, -4], [0, 8]]
        ];

        const lineages = [];
        for (let lineageIndex = 0; lineageIndex < clusterAnchors.length; lineageIndex++) {
            let prototype = this.createPrey(env, 0, 0);
            prototype.lineageId = `lineage_${lineageIndex + 1}`;
            prototype.generation = 0;
            prototype.parentId = null;
            prototype.ancestors = [];
            prototype.species = {
                name: prototype.role,
                addPop: () => { },
                decreasePop: () => { }
            };
            lineages.push(prototype);
        }

        for (let anchorIndex = 0; anchorIndex < clusterAnchors.length; anchorIndex++) {
            let [anchorC, anchorR] = clusterAnchors[anchorIndex];
            let placedInCluster = 0;

            for (let lineageIndex = 0; lineageIndex < lineages.length; lineageIndex++) {
                let lineageProto = lineages[lineageIndex];
                let offsets = lineageOffsetGroups[lineageIndex];

                for (let [dx, dy] of offsets) {
                    const c = Math.max(1, Math.min(width - 2, anchorC + dx));
                    const r = Math.max(1, Math.min(height - 2, anchorR + dy));

                    let sibling = new (require('./Organism'))(c, r, env, lineageProto);
                    if (this.tryAddOrganism(env, sibling, c, r)) {
                        spawned++;
                        placedInCluster++;
                    }
                }
            }

            console.log(`Food source at (${anchorC}, ${anchorR}) — placed ${placedInCluster} lineage siblings`);
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