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
        this.controller = new EnvironmentController(this, this.renderer.canvas);
        this.num_rows = Math.ceil(this.renderer.height / cell_size);
        this.num_cols = Math.ceil(this.renderer.width / cell_size);
        this.grid_map = new GridMap(this.num_cols, this.num_rows, cell_size);
        this.organisms = [];
        this.walls = [];
        this.total_mutability = 0;
        this.largest_cell_count = 0;
        this.reset_count = 0;
        this.total_ticks = 0;
        this.data_update_rate = 100;
        FossilRecord.setEnv(this);
    }

    update() {
        // In WorldEnvironment.update(), add temporarily:
        if (this.total_ticks % 100 === 0) {
            let preds = this.organisms.filter(o => o.role === "predator");
            let prey = this.organisms.filter(o => o.role === "prey");
            console.log(`[ROLES] predators=${preds.length}, prey=${prey.length}`);
            preds.forEach(p => console.log(`  predator at (${p.c},${p.r}) cells=${p.anatomy.cells.length} food=${p.food_collected}/${p.foodNeeded()} lifetime=${p.lifetime}/${p.lifespan()}`));
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
        this.total_ticks++;
        if (this.total_ticks % this.data_update_rate == 0) {
            FossilRecord.updateData();
        }
    }

    render() {
        if (WorldConfig.headless) {
            this.renderer.cells_to_render.clear();
            return;
        }
        this.renderer.renderCells();
        this.renderer.renderHighlights();

        const prey = this.organisms.filter(o => o.role === "prey" && o.living).length;
        const predators = this.organisms.filter(o => o.role === "predator" && o.living).length;
        console.log(`[POP] predators=${predators}, prey=${prey}`);
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
        CustomOrganismGenerator.spawnPopulation(this, 100, 5);
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
        var num_food = Math.max(Math.floor(this.grid_map.cols * this.grid_map.rows * Hyperparams.foodDropProb / 50000), 1)
        var prob = Hyperparams.foodDropProb;
        
        // Define corner regions (each corner gets 1/4 of the map area)
        var cornerSize = Math.floor(Math.min(this.grid_map.cols, this.grid_map.rows) / 4);
        var regions = [
            {cMin: 0, cMax: cornerSize, rMin: 0, rMax: cornerSize}, // top-left
            {cMin: this.grid_map.cols - cornerSize, cMax: this.grid_map.cols, rMin: 0, rMax: cornerSize}, // top-right
            {cMin: 0, cMax: cornerSize, rMin: this.grid_map.rows - cornerSize, rMax: this.grid_map.rows}, // bottom-left
            {cMin: this.grid_map.cols - cornerSize, cMax: this.grid_map.cols, rMin: this.grid_map.rows - cornerSize, rMax: this.grid_map.rows}, // bottom-right
            {
                cMin: Math.floor(this.grid_map.cols * 0.4),
                cMax: Math.ceil(this.grid_map.cols * 0.6),
                rMin: Math.floor(this.grid_map.rows * 0.4),
                rMax: Math.ceil(this.grid_map.rows * 0.6),
                center: true
            }
        ];
        
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
                    }
                }
            }
        }
    }

    reset(confirm_reset = true, reset_life = true) {
        if (confirm_reset && !confirm('The current environment will be lost. Proceed?'))
            return false;
        let restart = false;
        if (this.engine.running) {
            this.engine.last_fps = this.engine.fps;
            this.engine.stop();
            restart = true;
        }
        this.organisms = [];
        this.grid_map.fillGrid(CellStates.empty, !WorldConfig.clear_walls_on_reset);
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

