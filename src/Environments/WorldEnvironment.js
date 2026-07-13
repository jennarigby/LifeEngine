const Environment = require('./Environment');
const Renderer = require('../Rendering/Renderer');
const GridMap = require('../Grid/GridMap');
const Organism = require('../Organism/Organism');
const CellStates = require('../Organism/Cell/CellStates');
const EnvironmentController = require('../Controllers/EnvironmentController');
const Hyperparams = require('../Hyperparameters.js');
const FossilRecord = require('../Stats/FossilRecord');
const WorldConfig = require('../WorldConfig');
const SerializeHelper = require('../Utils/SerializeHelper');
const Species = require('../Stats/Species');
const CustomOrganismGenerator = require('../Organism/CustomOrganismGenerator');

class WorldEnvironment extends Environment {
    constructor(engine, cell_size) {
        super();
        this.engine = engine;
        this.renderer = new Renderer('env-canvas', 'env', cell_size);
        this.num_rows = WorldConfig.grid_rows || Math.ceil(this.renderer.height / cell_size);
        this.num_cols = WorldConfig.grid_cols || Math.ceil(this.renderer.width / cell_size);
        this.controller = new EnvironmentController(this, this.renderer.canvas);
        this.grid_map = new GridMap(this.num_cols, this.num_rows, cell_size);
        this.organisms = [];
        this.walls = [];
        this.total_mutability = 0;
        this.largest_cell_count = 0;
        this.reset_count = 0;
        this.total_ticks = 0;
        this.data_update_rate = 100;
        this._autoStopped = false;
        this.safeZones = [];
        this.alarmCallsThisWindow = 0;
        this.alarmCallWindowSize = 500;
        this.totalAlarmCallsLogged = 0;
        FossilRecord.setEnv(this);
        this.createSafeZone();
    }

    createSafeZone() {
        var width = Math.max(4, Math.floor(this.grid_map.cols * 0.15));
        var height = Math.max(4, Math.floor(this.grid_map.rows * 0.25));
        this.safeZones = [
            {
                cMin: 1,
                cMax: width + 1,
                rMin: 1,
                rMax: height + 1
            },
            {
                cMin: Math.max(1, this.grid_map.cols - width - 1),
                cMax: Math.max(1, this.grid_map.cols - 1),
                rMin: Math.max(1, this.grid_map.rows - height - 1),
                rMax: Math.max(1, this.grid_map.rows - 1)
            }
        ];
    }

    isInSafeZone(c, r) {
        if (!this.safeZones || this.safeZones.length === 0) return false;
        return this.safeZones.some(zone => c >= zone.cMin && c < zone.cMax && r >= zone.rMin && r < zone.rMax);
    }


    update() {


        if (this.total_ticks % 100 === 0) {
            let preds = this.organisms.filter(o => o.role === "predator");
            let prey = this.organisms.filter(o => o.role === "prey");
            
            let avgPredCells =
                preds.length > 0
                    ? preds.reduce((sum, p) => sum + p.anatomy.cells.length, 0) / preds.length
                    : 0;

            let avgPreyCells =
                prey.length > 0
                    ? prey.reduce((sum, p) => sum + p.anatomy.cells.length, 0) / prey.length
                    : 0;

            let maxPredCells =
                preds.length > 0
                    ? Math.max(...preds.map(p => p.anatomy.cells.length))
                    : 0;

            let maxPreyCells =
                prey.length > 0
                    ? Math.max(...prey.map(p => p.anatomy.cells.length))
                    : 0;

            // console.log(`
            // === TICK ${this.total_ticks} ===
            // Prey Count: ${prey.length}
            // Predator Count: ${preds.length}
            // `);

        }
        var to_remove = [];
        for (var i in this.organisms) {
            var org = this.organisms[i];
            if (!org.living || !org.update()) {
                to_remove.push(i);
            }
        }
        this.removeOrganisms(to_remove);
        if (Hyperparams.foodDropProb > 0) {
            this.generateFood();
        }

        const currentTick = this.total_ticks + 1;

        if (currentTick > 0 && currentTick % 10000 === 0) {
            let prey = this.organisms.filter(o => o.role === "prey" && o.living);
            let avgP = prey.length > 0
                ? prey.reduce((sum, o) => sum + o.alarmProbability, 0) / prey.length
                : 0;

            console.log(JSON.stringify({
                tick: currentTick,
                preyCount: prey.length,
                alarmCallsThisWindow: this.alarmCallsThisWindow,
                avgAlarmProbability: avgP.toFixed(3)
            }));
        }

        if (currentTick % this.alarmCallWindowSize === 0) {
            FossilRecord.addAlarmCallTick(currentTick, this.alarmCallsThisWindow || 0);
            this.alarmCallsThisWindow = 0;
        }

        this.total_ticks++;
        // Optionally stop at a specified tick value
        if (WorldConfig.stop_on_tick && WorldConfig.stop_tick_value > 0) {
            if (this.total_ticks >= WorldConfig.stop_tick_value) {
                if (!this._autoStopped) {
                    console.log(`[AutoStop] total_ticks=${this.total_ticks}, stop_on_tick=${WorldConfig.stop_on_tick}, stop_tick_value=${WorldConfig.stop_tick_value}`);
                    // Stop the engine directly and clear any accumulated time so the current
                    // packed update loop doesn't continue executing more steps.
                    try {
                        if (this.engine && typeof this.engine.stop === 'function') {
                            this.engine.stop();
                            this.engine.accum_ms = 0;
                        }
                    } catch (e) {
                        console.error('Failed to stop engine:', e);
                    }
                    this._autoStopped = true;
                }
            }
        }
        if (this.total_ticks % this.data_update_rate == 0) {
            FossilRecord.updateData();
        }
    }

