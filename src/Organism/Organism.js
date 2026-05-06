const CellStates = require("./Cell/CellStates");
const Neighbors = require("../Grid/Neighbors");
const Hyperparams = require("../Hyperparameters");
const Directions = require("./Directions");
const Anatomy = require("./Anatomy");
const Brain = require("./Perception/Brain");
const FossilRecord = require("../Stats/FossilRecord");
const SerializeHelper = require("../Utils/SerializeHelper");

class Organism {
    constructor(col, row, env, parent = null) {
        this.c = col;
        this.r = row;
        this.env = env;
        this.lifetime = 0;
        this.food_collected = 0;
        this.living = true;
        this.anatomy = new Anatomy(this)
        this.direction = Directions.down; // direction of movement
        this.rotation = Directions.up; // direction of rotation
        this.move_count = 0;
        this.move_range = 4;
        this.ignore_brain_for = 0;
        this.mutability = 5;
        this.damage = 0;
        this.brain = new Brain(this);
        if (parent != null) {
            this.inherit(parent);
        }
        if (parent != null) {
            this.inherit(parent);
        } else {
            this.role = "prey"; // only set default if no parent
        }


        // Alarm system
        this.isCallingAlarm = false;
        this.heardAlarm = false;
        this.alarmCooldown = 0;
        this.alarmTimer = 0;
        this.alarmSource = null;

        // Predator targeting
        this.target = null;
        this.targetType = null;
        this.targetTimer = 0;
    }

    inherit(parent) {
        this.move_range = parent.move_range;
        this.mutability = parent.mutability;
        this.species = parent.species;
        for (var c of parent.anatomy.cells) {
            //deep copy parent cells
            this.anatomy.addInheritCell(c);
        }
        this.brain.copy(parent.brain);
        this.role = parent.role;
    }

    detectPredator(radius = 10) {
        let env = this.env;

        for (let dx = -radius; dx <= radius; dx++) {
            for (let dy = -radius; dy <= radius; dy++) {
                let cell = env.grid_map.cellAt(this.c + dx, this.r + dy);

                if (cell && cell.owner && cell.owner.role === "predator") {
                    console.log(`[ALARM][DETECT] Predator found near (${this.c}, ${this.r})`);
                    return true;
                }
            }
        }
        return false;
    }

    broadcastAlarm(radius) {
        let env = this.env;

        for (let org of env.organisms) {
            if (org === this) continue;

            let dx = org.c - this.c;
            let dy = org.r - this.r;
            let dist = Math.sqrt(dx * dx + dy * dy);

            if (dist <= radius && org.role === "prey") {
                org.heardAlarm = true;
                org.alarmSource = { c: this.c, r: this.r };
                org.alarmTimer = 20; // lasts a few ticks

                console.log(
                    `[ALARM][RECEIVED] Prey at (${org.c}, ${org.r}) heard alarm from (${this.c}, ${this.r}), dist=${dist.toFixed(2)}`
                );
            }
        }
    }

    // amount of food required before it can reproduce
    foodNeeded() {
        return this.anatomy.is_mover ? this.anatomy.cells.length + Hyperparams.extraMoverFoodCost : this.anatomy.cells.length;
    }

    lifespan() {
        const multiplier = this.role === "predator" ? Hyperparams.predatorLifespanMultiplier : 1;
        return this.anatomy.cells.length * Hyperparams.lifespanMultiplier * multiplier;
    }

    maxHealth() {
        return this.anatomy.cells.length;
    }

    reproduce() {
        //produce mutated child
        //check nearby locations (is there room and a direct path)
        var org = new Organism(0, 0, this.env, this);
        if (Hyperparams.rotationEnabled) {
            org.rotation = Directions.getRandomDirection();
        }
        var prob = this.mutability;
        if (Hyperparams.useGlobalMutability) {
            prob = Hyperparams.globalMutability;
        }
        else {
            //mutate the mutability
            if (Math.random() <= 0.5)
                org.mutability++;
            else {
                org.mutability--;
                if (org.mutability < 1)
                    org.mutability = 1;
            }
        }
        var mutated = false;
        if (this.calcRandomChance(prob)) {
            mutated = org.mutate();
        }

        var direction = Directions.getRandomScalar();
        var direction_c = direction[0];
        var direction_r = direction[1];
        var offset = (Math.floor(Math.random() * 3));
        var basemovement = this.anatomy.birth_distance;
        var new_c = this.c + (direction_c * basemovement) + (direction_c * offset);
        var new_r = this.r + (direction_r * basemovement) + (direction_r * offset);

        if (org.isClear(new_c, new_r, org.rotation, true) &&
            org.isStraightPath(new_c, new_r, this.c, this.r, this) &&
            this.env.canAddOrganism()) {
            org.c = new_c;
            org.r = new_r;
            this.env.addOrganism(org);
            org.updateGrid();
            if (mutated) {
                FossilRecord.addSpecies(org, this.species);
            }
            else {
                org.species.addPop();
            }
        }
        Math.max(this.food_collected -= this.foodNeeded(), 0);
    }

