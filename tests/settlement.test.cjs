const assert = require('node:assert/strict');
const test = require('node:test');
const { field, Match, radii, step } = require('../assets/scripts/Match.ts');

const outcomes = new Set(['return', 'capture', 'misfire', 'death']);

function finishShot(game, observe = () => {}) {
  const events = [];
  for (let frame = 0; frame < 1200 && game.phase === 'moving'; frame++) {
    game.advance(step);
    const current = game.events.splice(0);
    if (game.phase === 'moving') {
      assert.ok(current.every(event => !outcomes.has(event.cue)), 'outcome before table settled');
    }
    observe(current);
    events.push(...current);
  }
  assert.notEqual(game.phase, 'moving');
  return events;
}

for (const owner of [0, 1]) {
  test('player ' + owner + ' can bank off the far rail and keep the disc in play', () => {
    const game = new Match();
    game.player = owner;
    game.piece.returns = 3;
    const direction = owner === 0 ? -1 : 1;
    const start = owner === 0 ? field.bottom : field.top;
    game.fire({ x: field.right / 2, y: start }, { x: 0, y: direction * 1290 });
    let bounced = false;
    const events = finishShot(game, current => {
      if (!current.some(event => event.cue === 'wall')) return;
      const [disc] = game.discs;
      assert.equal(disc.y, owner === 0 ? radii[disc.size] : field.height - radii[disc.size]);
      assert.ok(disc.vy * direction < 0);
      bounced = true;
    });
    assert.ok(bounced);
    assert.equal(game.score()[owner], 1);
    assert.equal(game.discs[0].returns, 3);
    assert.ok(events.every(event => !outcomes.has(event.cue)));
  });
}

test('a bank shot that settles in the far strip is captured at its resting position', () => {
  const game = new Match();
  game.fire({ x: field.right / 2, y: field.bottom }, { x: 0, y: -1070 });
  const events = finishShot(game);
  const wall = events.find(event => event.cue === 'wall');
  const captures = events.filter(event => event.cue === 'capture');
  assert.equal(captures.length, 1);
  const [capture] = captures;
  assert.ok(wall && wall.point.y < capture.point.y && capture.point.y < field.top);
  assert.equal(game.stock[1].at(-1).id, capture.id);
  assert.equal(game.stock[1].at(-1).returns, 1);
});

function place(game, owner, x, y, returns = 0) {
  const piece = game.stock[owner].pop();
  const disc = { ...piece, x, y, owner, returns, entered: true, vx: 0, vy: 0 };
  game.discs.push(disc);
  return disc;
}

test('all four outcomes wait for the last moving disc, then resolve once together', () => {
  const game = new Match();
  const recovered = place(game, 0, 80, 920);
  const captured = place(game, 1, 210, 920);
  const retired = place(game, 0, 350, 90, 3);
  const runner = place(game, 1, 90, 600);
  runner.vx = 750;
  const shot = game.piece.id;
  game.fire({ x: 550, y: 938 }, { x: 0, y: -50 });
  const initialStocks = game.stock.map(queue => queue.length);
  let waited = false;
  const events = finishShot(game, () => {
    if (game.phase !== 'moving') return;
    assert.equal(game.discs.length, 5);
    assert.deepEqual(game.stock.map(queue => queue.length), initialStocks);
    const launched = game.discs.find(disc => disc.id === shot);
    if (!launched.vy && runner.vx) waited = true;
  });
  assert.ok(waited, 'weak shot stopped while another disc was sliding');
  assert.deepEqual(events.filter(e => outcomes.has(e.cue)).map(e => [e.id, e.cue]), [
    [recovered.id, 'return'], [captured.id, 'capture'], [retired.id, 'death'], [shot, 'misfire']
  ]);
  assert.deepEqual(game.discs, [runner]);
  assert.deepEqual(game.stock[0].slice(-2).map(piece => piece.id), [recovered.id, captured.id]);
  assert.equal(game.stats[0].deaths, 2);
  game.advance(step);
  assert.deepEqual(game.events, []);
});

test('a later collision can rescue a stopped disc in the opposing strip', () => {
  const game = new Match();
  const target = place(game, 0, 250, field.top - 30, 3);
  game.player = 1;
  game.fire({ x: target.x, y: 56 }, { x: 0, y: 300 });
  const events = finishShot(game);
  assert.ok(events.some(event => event.cue === 'hit'));
  assert.ok(game.discs.includes(target));
  assert.equal(game.score()[0], 1);
  assert.equal(target.returns, 3);
  assert.ok(events.every(event => event.id !== target.id || !outcomes.has(event.cue)));
});
