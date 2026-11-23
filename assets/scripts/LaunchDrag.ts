import type { Point } from './Match';

const spacing = 4;
const headingDistance = 18;
const minPush = 14;
const fullSpeed = 1290;

export type Shot = { power: number; velocity: Point };

export class LaunchDrag {
  private samples: Point[];
  private pointer: Point;
  private grabOffset: Point;
  private held: Point;
  private forward: number;

  private fullPowerDistance: number;
  private launchLine: number;

  constructor(touch: Point, center: Point, fullPowerDistance: number, launchLine: number) {
    this.fullPowerDistance = fullPowerDistance;
    this.launchLine = launchLine;
    this.pointer = touch;
    this.samples = [this.pointer];
    this.held = center;
    this.forward = Math.sign(launchLine - center.y);
    this.grabOffset = { x: center.x - touch.x, y: center.y - touch.y };
  }

  move(point: Point): Shot | null {
    const previous = this.pointer;
    if (point.x === previous.x && point.y === previous.y) return null;
    const edge = this.launchLine - this.grabOffset.y;
    const beyond = (point.y-edge)*this.forward;
    this.record(point);
    if (beyond < 0) {
      this.held = { x:point.x+this.grabOffset.x, y:point.y+this.grabOffset.y };
      return null;
    }
    const remaining = (edge-previous.y)*this.forward;
    if (remaining > 0) {
      const fraction = remaining / (remaining+beyond);
      this.held = { x:previous.x+(point.x-previous.x)*fraction+this.grabOffset.x, y:this.launchLine };
    }
    return this.release();
  }

  followThrough(point: Point, heading: Point): Shot | null {
    const dx = point.x-this.pointer.x, dy = point.y-this.pointer.y;
    if (dx || dy) {
      // Only the uninterrupted outgoing stroke can contribute more distance.
      if (dy*this.forward <= 0 || dx*heading.x+dy*heading.y <
          Math.SQRT1_2*Math.hypot(dx,dy)*Math.hypot(heading.x,heading.y)) return null;
      this.record(point);
    }
    return this.release();
  }

  private record(point: Point) {
    this.pointer = point;
    const last = this.samples[this.samples.length - 1];
    if (Math.hypot(point.x - last.x, point.y - last.y) >= spacing) {
      this.samples.push(point);
      if (this.samples.length > Math.ceil(this.fullPowerDistance / spacing) + 2) this.samples.shift();
    }
  }

  center(left: number, right: number, top: number, bottom: number): Point {
    return {
      x: Math.max(left, Math.min(right, this.held.x)),
      y: Math.max(top, Math.min(bottom, this.held.y))
    };
  }

  release(): Shot | null {
    const end = this.pointer;
    let start = end, headingX = 0, headingY = 0, used = 0;

    // Only the final forward stroke contributes to heading and power.
    for (let i = this.samples.length - 1; i >= 0; i--) {
      const point = this.samples[i], dx = start.x - point.x, dy = start.y - point.y;
      const length = Math.hypot(dx, dy);
      if (!length || (length < spacing && i > 0)) continue;
      if (dy * this.forward <= 0) break;
      if (used && dx * headingX + dy * headingY < Math.SQRT1_2 * length * Math.hypot(headingX, headingY)) break;

      const weight = Math.min(length, headingDistance - used);
      headingX += dx / length * weight;
      headingY += dy / length * weight;
      used += weight;
      start = point;
      if (Math.hypot(end.x - start.x, end.y - start.y) >= this.fullPowerDistance) break;
    }

    const distance = Math.hypot(end.x - start.x, end.y - start.y);
    if (distance < minPush || (end.y - start.y) * this.forward < spacing) return null;
    const power = Math.min(1, distance / this.fullPowerDistance);
    const speedPerUnit = fullSpeed * power / Math.hypot(headingX, headingY);
    return { power, velocity: { x: headingX * speedPerUnit, y: headingY * speedPerUnit } };
  }
}
