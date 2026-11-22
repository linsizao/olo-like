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
      const radius = radii[game.selected];
      const line = player ? field.top-radius : field.bottom+radius;
      const drag = new LaunchDrag(touch, center, reach, line);
      const x = touch.x + side*176, y = touch.y - direction*32;
      push(drag, x, touch.y);          // Lateral placement.
      push(drag, x, y);                // Pull back without lifting.
      push(drag, x, y + direction*24); // Still behind the original touch.
      const shot = drag.release();
      assert(shot);
      assert.equal(shot.velocity.x, 0);
      assert.equal(Math.sign(shot.velocity.y), direction);
      assert.equal(shot.power, 24/reach);
      const origin = drag.center(radius,field.right-radius,radius,field.height-radius);
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
    const drag = new LaunchDrag(center, center, reach, field.bottom);
    const x = center.x + sideTravel;
    push(drag,x,center.y);
    for (let i=1;i<=steps;i++) push(drag,x+48*i/steps,center.y-64*i/steps);
    return drag.release();
  }
  const baseline = release(0,1);
  assert(baseline);
  for (const shot of [release(-160,1),release(240,80),release(-240,160)]) {
    assert(shot);
    assert(Math.abs(shot.velocity.x/shot.velocity.y + .75)<1e-10);
    assert(Math.abs(shot.power - baseline.power)<1e-10);
  }
});

test('a turn within the strip uses the direction of the final push on lift', () => {
  const center = spawn(0), radius = radii[0];
  const drag = new LaunchDrag(center,center,reach,field.bottom+radius,0);
  assert.equal(drag.move({x:200,y:center.y},80),null);
  assert.equal(drag.move({x:224,y:center.y-16},115),null);
  assert.equal(drag.move({x:224,y:center.y-58},170),null);
  const shot = drag.release();
  assert.equal(shot.velocity.x,0);
  assert(shot.velocity.y<0);
  assert.equal(shot.power,42/reach);
});

test('placing, tapping, a tiny forward nudge, or ending with a reversal does not fire', () => {
  const center=spawn(0), drag=new LaunchDrag(center,center,reach,field.bottom);
  assert.equal(drag.release(),null);
  push(drag,100,center.y);
  assert.equal(drag.release(),null);
  push(drag,100,center.y-6);
  assert.equal(drag.release(),null);
  push(drag,100,center.y-80);
  push(drag,100,center.y-59);
  assert.equal(drag.release(),null);
});

test('a deliberately shallow bank shot can be launched after repositioning', () => {
  const center=spawn(0), drag=new LaunchDrag(center,center,reach,field.bottom);
  push(drag,120,center.y);
  push(drag,220,center.y-8);
  const shot=drag.release();
  assert(shot);
  assert(Math.abs(shot.velocity.y/shot.velocity.x + .08)<1e-10);
  assert.equal(shot.power,Math.hypot(100,8)/reach);
});

for (const player of [0, 1]) {
  const dir = player ? 1 : -1;
  const radius = radii[2];
  const line = player ? field.top-radius : field.bottom+radius;
  const bounds = [radius, field.right-radius, radius, field.height-radius];

  test(`player ${player}: an in-strip reversal cancels the forward stroke and allows repositioning`, () => {
    const origin = spawn(player);
    const drag = new LaunchDrag(origin,origin,reach,line,0);
    assert.equal(drag.move({x:origin.x,y:origin.y+dir*20},30),null);
    assert.equal(drag.move(origin,60),null);
    assert.equal(drag.move({x:origin.x-80,y:origin.y},100),null);
    assert.equal(drag.release(),null);
    assert.equal(drag.move({x:origin.x-80,y:origin.y+dir*24},130),null);
    assert.equal(drag.release().power,24/reach);
  });

  test(`player ${player}: an off-center diagonal swipe launches where the disc rim meets the line`, () => {
    const origin = {x:field.right/2,y:line-dir*40};
    const touch = {x:origin.x-9,y:origin.y+dir*12};
    const drag = new LaunchDrag(touch,origin,reach,line,0);

    // The finger has crossed, but the disc rim is still four units inside.
    assert.equal(drag.move({x:touch.x+27,y:touch.y+dir*36},45),null);
    assert.deepEqual(drag.center(...bounds),{x:origin.x+27,y:origin.y+dir*36});
    const shot = drag.move({x:touch.x+105,y:touch.y+dir*140},175);
    assert(shot);
    assert(Math.abs(shot.velocity.x/(dir*shot.velocity.y)-0.75)<1e-9);
    const contact = {x:origin.x+30,y:line};
    assert.deepEqual(drag.center(...bounds),contact);
    drag.move({x:touch.x-120,y:touch.y+dir*250},300);
    assert.deepEqual(drag.center(...bounds),contact);
  });

  test(`player ${player}: fast flicks can reach full power even with a short launch strip`, () => {
    function swipe(speed,steps) {
      const from = {x:field.right/2,y:line-dir*27};
      const drag = new LaunchDrag(from,from,reach,line,0);
      for (let i=1;i<=steps;i++) {
        const distance = 96*i/steps;
        const shot = drag.move({x:from.x,y:from.y+dir*distance},1000*distance/speed);
        if (distance<27) assert.equal(shot,null);
        else {
          assert(shot);
          assert.deepEqual(drag.center(...bounds),{x:from.x,y:line});
          assert.equal(shot.velocity.x,0);
          assert.equal(Math.sign(shot.velocity.y),dir);
          return shot;
        }
      }
      assert.fail('Swipe reached the field while still held');
    }
    const slow = swipe(240,16), medium = swipe(1000,16), fast = swipe(1600,16);
    assert(slow.power>0 && slow.power<medium.power && medium.power<1);
    assert.equal(fast.power,1);
    assert(Math.abs(swipe(1000,1).power-medium.power)<1e-9);
    assert.equal(swipe(1600,1).power,1);
  });
}

test('a short nudge at the rim stays inside until the forward push qualifies', () => {
  const line = field.bottom+radii[2], start = {x:320,y:line+3};
  const drag = new LaunchDrag(start,start,reach,line,0);
  assert.equal(drag.move({x:322,y:line-3},20),null);
  const held = drag.center(50,field.right-50,50,field.height-50);
  assert.deepEqual(held,{x:321,y:line});
  assert.equal(drag.move({x:338,y:line-3},40),null);
  assert.deepEqual(drag.center(50,field.right-50,50,field.height-50),held);
  assert(drag.move({x:338,y:line-21},60));
  assert.deepEqual(drag.center(50,field.right-50,50,field.height-50),held);
});
