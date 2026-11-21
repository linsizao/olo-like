import type { Options } from './Profile';

interface Device { createWebAudioContext?(): AudioContext; vibrateShort?(options: { type: string }): void }
type Host = { wx?: Device; AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext; navigator?: Navigator };
const host = globalThis as unknown as Host;
// Frequencies in Hz. Each note has a start pitch, end pitch, offset, decay and relative gain.
type Note = readonly [number, number, number, number, number];
const cues: Record<string, readonly Note[]> = {
  click: [[660,650,0,.065,.42]],
  select: [[880,880,0,.11,.55],[2640,2640,0,.035,.12]],
  release: [[330,261,0,.10,.8],[1320,1045,0,.046,.26]],
  enter: [[660,660,0,.055,.24]],
  gain: [[784,784,0,.14,.48]],
  loss: [[392,349,0,.12,.39]],
  return: [[440,466,0,.15,.60],[587,622,.085,.17,.65]],
  restored: [[880,880,0,.067,.32]],
  capture: [[740,370,0,.14,.63],[494,988,.105,.20,.70]],
  turn: [[523,523,0,.065,.2]],
  pause: [[392,330,0,.12,.38]],
  resume: [[392,523,0,.12,.44]],
  blue: [[523,523,0,.19,.6],[659,659,.09,.19,.54],[784,784,.18,.25,.52]],
  red: [[587,587,0,.19,.6],[740,740,.09,.19,.54],[880,880,.18,.25,.52]],
  draw: [[587,587,0,.17,.52],[587,587,.12,.23,.46]]
};
export class TouchAudio {
  private context?: AudioContext;
  private bed?: GainNode;
  private voices = new Set<AudioScheduledSourceNode>();
  private hissBuffer?: AudioBuffer;
  private lastShatter = -1;
  private beat = 0;
  private next = 0;
  private lastImpact = -1;
  private lastSignificant = -1;
  private track = '';
  private hidden = false;
  constructor(private options: Options) {}
  unlock() {
    try {
      if (!this.context) {
        const Context = host.AudioContext || host.webkitAudioContext;
        this.context = host.wx?.createWebAudioContext?.() || (Context ? new Context() : undefined);
        if (this.context) { this.bed = this.context.createGain(); this.bed.gain.value = 0; this.bed.connect(this.context.destination); }
      }
      if (this.context && ['suspended','interrupted'].includes(this.context.state)) this.context.resume?.()?.catch?.(() => {});
    } catch {}
  }
  sleep(value: boolean) {
    this.hidden = value;
    if (value) {
      this.stop(); try { this.context?.suspend?.()?.catch?.(() => {}); } catch {}
    }
    this.next = 0;
  }
  stop() { for (const voice of this.voices) { try { voice.stop(); } catch {} } this.voices.clear(); }
  dispose() { this.stop(); try { this.context?.close?.()?.catch?.(() => {}); } catch {} }
  private tone(frequency: number, offset: number, duration: number, level: number, music: boolean, endPitch = frequency) {
    const ctx = this.context;
    if (!ctx || this.hidden || level <= 0) return;
    try {
      const time = ctx.currentTime + offset, osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.frequency.setValueAtTime(frequency,time);
      if (frequency !== endPitch) osc.frequency.exponentialRampToValueAtTime(endPitch,time+duration*0.8);
      gain.gain.setValueAtTime(0.0001,time);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002,level),time+0.003);
      gain.gain.exponentialRampToValueAtTime(0.0001,time+duration);
      osc.connect(gain); gain.connect(music && this.bed ? this.bed : ctx.destination);
      this.voices.add(osc); osc.onended = () => { this.voices.delete(osc); osc.disconnect(); gain.disconnect(); };
      osc.start(time); osc.stop(time+duration+0.01);
    } catch {}
  }
  private hiss(ctx: AudioContext, volume: number) {
    const duration = 0.19;
    try {
      if (!this.hissBuffer) {
        const buffer = ctx.createBuffer(1,Math.ceil(ctx.sampleRate*duration),ctx.sampleRate);
        const samples = buffer.getChannelData(0);
        let low = 0, high = 0;
        const lowRate = 1-Math.exp(-2*Math.PI*1900/ctx.sampleRate);
        const highRate = 1-Math.exp(-2*Math.PI*7900/ctx.sampleRate);
        for (let i=0; i<samples.length; i++) {
          const noise = Math.random()*2-1;
          low += lowRate*(noise-low);
          high += highRate*(noise-high);
          samples[i] = high-low;
        }
        this.hissBuffer = buffer;
      }
      const time = ctx.currentTime, source = ctx.createBufferSource(), gain = ctx.createGain();
      source.buffer = this.hissBuffer;
      gain.gain.setValueAtTime(0.0001,time);
      gain.gain.linearRampToValueAtTime(volume*0.46,time+0.006);
      gain.gain.exponentialRampToValueAtTime(volume*0.18+0.0001,time+0.065);
      gain.gain.exponentialRampToValueAtTime(0.0001,time+duration);
      source.connect(gain); gain.connect(ctx.destination);
      this.voices.add(source);
      source.onended = () => { this.voices.delete(source); source.disconnect(); gain.disconnect(); };
      source.start(time);
    } catch {}
  }
  cue(name: string, force = 1, size = 1) {
    if (this.hidden) return;
    if (this.options.haptic && (name === 'release' || name === 'shatter' || (name === 'hit' && force > 560))) {
      try { if (host.wx?.vibrateShort) host.wx.vibrateShort({type:'light'}); else host.navigator?.vibrate?.(12); } catch {}
    }
    const ctx = this.context;
    if (!ctx || !this.options.sound || !this.options.soundVolume) return;
    const now=ctx.currentTime, volume=this.options.soundVolume, pitch=[1.19,1,0.84][size] ?? 1;
    if (name==='shatter') {
      if (now-this.lastShatter >= 0.025) this.hiss(ctx,volume);
      this.lastShatter=this.lastSignificant=now;
      return;
    }
    if (name==='death' || name==='misfire') { this.lastSignificant=now; return; }
    if (name==='hit' || name==='wall') {
      if (now-this.lastImpact<0.033 || force<22 || this.voices.size>16) return;
      this.lastImpact=now;
      const strength=Math.min(1,force/1000), base=(name==='hit'?262:196)*pitch;
      const gain=(0.045+strength*0.14)*volume;
      this.tone(base*1.05,0,0.08+strength*0.045,gain,false,base);
      this.tone(base*(name==='hit'?4:2),0,0.035+strength*0.025,gain*(0.31+strength*0.25),false);
      return;
    }
    const notes=cues[name];
    if (!notes) return;
    const outcome=['capture','return','blue','red','draw'].includes(name);
    if (outcome) this.lastSignificant=now;
    if (now-this.lastSignificant<0.12 && ['enter','gain','loss','turn'].includes(name)) return;
    const transpose=['select','release','return','restored','capture'].includes(name)?pitch:1;
    const gain=volume*0.18*(name==='release'?0.65+0.35*force:1);
    for (const [start,end,offset,duration,level] of notes) {
      this.tone(start*transpose,offset,duration,gain*level,false,end*transpose);
    }
  }
  update(track: string) {
    const ctx = this.context;
    if (!ctx || !this.bed || this.hidden) return;
    if (track === 'quiet') {
      if (this.track !== track) {
        this.bed.gain.cancelScheduledValues(ctx.currentTime);
        this.bed.gain.setValueAtTime(0,ctx.currentTime);
        this.track = track;
      }
      return;
    }
    const active = this.options.music && this.options.musicVolume > 0;
    if (this.track !== track) { this.track = track; this.beat = 0; this.next = 0; }
    const target = active ? this.options.musicVolume * (ctx.currentTime - this.lastSignificant < 0.3 ? 0.48 : 1) : 0;
    this.bed.gain.setTargetAtTime(target,ctx.currentTime,0.08);
    if (!active || ctx.currentTime < this.next) return;
    const menu = track === 'menu', result = ['blue','red','draw'].includes(track);
    if (result && this.beat >= 6) return;
    const melody = menu ? [62,69,73,69,66,69,74,69] : track === 'blue' ? [60,64,67,72,71,72] : track === 'red' ? [62,66,69,74,73,74] : [65,67,69,67,65,65];
    const midi = melody[this.beat % melody.length];
    this.tone(440*Math.pow(2,(midi-69)/12),0,0.68,0.065,true);
    if (this.beat % 4 === 0) this.tone(440*Math.pow(2,(midi-81)/12),0,1.1,0.05,true);
    this.beat++; this.next = ctx.currentTime+(menu ? 0.62 : 0.46);
  }
}
