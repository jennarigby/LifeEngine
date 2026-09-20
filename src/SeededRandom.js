const seedrandom = require('seedrandom');

/**
 * Normalizes the seed to a value between 0 and 4.
 */
function normalizeSeed(seed) {
  const numericSeed = Number.isFinite(Number(seed)) ? Number(seed) : 0;
  return ((numericSeed % 5) + 5) % 5;
}

/**
 * Creates a deterministic random number generator from the seed.
 */
function createSeededRng(seed) {
  return seedrandom(String(seed));
}

/**
 * Shuffles an array using the Fisher-Yates algorithm.
 * Returns a new array without modifying the original.
 */
function shuffle(array, rng) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

module.exports = {
  normalizeSeed,
  createSeededRng,
  shuffle,
};