    mutate() {
        let added = false;
        let changed = false;
        let removed = false;
        if (this.calcRandomChance(Hyperparams.addProb)) {
            let branch = this.anatomy.getRandomCell();
            let state = CellStates.getRandomLivingType(); // branch.state;
            let growth_direction = Neighbors.all[Math.floor(Math.random() * Neighbors.all.length)];
            let c = branch.loc_col + growth_direction[0];
            let r = branch.loc_row + growth_direction[1];
            if (this.anatomy.canAddCellAt(c, r)) {
                added = true;
                this.anatomy.addRandomizedCell(state, c, r);

                // attempt symmetrical mutations across horizontal, vertical, and both diagonal axes
                const axes = ['h', 'v', 'd'];
                for (let axis of axes) {
                    if (this.calcRandomChance(Hyperparams.mutationSymmetryChance)) {
                        let mc = c;
                        let mr = r;
                        switch (axis) {
                            case 'h': // horizontal symmetry (mirror over x-axis)
                                mr = -r;
                                if (r === 0) {
                                    mr = c;
                                    mc = -r;
                                }
                                break;
                            case 'v': // vertical symmetry (mirror over y-axis)
                                mc = -c;
                                if (c === 0) {
                                    mr = -c;
                                    mc = r;
                                }
                                break;
                            case 'd': // diagonal symmetry (mirror over both axes)
                                mc = -c;
                                mr = -r;
                                break;
                        }
                        if (this.anatomy.canAddCellAt(mc, mr)) {
                            this.anatomy.addRandomizedCell(state, mc, mr);
                        }
                    }
                }
            }
        }
        if (this.calcRandomChance(Hyperparams.changeProb)) {
            let cell = this.anatomy.getRandomCell();
            let state = CellStates.getRandomLivingType();
            this.anatomy.replaceCell(state, cell.loc_col, cell.loc_row);
            changed = true;
        }
        if (this.calcRandomChance(Hyperparams.removeProb)) {
            if (this.anatomy.cells.length > 1) {
                let cell = this.anatomy.getRandomCell();
                removed = this.anatomy.removeCell(cell.loc_col, cell.loc_row);
            }
        }
        if (this.anatomy.is_mover && this.calcRandomChance(Hyperparams.brainMutationChance)) {
            if (this.anatomy.has_eyes) {
                this.brain.mutate();
            }
            this.move_range += Math.floor(Math.random() * 4) - 2;
            if (this.move_range <= 0) {
                this.move_range = 1;
            };
        }
        // return true if a new species is created, which is only true for anatomy changes, not brain changes
        return added || changed || removed;
    }

    calcRandomChance(prob) {
        return (Math.random() * 100) < prob;
    }

    attemptMove() {
        var direction = Directions.scalars[this.direction];
        var direction_c = direction[0];
        var direction_r = direction[1];
        var new_c = this.c + direction_c;
        var new_r = this.r + direction_r;
        if (this.isClear(new_c, new_r)) {
            for (var cell of this.anatomy.cells) {
                var real_c = this.c + cell.rotatedCol(this.rotation);
                var real_r = this.r + cell.rotatedRow(this.rotation);
                this.env.changeCell(real_c, real_r, CellStates.empty, null);
            }
            this.c = new_c;
            this.r = new_r;
            this.updateGrid();
            return true;
        }
        return false;
    }

    attemptRotate(rotation = null) {
        if (!Hyperparams.rotationEnabled) {
            this.direction = Directions.getRandomDirection();
            this.move_count = 0;
            return true;
        }
        if (rotation == null) {
            rotation = Directions.getRandomDirection();
        }
        if (this.isClear(this.c, this.r, rotation)) {
            for (var cell of this.anatomy.cells) {
                var real_c = this.c + cell.rotatedCol(this.rotation);
                var real_r = this.r + cell.rotatedRow(this.rotation);
                this.env.changeCell(real_c, real_r, CellStates.empty, null);
            }
            this.rotation = rotation;
            this.direction = Directions.getRandomDirection();
            this.updateGrid();
            this.move_count = 0;
            return true;
        }
        return false;
    }

    changeDirection(dir) {
        this.direction = dir;
        this.move_count = 0;
    }