    render() {
        if (WorldConfig.headless) {
            this.renderer.cells_to_render.clear();
            return;
        }

        this.renderer.clear();
        this.renderer.renderFullGrid(this.grid_map.grid);
        this.renderer.renderSafeZone(this.safeZones);
        this.renderer.renderAlarmGlow(this.organisms);

        const prey = this.organisms.filter(o => o.role === "prey" && o.living).length;
        const predators = this.organisms.filter(o => o.role === "predator" && o.living).length;
        //console.log(`[POP] predators=${predators}, prey=${prey}`);
    }

    renderFull() {
        this.renderer.renderFullGrid(this.grid_map.grid);
    }

    removeOrganisms(org_indeces) {
        let start_pop = this.organisms.length;
        for (var i of org_indeces.reverse()) {
            this.total_mutability -= this.organisms[i].mutability;
            this.organisms.splice(i, 1);
        }
        if (this.organisms.length === 0 && start_pop > 0) {
            if (WorldConfig.auto_pause)
                $('.pause-button')[0].click();
            else if (WorldConfig.auto_reset) {
                this.reset_count++;
                this.reset(false);
            }
        }
    }

    OriginOfLife() {
        //Spawn initial organisms (custom amount)
        CustomOrganismGenerator.spawnPopulation(this, 50, 50);
        // Register species
        for (let org of this.organisms) {
            FossilRecord.addSpecies(org, null);
        }
    }

    addOrganism(organism) {
        organism.updateGrid();
        this.total_mutability += organism.mutability;
        this.organisms.push(organism);
        if (organism.anatomy.cells.length > this.largest_cell_count)
            this.largest_cell_count = organism.anatomy.cells.length;
    }

    canAddOrganism() {
        return this.organisms.length < Hyperparams.maxOrganisms || Hyperparams.maxOrganisms < 0;
    }

    averageMutability() {
        if (this.organisms.length < 1)
            return 0;
        if (Hyperparams.useGlobalMutability) {
            return Hyperparams.globalMutability;
        }
        return this.total_mutability / this.organisms.length;
    }

    changeCell(c, r, state, owner) {
        super.changeCell(c, r, state, owner);
        this.renderer.addToRender(this.grid_map.cellAt(c, r));
        if (state == CellStates.wall)
            this.walls.push(this.grid_map.cellAt(c, r));
    }

    clearWalls() {
        for (var wall of this.walls) {
            let wcell = this.grid_map.cellAt(wall.col, wall.row);
            if (wcell && wcell.state == CellStates.wall)
                this.changeCell(wall.col, wall.row, CellStates.empty, null);
        }
    }

    clearOrganisms() {
        for (var org of this.organisms)
            org.die();
        this.organisms = [];
    }

