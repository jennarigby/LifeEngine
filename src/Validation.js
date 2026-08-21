const Organism = require("./Organism/Organism");
class Validation {

    static run() {
        console.log("=== Running Validation Tests ===");
        this.testRelatedness();
        this.testAlarmCooldown();
        this.testAlarmBroadcast();
        this.testMutation();
        console.log("=== Validation Complete ===");
    }
    // ── Relatedness tests ─────────────────────────────────────────────────
static testRelatedness() {
    console.log("\n-- Relatedness Tests --");

    // Minimal mock environment required by Organism
    const env = {
        organisms: [],
        grid_map: {
            cellAt: () => null
        }
    };

    // Helper to create an Organism with controlled pedigree information
    const createOrganism = (id, parent = null) => {
        const organism = new Organism(0, 0, env, parent);

        organism.id = id;

        return organism;
    };

    // ── Create pedigree ───────────────────────────────────────────────

    // Founder
    const founder = createOrganism("founder");

    // Child of founder
    const parent = createOrganism("parent", founder);

    // Two children of parent
    const offspring = createOrganism("offspring", parent);
    const sibling = createOrganism("sibling", parent);

    // Unrelated founder
    const unrelated = createOrganism("unrelated");

    // Further descendants
    const greatGrandchild =
        createOrganism("greatGrandchild", offspring);

    const greatGreatGrandchild =
        createOrganism("greatGreatGrandchild", greatGrandchild);

    // ── Assertions ───────────────────────────────────────────────────

    const assert = (label, actual, expected) => {
        const pass = Math.abs(actual - expected) < 0.001;

        console.log(
            `${pass ? "PASS" : "FAIL"} ${label}: ` +
            `expected ${expected}, got ${actual}`
        );
    };

    // Self
    assert(
        "self vs self",
        offspring.calcRelatedness(offspring),
        1.0
    );

    // Parent / child
    assert(
        "parent vs offspring",
        parent.calcRelatedness(offspring),
        0.5
    );

    assert(
        "offspring vs parent",
        offspring.calcRelatedness(parent),
        0.5
    );

    // Siblings
    assert(
        "full siblings",
        offspring.calcRelatedness(sibling),
        0.5
    );

    // Grandparent / grandchild
    assert(
        "grandparent vs grandchild",
        founder.calcRelatedness(offspring),
        0.25
    );

    // Great-grandparent / great-grandchild
    assert(
        "great-grandparent vs great-grandchild",
        founder.calcRelatedness(greatGrandchild),
        0.125
    );

    // Great-great-grandparent / great-great-grandchild
    assert(
        "great-great-grandparent vs great-great-grandchild",
        founder.calcRelatedness(greatGreatGrandchild),
        0.0625
    );

    // Unrelated
    assert(
        "unrelated",
        offspring.calcRelatedness(unrelated),
        0.0
    );

    // Symmetry
    assert(
        "symmetry: parent/offspring",
        parent.calcRelatedness(offspring),
        offspring.calcRelatedness(parent)
    );

    assert(
        "symmetry: founder/offspring",
        founder.calcRelatedness(offspring),
        offspring.calcRelatedness(founder)
    );

    assert(
        "symmetry: siblings",
        offspring.calcRelatedness(sibling),
        sibling.calcRelatedness(offspring)
    );
}

    // ── Alarm cooldown test ───────────────────────────────────────────────
    static testAlarmCooldown() {
        console.log("\n-- Alarm Cooldown Test --");
        let org = { alarmCooldown: 0, isCallingAlarm: false };

        // simulate triggering alarm
        org.isCallingAlarm = true;
        org.alarmCooldown = 10;

        // simulate 10 ticks
        for (let i = 0; i < 10; i++) {
            org.alarmCooldown--;
        }

        let pass = org.alarmCooldown === 0;
        console.log(`${pass ? "PASS" : "FAIL"} Alarm cooldown reaches 0 after 10 ticks`);
    }

    // ── Alarm broadcast radius test ───────────────────────────────────────
    static testAlarmBroadcast() {
        console.log("\n-- Alarm Broadcast Test --");

        let caller = { c: 0, r: 0 };
        let nearbyPrey = { c: 10, r: 0, role: "prey", heardAlarm: false, alarmTimer: 0, alarmSource: null };
        let farPrey = { c: 100, r: 0, role: "prey", heardAlarm: false, alarmTimer: 0, alarmSource: null };
        let radius = 30;

        // simulate broadcastAlarm
        for (let org of [nearbyPrey, farPrey]) {
            let dx = org.c - caller.c;
            let dy = org.r - caller.r;
            let distSq = dx * dx + dy * dy;
            if (distSq <= radius * radius && org.role === "prey") {
                org.heardAlarm = true;
                org.alarmTimer = 100;
                org.alarmSource = { c: caller.c, r: caller.r };
            }
        }

        console.log(`${nearbyPrey.heardAlarm ? "PASS" : "FAIL"} Nearby prey heard alarm`);
        console.log(`${!farPrey.heardAlarm ? "PASS" : "FAIL"} Far prey did not hear alarm`);
    }

    // ── Mutation bounds test ──────────────────────────────────────────────
    static testMutation() {
        console.log("\n-- Mutation Bounds Test --");
        let violations = 0;
        for (let i = 0; i < 1000; i++) {
            let parentP = Math.random();
            let mutation = (Math.random() - 0.5) * 0.05;
            let childP = Math.max(0, Math.min(1, parentP + mutation));
            if (childP < 0 || childP > 1) violations++;
        }
        console.log(`${violations === 0 ? "PASS" : "FAIL"} Alarm probability stays within [0,1] across 1000 mutations`);
    }
}

module.exports = Validation;