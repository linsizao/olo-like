export type Player = 0 | 1;
export type Point = { x: number; y: number };
type Piece = { size: number; returns: number };
export type Disc = Point & Piece & { vx: number; vy: number; owner: Player; entered: boolean };
export const field = { left: 0, right: 768, top: 171, bottom: 853, middle: 512, height: 1024 };
export const radii = [16, 33, 50];
const masses = [1, 2, 3.8];
const speeds = [2.12, 1.96, 1.8];
export const step = 1 / 120;
export const spawn = (player: Player): Point => ({ x: field.right / 2, y: player === 0 ? 938.5 : 85.5 });
export const scoring = (disc: Disc) => disc.owner === 0 ? disc.y >= field.top && disc.y < field.middle : disc.y > field.middle && disc.y <= field.bottom;
const rack = (): Piece[] => [2, 1, 0, 1, 2, 0].map(size => ({ size, returns: 0 }));

export function collide(first: Disc, second: Disc) {
  const diffX = second.x - first.x, diffY = second.y - first.y;
  const distance = Math.hypot(diffX, diffY), reach = radii[first.size] + radii[second.size];
  if (distance >= reach) return;
  const normalX = distance ? diffX / distance : 1, normalY = distance ? diffY / distance : 0;
  const invFirst = 1 / masses[first.size], invSecond = 1 / masses[second.size];
  const correction = (reach - distance) / (invFirst + invSecond);
  first.x -= normalX * correction * invFirst; first.y -= normalY * correction * invFirst;
  second.x += normalX * correction * invSecond; second.y += normalY * correction * invSecond;
  const approach = (second.vx - first.vx) * normalX + (second.vy - first.vy) * normalY;
  if (approach >= 0) return;
  const impulse = -1.9 * approach / (invFirst + invSecond);
  first.vx -= normalX * impulse * invFirst; first.vy -= normalY * impulse * invFirst;
  second.vx += normalX * impulse * invSecond; second.vy += normalY * impulse * invSecond;
}

export class Match {
  player: Player = 0;
  starter: Player = 0;
  phase: 'ready' | 'moving' | 'over' = 'ready';
  stock = [rack(), rack()];
  discs: Disc[] = [];
  get selected() { return this.stock[this.player][0]?.size ?? 0; }
  shots = 0;
  carry = 0;
  resize(width: number) {
    for (const disc of this.discs) disc.x *= width / field.right;
    field.right = width;
    [16, 33, 50].forEach((radius, index) => { radii[index] = radius * width / 768; });
  }
  private settledScore: [number, number] = [0, 0];
  score(): readonly [number, number] { return this.settledScore; }
  private recount() {
    const points: [number, number] = [0, 0];
    for (const disc of this.discs) {
      if (scoring(disc)) points[disc.owner]++;
    }
    this.settledScore = points;
  }
  fire(origin: Point, velocity: Point) {
    const speed = Math.hypot(velocity.x, velocity.y);
    if (this.phase !== 'ready' || !Number.isFinite(speed) || speed < 48) return false;
    const piece = this.stock[this.player].shift();
    if (!piece) return false;
    const factor = Math.min(2000 / speed, speeds[piece.size]);
    this.discs.push({ ...origin, ...piece, owner: this.player, entered: false, vx: velocity.x * factor, vy: velocity.y * factor });
    this.shots++; this.phase = 'moving'; this.carry = 0;
    return true;
  }
  advance(seconds: number) {
    if (this.phase !== 'moving') return;
    this.carry += Math.min(0.1, Math.max(0, seconds));
    while (this.carry >= step && this.phase === 'moving') {
      this.carry -= step;
      for (const disc of this.discs) {
        disc.x += disc.vx * step; disc.y += disc.vy * step;
        const radius = radii[disc.size];
        if (disc.x < field.left + radius) { disc.x = field.left + radius; disc.vx = Math.abs(disc.vx) * 0.84; }
        if (disc.x > field.right - radius) { disc.x = field.right - radius; disc.vx = -Math.abs(disc.vx) * 0.84; }
        const speed = Math.hypot(disc.vx, disc.vy);
        const factor = speed ? Math.max(0, speed * 0.984 - 0.95) / speed : 0;
        disc.vx *= factor; disc.vy *= factor;
      }
      for (let first = 0; first < this.discs.length; first++) {
        for (let second = first + 1; second < this.discs.length; second++) collide(this.discs[first], this.discs[second]);
      }
      this.discs = this.discs.filter(disc => {
        if (disc.y >= field.top && disc.y <= field.bottom) { disc.entered = true; return true; }
        if (!disc.entered) return disc.y >= 0 && disc.y <= field.height;
        if (disc.returns < 3) this.stock[disc.y < field.top ? 1 : 0].push({ size: disc.size, returns: disc.returns + 1 });
        return false;
      });
      if (this.discs.every(disc => !disc.vx && !disc.vy)) {
        this.discs = this.discs.filter(disc => disc.entered);
        this.recount();
        this.phase = this.stock.every(queue => !queue.length) ? 'over' : 'ready';
        if (this.phase === 'ready') {
          const other = (1 - this.player) as Player;
          if (this.stock[other].length) this.player = other;
        }
      }
    }
  }
  rematch() {
    const next = (1 - this.starter) as Player;
    Object.assign(this, new Match()); this.player = this.starter = next;
  }
}
