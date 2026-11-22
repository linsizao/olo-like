import type { Point } from './Match';

const spacing = 4;
const headingDistance = 18;
const minPush = 14;
const fullSpeed = 1290;
const flickWindowMs = 80;

type Sample = Point & { time: number };
export type Shot = { power: number; velocity: Point };

export class LaunchDrag {
  private samples: Sample[];
  private pointer: Sample;
  private grabOffset: Point;
  private held: Point;
  private forward: number;

  private fullPowerDistance: number;
  private launchLine: number;

  constructor(touch: Point, center: Point, fullPowerDistance: number, launchLine: number, time = Date.now()) {
    this.fullPowerDistance = fullPowerDistance;
    this.launchLine = launchLine;
    this.pointer = { ...touch, time };
    this.samples = [this.pointer];
    this.held = center;
    this.forward = Math.sign(launchLine - center.y);
    this.grabOffset = { x: center.x - touch.x, y: center.y - touch.y };
  }

  move(point: Point, time = Date.now()): Shot | null {
    const next = { ...point, time };
    const edge = this.launchLine - this.grabOffset.y;
    const beyond = (point.y-edge)*this.forward;
    if (beyond < 0) {
      this.held = { x:point.x+this.grabOffset.x, y:point.y+this.grabOffset.y };
      this.record(next);
      return null;
    }

    const previous = this.pointer;
    const remaining = (edge-previous.y)*this.forward;
    if (remaining > 0) {
      // A single touch event may span the board. Use the first point at the rim.
      const fraction = remaining / (remaining+beyond);
      const x = previous.x + (point.x-previous.x)*fraction;
      this.held = { x:x+this.grabOffset.x, y:this.launchLine };
      this.record({ x, y:edge, time:previous.time+(time-previous.time)*fraction });
      const shot = this.forwardStroke(true);
      if (shot) return shot;
    }
    // A push started right at the rim may need a little more finger travel to qualify.
    this.record(next);
    return this.forwardStroke(true);
  }

  private record(point: Sample) {
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

  release() {
    return this.forwardStroke(false);
  }

  private forwardStroke(atRim: boolean): Shot | null {
    const end = this.pointer;
    let start = end, headingX = 0, headingY = 0, used = 0;
    let recentDistance = 0, recentMs = 0;

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
      if (atRim && start.time > end.time-flickWindowMs) {
        const duration = start.time-point.time;
        const overlap = Math.min(duration, start.time-(end.time-flickWindowMs));
        recentDistance += duration > 0 ? length*overlap/duration : length;
        recentMs += overlap;
      }
      start = point;
      if (Math.hypot(end.x - start.x, end.y - start.y) >= this.fullPowerDistance) break;
    }

    const distance = Math.hypot(end.x - start.x, end.y - start.y);
    if (distance < minPush || (end.y - start.y) * this.forward < spacing) return null;
    // A quick flick can reach full power even when a large disc has a short run-up.
    const flickSpeed = recentDistance*1000 / Math.max(1, recentMs);
    const power = Math.min(1, Math.max(distance/this.fullPowerDistance, flickSpeed/fullSpeed));
    const speedPerUnit = fullSpeed * power / Math.hypot(headingX, headingY);
    return { power, velocity: { x: headingX * speedPerUnit, y: headingY * speedPerUnit } };
  }
}
