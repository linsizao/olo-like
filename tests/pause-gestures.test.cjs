const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

let Table;
test.before(async () => {
  // Run the packaged Table with the game's SystemJS loader and no renderer or device.
  const context = vm.createContext({location:{href:'file:///wechat/game.js'}});
  context.self = context;
  const load = file => vm.runInContext(readFileSync(path.join(__dirname,'../wechat',file),'utf8'),context);
  load('src/system.bundle.js');
  load('src/chunks/bundle.js');
  const system = context.System;
  system.getRegister()[1](() => {},{}).execute();
  load('assets/main/index.js');
  system.register('cc',[],publish => ({execute() { publish('cclegacy',{_RF:{push(){},pop(){}}}); }}));
  ({ Table } = await system.import('chunks:///_virtual/Table.ts'));
});

const middle = 512, center = 384;
const point = (x,y) => ({x,y});
const ink = {rect(){},dot(){},polygon(){},text(){}};
function finishAnimation(table) { for (let i=0;i<10;i++) table.tick(.1); }
function tap(table,x,y) { table.draw(ink); table.down(point(x,y)); table.up(point(x,y)); }
function paused() {
  const table = new Table();
  tap(table,center,380);
  finishAnimation(table);
  assert.equal(table.page,'play');
  assert(table.match.fire(point(center,780),point(90,-400)));
  table.down(point(center,middle));
  table.up(point(center,middle+65));
  finishAnimation(table);
  assert.equal(table.page,'pause');
  return table;
}
function gripRows(table) {
  const rows = [];
  table.draw({...ink,rect(x,y,w,h) {
    if (x===center-28 && w===56 && h===4) rows.push(y+h/2);
  }});
  assert.equal(rows.length,2,'two visible handles');
  return rows;
}

for (const which of [0,1]) {
  test((which?'lower grip up':'upper grip down')+' closes the board and resumes the frozen shot', () => {
    const table = paused(), sign = which?-1:1;
    const rows = gripRows(table), y = rows[which], disc = table.match.discs[0];
    const before = {x:disc.x,y:disc.y};
    table.down(point(center,y));
    table.move(point(center,y+sign*80));
    const during = gripRows(table);
    assert(during[0]>rows[0] && during[1]<rows[1]);
    table.tick(.1);
    assert.equal(table.page,'pause');
    assert.deepEqual({x:disc.x,y:disc.y},before);
    table.up(point(center,y+sign*80));
    assert.equal(table.page,'play');
    const firstFrame = gripRows(table);
    assert.deepEqual(firstFrame,during,'release starts at the dragged position');
    table.tick(.02);
    assert.deepEqual({x:disc.x,y:disc.y},before);
    finishAnimation(table);
    assert(disc.x>before.x && disc.y<before.y);
  });
}

test('short, outward, sideways, off-handle and cancelled gestures stay paused', () => {
  const table = paused(), rows = gripRows(table), y = rows[1], disc = table.match.discs[0];
  const before = {x:disc.x,y:disc.y};
  for (const [x,dx,dy,cancel] of [
    [center,0,-20,false], [center,0,95,false], [center,85,-20,false],
    [center+150,0,-95,false], [center,0,-95,true], [center,0,-220,true],
  ]) {
    table.down(point(x,y));
    table.move(point(x+dx,y+dy));
    if (cancel) table.cancel();
    else table.up(point(x+dx,y+dy));
    finishAnimation(table);
    assert.equal(table.page,'pause');
    assert.deepEqual(gripRows(table),rows);
    assert.deepEqual({x:disc.x,y:disc.y},before);
  }
  tap(table,768*.30,middle);
  finishAnimation(table);
  assert.equal(table.page,'play');
});

test('pause menu and rulebook scrolling retain their original touch targets', () => {
  const table = paused();
  tap(table,768*.70,middle);
  finishAnimation(table);
  assert.equal(table.page,'menu');
  tap(table,center,468);
  assert.equal(table.page,'rules');
  const visible = () => {
    const labels = [];
    table.draw({...ink,text(_x,_y,value){labels.push(value);}});
    return labels;
  };
  const before = visible();
  table.down(point(center,700));
  table.move(point(center,380));
  table.up(point(center,380));
  assert.equal(table.page,'rules');
  assert.notDeepEqual(visible(),before);
});
