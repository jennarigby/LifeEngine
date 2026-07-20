const Neighbors = require("./Grid/Neighbors");

const Hyperparams = {
    setDefaults: function() {
        this.lifespanMultiplier = 1000;
        this.predatorLifespanMultiplier = 1.2;
        this.predatorReproductionMultiplier = 26;
        this.predatorDecayRate = 0.5;
        this.predatorStartingFood = 0;
        this.predatorStarvationBase = 1100; // base ticks before starving without meals
        

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
        this.preyAlarmSpeedMultiplier = 2;        
        this.evolveIndependentEyeDecisions = true;

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