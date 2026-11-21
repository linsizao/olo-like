import type { Ink } from './Arena';
import type { Point } from './Match';

export const crackTime = 0.055;
export const shatterTime = 0.30;

const angles = [-2.71, -1.78, -0.87, 0.32, 1.18, 2.35];
const centre = { x: -0.14, y: 0.09 };
const polar = (angle: number, radius: number) => ({ x: Math.cos(angle)*radius, y: Math.sin(angle)*radius });
const joints = angles.map((angle, i) => polar(angle + (i % 2 ? 0.15 : -0.18), 0.52));
const pieces = angles.map((from, index) => {
  const next = (index+1) % angles.length, to = angles[next] + (next === 0 ? 2*Math.PI : 0);
  const rim = Array.from({length: 7}, (_, i) => polar(from + (to-from)*i/6, 1));
  const axis = polar((from+to)/2, 1);
  return { shape: [centre, joints[index], ...rim, joints[next]], axis };
});

export function drawShatter(ink: Ink, origin: Point, radius: number, color: string, id: number, age: number) {
  const crack = Math.min(1, age / crackTime);
  const progress = Math.max(0, (age-crackTime)/(shatterTime-crackTime));
  if (progress >= 1) return;
  const travel = 1 - (1-progress)**2;
  const alpha = Math.min(1, (1-progress)/0.8);
  const fill = color + Math.round(255*alpha).toString(16).padStart(2,'0');
  const rotation = id*2.4, c = Math.cos(rotation), s = Math.sin(rotation);
  pieces.forEach(({ shape, axis }, i) => {
    // Three seams appear first. The paired sections then separate into six shards.
    const group = pieces[i-i%2].axis;
    const dx = group.x*crack*0.045 + axis.x*travel*0.92;
    const dy = group.y*crack*0.045 + axis.y*travel*0.92;
    const pivotX = axis.x*0.52, pivotY = axis.y*0.52;
    const spin = travel*(i%2 ? 0.46 : -0.36);
    const shrink = 1-progress*0.36, cos = Math.cos(spin)*shrink, sin = Math.sin(spin)*shrink;
    const vertices = shape.map(p => {
      const x = p.x-pivotX, y = p.y-pivotY;
      const u = pivotX+dx+x*cos-y*sin, v = pivotY+dy+x*sin+y*cos;
      return { x: origin.x+radius*(u*c-v*s), y: origin.y+radius*(u*s+v*c) };
    });
    ink.polygon(vertices, fill);
  });
}
