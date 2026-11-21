const assert = require('node:assert/strict');
const test = require('node:test');
const { Match, field, radii, step } = require('../assets/scripts/Match.ts');

function setup(player, size, targetSize, x, y) {
  const game = new Match();
  game.player = player;
  game.choose(game.stock[player].findIndex(p => p.size === size));
  const stock = game.stock[1-player];
  const [piece] = stock.splice(stock.findIndex(p => p.size === targetSize),1);
  const target = {...piece,owner:1-player,entered:true,x,y,vx:0,vy:0};
  game.discs.push(target);
  return {game,target};
}

for (const player of [0,1]) {
  const dir = player ? 1 : -1, line = player ? field.top : field.bottom;
  test(`player ${player}: head-on launches at the line transfer ordinary impact speed for every size`, () => {
    for (const size of [0,1,2]) for (const targetSize of [0,1,2]) {
      const reach = radii[size]+radii[targetSize], velocity = {x:0,y:dir*720};
      const edge = setup(player,size,targetSize,320,line+dir);
      const normal = setup(player,size,targetSize,320,field.middle);
      edge.game.fire({x:320,y:line},velocity);
      normal.game.fire({x:320,y:field.middle-dir*(reach+4)},velocity);
      assert.equal(normal.game.stats[player].hits,0);
      edge.game.advance(step); normal.game.advance(step);
      assert(edge.target.vy*dir>0);
      assert.equal(normal.game.stats[player].hits,1);
      // Normal flight applies one step of drag before contact instead of after it.
      assert(Math.abs(edge.target.vy-normal.target.vy)<1);
      assert.equal(edge.game.events.filter(e=>e.cue==='hit').length,1);
    }
  });
  test(`player ${player}: a diagonal release uses first contact on its incoming line`, () => {
    const origin = {x:320,y:line}, {game,target} = setup(player,2,2,origin.x-0.00001,line);
    assert(game.fire(origin,{x:360,y:480*dir}));
    game.advance(step);
    assert(target.vy*dir>0);
    assert(Math.abs(target.vx/target.vy-.75*dir)<1e-5);
  });
  test(`player ${player}: sliding away from an overlapping rim does not kick the target`, () => {
    const {game,target}=setup(player,2,1,300,line);
    game.fire({x:320,y:line},{x:720,y:50*dir});
    game.advance(step);
    assert.equal(game.stats[player].hits,0);
    assert.equal(Math.hypot(target.vx,target.vy),0);
  });
  test(`player ${player}: a ball along the side rail can be hit without spawning outside the board`, () => {
    const x=radii[2], {game,target}=setup(player,2,2,x,line);
    game.fire({x,y:line},{x:270,y:720*dir});
    const shot=game.discs.at(-1);
    assert(shot.x>=radii[shot.size]);
    assert(Math.hypot(shot.x-target.x,shot.y-target.y)>=2*radii[2]-1e-6);
    game.advance(step);
    assert(target.vy*dir>0);
  });
}
