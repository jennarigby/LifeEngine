const Neighbors = require("./Grid/Neighbors");

const Hyperparams = {
    setDefaults: function() {
        this.lifespanMultiplier = 1000;
        this.predatorLifespanMultiplier = 1.2;
        this.predatorReproductionMultiplier = 24;
        this.predatorDecayRate = 0.5;
        this.predatorStartingFood = 0;
        this.predatorStarvationBase = 2500; // base ticks before starving without meals
        

        this.foodProdProb = 0;
        this.killableNeighbors = Neighbors.adjacent;
        this.edibleNeighbors = Neighbors.all;
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
        this.predatorAlarmResponseProbability = 0.7;        
        this.preyAlarmSpeedMultiplier = 1;        
        this.evolveIndependentEyeDecisions = true;
        this.relatednessLevel = 0.125;

        this.foodDropProb = 6;

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