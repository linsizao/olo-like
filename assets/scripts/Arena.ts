import { Disc, field, Impact, Match, pieceScale, Player, Point, radii, scoring, spawn } from './Match';
import { fitBoard, haloPeak } from './BoardLayout';
import { crackTime, drawShatter, shatterTime } from './Shatter';
import { LaunchDrag, Shot } from './LaunchDrag';
import { discColors, PlayerColors } from './PlayerColors';

export interface Ink {
  rect(x: number, y: number, width: number, height: number, color: string): void;
  dot(x: number, y: number, radius: number, color: string, cut?: { height: number; upper: boolean }): void;
  polygon(points: Point[], color: string): void;
  text(x: number, y: number, value: string, size: number, color: string, inverted?: boolean, thin?: boolean): void;
}
export const palette = { paper:'#FFFFFF', ink:'#233B42', muted:'#587079', mist:'#EDF4F4', accent:discColors.blue.disc };
type Flash = Impact & { age: number };
const flightTime = 0.34;
const durations = { hit:0.16, return:0.52, capture:0.62, misfire:shatterTime, death:shatterTime };
type VisibleCue = keyof typeof durations;
const visible = (cue:Impact['cue']): cue is VisibleCue => Object.prototype.hasOwnProperty.call(durations,cue);
export type Sound = (name: string, force?: number, size?: number) => void;
export const bounded = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
export class Arena {
  match = new Match();
  private drag: { stroke: LaunchDrag; center: Point } | null = null;
  private follow: { stroke: LaunchDrag; disc: Disc; origin: Point; heading: Point } | null = null;
  effects: Flash[] = [];
  clock = 0;
  private arrival = 0;
  layout = fitBoard(field.height,radii[2]);
  constructor(private sound: Sound, readonly colors: PlayerColors) {}
  get scale() { return pieceScale(field.right); }
  get busy() { return this.effects.some(effect => effect.cue !== 'hit'); }
  cancel() { this.drag = null; this.follow = null; }
  private reserves(player: Player) {
    const active = this.match.phase === 'ready' && this.match.player === player;
    return this.match.stock[player].map((piece,index)=>({piece,index})).filter(entry=>!active || entry.index!==this.match.chosen);
  }
  private rackX(slot: number, player: Player) {
    const offset = (44+slot*14)*this.scale;
    return player === 0 ? offset : field.right-offset;
  }
  down(point: Point) {
    this.follow = null;
    const game = this.match;
    if (game.phase !== 'ready' || this.busy || this.arrival < flightTime) return false;
    const player = game.player, diff = Math.abs(point.y-spawn(player,this.layout.upperRow).y);
    if (diff < 32) {
      let closest = -1, best = Infinity;
      this.reserves(player).forEach(({index},slot) => { const distance = Math.abs(this.rackX(slot,player)-point.x); if (distance < best) { closest = index; best = distance; } });
      if (best <= 16*this.scale && game.choose(closest)) { this.arrival=0; this.sound('select',1,game.selected); return false; }
    }
    const origin = this.shooterCenter();
    const hitRadius = radii[game.selected]*Math.min(1.55, 1+haloPeak*this.layout.haloSpread);
    if (Math.hypot(point.x-origin.x,point.y-origin.y) > Math.max(36*this.scale,hitRadius)) return false;
    const radius = radii[game.selected];
    const launchLine = player === 0 ? field.bottom+radius : field.top-radius;
    this.drag = {
      stroke: new LaunchDrag(point, origin, field.height * 0.27, launchLine),
      center: origin
    };
    this.sound('select'); return true;
  }
  move(point: Point) {
    if (this.follow) {
      const {stroke,disc,origin,heading} = this.follow;
      const shot = stroke.followThrough(point,heading);
      if (!shot || !this.match.extendLaunch(disc,origin,shot.velocity,shot.power)) this.follow = null;
      return false;
    }
    if (!this.drag) return false;
    const { stroke, center } = this.drag;
    const shot = stroke.move(point);
    const {player, selected} = this.match;
    const radius = radii[selected];
    const safeEdge = this.layout.clearance - (this.layout.upperRow-this.layout.shooterRow);
    const outer = this.layout.clearance ? Math.max(radius,safeEdge+radius*(1+0.53*this.layout.haloSpread)) : radius;
    const target = stroke.center(radius, field.right-radius, player === 0 ? radius : outer,
      player === 0 ? field.height-outer : field.height-radius);
    this.drag.center = this.match.dragCenter(center, target, selected);
    return shot ? this.launch(shot,true) : false;
  }
  private shooterCenter() {
    const {player, selected} = this.match;
    return this.drag?.center ?? this.match.launchCenter(spawn(player,this.layout.shooterRow),selected);
  }
  up(point: Point) {
    const fired = this.move(point) || this.launch(this.drag?.stroke.release() ?? null);
    this.follow = null;
    return fired;
  }
  private launch(shot: Shot | null, follow = false) {
    if (!this.drag) return false;
    const {center,stroke} = this.drag;
    this.cancel();
    if (!shot || !this.match.fire(center, shot.velocity, shot.power)) return false;
    if (follow && shot.power < 1) {
      const disc = this.match.discs[this.match.discs.length-1];
      this.follow = {stroke,disc,origin:{x:disc.x,y:disc.y},heading:shot.velocity};
    }
    this.sound('launchHaptic');
    return true;
  }
  tick(dt: number) {
    this.clock += dt;
    const phase = this.match.phase;
    this.match.advance(dt);
    let strongest: Impact | undefined;
    for (const event of this.match.events.splice(0)) {
      if (event.cue === 'hit' || event.cue === 'wall') {
        if (!strongest || strongest.force < event.force) strongest = event;
      } else this.sound(event.cue,event.force,event.size);
      if (visible(event.cue)) this.effects.push({ ...event, age:0 });
    }
    if (strongest) this.sound(strongest.cue,strongest.force,strongest.size);
    for (const effect of this.effects) {
      const before = effect.age; effect.age += dt;
      if ((effect.cue === 'misfire' || effect.cue === 'death') && before < crackTime && effect.age >= crackTime) {
        this.sound('shatter',1,effect.size);
      }
      if (effect.cue === 'return' && before < 0.43 && effect.age >= 0.43) this.sound('restored',1,effect.size);
    }
    this.effects = this.effects.filter(effect => visible(effect.cue) && effect.age < durations[effect.cue]);
    if (phase === 'moving' && this.match.phase === 'ready') { this.arrival=0; this.sound('turn'); }
    else if (this.match.phase === 'ready' && !this.busy) this.arrival=Math.min(flightTime,this.arrival+dt);
  }
  draw(ink: Ink, showShooter = true) {
    const game = this.match, score = game.score(), scale = this.scale;
    ink.rect(0,0,field.right,field.height,palette.paper);
    ink.rect(0,field.top,field.right,field.middle-field.top,this.colors[0].zone);
    ink.rect(0,field.middle,field.right,field.bottom-field.middle,this.colors[1].zone);
    // A short slit in the board sits beneath discs that cross the middle.
    const half = 28*scale, radius = 2*scale, center = field.right/2;
    ink.rect(center-half,field.middle-radius,half*2,radius*2,palette.paper);
    ink.dot(center-half,field.middle,radius,palette.paper);
    ink.dot(center+half,field.middle,radius,palette.paper);
    for (const player of [0,1] as Player[]) {
      const upper = player === 1, origin = spawn(player, this.layout.upperRow);
      ink.text(upper ? 55*scale : field.right-55*scale,origin.y,String(score[player]),54*scale,this.colors[player].disc,upper);
      this.reserves(player).forEach(({piece},slot) => {
        if (this.effects.some(effect => (effect.cue==='return'||effect.cue==='capture') && effect.id===piece.id)) return;
        ink.dot(this.rackX(slot,player),origin.y,[2.1,3.6,5.2][piece.size]*scale,this.colors[player].disc);
      });
    }
    for (const disc of game.discs) {
      if (scoring(disc)) ink.dot(disc.x,disc.y,radii[disc.size]+8*scale,palette.paper);
      ink.dot(disc.x,disc.y,radii[disc.size],this.colors[disc.owner].disc);
    }
    if (showShooter && game.phase === 'ready' && !this.busy) {
      const where = this.shooterCenter(), radius = radii[game.selected];
      const offscreen = game.player === 0 ? field.height+radius*2 : -radius*2;
      const y = where.y + (offscreen-where.y)*Math.pow(1-this.arrival/flightTime,3);
      const pulse = this.drag ? 0 : (1+Math.sin(this.clock*2.8))*0.024;
      [1.53+pulse,1.32+pulse/2,1.08].forEach((factor,index)=>ink.dot(where.x,y,radius*(1+(factor-1)*this.layout.haloSpread),this.colors[game.player].halo[index]));
      ink.dot(where.x,y,radius,this.colors[game.player].disc);
    }
    for (const effect of this.effects) this.drawEffect(ink,effect);
  }
  drawEffect(ink: Ink, effect: Flash) {
    const { cue, age, point, player } = effect, scale = this.scale;
    if (cue === 'death' || cue === 'misfire') {
      drawShatter(ink,point,radii[effect.size],this.colors[player].disc,effect.id,age);
    } else if (cue === 'capture' || cue === 'return') {
      const receiver:Player = point.y < field.middle ? 1 : 0, capture=cue==='capture';
      const slot=this.reserves(receiver).findIndex(entry=>entry.piece.id===effect.id);
      const destination={x:this.rackX(Math.max(0,slot),receiver),y:spawn(receiver, this.layout.upperRow).y};
      const progress=bounded(age/durations[cue],0,1), travel=capture?bounded((progress-0.33)/0.67,0,1):progress;
      const ease=travel*travel*(3-2*travel), arc=Math.sin(Math.PI*travel)*(receiver===0?1:-1)*44*scale;
      const x=point.x+(destination.x-point.x)*ease, y=point.y+(destination.y-point.y)*ease+arc;
      const radius=radii[effect.size]*(1-ease)+[2.1,3.6,5.2][effect.size]*scale*ease;
      if (capture) {
        ink.dot(x,y,radius+4*scale*(1-ease),this.colors[receiver].disc);
        ink.dot(x,y,radius,this.colors[player].disc);
        ink.dot(x,y,radius*bounded(progress/0.33,0,1),this.colors[receiver].disc);
      } else {
        ink.dot(x,y,radius*(1+0.32*Math.sin(Math.PI*progress)),this.colors[player].halo[1]);
        ink.dot(x,y,radius,this.colors[player].disc);
      }
    } else if (cue === 'hit') {
      const spread = radii[effect.size]+age*68*scale;
      for (let index=0;index<4;index++) ink.dot(point.x+Math.cos(index*1.57)*spread,point.y+Math.sin(index*1.57)*spread,3*scale,palette.paper);
    }
  }
}
