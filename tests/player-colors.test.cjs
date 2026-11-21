const assert = require('node:assert/strict');
const test = require('node:test');
const { discColors, pickPlayerColors } = require('../assets/scripts/PlayerColors.ts');

test('each of the twelve ordered seat pairings has an equal interval in the draw', () => {
  const pairs = new Set();
  for (let lower = 0; lower < 4; lower++) {
    for (let upper = 0; upper < 3; upper++) {
      const rolls = [(lower + 0.5) / 4, (upper + 0.5) / 3];
      const [first, second] = pickPlayerColors(() => rolls.shift());
      assert.equal(first, Object.values(discColors)[lower]);
      assert.notEqual(first, second);
      pairs.add(first.disc + second.disc);
    }
  }
  assert.equal(pairs.size, 12);
});
