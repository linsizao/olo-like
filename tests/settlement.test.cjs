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
  const disc = { ...piece, x, y, owner, returns, leftHome: true, collided: false, vx: 0, vy: 0 };
  game.discs.push(disc);
  return disc;
}

test('stock changes and misfires wait for the last moving disc, then resolve once together', () => {
  const game = new Match();
  const recovered = place(game, 0, 80, 920);
  const captured = place(game, 1, 210, 920);
  const reused = place(game, 0, 350, 90, 3);
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
    [recovered.id, 'return'], [captured.id, 'capture'], [reused.id, 'capture'], [shot, 'misfire']
  ]);
  assert.deepEqual(game.discs, [runner]);
  assert.equal(game.stock[1].at(-1).returns,4);
  assert.deepEqual(game.stock[0].slice(-2).map(piece => piece.id), [recovered.id, captured.id]);
  assert.equal(game.stats[0].deaths, 1);
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

for (const player of [0,1]) {
  const direction = player ? 1 : -1, y = player ? 70 : field.height-70;
  for (const targetOwner of [0,1]) {
    test(`player ${player}: contact with player ${targetOwner}'s ball protects a shot that stays home`, () => {
      const game = new Match();
      game.player = player;
      const target = place(game,targetOwner,300,y+direction*(radii[2]+radii[0]+3));
      const id = game.piece.id;
      assert(game.fire({x:300,y},{x:0,y:direction*50}));
      const shot = game.discs.at(-1);
      const events = finishShot(game);
      assert(events.some(e => e.cue==='hit'));
      assert(shot.collided && target.collided && !shot.leftHome);
      assert(events.some(e => e.cue==='return' && e.id===id));
      assert.equal(game.stats[player].deaths,0);

      // A returned disc must earn protection again on its next launch.
      game.player = player;
      assert(game.choose(game.stock[player].findIndex(piece => piece.id===id)));
      assert(game.fire({x:560,y},{x:0,y:direction*50}));
      assert(finishShot(game).some(e => e.cue==='misfire' && e.id===id));
    });
  }
  test(`player ${player}: a quiet glancing impact still counts as a collision`, () => {
    const game = new Match();
    game.player = player;
    const target = place(game,1-player,300,y);
    const id = game.piece.id, x = target.x-radii[game.selected]-radii[target.size];
    assert(game.fire({x,y},{x:1,y:direction*50}));
    const events = finishShot(game);
    assert.equal(game.stats[player].hits,0);
    assert(events.some(e => e.cue==='return' && e.id===id));
  });
  test(`player ${player}: a wall rebound in the home strip protects the shot`, () => {
    const game = new Match();
    game.player = player;
    const id = game.piece.id;
    assert(game.fire({x:radii[game.selected]+2,y},{x:-60,y:direction*8}));
    const events = finishShot(game);
    assert(events.some(e => e.cue==='wall'));
    assert(events.some(e => e.cue==='return' && e.id===id));
  });
}

test('contact on the final step counts even when friction immediately stops both discs', () => {
  const game = new Match(), y = field.height-65;
  const target = place(game,1,300,y);
  const id = game.piece.id;
  const x = target.x-radii[game.selected]-radii[target.size]-0.001;
  assert(game.fire({x,y},{x:50,y:0}));
  game.discs.at(-1).vx = 0.5;
  const events = finishShot(game);
  assert(!events.some(e => e.cue==='hit'));
  assert(events.some(e => e.id===id && e.cue==='return'));
});