    // assumes either c1==c2 or r1==r2, returns true if there is a clear path from point 1 to 2
    isStraightPath(c1, r1, c2, r2, parent) {
        if (c1 == c2) {
            if (r1 > r2) {
                var temp = r2;
                r2 = r1;
                r1 = temp;
            }
            for (var i = r1; i != r2; i++) {
                var cell = this.env.grid_map.cellAt(c1, i)
                if (!this.isPassableCell(cell, parent)) {
                    return false;
                }
            }
            return true;
        }
        else {
            if (c1 > c2) {
                var temp = c2;
                c2 = c1;
                c1 = temp;
            }
            for (var i = c1; i != c2; i++) {
                var cell = this.env.grid_map.cellAt(i, r1);
                if (!this.isPassableCell(cell, parent)) {
                    return false;
                }
            }
            return true;
        }
    }

    isPassableCell(cell, parent) {
        return cell != null && (cell.state == CellStates.empty || cell.owner == this || cell.owner == parent || cell.state == CellStates.food);
    }

    isClear(col, row, rotation = this.rotation) {
        for (var loccell of this.anatomy.cells) {
            var cell = this.getRealCell(loccell, col, row, rotation);
            if (cell == null) {
                return false;
            }
            if (cell.owner == this || cell.state == CellStates.empty || (!Hyperparams.foodBlocksReproduction && cell.state == CellStates.food)
                || (this.role === "predator" && cell.owner && cell.owner.role === "prey")) {
                continue;
            }
            return false;
        }
        return true;
    }

    harm() {
        this.damage++;
        if (this.damage >= this.maxHealth() || Hyperparams.instaKill) {
            this.die();
        }
    }

    die() {
        for (var cell of this.anatomy.cells) {
            var real_c = this.c + cell.rotatedCol(this.rotation);
            var real_r = this.r + cell.rotatedRow(this.rotation);
            this.env.changeCell(real_c, real_r, CellStates.food, null);
        }
        this.species.decreasePop();
        this.living = false;
    }

    updateGrid() {
        for (var cell of this.anatomy.cells) {
            var real_c = this.c + cell.rotatedCol(this.rotation);
            var real_r = this.r + cell.rotatedRow(this.rotation);
            this.env.changeCell(real_c, real_r, cell.state, cell);
        }
    }

    update() {
        if (this.alarmCooldown > 0) this.alarmCooldown--;
        if (this.alarmTimer > 0) this.alarmTimer--;

        this.lifetime++;

        if (this.lifetime > this.lifespan()) {
            this.die();
            return this.living;
        }

        if (this.food_collected >= this.foodNeeded()) {
            this.reproduce();
        }

        // 1. PREY ALARM SYSTEM
        if (this.role === "prey") {
            let predatorNearby = this.detectPredator();

            if (predatorNearby && this.alarmCooldown === 0 && this.alarmTimer === 0) {
                this.isCallingAlarm = true;
                this.alarmCooldown = 10;

                console.log(`[ALARM][CALL] Prey at (${this.c}, ${this.r}) broadcasting alarm`);
            } else {
                this.isCallingAlarm = false;
            }

            if (this.isCallingAlarm) {
                this.broadcastAlarm(30);
                this.food_collected = Math.max(0, this.food_collected - 0.2);
            }

            if (this.isCallingAlarm) {
                this.alarmMovePenalty = true;
            } else {
                this.alarmMovePenalty = false;
            }
        }


        // 2. EXECUTE CELL BEHAVIOUR
        for (var cell of this.anatomy.cells) {
            cell.performFunction();
            if (!this.living) return this.living;
        }

        // 3. MOVEMENT DECISION 
        let dontmove = false;

        if (this.anatomy.is_mover) {
            if (this.anatomy.is_mover) {

                const Decision = Brain.Decision;

                let brain_decision = Decision.neutral;
                let brain_direction = 0;


                // 1. PREDATOR OVERRIDE 
                if (this.role === "predator") {

                    // acquire / maintain target
                    if (this.target && this.target.living && this.targetTimer > 0) {
                        this.targetTimer--;
                    } else {
                        let alarmTarget = this.detectAlarmCaller();
                        let preyTarget = this.detectPrey();

                        this.target = alarmTarget || preyTarget;
                        this.targetType = alarmTarget ? "alarm" : (preyTarget ? "prey" : null);
                        this.targetTimer = this.target ? 50 : 0;
                    }

                    // CHASE ONLY 
                    if (this.target) {

                        let dx = this.target.c - this.c;
                        let dy = this.target.r - this.r;

                        if (Math.abs(dx) > Math.abs(dy)) {
                            this.changeDirection(dx > 0 ? Directions.right : Directions.left);
                        } else {
                            this.changeDirection(dy > 0 ? Directions.down : Directions.up);
                        }

                        console.log(
                            `[PREDATOR][CHASE] (${this.c}, ${this.r}) -> ${this.targetType} (${this.target.c}, ${this.target.r})`
                        );
                    }

                    // skip all brain logic for predators
                    brain_decision = Decision.neutral;
                }

                // 2. PREY BRAIN (ONLY PREY)
                if (this.role === "prey" && this.anatomy.has_eyes) {
                    let result = this.brain.decide();
                    brain_decision = result.decision;
                    brain_direction = result.move_direction;
                }

                // 3. PREY ALARM OVERRIDE
                if (this.role === "prey" && this.alarmTimer > 0 && this.alarmSource) {
                    let dx = this.c - this.alarmSource.c;
                    let dy = this.r - this.alarmSource.r;

                    this.changeDirection(Directions.fromVector(dx, dy));
                    brain_decision = Decision.neutral;
                }

                // 4. BRAIN DECISION (ONLY PREY )
                switch (brain_decision) {
                    case Decision.chase:
                        this.changeDirection(brain_direction);
                        break;

                    case Decision.retreat:
                        this.changeDirection(Directions.getOppositeDirection(brain_direction));
                        break;

                    case Decision.move_left:
                        this.changeDirection(Directions.getLeftDirection(brain_direction));
                        break;

                    case Decision.move_right:
                        this.changeDirection(Directions.getRightDirection(brain_direction));
                        break;

                    case Decision.turn_left:
                        this.attemptRotate(Directions.getLeftDirection(this.rotation));
                        return this.living;

                    case Decision.turn_right:
                        this.attemptRotate(Directions.getRightDirection(this.rotation));
                        return this.living;

                    case Decision.stop:
                        return this.living;
                }


                // 5. MOVE 
                let moved = this.attemptMove();

                if (!moved) {
                    let rotated = this.attemptRotate();
                    if (!rotated) {
                        this.changeDirection(Directions.getRandomDirection());
                    }
                } else {
                    this.move_count++;
                }

                // collision
                if (this.role === "predator") {
                    this.checkForPreyCollision();
                }
            }
        }

        this.heardAlarm = false;
        return this.living;
    }

