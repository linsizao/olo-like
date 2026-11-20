import { Match, Point, Player, field, radii, scoring, spawn } from './Match';

export interface Ink {
  rect(x: number, y: number, width: number, height: number, color: string): void;
  dot(x: number, y: number, radius: number, color: string): void;
  text(x: number, y: number, value: string, size: number, color: string, inverted?: boolean): void;
}
const white = '#FFFFFF', colors = ['#29BAE3', '#FF4848'], zones = ['#B3E7F5', '#FFC9C9'];
const halos = [['#E8F7FB', '#C2EAF6', '#9EDFF2'], ['#FFF0F0', '#FFD9D9', '#FFBBBB']];
const gray = '#889499';
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));

export class Table {
  match = new Match();
  help = false;
  revision = 0;
  private grip: Point | null = null;
  private position: Point = spawn(0);
  private samples: { point: Point; time: number }[] = [];
  private clock = 0;
  down(point: Point, time = Date.now()) {
    if (this.grip) return;
    this.revision++;
    if (this.help) { this.help = false; return; }
    if (this.match.phase === 'over') { this.match.rematch(); return; }
    const inDots = (point.y < field.top && point.x > field.right * 0.82) || (point.y > field.bottom && point.x < field.right * 0.18);
    if (inDots) { this.help = true; return; }
    if (this.match.phase !== 'ready') return;
    const origin = spawn(this.match.player);
    if (Math.hypot(point.x - origin.x, point.y - origin.y) > Math.max(48, radii[this.match.selected] * 1.55)) return;
    this.position = origin; this.grip = { x: point.x - origin.x, y: point.y - origin.y };
    this.samples = [{ point, time }];
  }
  move(point: Point, time = Date.now()) {
    if (!this.grip) return;
    const player = this.match.player, radius = radii[this.match.selected];
    const rawY = point.y - this.grip.y;
    this.position = { x: clamp(point.x - this.grip.x, radius, field.right - radius),
      y: player === 0 ? clamp(rawY, field.bottom, field.height - radius) : clamp(rawY, radius, field.top) };
    this.samples.push({ point, time });
    while (this.samples.length > 2 && this.samples[1].time < time - 90) this.samples.shift();
    this.revision++;
    if (player === 0 ? rawY <= field.bottom : rawY >= field.top) this.launch();
  }
  up(point: Point, time = Date.now()) { if (this.grip) { this.move(point, time); if (this.grip) this.launch(); } }
  private launch() {
    const first = this.samples[0], last = this.samples[this.samples.length - 1];
    const duration = Math.max(16, last.time - first.time) / 1000;
    this.match.fire(this.position, { x: (last.point.x - first.point.x) / duration, y: (last.point.y - first.point.y) / duration });
    this.cancel();
  }
  cancel() { this.grip = null; this.samples = []; this.revision++; }
  tick(seconds: number) {
    if (!this.help && this.match.phase !== 'over') {
      this.clock += Math.min(seconds, 0.1); this.match.advance(seconds); this.revision++;
    }
  }
  draw(ink: Ink) {
    const game = this.match, score = game.score();
    const width = field.right, scale = width / 768, center = width / 2;
    ink.rect(0, 0, width, 1024, white);
    ink.rect(0, field.top, width, field.middle - field.top, zones[0]);
    ink.rect(0, field.middle, width, field.bottom - field.middle, zones[1]);
    for (const player of [0, 1] as Player[]) {
      const origin = spawn(player), upper = player === 1;
      ink.text((upper ? 55 : 713) * scale, origin.y, String(score[player]), 54 * scale, colors[player], upper);
      const reserve = game.stock[player].slice(game.phase === 'ready' && game.player === player ? 1 : 0);
      let offset = 44;
      for (const piece of reserve) {
        ink.dot((upper ? 768 - offset : offset) * scale, origin.y, [2.1, 3.6, 5.2][piece.size] * scale, colors[player]);
        offset += 14;
      }
    }
    for (const disc of game.discs) {
      if (scoring(disc)) ink.dot(disc.x, disc.y, radii[disc.size] + 8 * scale, white);
      ink.dot(disc.x, disc.y, radii[disc.size], colors[disc.owner]);
    }
    if (game.phase === 'ready') {
      const player = game.player, where = this.grip ? this.position : spawn(player), radius = radii[game.selected];
      const pulse = this.grip ? 0 : (1 + Math.sin(this.clock * 2.8)) * 0.024;
      [1.53 + pulse, 1.32 + pulse / 2, 1.08].forEach((scale, index) => ink.dot(where.x, where.y, radius * scale, halos[player][index]));
      ink.dot(where.x, where.y, radius, colors[player]);
    }
    if (this.help || game.phase === 'over') {
      ink.rect(0, 338, width, 348, white);
      if (this.help) {
        ink.text(center, 402, '玩法', 42 * scale, colors[0]);
        ink.text(center, 476, '按住光圈中的圆片，向对面滑出。', 28 * scale, gray);
        ink.text(center, 526, '停在同色区得分；滑过头会送给对手。', 28 * scale, gray);
        ink.text(center, 620, '轻触返回', 27 * scale, colors[1]);
      } else {
        ink.text(center, 440, score[0] === score[1] ? '平局' : score[0] > score[1] ? '蓝方胜' : '红方胜', 44 * scale, score[1] > score[0] ? colors[1] : colors[0]);
        ink.text(center, 522, score.join('   :   '), 56 * scale, gray);
        ink.text(center, 624, '轻触再来一局', 28 * scale, colors[1]);
      }
    }
  }
}
