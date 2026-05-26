const Neighbors = require("./Grid/Neighbors");

const Hyperparams = {
    setDefaults: function() {
        this.lifespanMultiplier = 500;
        this.predatorLifespanMultiplier = 1;
        this.predatorReproductionMultiplier = 25;
        this.predatorDecayRate = 0.5;
        this.predatorStartingFood = 0;
        this.predatorStarvationBase = 1500; // base ticks before starving without meals
        //this.predatorStarvationAgeFactor = 0; // extra tolerance per tick of lifetime
        //this.preyReproductionBonus = 1200; // extra food for prey when reproducing, scaled by population density

        this.foodProdProb = 0;
        this.killableNeighbors = Neighbors.adjacent;
        this.edibleNeighbors = Neighbors.adjacent;
        this.growableNeighbors = Neighbors.adjacent;

        this.useGlobalMutability = false;
        this.globalMutability = 0;
        this.addProb = 0;
        this.changeProb = 0;
        this.removeProb = 0;
        this.brainMutationChance = 0;
        this.mutationSymmetryChance = 0;
        
        this.rotationEnabled = true;

        this.foodBlocksReproduction = true;
        this.moversCanProduce = false;

        this.instaKill = false;
        this.dontKillSameSpecies = false;

        this.lookRange = 30;
        this.seeThroughSelf = false;
        this.alarmSignallingEnabled = false;
        this.evolveIndependentEyeDecisions = true;

        this.foodDropProb = 5;

        this.extraMoverFoodCost = 0;

        this.maxOrganisms = -1;
    },

    loadJsonObj(obj) {
        for (let key in obj) {
            this[key] = obj[key];
        }
    }
}

Hyperparams.setDefaults();

module.exports = Hyperparams;