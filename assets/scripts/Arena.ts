import { field, Impact, Match, Player, Point, radii, scoring, spawn } from './Match';
import { LaunchDrag } from './LaunchDrag';
import { discColors, PlayerColors } from './PlayerColors';

export interface Ink {
  rect(x: number, y: number, width: number, height: number, color: string): void;
  dot(x: number, y: number, radius: number, color: string, cut?: { height: number; upper: boolean }): void;
  text(x: number, y: number, value: string, size: number, color: string, inverted?: boolean, thin?: boolean): void;
}
export const palette = { paper:'#FFFFFF', ink:'#233B42', muted:'#587079', mist:'#EDF4F4', accent:discColors.blue.disc };
type Flash = Impact & { age: number };
const flightTime = 0.34;
const durations = { hit:0.16, return:0.52, capture:0.62, misfire:0.48, death:0.75 };
type VisibleCue = keyof typeof durations;
const visible = (cue:Impact['cue']): cue is VisibleCue => Object.prototype.hasOwnProperty.call(durations,cue);
export type Sound = (name: string, force?: number, size?: number) => void;
export const bounded = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
export class Arena {
  match = new Match();
  private drag: LaunchDrag | null = null;
  effects: Flash[] = [];
  clock = 0;
  private arrival = 0;
  constructor(private sound: Sound, readonly colors: PlayerColors) {}
  get scale() { return field.right / 768; }
  get busy() { return this.effects.some(effect => effect.cue !== 'hit'); }
  cancel() { this.drag = null; }
  private reserves(player: Player) {
    const active = this.match.phase === 'ready' && this.match.player === player;
    return this.match.stock[player].map((piece,index)=>({piece,index})).filter(entry=>!active || entry.index!==this.match.chosen);
  }
  private rackX(slot: number, player: Player) {
    const offset = (44+slot*14)*this.scale;
    return player === 0 ? offset : field.right-offset;
  }
  down(point: Point) {
    const game = this.match;
    if (game.phase !== 'ready' || this.busy || this.arrival < flightTime) return false;
    const player = game.player, origin = spawn(player), diff = Math.abs(point.y-origin.y);
    if (diff < 32) {
      let closest = -1, best = Infinity;
      this.reserves(player).forEach(({index},slot) => { const distance = Math.abs(this.rackX(slot,player)-point.x); if (distance < best) { closest = index; best = distance; } });
      if (best <= 16*this.scale && game.choose(closest)) { this.arrival=0; this.sound('select',1,game.selected); return false; }
    }
    if (Math.hypot(point.x-origin.x,point.y-origin.y) > Math.max(36*this.scale,radii[game.selected]*1.55)) return false;
    this.drag = new LaunchDrag(point, origin, field.height * 0.27, player === 0 ? field.bottom : field.top);
    this.sound('select'); return true;
  }
  move(point: Point) {
    this.drag?.move(point);
  }
  private shooterCenter() {
    if (!this.drag) return spawn(this.match.player);
    const radius = radii[this.match.selected], lower = this.match.player === 0;
    return this.drag.center(radius, field.right-radius, lower ? field.bottom : radius,
      lower ? field.height-radius : field.top);
  }
  up(point: Point) {
    if (!this.drag) return false;
    this.move(point);
    const shot = this.drag.release(), origin = this.shooterCenter(), size = this.match.selected;
    this.cancel();
    if (!shot || !this.match.fire(origin, shot.velocity)) return false;
    this.sound('release',shot.power,size);
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
      if (effect.cue === 'death' && before < 0.31 && effect.age >= 0.31) this.sound('touch');
      if (effect.cue === 'death' && before < 0.56 && effect.age >= 0.56) this.sound('gone');
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
    for (const player of [0,1] as Player[]) {
      const upper = player === 1, origin = spawn(player);
      ink.text((upper ? 55 : 713)*scale,origin.y,String(score[player]),54*scale,this.colors[player].disc,upper);
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
      where.y += (offscreen-where.y)*Math.pow(1-this.arrival/flightTime,3);
      const pulse = this.drag ? 0 : (1+Math.sin(this.clock*2.8))*0.024;
      [1.53+pulse,1.32+pulse/2,1.08].forEach((factor,index)=>ink.dot(where.x,where.y,radius*factor,this.colors[game.player].halo[index]));
      ink.dot(where.x,where.y,radius,this.colors[game.player].disc);
    }
    for (const effect of this.effects) this.drawEffect(ink,effect);
  }
  drawEffect(ink: Ink, effect: Flash) {
    const { cue, age, point, player } = effect, scale = this.scale;
    if (cue === 'death') {
      const top = point.y < 512, direction = top ? 1 : -1, radius = radii[effect.size];
      const reach = bounded(age/0.31,0,1)-bounded((age-0.53)/0.21,0,1);
      const tip = point.y-direction*(1-reach)*155;
      if (age < 0.56) {
        const shrink = 1-bounded((age-0.31)/0.25,0,1);
        ink.dot(point.x,point.y,Math.max(0.2,radius*shrink),this.colors[player].disc);
      }
      for (let joint=0; joint<4; joint++) {
        const x = point.x+joint*4*scale, y = tip-direction*joint*24*scale;
        ink.rect(x-5*scale,Math.min(y,y-direction*22*scale),10*scale,22*scale,palette.ink);
        ink.dot(x,y,8*scale,palette.ink); ink.dot(x,y,4*scale,palette.paper);
      }
    } else if (cue === 'capture' || cue === 'return') {
      const receiver:Player = point.y < field.middle ? 1 : 0, capture=cue==='capture';
      const slot=this.reserves(receiver).findIndex(entry=>entry.piece.id===effect.id);
      const destination={x:this.rackX(Math.max(0,slot),receiver),y:spawn(receiver).y};
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
    } else if (cue === 'misfire') {
      const progress=bounded(age/durations.misfire,0,1), radius=radii[effect.size];
      const body=1-bounded((progress-0.16)/0.46,0,1);
      const y=bounded(point.y,radius,field.height-radius);
      if (body>0) {
        ink.dot(point.x,y,radius*body*(1+0.12*Math.sin(Math.PI*progress*2)),this.colors[player].disc);
        ink.dot(point.x,y,radius*body*progress,this.colors[player].halo[1]);
      }
      const burst=bounded((progress-0.25)/0.75,0,1);
      if (burst>0) for (let index=0; index<7; index++) {
        const angle=index*Math.PI*2/7, reach=radius*(0.55+burst*1.1);
        ink.dot(point.x+Math.cos(angle)*reach,y+Math.sin(angle)*reach,radius*0.14*(1-burst),this.colors[player].disc);
      }
    } else if (cue === 'hit') {
      const spread = radii[effect.size]+age*68*scale;
      for (let index=0;index<4;index++) ink.dot(point.x+Math.cos(index*1.57)*spread,point.y+Math.sin(index*1.57)*spread,3*scale,palette.paper);
    }
  }
}
