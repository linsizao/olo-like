export type Options = { music: boolean; sound: boolean; haptic: boolean; musicVolume: number; soundVolume: number; english: boolean };
export type Ledger = { games: number; blue: number; red: number; draws: number; bluePoints: number; redPoints: number; streak: number; best: number; last: number };
export interface StoragePort { getItem(key: string): string | null; setItem(key: string, value: string): void }
const key = 'olo-like.local-duel.v1';
const defaults: Options = { music: true, sound: true, haptic: true, musicVolume: 0.6, soundVolume: 0.8, english: false };
const empty: Ledger = { games: 0, blue: 0, red: 0, draws: 0, bluePoints: 0, redPoints: 0, streak: 0, best: 0, last: -1 };
export class Profile {
  options = { ...defaults };
  ledger = { ...empty };
  constructor(private storage?: StoragePort) {
    try {
      const saved = JSON.parse(storage?.getItem(key) || '{}');
      for (const name of ['music','sound','haptic','english'] as const) {
        if (typeof saved.options?.[name] === 'boolean') this.options[name] = saved.options[name];
      }
      for (const name of ['musicVolume','soundVolume'] as const) {
        const value = saved.options?.[name]; if (Number.isFinite(value)) this.options[name] = Math.min(1, Math.max(0, value));
      }
      for (const name of Object.keys(empty) as (keyof Ledger)[]) {
        const value = saved.ledger?.[name]; if (Number.isSafeInteger(value) && value >= (name === 'last' ? -1 : 0)) this.ledger[name] = value;
      }
    } catch {}
  }
  save() { try { this.storage?.setItem(key, JSON.stringify({ options: this.options, ledger: this.ledger })); } catch {} }
  finish(score: readonly [number, number]) {
    const record = this.ledger, winner = score[0] === score[1] ? -1 : score[0] > score[1] ? 0 : 1;
    record.games++; record.bluePoints += score[0]; record.redPoints += score[1];
    if (winner < 0) record.draws++; else if (winner === 0) record.blue++; else record.red++;
    record.streak = winner < 0 ? 0 : record.last === winner ? record.streak + 1 : 1;
    record.best = Math.max(record.best, record.streak); record.last = winner; this.save();
  }
}
