const assert = require('node:assert/strict');
const test = require('node:test');
const { LaunchDrag } = require('../assets/scripts/LaunchDrag.ts');
const { Match, field, radii, spawn, step } = require('../assets/scripts/Match.ts');

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

  test(`player ${player}: holding still before a flick leaves its velocity and stopping point unchanged`, () => {
    const from = {x:320,y:line-dir*27};
    function replay(hold, interval, firstMove, reposition) {
      const game = new Match();
      game.player = player;
      const initial = reposition ? {x:from.x-75,y:from.y} : from;
      const drag = new LaunchDrag(initial,initial,reach,line,0);
      if (reposition) drag.move(from,15);
      if (hold) assert.equal(drag.move(from,hold/2),null);
      let shot;
      for (let i=0; !shot && i<10; i++) {
        const p = {x:from.x+2*(i+1), y:from.y+dir*8*(i+1)};
        shot = drag.move(p,(reposition ? 15 : 0)+hold+firstMove+i*interval);
      }
      assert(shot);
      assert(Math.abs(shot.velocity.y - dir*1290*32/reach)<1e-8);
      const start = drag.center(...bounds);
      assert(game.fire(start,shot.velocity,shot.power));
      const disc = game.discs[0];
      const velocity = [disc.vx,disc.vy];
      for (let i=0; i<1200 && game.phase==='moving'; i++) game.advance(step);
      assert.notEqual(game.phase,'moving');
      return {velocity, power:shot.power, x:disc.x, y:disc.y};
    }
    for (const interval of [8,12,32]) for (const reposition of [false,true]) {
      const direct = replay(0,interval,interval,reposition);
      assert.deepEqual(replay(1200,interval,interval,reposition),direct);
      assert.deepEqual(replay(0,interval,0,reposition),direct);
    }
  });

  test(`player ${player}: a single movement spanning the line uses the same distance after a hold`, () => {
    const from = {x:320,y:line-dir*27};
    for (const travel of [72,310]) {
      const end = {x:from.x,y:from.y+dir*travel};
      const shot = hold => {
        const drag = new LaunchDrag(from,from,reach,line,0);
        const fired = drag.move(end,hold+16);
        assert(fired);
        assert.deepEqual(drag.center(...bounds),{x:from.x,y:line});
        return fired;
      };
      assert.deepEqual(shot(1500),shot(0));
      assert.equal(shot(0).power,Math.min(1,travel/reach));
    }
  });

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

  test(`player ${player}: short and long swipes use the original distance curve at any sampling rate`, () => {
    const from = {x:320,y:line-dir*27};
    function roll(distance, samples, ticks) {
      const game = new Match();
      game.player = player;
      const drag = new LaunchDrag(from,from,reach,line);
      let disc, origin, heading;
      for (let i=1; i<=samples; i++) {
        const p = {x:from.x,y:from.y+dir*distance*i/samples};
        if (disc) {
          const more = drag.followThrough(p,heading);
          assert(more);
          game.extendLaunch(disc,origin,more.velocity,more.power);
        } else {
          const shot = drag.move(p);
          if (!shot) continue;
          origin = drag.center(...bounds);
          assert.deepEqual(origin,{x:from.x,y:line});
          heading = shot.velocity;
          assert(game.fire(origin,heading,shot.power));
          disc = game.discs[0];
        }
        game.advance(ticks*step);
        assert((disc.y-line)*dir>0,'the disc moves while the finger is still down');
      }
      const power = Math.min(1,distance/reach);
      assert(Math.abs(disc.launchPower-power)<1e-10);
      const reference = new Match();
      reference.player = player;
      assert(reference.fire(origin,{x:0,y:dir*1290*power},power));
      const expected = reference.discs[0];
      while (reference.phase==='moving') reference.advance(step);
      while (game.phase==='moving') game.advance(step);
      // The exact wall-contact frame can differ when the disc starts rolling earlier.
      assert(Math.abs(disc.y-expected.y) < (disc.collided ? 4 : 0.02));
      assert.equal(game.shots,1);
    }
    for (const distance of [36,96,180,310]) {
      for (const samples of [1,8,32]) for (const ticks of [1,2]) roll(distance,samples,ticks);
    }
  });

  test(`player ${player}: sideways or reversed follow-through cannot steer, and contact ends the push`, () => {
    const from = {x:320,y:line-dir*27}, end = {x:320,y:line+dir*6};
    for (const stray of [{x:350,y:end.y},{x:320,y:end.y-dir*12}]) {
      const drag = new LaunchDrag(from,from,reach,line);
      const shot = drag.move(end);
      assert(shot);
      assert.equal(drag.followThrough(stray,shot.velocity),null);
    }
    const game = new Match();
    game.player = player;
    const target = game.stock[1-player].pop();
    game.discs.push({...target,x:320,y:line+dir*(radius+radii[target.size]),
      owner:1-player,vx:0,vy:0,collided:false,leftHome:true});
    const origin = {x:320,y:line};
    assert(game.fire(origin,{x:0,y:dir*200},0.2));
    const disc = game.discs.at(-1);
    assert(disc.collided);
    const before = [disc.x,disc.y,disc.vx,disc.vy];
    assert.equal(game.extendLaunch(disc,origin,{x:0,y:dir*1290},1),false);
    assert.deepEqual([disc.x,disc.y,disc.vx,disc.vy],before);
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
