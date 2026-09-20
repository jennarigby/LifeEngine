const CellStates = require("./Cell/CellStates");
const Organism = require("./Organism");
const Directions = require('./Directions');
const LineageColors = require('../Rendering/LineageColors');
const Hyperparams = require("../Hyperparameters");
const { createSeededRng, normalizeSeed, shuffle } = require('../WorldSeed');

class CustomOrganismGenerator {

    // Creates a prey organism with a fixed body structure and initial alarm-signalling strength.
    static createPrey(env, col, row) {
        let org = new Organism(col, row, env);
        org.role = "prey";

        // Core body: mouth used for food consumption.
        org.anatomy.addDefaultCell(CellStates.mouth, 0, 0);

        // Movement
        org.anatomy.addDefaultCell(CellStates.mover, 1, 0);

        // Three eyes facing different directions
        org.anatomy.addDefaultCell(CellStates.eye, 0, -1);
        org.anatomy.addDefaultCell(CellStates.eye, 0, 1);
        org.anatomy.addDefaultCell(CellStates.eye, -1, 0);


        // Assign a different viewing direction to each eye.
        const eyeDirections = [Directions.up, Directions.down, Directions.left, Directions.right];
        let eyeIndex = 0;
        for (let cell of org.anatomy.cells) {
            if (cell.state.name === CellStates.eye.name) {
                cell.direction = eyeDirections[eyeIndex++];
            }
        }

        // Initialise alarm strength at the midpoint of its possible range when alarm signalling is enabled.
        org.alarmStrength = Hyperparams.alarmSignallingEnabled ? 0.5 : 0;

        return org;
    }

    // Creates a predator with movement, attack, and vision capabilities.
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

        // Randomised eye provides predator vision.
        org.anatomy.addRandomizedCell(CellStates.eye, -1, 0);

        return org;
    }

    // Attempts to find an empty location in the environment for spawning an organism. Returns null if no valid position is found.
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

    // Checks whether an organism can be placed at the requested position before adding it to the environment.
    static tryAddOrganism(env, org, c, r) {
        // Prevent organisms from being placed on occupied cells or otherwise invalid locations.
        if (!org.isClear(c, r)) return false;

         // Temporary species object required by the existing Life Engine population-management functionality.
        org.species = {
            name: org.role,
            addPop: () => { },
            decreasePop: () => { }
        };

        env.addOrganism(org);
        return true;
    }

    // Generates candidate positions around an anchor point so that prey can be spawned in spatially clustered family groups.
    static buildPlacementCandidates(anchorC, anchorR, width, height, seedTag, seedValue, maxRadius = null) {
        
        // Determine how far from the anchor positions may be considered.
        const radiusLimit = maxRadius || Math.max(10, Math.ceil(Math.sqrt(Math.max(width, height) / 3)));
        const positions = [];
        const startRadius = 4;

        // Search progressively larger rings around the anchor.
        for (let radius = startRadius; radius <= radiusLimit; radius++) {
            const ringPositions = [];
            for (let dc = -radius; dc <= radius; dc++) {
                const maxDr = Math.max(0, radius - Math.abs(dc));
                for (let dr = -maxDr; dr <= maxDr; dr++) {
                    const c = anchorC + dc;
                    const r = anchorR + dr;
                    // Keep organisms away from the outer boundary.
                    if (c < 1 || c > width - 2 || r < 1 || r > height - 2) continue;
                    ringPositions.push([c, r]);
                }
            }

            // Shuffle each ring deterministically so that the same world seed produces the same initial spatial arrangement.
            const shuffledRing = shuffle(ringPositions, createSeededRng(`${seedValue}-${seedTag}-ring-${radius}`));
            positions.push(...shuffledRing);
        }

        return positions;
    }


    // Creates the initial prey and predator populations. Prey are organised into spatially separated family clusters, while predators are placed
    // at predefined locations around the environment.
    static spawnPopulation(env, numPrey, numPredators, preset = null, rng = null) {
        let spawned = 0;
        const width = env.grid_map.cols;
        const height = env.grid_map.rows;
        const margin = 6;

        // Use the environment's world seed so that initial placement can be reproduced across simulation runs.
        const seedValue = env && env.worldSeed !== undefined ? env.worldSeed : 0;
        const seededRng = rng || createSeededRng(seedValue);

        // Define default starting locations when no custom preset is supplied.
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

        // Retrieve prey cluster anchors and predator starting positions from the supplied preset or the defaults above.
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

        // Initialise all founder lineages with a starting alarm signalling strength - currently set to 0.5 for all lineages when alarm signalling is enabled, or 0 when disabled.
        const lineageAlarmProbabilities = Hyperparams.alarmSignallingEnabled ? [0.5, 0.5, 0.5, 0.5, 0.5] : [0, 0, 0, 0, 0];

        // Each anchor represents the founder of a separate prey lineage.
        // Offspring are placed near the founder to create spatial kin clusters.
        for (let clusterIndex = 0; clusterIndex < clusterAnchors.length; clusterIndex++) {
            const [anchorC, anchorR] = clusterAnchors[clusterIndex];

            // Create the founder at the centre of the cluster.
            const founder = this.createPrey(env, anchorC, anchorR);
            founder.alarmStrength = lineageAlarmProbabilities[clusterIndex % lineageAlarmProbabilities.length];
            founder.id = founder.generateId ? founder.generateId() : `founder_${Date.now()}_${seededRng()}`;
            const lineageId = `lineage_${clusterIndex + 1}`;
            const lineageColor = LineageColors.getColor(lineageId);
            console.log(`%c[Lineage ${clusterIndex + 1}] p=${Number(founder.alarmStrength).toFixed(2)} at (${anchorC}, ${anchorR})`, `color: ${lineageColor}; font-weight: bold;`);
            founder.lineageId = lineageId;
            founder.generation = 0;
            founder.ancestors = [];

            // Spawn a fixed number of prey per lineage to maintain consistent initial population structure across experimental runs.
            const preyPerCluster = 20;
            let placedInCluster = 0;

            // Generate deterministic candidate positions around the founder.
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

                // Warn if there are insufficient valid positions for the requested number of offspring
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

        // Shuffle the predefined predator locations deterministically so predator placement varies between seeds while remaining reproducible.
        const orderedPredatorPositions = shuffle(predatorPositions, createSeededRng(`${seedValue}-predators`));
        for (let i = 0; i < Math.min(numPredators, orderedPredatorPositions.length); i++) {
            let placed = false;
            const [preferredC, preferredR] = orderedPredatorPositions[i];

            // First attempt to place the predator near its preferred position.
            const placementCandidates = this.buildPlacementCandidates(preferredC, preferredR, width, height, `predator-${i}`, seedValue, Math.max(15, Math.floor(Math.sqrt(width + height) / 2)));
            for (const [c, r] of placementCandidates) {
                const predator = this.createPredator(env, c, r);
                if (this.tryAddOrganism(env, predator, c, r)) {
                    spawned++;
                    placed = true;
                    break;
                }
            }

            // If no suitable position was found near the preferred location, search the rest of the environment as a fallback.
            if (!placed) {
                const fallbackCandidates = [];
                for (let c = 1; c < width - 1; c++) {
                    for (let r = 1; r < height - 1; r++) {
                        fallbackCandidates.push([c, r]);
                    }
                }

                // Sort positions by Manhattan distance from the preferred location, ensuring the closest available position is tried first.
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