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
        this.mutability = 1;
        this.damage = 0;
        this.brain = new Brain(this);
        this.lineageId = this.generateLineageId();
        this.id = this.generateId(); // unique ID for this specific organism

        if (parent != null) {
            this.inherit(parent);
            this.parentId = parent.id;
            this.generation = parent.generation + 1;
        } else {
            this.role = "prey";
            this.alarmProbability = 0.5;
            this.lineageId = this.generateLineageId();
            this.parentId = null;
            this.generation = 0;
        }

        if (this.role === "predator") {
            this.food_collected = Hyperparams.predatorStartingFood;

        }

        // Starvation tracking (ticks since last meal)
        this.ticksSinceMeal = 0;


        // Alarm system
        this.isCallingAlarm = false;
        this.heardAlarm = false;
        this.alarmCooldown = 0;
        this.alarmCallTimer = 0;
        this.alarmTimer = 0;
        this.alarmSource = null;
        this.survivedAlarmCount = 0;

        // Predator targeting
        this.target = null;
        this.targetType = null;
        this.targetTimer = 0;

    }

    generateLineageId() {
        return `lineage_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
    }

    generateId() {
        return `org_${Date.now()}_${Math.floor(Math.random() * 1000000)}`;
    }

    inherit(parent) {

        // ensure role consistency
        this.role = parent.role;
        this.lineageId = parent.lineageId;

        // Wipe any existing structure
        this.anatomy.clear();


        if (this.role === "prey") {
            // Core body
            this.anatomy.addDefaultCell(CellStates.mouth, 0, 0);

            // Movement
            this.anatomy.addDefaultCell(CellStates.mover, 1, 0);
            // Four eyes facing all directions
            this.anatomy.addDefaultCell(CellStates.eye, 0, -1);
            this.anatomy.addDefaultCell(CellStates.eye, 0, 1);
            this.anatomy.addDefaultCell(CellStates.eye, -1, 0);


            // Set eye directions
            const eyeDirections = [Directions.up, Directions.down, Directions.left, Directions.right];
            let eyeIndex = 0;
            for (let cell of this.anatomy.cells) {
                if (cell.state.name === CellStates.eye.name) {
                    cell.direction = eyeDirections[eyeIndex++];
                }
            }
        }

        if (this.role === "predator") {
            this.anatomy.addDefaultCell(CellStates.mouth, 0, 0);
            // Movement
            this.anatomy.addDefaultCell(CellStates.mover, 1, 0);
            // Attack 
            this.anatomy.addDefaultCell(CellStates.killer, 0, 1);
            this.anatomy.addDefaultCell(CellStates.killer, 0, -1);
            // Vision
            this.anatomy.addRandomizedCell(CellStates.eye, -1, 0);
        }

        this.brain.copy(parent.brain);

        this.move_range = parent.move_range;

        this.mutability = 0;

        // identity
        this.species = parent.species;
        if (this.role === "prey") {
            //Bonus/Bias value:
            // let bias = 0;
            // if (parent.survivedAlarmCount > 0) {
            //     bias += 0.01 * Math.min(parent.survivedAlarmCount, 5);
            // }
            // let mutation = (Math.random() - 0.5) * 0.05 + bias;
            // this.alarmProbability = Math.max(0, Math.min(1, parent.alarmProbability + mutation));

            //Without bias: 
            //let mutation = (Math.random() - 0.5) * 0.05; // ±0.025 per generation
            //this.alarmProbability = Math.max(0, Math.min(1, parent.alarmProbability + mutation));
            // Keep each lineage's alarm probability fixed so all descendants share the same value.
            this.alarmProbability = parent.alarmProbability;
        } else {
            this.alarmProbability = 0;
        }

        this.parentId = parent.id;
        this.generation = parent.generation + 1;

        // keep a short ancestor chain (last N generations) for relatedness calc
        this.ancestors = [...(parent.ancestors || []), parent.id].slice(-4);

    }


    // detectPredator(radius = 15) {
    //     let env = this.env;

    //     for (let dx = -radius; dx <= radius; dx++) {
    //         for (let dy = -radius; dy <= radius; dy++) {
    //             let cell = env.grid_map.cellAt(this.c + dx, this.r + dy);

    //             if (cell && cell.owner && cell.owner.role === "predator") {
    //                 //  console.log(`[ALARM][DETECT] Predator found near (${this.c}, ${this.r})`);
    //                 return true;
    //             }
    //         }
    //     }
    //     return false;
    // }

    detectPredator(radius = 15) {
        let radiusSq = radius * radius;
        for (let org of this.env.organisms) {
            if (org.role !== "predator" || !org.living) continue;
            let dx = org.c - this.c;
            let dy = org.r - this.r;
            if (dx * dx + dy * dy <= radiusSq) return true;
        }
        return false;
    }

    logAlarmCall(recipients) {
        if (!this.living || this.role !== "prey" || recipients.length === 0) return;

        let details = [
            `Caller ID: ${this.id}`,
            `Caller generation: ${this.generation}`,
            `Caller p: ${this.alarmProbability.toFixed(2)}`
        ];

        for (let recipient of recipients) {
            details.push(`Kin ID: ${recipient.id}`);
            details.push(`Relatedness: ${recipient.relatedness.toFixed(2)}`);
            details.push(`Generation: ${recipient.generation}`);
            details.push(`p: ${recipient.alarmProbability.toFixed(2)}`);
        }

        console.log(details.join(""));
    }

    broadcastAlarm(radius, logCall = false) {
        let env = this.env;
        let radiusSq = radius * radius;
        let recipients = [];

        for (let org of env.organisms) {
            if (org === this || org.role !== "prey" || !org.living) continue;

            let dx = org.c - this.c;
            let dy = org.r - this.r;
            let distSq = dx * dx + dy * dy;

            if (distSq <= radiusSq) {
                // only alert kin above relatedness threshold
                let r = this.calcRelatedness(org);
                org.heardAlarm = true;
                org.alarmSource = { c: this.c, r: this.r };

                if (r >= Hyperparams.relatednessLevel) {
                    const intensity = Math.max(0.25, this.alarmProbability);
                    const preySpeedMultiplier = Hyperparams.preyAlarmSpeedMultiplier || 1;
                    org.alarmTimer = Math.floor(20 + 80 * intensity * intensity);
                    recipients.push({
                        id: org.id,
                        relatedness: r,
                        generation: org.generation,
                        alarmProbability: org.alarmProbability
                    });
                } else {
                    org.alarmTimer = 5;  // non-kin barely react
                }
            }
        }

        // if (logCall) {
        //     this.logAlarmCall(recipients);
        // }
    }

    // amount of food required before it can reproduce
    foodNeeded() {
        let base = this.anatomy.is_mover ? this.anatomy.cells.length + Hyperparams.extraMoverFoodCost : this.anatomy.cells.length;
        if (this.role === "prey") {
            return Math.max(1, Math.floor(base * 15.0));
        }
        const multiplier = this.role === "predator" ? Hyperparams.predatorReproductionMultiplier : 1;
        return base * multiplier;
    }

    lifespan() {
        const multiplier = this.role === "predator" ? Hyperparams.predatorLifespanMultiplier : 1;
        return this.anatomy.cells.length * Hyperparams.lifespanMultiplier * multiplier;
    }

    maxHealth() {
        return this.anatomy.cells.length;
    }

    reproduce() {
        const foodCost = this.foodNeeded();


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
            } else {
                // Guard: if species wasn't inherited, register it.
                if (!org.species) {
                    console.warn(`[REPRODUCE] child has no species; registering new species. parent.species=${this.species ? this.species.name : '<none>'}`);
                    FossilRecord.addSpecies(org, this.species || null);
                } else {
                    org.species.addPop();
                }
            }
        } else {
            //console.log(`[REPRODUCE][FAIL] No space at (${new_c}, ${new_r})`);
        }
        Math.max(this.food_collected -= this.foodNeeded(), 0);
    }

    mutate() {

        return false;
        let added = false;
        let changed = false;
        let removed = false;
        if (this.calcRandomChance(Hyperparams.addProb)) {
            let branch = this.anatomy.getRandomCell();
            let state = CellStates.getRandomLivingType(this.role); // branch.state;
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
            let state = CellStates.getRandomLivingType(this.role);
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
        if (cell == null) return false;
        if (this.role === "predator" && this.env.isInSafeZone(cell.col, cell.row)) return false;
        return cell.state == CellStates.empty || cell.owner == this || cell.owner == parent || cell.state == CellStates.food;
    }

    //Updated version of isClear to allow predators to move onto food 
    isClear(col, row, rotation = this.rotation, forReproduction = false) {

        for (var loccell of this.anatomy.cells) {
            var cell = this.getRealCell(loccell, col, row, rotation);
            if (cell == null) {
                return false;
            }

            if (this.role === "predator" && this.env.isInSafeZone(cell.col, cell.row)) {
                return false;
            }

            // Always allow empty + self
            if (cell.owner == this || cell.state == CellStates.empty) {
                continue;
            }

            // Allow predators to overlap prey (for killing)
            if (this.role === "predator" && cell.owner && cell.owner.role === "prey") {
                continue;
            }

            // Movement: allow food
            if (!forReproduction && cell.state == CellStates.food) {
                continue;
            }

            // Allow prey to occupy the safe zone
            if (this.role === "prey" && this.env.isInSafeZone(cell.col, cell.row)) {
                continue;
            }

            // Otherwise blocked
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
        if (this.species) {
            this.species.decreasePop();
        }
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
        // if (this.role === "prey" && this.alarmTimer === 1 && this.living) {
        //     this.survivedAlarmCount = (this.survivedAlarmCount || 0) + 1;
        // }

        this.lifetime++;

        // Predator starvation: increment ticks since last meal and check threshold
        if (this.role === "predator") {
            this.ticksSinceMeal = (this.ticksSinceMeal || 0) + 1;
            const starvationThreshold = Math.max(10, Math.floor(Hyperparams.predatorStarvationBase + this.lifetime * Hyperparams.predatorStarvationAgeFactor));
            if (this.ticksSinceMeal > starvationThreshold) {
                this.die();
                //console.log(`Died of starvation.` + this.ticksSinceMeal);
                //console.log(`Died of starvation.` + this.ticksSinceMeal);
                return this.living;
            }
        }

        //If predator hasn't moved
        if (this.role === "predator") {
            this.lastPos = this.lastPos || { c: this.c, r: this.r };
            this.stuckTimer = this.stuckTimer || 0;

            if (this.c === this.lastPos.c && this.r === this.lastPos.r) {
                this.stuckTimer++;
                if (this.stuckTimer > 50) {
                    // force random direction change
                    this.changeDirection(Directions.getRandomDirection());
                    this.attemptRotate();
                    this.stuckTimer = 0;
                }
            } else {
                this.stuckTimer = 0;
                this.lastPos = { c: this.c, r: this.r };
            }
        }


        if (this.lifetime > this.lifespan()) {
            this.die();
            return this.living;
        }



        // 1. PREY ALARM SYSTEM
        if (this.role === "prey") {
            if (Hyperparams.alarmSignallingEnabled) {
                let shouldLogAlarmCall = false;

                //let predatorNearby = this.detectPredator();

                //Alarm call sent if predators and kin are nearby
                if (
                    this.detectPredator(30) &&
                    this.alarmCooldown === 0 &&
                    Math.random() < this.alarmProbability &&
                    this.detectKin() &&
                    !this.heardAlarm &&
                    !this.env.isInSafeZone(this.c, this.r)
                ) {
                    shouldLogAlarmCall = true;
                    this.alarmCallTimer = Math.max(20, Math.floor(20 + 60 * this.alarmProbability));
                    this.alarmCooldown = 3;
                    if (this.env && typeof this.env.alarmCallsThisWindow === 'number') {
                        this.env.alarmCallsThisWindow++;
                    }
                }

                if (this.alarmCallTimer > 0) {
                    this.alarmCallTimer--;
                    this.isCallingAlarm = true;
                } else {
                    this.isCallingAlarm = false;
                }

                //Calls broadcast if alarm is active
                if (this.isCallingAlarm) {
                    const intensity = Math.max(0.25, this.alarmProbability);
                    const broadcastRadius = Math.floor(35 + 60 * intensity * intensity);
                    this.broadcastAlarm(broadcastRadius, shouldLogAlarmCall);
                    //this.food_collected = Math.max(0, this.food_collected - 0.2);
                }

                //
                if (this.isCallingAlarm) {
                    this.alarmMovePenalty = true;
                } else {
                    this.alarmMovePenalty = false;
                }


            } else {
                this.isCallingAlarm = false;
                this.alarmTimer = 0;
                this.alarmSource = null;
                this.alarmMovePenalty = false;
            }
        }


        //  EXECUTE CELL BEHAVIOUR
        for (var cell of this.anatomy.cells) {
            cell.performFunction();
            if (!this.living) return this.living;
        }
        if (this.food_collected >= this.foodNeeded()) {
            this.reproduce();
        }

        //  MOVEMENT DECISION 
        let dontmove = false;

        if (this.anatomy.is_mover) {
            if (this.anatomy.is_mover) {

                const Decision = Brain.Decision;

                let brain_decision = Decision.neutral;
                let brain_direction = 0;


                // Predator brain for movement decisions - overrides prey brain if predator has a target
                if (this.role === "predator") {
                    // always check for alarm caller first — overrides existing target
                    let alarmTarget = Hyperparams.alarmSignallingEnabled
                        ? this.detectAlarmCaller()
                        : null;

                    if (alarmTarget && Math.random() < Hyperparams.predatorAlarmResponseProbability) {
                        this.target = alarmTarget;
                        this.targetType = "alarm";
                        this.targetTimer = 50;
                    } else {
                        const hasTarget = this.target && this.target.living;

                        if (!hasTarget || this.targetTimer <= 0 || this.targetType !== "prey") {
                            let preyTarget = this.detectPrey();
                            this.target = preyTarget || this.target || null;
                            this.targetType = preyTarget ? "prey" : this.targetType;
                            this.targetTimer = preyTarget ? 50 : 0;
                        } else {
                            this.targetTimer--;
                        }
                    }

                    if (!this.target) {
                        // fallback behavior: wander instead of freezing
                        if (Math.random() < 0.2) {
                            this.changeDirection(Directions.getRandomDirection());
                        }
                        this.attemptMove();
                        return this.living;
                    }
                    // CHASE ONLY 
                    if (this.target && this.target.living) {
                        let dx = this.target.c - this.c;
                        let dy = this.target.r - this.r;
                        if (Math.abs(dx) > Math.abs(dy)) {
                            this.changeDirection(dx > 0 ? Directions.right : Directions.left);
                        } else {
                            this.changeDirection(dy > 0 ? Directions.down : Directions.up);
                        }
                    } else {
                        // no prey target — spread out from other predators
                        let nearbyPredators = this.env.organisms.filter(o =>
                            o !== this && o.role === "predator" &&
                            Math.abs(o.c - this.c) < 15 &&
                            Math.abs(o.r - this.r) < 15
                        );

                        if (nearbyPredators.length > 0) {
                            let nearest = nearbyPredators[0];
                            let dx = this.c - nearest.c;
                            let dy = this.r - nearest.r;
                            this.changeDirection(Math.abs(dx) > Math.abs(dy) ?
                                (dx > 0 ? Directions.right : Directions.left) :
                                (dy > 0 ? Directions.down : Directions.up));
                        } else {
                            // no nearby predators either — wander randomly
                            if (Math.random() < 0.2) {
                                this.changeDirection(Directions.getRandomDirection());
                            }
                        }
                    }

                    brain_decision = Decision.neutral;
                }

                // PREY BRAIN 
                if (this.role === "prey" && this.anatomy.has_eyes) {
                    let result = this.brain.decide();
                    brain_decision = result.decision;
                    brain_direction = result.move_direction;
                }

                // ALARM MOVEMENT OVERRIDE -  caller takes priority
                if (this.role === "prey" && this.isCallingAlarm) {
                    // decoy: run away from kin
                    let nearestKin = this.detectNearestKin();
                    if (nearestKin) {
                        let dx = this.c - nearestKin.c;
                        let dy = this.r - nearestKin.r;
                        this.changeDirection(Directions.fromVector(dx, dy));
                        brain_decision = Decision.neutral;
                    }
                } else if (this.role === "prey" && this.alarmTimer > 0 && this.alarmSource) {
                    // hearer: flee away from alarm source
                    let dx = this.c - this.alarmSource.c;
                    let dy = this.r - this.alarmSource.r;
                    this.changeDirection(Directions.fromVector(dx, dy));
                    brain_decision = Decision.neutral;
                }

                if (this.role === "prey") {
                    // if brain wants to chase food but there are too many prey nearby, wander instead
                    if (brain_decision === Decision.chase) {
                        let nearbyPrey = this.env.organisms.filter(o =>
                            o !== this && o.role === "prey" &&
                            Math.abs(o.c - this.c) < 3 &&
                            Math.abs(o.r - this.r) < 3
                        ).length;

                        if (nearbyPrey > 7) {
                            this.changeDirection(Directions.getRandomDirection());
                        }
                    }
                }

                // Prey brain for movement decisions
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
                        if (!this.attemptRotate(Directions.getLeftDirection(this.rotation))) {
                            this.changeDirection(Directions.getRandomDirection());
                        }
                        return this.living;

                    case Decision.turn_right:
                        if (!this.attemptRotate(Directions.getRightDirection(this.rotation))) {
                            this.changeDirection(Directions.getRandomDirection());
                        }
                        return this.living;

                    case Decision.stop:
                        this.preyStuckTimer = (this.preyStuckTimer || 0) + 1;
                        if (this.preyStuckTimer > 30) {
                            this.changeDirection(Directions.getRandomDirection());
                            this.preyStuckTimer = 0;
                        }
                        break;
                }


                // MOVE
                let moveAttempts = 1;
                if (this.role === "prey" && this.alarmTimer > 0) {
                    moveAttempts = Math.max(1, Math.floor(Hyperparams.preyAlarmSpeedMultiplier || 1));
                }

                for (let attempt = 0; attempt < moveAttempts; attempt++) {
                    let moved = this.attemptMove();

                    if (!moved) {
                        let rotated = this.attemptRotate();
                        if (!rotated) {
                            this.changeDirection(Directions.getRandomDirection());
                        }
                    } else {
                        this.move_count++;
                    }
                    if (this.role === "predator") {
                        this.checkForPreyCollision();
                    }
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
    // detectPrey(radius = 15) {
    //     let env = this.env;
    //     for (let dx = -radius; dx <= radius; dx++) {
    //         for (let dy = -radius; dy <= radius; dy++) {
    //             let cell = env.grid_map.cellAt(this.c + dx, this.r + dy);
    //             if (cell && cell.owner && cell.owner.role === "prey") {
    //                 // never target prey inside safe zone
    //                 if (!env.isInSafeZone(cell.owner.c, cell.owner.r)) {
    //                     return cell.owner;
    //                 }
    //             }
    //         }
    //     }
    //     return null;
    // }

    detectPrey(radius = 30) {
        let radiusSq = radius * radius;
        for (let org of this.env.organisms) {
            if (org.role !== "prey" || !org.living) continue;
            if (this.env.isInSafeZone(org.c, org.r)) continue;
            let dx = org.c - this.c;
            let dy = org.r - this.r;
            if (dx * dx + dy * dy <= radiusSq) return org;
        }
        return null;
    }

    //For predators: detect alarm calls from prey and pursue that prey instead 
    detectAlarmCaller(radius = 40) {
        if (!Hyperparams.alarmSignallingEnabled) return null;

        let env = this.env;

        for (let org of env.organisms) {
            if (org.role === "prey" && org.isCallingAlarm && org.living) {
                if (env.isInSafeZone(org.c, org.r)) {
                    continue;
                }
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

    calcRelatedness(other) {
        if (this === other) return 1;

        // direct parent-child = 0.5
        if (this.parentId === other.id || other.parentId === this.id) return 0.5;

        // siblings share the same parent = 0.5
        if (this.parentId && this.parentId === other.parentId) return 0.5;

        // check shared ancestors for cousins etc.
        let myAncestors = this.ancestors || [];
        let otherAncestors = other.ancestors || [];

        for (let i = 0; i < myAncestors.length; i++) {
            for (let j = 0; j < otherAncestors.length; j++) {
                if (myAncestors[i] === otherAncestors[j]) {
                    // shared ancestor found — relatedness halves per generation back
                    let generationsBack = Math.max(i, j) + 1;
                    return Math.pow(0.5, generationsBack);
                }
            }
        }

        return 0; // no shared ancestry within tracked depth
    }

    detectKin(radius = 30, threshold = Hyperparams.relatednessLevel) {
        let radiusSq = radius * radius;
        for (let org of this.env.organisms) {
            if (org === this || org.role !== "prey" || !org.living) continue;
            let dx = org.c - this.c;
            let dy = org.r - this.r;
            if (dx * dx + dy * dy <= radiusSq) {
                if (this.calcRelatedness(org) >= threshold) return true;
            }
        }
        return false;
    }

    detectNearestKin(radius = 30, threshold = Hyperparams.relatednessLevel) {
        let radiusSq = radius * radius;
        let nearest = null;
        let nearestDistSq = Infinity;
        for (let org of this.env.organisms) {
            if (org === this || org.role !== "prey" || !org.living) continue;
            let dx = org.c - this.c;
            let dy = org.r - this.r;
            let distSq = dx * dx + dy * dy;
            if (distSq <= radiusSq && this.calcRelatedness(org) >= threshold) {
                if (distSq < nearestDistSq) {
                    nearestDistSq = distSq;
                    nearest = org;
                }
            }
        }
        return nearest;
    }

    checkForPreyCollision() {
        for (let org of this.env.organisms) {
            if (!org || org === this || org.role !== "prey" || !org.living) continue;

            let dx = Math.abs(org.c - this.c);
            let dy = Math.abs(org.r - this.r);

            //console.log(`[COLLISION_CHECK] Predator (${this.c},${this.r}) vs Prey (${org.c},${org.r}) dx=${dx} dy=${dy}`);

            if (dx <= 1 && dy <= 1) {
                // console.log(`[PREDATOR][ATTACK] Predator at (${this.c}, ${this.r}) attacked prey at (${org.c}, ${org.r})`);
                org.harm();
                if (!org.living) {
                    this.food_collected += org.anatomy.cells.length;
                }
                return true;
            }
        }
        return false;
    }



}



module.exports = Organism;
