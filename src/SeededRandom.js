const seedrandom = require('seedrandom');

function normalizeSeed(seed) {
  const numericSeed = Number.isFinite(Number(seed)) ? Number(seed) : 0;
  return ((numericSeed % 5) + 5) % 5;
}

function createSeededRng(seed) {
  return seedrandom(String(seed));
}

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