    clearDeadOrganisms() {
        let to_remove = [];
        for (let i in this.organisms) {
            let org = this.organisms[i];
            if (!org.living)
                to_remove.push(i);
        }
        this.removeOrganisms(to_remove);
    }

    generateFood() {
        var num_food = Math.max(Math.floor(this.grid_map.cols * this.grid_map.rows * Hyperparams.foodDropProb / 50000), 1);
        var prob = Hyperparams.foodDropProb;

        var cornerSize = Math.floor(Math.min(this.grid_map.cols, this.grid_map.rows) / 4);
        var regions = [
            { cMin: 0, cMax: cornerSize, rMin: 0, rMax: cornerSize },
            { cMin: this.grid_map.cols - cornerSize, cMax: this.grid_map.cols, rMin: 0, rMax: cornerSize },
            { cMin: 0, cMax: cornerSize, rMin: this.grid_map.rows - cornerSize, rMax: this.grid_map.rows },
            { cMin: this.grid_map.cols - cornerSize, cMax: this.grid_map.cols, rMin: this.grid_map.rows - cornerSize, rMax: this.grid_map.rows },
            {
                cMin: Math.floor(this.grid_map.cols * 0.4),
                cMax: Math.ceil(this.grid_map.cols * 0.6),
                rMin: Math.floor(this.grid_map.rows * 0.4),
                rMax: Math.ceil(this.grid_map.rows * 0.6),
                center: true
            }
        ];

        // Path connections between patches — define pairs of region centres
        const regionCentres = regions.map(reg => ({
            c: Math.floor((reg.cMin + reg.cMax) / 2),
            r: Math.floor((reg.rMin + reg.rMax) / 2)
        }));

        // Connect each corner to the centre, and corners to adjacent corners
        const pathPairs = [
            [0, 4], // top-left to centre
            [1, 4], // top-right to centre
            [2, 4], // bottom-left to centre
            [3, 4], // bottom-right to centre
            [0, 1], // top-left to top-right
            [2, 3], // bottom-left to bottom-right
            [0, 2], // top-left to bottom-left
            [1, 3], // top-right to bottom-right
        ];

        // Spawn sparse food along each path occasionally
        if (Math.random() < 0.3) { // only generate paths 30% of ticks to keep them sparse
            for (let [a, b] of pathPairs) {
                let c1 = regionCentres[a].c, r1 = regionCentres[a].r;
                let c2 = regionCentres[b].c, r2 = regionCentres[b].r;
                let steps = Math.floor(Math.sqrt((c2 - c1) ** 2 + (r2 - r1) ** 2));

                for (let s = 0; s < steps; s++) {
                    // only place food occasionally along path — sparse trail
                    if (Math.random() > 0.05) continue;

                    let t = s / steps;
                    let pc = Math.floor(c1 + t * (c2 - c1));
                    let pr = Math.floor(r1 + t * (r2 - r1));

                    // small random offset so path isn't perfectly straight
                    pc = Math.max(0, Math.min(this.grid_map.cols - 1, pc + Math.floor(Math.random() * 3) - 1));
                    pr = Math.max(0, Math.min(this.grid_map.rows - 1, pr + Math.floor(Math.random() * 3) - 1));

                    if (this.grid_map.cellAt(pc, pr).state === CellStates.empty) {
                        this.changeCell(pc, pr, CellStates.food, null);
                    }
                }
            }
        }

        // Original cluster generation unchanged
        var placed = 0;
        for (var i = 0; i < num_food; i++) {
            if (Math.random() <= prob) {
                var region = regions[Math.floor(Math.random() * regions.length)];
                var clusterSize = region.center ? 7 : 5;
                var spread = region.center ? 4 : 3;
                var baseC = Math.floor(Math.random() * (region.cMax - region.cMin)) + region.cMin;
                var baseR = Math.floor(Math.random() * (region.rMax - region.rMin)) + region.rMin;

                for (var j = 0; j < clusterSize; j++) {
                    var offsetC = Math.floor(Math.random() * (spread * 2 + 1)) - spread;
                    var offsetR = Math.floor(Math.random() * (spread * 2 + 1)) - spread;
                    var c = Math.max(0, Math.min(this.grid_map.cols - 1, baseC + offsetC));
                    var r = Math.max(0, Math.min(this.grid_map.rows - 1, baseR + offsetR));

                    if (this.grid_map.cellAt(c, r).state == CellStates.empty) {
                        this.changeCell(c, r, CellStates.food, null);
                        placed++;
                    }
                }
            }
        }
    }

