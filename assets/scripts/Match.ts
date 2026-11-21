export type Player = 0 | 1;
export type Point = { x: number; y: number };
export type Piece = { id: number; size: number; returns: number; origin: Player };
export type Cue = 'hit' | 'wall' | 'enter' | 'gain' | 'loss' | 'return' | 'capture' | 'death' | 'misfire';
export type Impact = { cue: Cue; point: Point; player: Player; size: number; force: number; id: number };
export type Disc = Point & Piece & { vx: number; vy: number; owner: Player; entered: boolean };
export const field = { left: 0, right: 768, top: 171, bottom: 853, middle: 512, height: 1024 };
export const pieceScale = (width: number) => Math.min(1, width/768);
export const radii = [16, 33, 50];
const masses = [1, 2, 3.8];
const speeds = [2.12, 1.96, 1.8];
export const step = 1 / 120;
export const spawn = (player: Player, upperRow = field.top / 2): Point => ({ x: field.right / 2, y: player === 0 ? field.height-upperRow : upperRow });
const onColoredField = (disc: Point) => disc.y >= field.top && disc.y <= field.bottom;
export const scoring = (disc: Disc) => disc.owner === 0 ? disc.y >= field.top && disc.y < field.middle : disc.y > field.middle && disc.y <= field.bottom;
const rack = (origin: Player): Piece[] => [2, 1, 0, 1, 2, 0].map((size, index) => ({ id: index + origin * 6, origin, size, returns: 0 }));
const tally = () => ({ shots: 0, hits: 0, returns: 0, captures: 0, goals: 0, deaths: 0 });

const contactEpsilon = 1e-7;

export function collide(first: Disc, second: Disc) {
  const diffX = second.x - first.x, diffY = second.y - first.y;
  const distance = Math.hypot(diffX, diffY), reach = radii[first.size] + radii[second.size];
  if (distance > reach + contactEpsilon) return;
  const normalX = distance ? diffX / distance : 1, normalY = distance ? diffY / distance : 0;
  const invFirst = 1 / masses[first.size], invSecond = 1 / masses[second.size];
  const correction = Math.max(0, reach - distance) / (invFirst + invSecond);
  first.x -= normalX * correction * invFirst; first.y -= normalY * correction * invFirst;
  second.x += normalX * correction * invSecond; second.y += normalY * correction * invSecond;
  const approach = (second.vx - first.vx) * normalX + (second.vy - first.vy) * normalY;
  if (approach >= 0) return;
  const impulse = -1.9 * approach / (invFirst + invSecond);
  first.vx -= normalX * impulse * invFirst; first.vy -= normalY * impulse * invFirst;
  second.vx += normalX * impulse * invSecond; second.vy += normalY * impulse * invSecond;
  return -approach;
}

