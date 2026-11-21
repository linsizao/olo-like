const assert = require('node:assert/strict');
const test = require('node:test');
const { LaunchDrag } = require('../assets/scripts/LaunchDrag.ts');
const { Match, field, radii, spawn } = require('../assets/scripts/Match.ts');

const reach = field.height * 0.27;
function push(gesture, x, y) { gesture.move({ x, y }); }

for (const player of [0, 1]) {
  for (const side of [-1, 1]) {
    test(`player ${player}: position on side ${side}, then push straight in the same touch`, () => {
      const game = new Match();
      game.player = player;
      const center = spawn(player), direction = player ? 1 : -1;
      const touch = { x:center.x+7, y:center.y-3 };
      const drag = new LaunchDrag(touch, center, reach);
      const x = touch.x + side*176, y = touch.y - direction*32;
      push(drag, x, touch.y);          // Lateral placement.
      push(drag, x, y);                // Pull back without lifting.
      push(drag, x, y + direction*24); // Still behind the original touch.
      const shot = drag.release(player);
      assert(shot);
      assert.equal(shot.velocity.x, 0);
      assert.equal(Math.sign(shot.velocity.y), direction);
      assert.equal(shot.power, 24/reach);
      const r = radii[game.selected];
      const origin = drag.center(r, field.right-r, player ? r : field.bottom, player ? field.top : field.height-r);
      assert.deepEqual(origin, {x:center.x+side*176, y:center.y-direction*8});
      assert(game.fire(origin, shot.velocity));
      assert.equal(game.discs[0].x, origin.x);
      assert.equal(game.discs[0].y, origin.y);
      assert.equal(game.discs[0].vx, 0);
    });
  }
}

test('the same diagonal push has the same angle and power after any lateral approach', () => {
  const center = spawn(0);
  function release(sideTravel, steps) {
    const drag = new LaunchDrag(center, center, reach);
    const x = center.x + sideTravel;
    push(drag,x,center.y);
    for (let i=1;i<=steps;i++) push(drag,x+48*i/steps,center.y-64*i/steps);
    return drag.release(0);
  }
  const baseline = release(0,1);
  assert(baseline);
  for (const shot of [release(-160,1),release(240,80),release(-240,160)]) {
    assert(shot);
    assert(Math.abs(shot.velocity.x/shot.velocity.y + .75)<1e-10);
    assert(Math.abs(shot.power - baseline.power)<1e-10);
  }
});

test('a final turn steers the shot, and a long push past the strip can still reach full power', () => {
  const center = spawn(0), drag = new LaunchDrag(center,center,reach);
  push(drag,210,center.y);
  push(drag,250,center.y-80);
  push(drag,250,center.y-400);
  const shot=drag.release(0);
  assert.deepEqual(shot,{power:1,velocity:{x:0,y:-1290}});
  assert.deepEqual(drag.center(50,field.right-50,field.bottom,field.height-50),{x:250,y:field.bottom});
});

test('placing, tapping, a tiny forward nudge, or ending with a reversal does not fire', () => {
  const center=spawn(0), drag=new LaunchDrag(center,center,reach);
  assert.equal(drag.release(0),null);
  push(drag,100,center.y);
  assert.equal(drag.release(0),null);
  push(drag,100,center.y-6);
  assert.equal(drag.release(0),null);
  push(drag,100,center.y-80);
  push(drag,100,center.y-59);
  assert.equal(drag.release(0),null);
});

test('a deliberately shallow bank shot can be launched after repositioning', () => {
  const center=spawn(0), drag=new LaunchDrag(center,center,reach);
  push(drag,120,center.y);
  push(drag,220,center.y-8);
  const shot=drag.release(0);
  assert(shot);
  assert(Math.abs(shot.velocity.y/shot.velocity.x + .08)<1e-10);
  assert.equal(shot.power,Math.hypot(100,8)/reach);
});
