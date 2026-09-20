const seedrandom = require('seedrandom');

// Converts a seed to a valid numeric value.
// Invalid or missing seeds default to 0.
function normalizeSeed(seed) {
  return Number.isFinite(Number(seed)) ? Number(seed) : 0;
}

// Selects a preset deterministically using the supplied seed and label.
// The same seed and label will always produce the same preset.
function choosePreset(seed, presets, label) {
  const normalizedSeed = normalizeSeed(seed);
  const rng = createSeededRng(`${normalizedSeed}-${label}`);
  return presets[Math.floor(rng() * presets.length)];
}

// Creates a deterministic random number generator from a seed.
function createSeededRng(seed) {
  return seedrandom(String(seed));
}

// Returns a shuffled copy of an array using the supplied random number generator. 
function shuffle(array, rng) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// Creates a rectangular zone using column and row boundaries.
function makeZone(cMin, cMax, rMin, rMax) {
  return { cMin, cMax, rMin, rMax };
}

// =========================
// SAFE ZONE PRESETS
// =========================

// Generates two safe zones from a set of possible corner combinations.
// The selected configuration is determined by the world seed.
function getSafeZonePreset(seed, cols, rows) {
  const safeCols = Number(cols) || 400;
  const safeRows = Number(rows) || 200;
  // Safe zones occupy a fixed proportion of the environment.
  const width = Math.max(4, Math.floor(safeCols * 0.15));
  const height = Math.max(4, Math.floor(safeRows * 0.25));
  const normalizedSeed = normalizeSeed(seed);

  const baseZones = [
    makeZone(1, width + 1, 1, height + 1),
    makeZone(Math.max(1, safeCols - width - 1), Math.max(1, safeCols - 1), 1, height + 1),
    makeZone(1, width + 1, Math.max(1, safeRows - height - 1), Math.max(1, safeRows - 1)),
    makeZone(Math.max(1, safeCols - width - 1), Math.max(1, safeCols - 1), Math.max(1, safeRows - height - 1), Math.max(1, safeRows - 1)),
  ];

  // Define possible pairs of safe zones.
  const presets = [
    [baseZones[0], baseZones[3]],
    [baseZones[1], baseZones[2]],
    [baseZones[2], baseZones[0]],
    [baseZones[3], baseZones[1]],
    [baseZones[0], baseZones[1]],
  ];

  // Select a reproducible pair based on the world seed.
  const candidate = choosePreset(seed, presets, 'safe-zones');
  return shuffle(candidate, createSeededRng(`${normalizedSeed}-safe-zones`));
}

// =========================
// SPAWN PRESETS
// =========================

// Generates initial prey and predator positions.
// Multiple predefined spatial configurations are available so that different seeds can produce different initial population layouts.
function getSpawnPreset(seed, cols, rows) {
  const width = Number(cols) || 400;
  const height = Number(rows) || 200;
  const centerCol = Math.floor(width / 2);
  const centerRow = Math.floor(height / 2);
  const margin = 6;
  const normalizedSeed = normalizeSeed(seed);

  // Predefined combinations of prey cluster anchors and predator starting positions.
  const basePresets = [
    {
      // Prey are initially distributed around the four corners and centre.
      preyAnchors: [
        [centerCol, centerRow],
        [centerCol - 80, centerRow - 40],
        [centerCol + 80, centerRow + 40],
        [centerCol - 30, centerRow + 90],
        [centerCol + 30, centerRow - 90],
      ],
      // Predators begin around the centre of each side.
      predatorPositions: [
        [margin + 12, margin + 12],
        [width - margin - 12, margin + 12],
        [margin + 12, height - margin - 12],
        [width - margin - 12, height - margin - 12],
      ],
    },
    {
      // Prey form four outer clusters and one central cluster.
      preyAnchors: [
        [margin + 28, margin + 30],
        [width - margin - 28, margin + 30],
        [margin + 28, height - margin - 30],
        [width - margin - 28, height - margin - 30],
        [centerCol, centerRow],
      ],
      predatorPositions: [
        [centerCol, margin + 12],
        [centerCol, height - margin - 12],
        [margin + 12, centerRow],
        [width - margin - 12, centerRow],
      ],
    },
    {
      // Prey are distributed vertically through the environment.
      preyAnchors: [
        [centerCol - 90, centerRow - 12],
        [centerCol + 90, centerRow - 12],
        [centerCol - 85, centerRow + 85],
        [centerCol + 85, centerRow + 85],
        [centerCol, centerRow],
      ],
      predatorPositions: [
        [margin + 12, centerRow],
        [width - margin - 12, centerRow],
        [centerCol, margin + 12],
        [centerCol, height - margin - 12],
      ],
    },
    {
      
      preyAnchors: [
        [centerCol, centerRow - 110],
        [centerCol + 100, centerRow - 45],
        [centerCol - 100, centerRow + 45],
        [centerCol, centerRow + 110],
        [centerCol, centerRow],
      ],
      predatorPositions: [
        [margin + 12, centerRow - 20],
        [margin + 12, centerRow + 20],
        [width - margin - 12, centerRow - 20],
        [width - margin - 12, centerRow + 20],
      ],
    },
    {
      // Prey form clusters near the four corners and one central cluster.
      preyAnchors: [
        [margin + 20, centerRow - 90],
        [width - margin - 20, centerRow - 90],
        [margin + 20, centerRow + 90],
        [width - margin - 20, centerRow + 90],
        [centerCol, centerRow],
      ],
      predatorPositions: [
        [centerCol - 18, centerRow],
        [centerCol + 18, centerRow],
        [centerCol, centerRow - 18],
        [centerCol, centerRow + 18],
      ],
    },
  ];

  const preset = choosePreset(seed, basePresets, 'spawn-preset') || basePresets[0];

  // Create a separate deterministic random stream for position variation.
  const rng = createSeededRng(`${normalizedSeed}-spawn`);

  // Apply a small random displacement to each prey cluster anchor.
  // This preserves the overall spatial structure while preventing every run from using identical coordinates.
  const jitteredPreyAnchors = preset.preyAnchors.map(([c, r]) => [
    clamp(c + Math.round((rng() - 0.5) * 18), 2, width - 3),
    clamp(r + Math.round((rng() - 0.5) * 18), 2, height - 3),
  ]);

  const jitteredPredators = preset.predatorPositions.map(([c, r]) => [
    clamp(c + Math.round((rng() - 0.5) * 10), 2, width - 3),
    clamp(r + Math.round((rng() - 0.5) * 10), 2, height - 3),
  ]);

  return {
    preyAnchors: jitteredPreyAnchors,
    predatorPositions: jitteredPredators,
  };
}

// =========================
// VALUE CLAMPING
// =========================

// Restricts a value to the specified minimum and maximum bounds.
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

module.exports = {
  normalizeSeed,
  createSeededRng,
  shuffle,
  getSafeZonePreset,
  getSpawnPreset,
};
