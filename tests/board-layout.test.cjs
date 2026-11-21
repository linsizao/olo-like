const assert = require('node:assert/strict');
const test = require('node:test');
const { fitBoard, boardViewport, haloPeak } = require('../assets/scripts/BoardLayout.ts');

const { Match, field, pieceScale, scoring } = require('../assets/scripts/Match.ts');

test('the ordinary board keeps its original size with the shooter nearer its end', () => {
  assert.deepEqual(boardViewport(844),{windowHeight:844,inset:0});
  assert.deepEqual(fitBoard(1024,50),{ strip:171, resultRow:85.5, upperRow:77.5, shooterRow:67.5, clearance:0, haloSpread:1 });
});

test('play controls move eight logical pixels at each end independently of the strip and results', () => {
  // Last column is the upper limit for each visible white strip, in logical pixels.
  for (const [width,height,capsule,limit] of [[390,844,48,119],[390,844,80,146],[375,667,86,150],[820,1024,94,220]]) {
    const radius = 50*pieceScale(width/height*1024);
    const inset = (capsule+4)*1024/height;
    const { strip, resultRow, upperRow, shooterRow, haloSpread } = fitBoard(1024,radius,{windowHeight:height,inset:capsule+4});
    const extent = Math.max(32,radius*(1+haloPeak*haloSpread));
    const originalRow = (inset+strip)/2;
    const originalShooter = originalRow-Math.min(10,radius/3);
    for (const [oldY,newY] of [[originalRow,upperRow],[originalShooter,shooterRow]]) {
      assert(Math.abs((oldY-newY)*height/1024-8)<1e-6);
      assert(Math.abs(((1024-newY)-(1024-oldY))*height/1024-8)<1e-6);
    }
    assert.equal(resultRow,originalRow);
    assert((upperRow-extent)*height/1024 >= capsule-4-1e-6);
    assert(upperRow-shooterRow > 0 && upperRow-shooterRow <= 10);
    assert(shooterRow*height/1024 > capsule);
    assert(shooterRow+radius <= strip);
    assert(upperRow+extent <= strip+1e-6);
    assert(strip*height/1024 < limit);
    assert(Math.abs(strip-resultRow - (resultRow-inset))<1e-6);
  }
});

test('resizing the field keeps settled discs in their zones and moves effects with them', () => {
  const game = new Match();
  const originalWidth = field.right, originalStrip = field.top;
  try {
    const ys = [0,field.top-1,field.top,230,field.middle,800,field.bottom,field.bottom+1,1024];
    game.discs = ys.map((y,i)=>({x:100,y,owner:i<4?0:1}));
    const points = game.discs.map(d=>({x:d.x,y:d.y}));
    const scores = game.discs.map(scoring);
    game.resize(820,140,points);
    assert.deepEqual(game.discs.map(scoring),scores);
    assert.deepEqual(game.discs.map(({x,y})=>({x,y})),points);
    assert.equal(field.right,820);
    assert.equal(game.discs[2].y,140);
    assert.equal(game.discs[6].y,884);
    assert(game.discs[1].y<140 && game.discs[7].y>884);
  } finally { game.resize(originalWidth,originalStrip); }
});

test('WeChat reports logical pixels and falls back for an unavailable capsule', () => {
  try {
    global.wx={getWindowInfo:()=>({windowHeight:844,safeArea:{top:44,bottom:810}}),
      getMenuButtonBoundingClientRect:()=>({bottom:80})};
    assert.deepEqual(boardViewport(2532),{windowHeight:844,inset:84});
    global.wx.getMenuButtonBoundingClientRect=()=>{throw Error('not ready')};
    assert.deepEqual(boardViewport(2532),{windowHeight:844,inset:88});
  } finally { delete global.wx; }
});