    getRealCell(local_cell, c = this.c, r = this.r, rotation = this.rotation) {
        var real_c = c + local_cell.rotatedCol(rotation);
        var real_r = r + local_cell.rotatedRow(rotation);
        return this.env.grid_map.cellAt(real_c, real_r);
    }

    isNatural() {
        let found_center = false;
        if (this.anatomy.cells.length === 0) {
            return false;
        }
        for (let i = 0; i < this.anatomy.cells.length; i++) {
            let cell = this.anatomy.cells[i];
            for (let j = i + 1; j < this.anatomy.cells.length; j++) {
                let toCompare = this.anatomy.cells[j];
                if (cell.loc_col === toCompare.loc_col && cell.loc_row === toCompare.loc_row) {
                    return false;
                }
            }
            if (cell.loc_col === 0 && cell.loc_row === 0) {
                found_center = true;
            }
        }
        return found_center;
    }

    serialize() {
        let org = SerializeHelper.copyNonObjects(this);
        org.anatomy = this.anatomy.serialize();
        if (this.anatomy.is_mover && this.anatomy.has_eyes)
            org.brain = this.brain.serialize();
        org.species_name = this.species.name;
        return org;
    }

    loadRaw(org) {
        SerializeHelper.overwriteNonObjects(org, this);
        this.anatomy.loadRaw(org.anatomy)
        if (org.brain)
            this.brain.copy(org.brain)
    }

    //Method for predators to detect prey in a certain radius
    detectPrey(radius = 10) {
        let env = this.env;

        for (let dx = -radius; dx <= radius; dx++) {
            for (let dy = -radius; dy <= radius; dy++) {
                let cell = env.grid_map.cellAt(this.c + dx, this.r + dy);

                if (cell && cell.owner && cell.owner.role === "prey") {
                    return cell.owner;
                }
            }
        }
        return null;
    }

    //For predators: detect alarm calls from prey and pursue that prey instead 
    detectAlarmCaller(radius = 30) {
        let env = this.env;

        for (let org of env.organisms) {
            if (org.role === "prey" && org.alarmTimer > 0) {
                let dx = org.c - this.c;
                let dy = org.r - this.r;
                let dist = Math.sqrt(dx * dx + dy * dy);

                if (dist <= radius) {
                    return org;
                }
            }
        }
        return null;
    }

    checkForPreyCollision() {
        for (let org of this.env.organisms) {
            if (!org || org === this || org.role !== "prey" || !org.living) continue;

            let dx = Math.abs(org.c - this.c);
            let dy = Math.abs(org.r - this.r);

            //console.log(`[COLLISION_CHECK] Predator (${this.c},${this.r}) vs Prey (${org.c},${org.r}) dx=${dx} dy=${dy}`);

            if (dx <= 1 && dy <= 1) {
                console.log(`[PREDATOR][KILL] Predator at (${this.c}, ${this.r}) killed prey at (${org.c}, ${org.r})`);
                org.die();
                this.food_collected += org.anatomy.cells.length;
                return true;
            }
        }
        return false;
    }

}



module.exports = Organism;
