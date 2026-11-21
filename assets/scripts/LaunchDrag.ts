import type { Point } from './Match';

const spacing = 4;
const headingDistance = 18;
const minPush = 14;

type Shot = { power: number; velocity: Point };

export class LaunchDrag {
  private samples: Point[];
  private pointer: Point;
  private grabOffset: Point;
  private fullPowerDistance: number;

  private launchLine: number;
  private forward: number;
  private edgeX: number | null = null;
  private fieldShot: Shot | null = null;

  constructor(touch: Point, center: Point, fullPowerDistance: number, launchLine: number) {
    this.launchLine = launchLine;
    this.forward = Math.sign(launchLine - center.y);
    this.samples = [touch];
    this.pointer = touch;
    this.grabOffset = { x: center.x - touch.x, y: center.y - touch.y };
    this.fullPowerDistance = fullPowerDistance;
  }

  move(point: Point) {
    const previous = this.pointer, offset = this.grabOffset;
    const front = this.launchLine - offset.y;
    if ((point.y - front) * this.forward < 0) {
      this.edgeX = null;
    } else if (this.edgeX === null) {
      // Pin the visible disc at the exact crossing even if one event spans the whole strip.
      const t = (front - previous.y) / (point.y - previous.y);
      this.edgeX = previous.x + (point.x - previous.x) * t + offset.x;
    }
    this.pointer = point;
    const last = this.samples[this.samples.length - 1];
    if (Math.hypot(point.x - last.x, point.y - last.y) >= spacing) {
      this.samples.push(point);
      if (this.samples.length > Math.ceil(this.fullPowerDistance / spacing) + 2) this.samples.shift();
    }
    // A follow-through may end in a pause, sideways motion or a slight recoil.
    if ((point.y - this.launchLine) * this.forward >= 0) {
      this.fieldShot = this.forwardStroke() ?? this.fieldShot;
    } else {
      this.fieldShot = null;
    }
  }

  center(left: number, right: number, top: number, bottom: number): Point {
    return {
      x: Math.max(left, Math.min(right, this.edgeX ?? (this.pointer.x + this.grabOffset.x))),
      y: Math.max(top, Math.min(bottom, this.pointer.y + this.grabOffset.y))
    };
  }

  release() {
    return this.fieldShot ?? this.forwardStroke();
  }

  private forwardStroke(): Shot | null {
    const forward = this.forward;
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
