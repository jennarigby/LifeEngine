const CellStates = require("./Cell/CellStates");
const Organism = require("./Organism");
const Directions = require('./Directions');
const LineageColors = require('../Rendering/LineageColors');
const Hyperparams = require("../Hyperparameters");
const { createSeededRng, normalizeSeed, shuffle } = require('../WorldSeed');

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
        org.alarmStrength = Hyperparams.alarmSignallingEnabled ? 0.5 : 0;

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

    static buildPlacementCandidates(anchorC, anchorR, width, height, seedTag, seedValue, maxRadius = null) {
        const radiusLimit = maxRadius || Math.max(10, Math.ceil(Math.sqrt(Math.max(width, height) / 3)));
        const positions = [];
        const startRadius = 4;

        for (let radius = startRadius; radius <= radiusLimit; radius++) {
            const ringPositions = [];
            for (let dc = -radius; dc <= radius; dc++) {
                const maxDr = Math.max(0, radius - Math.abs(dc));
                for (let dr = -maxDr; dr <= maxDr; dr++) {
                    const c = anchorC + dc;
                    const r = anchorR + dr;
                    if (c < 1 || c > width - 2 || r < 1 || r > height - 2) continue;
                    ringPositions.push([c, r]);
                }
            }

            const shuffledRing = shuffle(ringPositions, createSeededRng(`${seedValue}-${seedTag}-ring-${radius}`));
            positions.push(...shuffledRing);
        }

        return positions;
    }


    // SPAWN POPULATION
    static spawnPopulation(env, numPrey, numPredators, preset = null, rng = null) {
        let spawned = 0;
        const width = env.grid_map.cols;
        const height = env.grid_map.rows;
        const margin = 6;
        const seedValue = env && env.worldSeed !== undefined ? env.worldSeed : 0;
        const seededRng = rng || createSeededRng(seedValue);

        const resolvedPreset = preset || {
            preyAnchors: [
                [Math.floor(width / 2), Math.floor(height / 2)],
                [Math.floor(width / 2) - 18, Math.floor(height / 2)],
                [Math.floor(width / 2) + 18, Math.floor(height / 2)],
                [Math.floor(width / 2), Math.floor(height / 2) - 14],
                [Math.floor(width / 2), Math.floor(height / 2) + 14],
            ],
            predatorPositions: [
                [Math.floor(width / 2), margin + 2],
                [Math.floor(width / 2), height - margin - 3],
                [margin + 2, Math.floor(height / 2)],
                [width - margin - 3, Math.floor(height / 2)],
            ],
        };

        const clusterAnchors = resolvedPreset.preyAnchors || [
            [Math.floor(width / 2), Math.floor(height / 2)],
            [Math.floor(width / 2) - 18, Math.floor(height / 2)],
            [Math.floor(width / 2) + 18, Math.floor(height / 2)],
            [Math.floor(width / 2), Math.floor(height / 2) - 14],
            [Math.floor(width / 2), Math.floor(height / 2) + 14],
        ];
        const predatorPositions = resolvedPreset.predatorPositions || [
            [Math.floor(width / 2), margin + 2],
            [Math.floor(width / 2), height - margin - 3],
            [margin + 2, Math.floor(height / 2)],
            [width - margin - 3, Math.floor(height / 2)],
        ];

        const lineageAlarmProbabilities = Hyperparams.alarmSignallingEnabled ? [0.5, 0.5, 0.5, 0.5, 0.5] : [0, 0, 0, 0, 0];

        for (let clusterIndex = 0; clusterIndex < clusterAnchors.length; clusterIndex++) {
            const [anchorC, anchorR] = clusterAnchors[clusterIndex];
            const founder = this.createPrey(env, anchorC, anchorR);
            founder.alarmStrength = lineageAlarmProbabilities[clusterIndex % lineageAlarmProbabilities.length];
            founder.id = founder.generateId ? founder.generateId() : `founder_${Date.now()}_${seededRng()}`;
            const lineageId = `lineage_${clusterIndex + 1}`;
            const lineageColor = LineageColors.getColor(lineageId);
            console.log(`%c[Lineage ${clusterIndex + 1}] p=${Number(founder.alarmStrength).toFixed(2)} at (${anchorC}, ${anchorR})`, `color: ${lineageColor}; font-weight: bold;`);
            founder.lineageId = lineageId;
            founder.generation = 0;
            founder.ancestors = [];

            const preyPerCluster = 20;
            let placedInCluster = 0;
            const placementCandidates = this.buildPlacementCandidates(anchorC, anchorR, width, height, `cluster-${clusterIndex}`, seedValue);

            for (let i = 0; i < preyPerCluster; i++) {
                let placed = false;
                for (const [c, r] of placementCandidates) {
                    const sibling = new (require('./Organism'))(c, r, env, founder);
                    if (this.tryAddOrganism(env, sibling, c, r)) {
                        spawned++;
                        placedInCluster++;
                        placed = true;
                        break;
                    }
                }

                if (!placed) {
                    console.warn(`[spawn] failed to place prey ${i + 1}/${preyPerCluster} for lineage ${clusterIndex + 1}`);
                }
            }

            console.log(`Family at (${anchorC}, ${anchorR}) — placed ${placedInCluster} siblings`);
        }

        const fallbackOffsets = [
            [1, 0], [-1, 0], [0, 1], [0, -1],
            [2, 0], [-2, 0], [0, 2], [0, -2],
        ];

        const orderedPredatorPositions = shuffle(predatorPositions, createSeededRng(`${seedValue}-predators`));
        for (let i = 0; i < Math.min(numPredators, orderedPredatorPositions.length); i++) {
            let placed = false;
            const [preferredC, preferredR] = orderedPredatorPositions[i];
            const placementCandidates = this.buildPlacementCandidates(preferredC, preferredR, width, height, `predator-${i}`, seedValue, Math.max(15, Math.floor(Math.sqrt(width + height) / 2)));
            for (const [c, r] of placementCandidates) {
                const predator = this.createPredator(env, c, r);
                if (this.tryAddOrganism(env, predator, c, r)) {
                    spawned++;
                    placed = true;
                    break;
                }
            }

            if (!placed) {
                const fallbackCandidates = [];
                for (let c = 1; c < width - 1; c++) {
                    for (let r = 1; r < height - 1; r++) {
                        fallbackCandidates.push([c, r]);
                    }
                }
                fallbackCandidates.sort((a, b) => {
                    const distA = Math.abs(a[0] - preferredC) + Math.abs(a[1] - preferredR);
                    const distB = Math.abs(b[0] - preferredC) + Math.abs(b[1] - preferredR);
                    return distA - distB || a[0] - b[0] || a[1] - b[1];
                });

                for (const [c, r] of fallbackCandidates) {
                    const predator = this.createPredator(env, c, r);
                    if (this.tryAddOrganism(env, predator, c, r)) {
                        spawned++;
                        placed = true;
                        break;
                    }
                }
            }

            if (!placed) {
                console.warn(`[spawn] failed to place predator ${i + 1}/${Math.min(numPredators, orderedPredatorPositions.length)}`);
            }
        }

        if (spawned < numPrey + numPredators) {
            console.warn(`Spawned only ${spawned} organisms out of requested ${numPrey + numPredators}`);
        }
        console.log("Spawned organisms:", spawned);
    }
}

module.exports = CustomOrganismGenerator;