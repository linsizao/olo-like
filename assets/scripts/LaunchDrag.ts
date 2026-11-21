import type { Player, Point } from './Match';

const spacing = 4;
const headingDistance = 18;
const minPush = 14;

export class LaunchDrag {
  private samples: Point[];
  private pointer: Point;
  private grabOffset: Point;
  private fullPowerDistance: number;

  constructor(touch: Point, center: Point, fullPowerDistance: number) {
    this.samples = [touch];
    this.pointer = touch;
    this.grabOffset = { x: center.x - touch.x, y: center.y - touch.y };
    this.fullPowerDistance = fullPowerDistance;
  }

  move(point: Point) {
    this.pointer = point;
    const last = this.samples[this.samples.length - 1];
    if (Math.hypot(point.x - last.x, point.y - last.y) < spacing) return;
    this.samples.push(point);
    if (this.samples.length > Math.ceil(this.fullPowerDistance / spacing) + 2) this.samples.shift();
  }

  center(left: number, right: number, top: number, bottom: number): Point {
    return {
      x: Math.max(left, Math.min(right, this.pointer.x + this.grabOffset.x)),
      y: Math.max(top, Math.min(bottom, this.pointer.y + this.grabOffset.y))
    };
  }

  release(player: Player) {
    const forward = player === 0 ? -1 : 1;
    const end = this.pointer;
    let start = end, headingX = 0, headingY = 0, used = 0;

    // Walk back only along the final forward stroke. An earlier sideways sweep
    // or reversal positions the disc but contributes neither angle nor power.
    for (let i = this.samples.length - 1; i >= 0; i--) {
      const point = this.samples[i], dx = start.x - point.x, dy = start.y - point.y;
      const length = Math.hypot(dx, dy);
      if (!length || (length < spacing && i > 0)) continue;
      if (dy * forward <= 0) break;
      if (used && dx * headingX + dy * headingY < Math.SQRT1_2 * length * Math.hypot(headingX, headingY)) break;

      const weight = Math.min(length, headingDistance - used);
      headingX += dx / length * weight;
      headingY += dy / length * weight;
      used += weight;
      start = point;
      if (Math.hypot(end.x - start.x, end.y - start.y) >= this.fullPowerDistance) break;
    }

    const distance = Math.hypot(end.x - start.x, end.y - start.y);
    if (distance < minPush || (end.y - start.y) * forward < spacing) return null;
    const power = Math.min(1, distance / this.fullPowerDistance);
    const speedPerUnit = 1290 * power / Math.hypot(headingX, headingY);
    return { power, velocity: { x: headingX * speedPerUnit, y: headingY * speedPerUnit } };
  }
}