export class Match {
  player: Player = 0;
  starter: Player = 0;
  phase: 'ready' | 'moving' | 'over' = 'ready';
  stock = [rack(0), rack(1)];
  stats = [tally(), tally()];
  events: Impact[] = [];
  chosen = 0;
  discs: Disc[] = [];
  get piece() { return this.stock[this.player][this.chosen]; }
  get selected() { return this.piece?.size ?? 0; }
  choose(index: number) {
    if (this.phase !== 'ready' || !this.stock[this.player][index]) return false;
    this.chosen = index; return true;
  }
  shots = 0;
  carry = 0;
  resize(width: number, strip = field.top, animationPoints: Point[] = []) {
    if (width === field.right && strip === field.top) return;
    const points = [...this.discs, ...this.events.map(e => e.point), ...animationPoints];
    for (const point of points) {
      point.x *= width / field.right;
      if (strip === field.top) continue;
      // Keep each disc in the same launch or scoring zone when the window changes.
      if (point.y <= field.top) point.y = point.y / field.top * strip;
      else if (point.y >= field.bottom) point.y = field.height - (field.height-point.y)/field.top*strip;
      else point.y = field.middle + (point.y-field.middle)/(field.middle-field.top)*(field.middle-strip);
    }
    field.right = width; field.top = strip; field.bottom = field.height-strip;
    [16, 33, 50].forEach((radius, index) => { radii[index] = radius*pieceScale(width); });
  }
  private settledScore: [number, number] = [0, 0];
  private confirmed = new Set<number>();
  private emit(cue: Cue, disc: Disc, force = 1) {
    this.events.push({ cue, point: { x: disc.x, y: disc.y }, size: disc.size, player: disc.owner, force, id: disc.id });
  }
  private retire(disc:Disc, cue:'misfire'|'death') {
    this.stats[disc.owner].deaths++; this.emit(cue,disc);
  }
  score(): readonly [number, number] { return this.settledScore; }
  private recount() {
    const points: [number, number] = [0, 0];
    for (const disc of this.discs) {
      if (scoring(disc)) {
        points[disc.owner]++;
        if (!this.confirmed.has(disc.id)) { this.stats[disc.owner].goals++; this.emit('gain', disc); }
      }
    }
    for (const id of this.confirmed) {
      const disc = this.discs.find(item => item.id === id);
      if (disc && !scoring(disc)) this.emit('loss', disc);
    }
    this.confirmed = new Set(this.discs.filter(scoring).map(disc => disc.id));
    this.settledScore = points;
  }
  // A held disc can reach the rim of a settled disc before its centre reaches
  // the launch line. Recover that first contact along the intended stroke.
  launchCenter(origin: Point, size: number, velocity?: Point): Point {
    const forward = this.player === 0 ? -1 : 1;
    const line = this.player === 0 ? field.bottom : field.top;
    if ((origin.y-line)*forward > 0) return origin;
    const radius = radii[size];
    const speed = velocity ? Math.hypot(velocity.x,velocity.y) : 0;
    const ux = speed && velocity ? velocity.x/speed : 0;
    const uy = speed && velocity ? velocity.y/speed : forward;
    let retreat = 0, straightRetreat = 0, useStroke = uy*forward > 0;
    for (const disc of this.discs) {
      const dx = disc.x-origin.x, dy = disc.y-origin.y, reach = radius+radii[disc.size];
      const overlap = reach*reach - dx*dx - dy*dy;
      if (overlap <= 0) continue;
      const along = dx*ux + dy*uy;
      const depth = Math.sqrt(reach*reach-dx*dx);
      // At the home-side tangent a stroke pointing away should slide free.
      if (dx*ux + depth*forward*uy <= 0) useStroke = false;
      retreat = Math.max(retreat, Math.sqrt(along*along+overlap)-along);
      straightRetreat = Math.max(straightRetreat, depth-dy*forward);
    }
    if (!retreat) return origin;
    const x = origin.x-retreat*ux, y = origin.y-retreat*uy;
    if (useStroke && x >= radius && x <= field.right-radius && y >= radius && y <= field.height-radius &&
        this.discs.every(d => Math.hypot(x-d.x,y-d.y) >= radius+radii[d.size]-contactEpsilon)) {
      return {x,y};
    }
    // Against a side rail or a cluster, keep the chosen lane and back up towards home.
    return {x:origin.x, y:Math.max(radius, Math.min(field.height-radius, origin.y-straightRetreat*forward))};
  }
  private resolveContact(first: Disc, second: Disc) {
    const force = collide(first,second);
    if (force !== undefined && force > 5) {
      this.stats[this.player].hits++;
      this.emit('hit',second,force);
    }
  }
  fire(origin: Point, velocity: Point) {
    const speed = Math.hypot(velocity.x, velocity.y);
    if (this.phase !== 'ready' || !Number.isFinite(speed) || speed < 48) return false;
    const piece = this.stock[this.player].splice(this.chosen, 1)[0];
    if (!piece) return false;
    const factor = Math.min(2300 / speed, speeds[piece.size]);
    const center = this.launchCenter(origin,piece.size,velocity);
    const shot = { ...center, ...piece, owner:this.player, entered:onColoredField(center), vx:velocity.x*factor, vy:velocity.y*factor };
    // Resolve touching discs before the first integration step can carry the shot past contact.
    for (const disc of this.discs) this.resolveContact(disc,shot);
    this.discs.push(shot);
    this.stats[this.player].shots++; this.shots++; this.phase = 'moving'; this.carry = 0; this.chosen = 0;
    return true;
  }
  private rebound(disc: Disc) {
    const radius = radii[disc.size];
    const x = Math.max(field.left + radius, Math.min(field.right - radius, disc.x));
    const y = Math.max(radius, Math.min(field.height - radius, disc.y));
    let force = 0;
    if ((disc.x - x) * disc.vx > 0) {
      force = Math.abs(disc.vx);
      disc.vx *= -0.84;
    }
    if ((disc.y - y) * disc.vy > 0) {
      force = Math.max(force, Math.abs(disc.vy));
      disc.vy *= -0.84;
    }
    disc.x = x;
    disc.y = y;
    if (force > 48) this.emit('wall', disc, force);
  }
  private settleTurn() {
    this.recount();
    this.discs = this.discs.filter(disc => {
      if (onColoredField(disc)) return true;
      if (!disc.entered) {
        this.retire(disc, 'misfire');
      } else if (disc.returns >= 3) {
        this.retire(disc, 'death');
      } else {
        const receiver = disc.y < field.top ? 1 : 0;
        this.stock[receiver].push({ id: disc.id, origin: disc.origin, size: disc.size, returns: disc.returns + 1 });
        if (receiver === disc.owner) {
          this.stats[receiver].returns++;
          this.emit('return', disc);
        } else {
          this.stats[receiver].captures++;
          this.emit('capture', disc);
        }
      }
      return false;
    });
    this.phase = this.stock.every(queue => !queue.length) ? 'over' : 'ready';
    const other = (1 - this.player) as Player;
    if (this.stock[other].length) this.player = other;
  }
  advance(seconds: number) {
    if (this.phase !== 'moving') return;
    this.carry += Math.min(0.1, Math.max(0, seconds));
    while (this.carry >= step && this.phase === 'moving') {
      this.carry -= step;
      const inside = new Set(this.discs.filter(scoring).map(disc => disc.id));
      for (const disc of this.discs) {
        disc.x += disc.vx * step; disc.y += disc.vy * step;
        const speed = Math.hypot(disc.vx, disc.vy);
        const factor = speed ? Math.max(0, speed * 0.984 - 0.95) / speed : 0;
        disc.vx *= factor; disc.vy *= factor;
      }
      for (let first = 0; first < this.discs.length; first++) {
        for (let second = first + 1; second < this.discs.length; second++) {
          this.resolveContact(this.discs[first],this.discs[second]);
        }
      }
      for (const disc of this.discs) {
        this.rebound(disc);
        if (onColoredField(disc)) disc.entered = true;
        if (scoring(disc) && !inside.has(disc.id)) this.emit('enter', disc);
      }
      if (this.discs.every(disc => !disc.vx && !disc.vy)) this.settleTurn();
    }
  }
  rematch() {
    const next = (1 - this.starter) as Player;
    Object.assign(this, new Match()); this.player = this.starter = next;
  }
}
