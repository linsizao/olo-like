const assert = require('node:assert/strict');
const test = require('node:test');
const { drawShatter, crackTime, shatterTime } = require('../assets/scripts/Shatter.ts');

test('the six fragments share their initial seams, detach, and fade out', () => {
  function frame(age) {
    const pieces = [];
    drawShatter({polygon: (points,color) => pieces.push({points,color})}, {x:240,y:96},50,'#29BAE3',2,age);
    return pieces;
  }
  const together = (a,b) => Math.hypot(a.x-b.x,a.y-b.y)<1e-8;
  const whole = frame(0), cracked = frame(crackTime), flying = frame(0.18);
  assert.equal(whole.length,6);
  for (let i=0; i<whole.length; i++) {
    const next = (i+1)%whole.length;
    assert(together(whole[i].points[0],whole[next].points[0]));
    assert(together(whole[i].points.at(-1),whole[next].points[1]));
    assert.equal(cracked[i].color,'#29BAE3ff');
    assert.equal(together(cracked[i].points[0],cracked[next].points[0]), i%2 === 0);
    assert(!together(flying[i].points[0],flying[next].points[0]));
    assert(parseInt(flying[i].color.slice(7),16)<255);
  }
  assert.deepEqual(frame(shatterTime),[]);
});
