import type { Options } from './Profile';

interface Device { createWebAudioContext?(): AudioContext; vibrateShort?(options: { type: string }): void }
declare const wx: Device | undefined;
type Host = { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext; navigator?: Navigator };
const host = globalThis as unknown as Host;
const device = () => typeof wx === 'undefined' ? undefined : wx;
const melodies = {
  loop: [62,69,73,69,66,69,74,69],
  blue: [60,64,67,72,71,72],
  red: [62,66,69,74,73,74],
  draw: [65,67,69,67,65,65]
};
type Track = keyof typeof melodies | 'quiet';
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
  private track?: Track;
  private musicGain = 0;
  private hidden = false;
  constructor(private options: Options) {}
  start() {
    if (device()?.createWebAudioContext && this.options.music && this.options.musicVolume > 0) this.unlock();
  }
  unlock() {
    if (this.hidden) return;
    try {
      if (!this.context) {
        const Context = host.AudioContext || host.webkitAudioContext;
        const context = device()?.createWebAudioContext?.() ?? (Context ? new Context() : undefined);
        if (!context) return;
        const bed = context.createGain();
        bed.gain.value = 0;
        bed.connect(context.destination);
        this.context = context;
        this.bed = bed;
      }
      if (this.context.state !== 'running') this.context.resume?.()?.catch?.(() => {});
    } catch {}
  }
  sleep(value: boolean) {
    this.hidden = value;
    if (value) {
      this.stop(); try { this.context?.suspend?.()?.catch?.(() => {}); } catch {}
    } else if (this.context) this.unlock();
    this.next = 0;
  }
  stop() { for (const voice of this.voices) { try { voice.stop(); } catch {} } this.voices.clear(); }
  dispose() { this.stop(); try { this.context?.close?.()?.catch?.(() => {}); } catch {} }
  private tone(frequency: number, offset: number, duration: number, level: number, music: boolean, endPitch = frequency) {
    const ctx = this.context;
    if (!ctx || this.hidden || level <= 0) return;
    try {
      const time = ctx.currentTime + offset, gain = ctx.createGain();
      const destination = music && this.bed ? this.bed : ctx.destination;
      if (!gain.gain.setValueAtTime || !gain.gain.exponentialRampToValueAtTime || !ctx.createOscillator) {
        this.bufferedTone(ctx,time,frequency,endPitch,duration,level,destination);
        return;
      }
      const osc = ctx.createOscillator();
      osc.frequency.setValueAtTime(frequency,time);
      if (frequency !== endPitch) osc.frequency.exponentialRampToValueAtTime(endPitch,time+duration*0.8);
      gain.gain.setValueAtTime(0.0001,time);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002,level),time+0.003);
      gain.gain.exponentialRampToValueAtTime(0.0001,time+duration);
      osc.connect(gain); gain.connect(destination);
      this.voices.add(osc); osc.onended = () => { this.voices.delete(osc); osc.disconnect(); gain.disconnect(); };
      osc.start(time); osc.stop(time+duration+0.01);
    } catch {}
  }
  // Some WeChat WebAudio implementations expose only the current AudioParam value.
  private bufferedTone(ctx: AudioContext, time: number, frequency: number, endPitch: number, duration: number, level: number, destination: AudioNode) {
    const samples = new Float32Array(Math.ceil(ctx.sampleRate * duration));
    let phase = 0;
    for (let index = 0; index < samples.length; index++) {
      const elapsed = index / ctx.sampleRate;
      const pitch = frequency * Math.pow(endPitch / frequency, Math.min(1, elapsed / (duration * 0.8)));
      const envelope = Math.min(1, elapsed / 0.003) * Math.exp(-6 * elapsed / duration);
      samples[index] = Math.sin(phase) * level * envelope;
      phase += 2 * Math.PI * pitch / ctx.sampleRate;
    }
    const buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate);
    buffer.copyToChannel(samples, 0, 0);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(destination);
    this.voices.add(source);
    source.onended = () => { this.voices.delete(source); source.disconnect(); };
    source.start(time);
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
      const native = device();
      try { if (native?.vibrateShort) native.vibrateShort({type:'light'}); else host.navigator?.vibrate?.(12); } catch {}
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
  update(track: Track) {
    const ctx = this.context;
    if (!ctx || !this.bed || this.hidden || ctx.state !== 'running') return;
    const gain = this.bed.gain, now = ctx.currentTime;
    const active = track !== 'quiet' && this.options.music && this.options.musicVolume > 0;
    const target = active ? this.options.musicVolume * (now - this.lastSignificant < 0.3 ? 0.48 : 1) : 0;
    if (this.musicGain !== target) {
      gain.cancelScheduledValues?.(now);
      if (target > 0 && gain.setTargetAtTime) gain.setTargetAtTime(target,now,0.08);
      else if (gain.setValueAtTime) gain.setValueAtTime(target,now);
      else gain.value = target;
      this.musicGain = target;
    }
    if (this.track !== track) { this.track = track; this.beat = 0; this.next = 0; }
    if (track === 'quiet' || !active || now < this.next) return;
    const melody = melodies[track], loop = track === 'loop';
    if (!loop && this.beat >= melody.length) return;
    const midi = melody[this.beat % melody.length];
    this.tone(440*Math.pow(2,(midi-69)/12),0,0.68,0.065,true);
    if (this.beat % 4 === 0) this.tone(440*Math.pow(2,(midi-81)/12),0,1.1,0.05,true);
    this.beat++; this.next = now+(loop ? 0.62 : 0.46);
  }
}