    reset(confirm_reset = true, reset_life = true) {
        if (confirm_reset && !confirm('The current environment will be lost. Proceed?'))
            return false;
        let restart = false;
        // clear auto-stop so stop-at-tick can trigger again after a reset
        this._autoStopped = false;
        if (this.engine.running) {
            this.engine.last_fps = this.engine.fps;
            this.engine.stop();
            restart = true;
        }
        this.organisms = [];
        this.grid_map.fillGrid(CellStates.empty, !WorldConfig.clear_walls_on_reset);
        this.createSafeZone();
        this.renderer.renderFullGrid(this.grid_map.grid);
        this.total_mutability = 0;
        this.total_ticks = 0;
        this.largest_cell_count = 0;
        FossilRecord.clear_record();
        if (reset_life)
            this.OriginOfLife();
        if (restart)
            this.engine.start(this.engine.last_fps);
        return true;
    }

    resizeGridColRow(cell_size, cols, rows) {
        cell_size = Number(cell_size);
        cols = Number(cols);
        rows = Number(rows);
        this.num_cols = cols;
        this.num_rows = rows;
        this.renderer.cell_size = cell_size;
        this.renderer.fillShape(rows * cell_size, cols * cell_size);
        this.grid_map.resize(cols, rows, cell_size);
    }

    resizeFillWindow(cell_size) {
        this.renderer.cell_size = cell_size;
        this.renderer.fillWindow('env');
        this.num_cols = Math.ceil(this.renderer.width / cell_size);
        this.num_rows = Math.ceil(this.renderer.height / cell_size);
        this.grid_map.resize(this.num_cols, this.num_rows, cell_size);
    }

    serialize() {
        this.clearDeadOrganisms();
        let env = SerializeHelper.copyNonObjects(this);
        env.grid = this.grid_map.serialize();
        env.organisms = [];
        for (let org of this.organisms) {
            env.organisms.push(org.serialize());
        }
        env.fossil_record = FossilRecord.serialize();
        env.controls = Hyperparams;
        return env;
    }

    loadRaw(env) { // species name->stats map, evolution controls, 
        this.organisms = [];
        FossilRecord.clear_record();
        let cell_size = env.grid.cell_size ? env.grid.cell_size : this.grid_map.cell_size;
        this.resizeGridColRow(cell_size, env.grid.cols, env.grid.rows)
        this.grid_map.loadRaw(env.grid);
        for (let wall of env.grid.walls) {
            this.walls.push(this.grid_map.cellAt(wall.c, wall.r));
        }

        // create species map
        let species = {};
        for (let name in env.fossil_record.species) {
            let s = new Species(null, null, 0);
            SerializeHelper.overwriteNonObjects(env.fossil_record.species[name], s)
            species[name] = s; // the species needs an anatomy obj still
        }

        for (let orgRaw of env.organisms) {
            let org = new Organism(orgRaw.col, orgRaw.row, this);
            org.loadRaw(orgRaw);
            this.addOrganism(org);
            let s = species[orgRaw.species_name];
            if (!s) { // ideally, every organisms species should exists, but there is a bug that misses some species sometimes
                s = new Species(org.anatomy, null, env.total_ticks);
                species[orgRaw.species_name] = s;
            }
            if (!s.anatomy) {
                //if the species doesn't have anatomy we need to initialize it
                s.anatomy = org.anatomy;
                s.calcAnatomyDetails();
            }
            s.name = orgRaw.species_name;
            org.species = s;
        }
        for (let name in species)
            FossilRecord.addSpeciesObj(species[name]);
        FossilRecord.loadRaw(env.fossil_record);
        SerializeHelper.overwriteNonObjects(env, this);
        if ($('#override-controls').is(':checked'))
            Hyperparams.loadJsonObj(env.controls)
        this.renderer.renderFullGrid(this.grid_map.grid);
    }
}

module.exports = WorldEnvironment;

