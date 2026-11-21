import { Arena, bounded, Ink, palette } from './Arena';
import { BoardTransition, blendColor, Movement, pauseGap, splitInk } from './BoardTransition';
import { field, Player, Point } from './Match';
import { Profile, StoragePort } from './Profile';
import { rules } from './Rules';
import { TouchAudio } from './TouchAudio';
export type { Ink } from './Arena';

type Page = 'menu'|'play'|'pause'|'rules'|'result'|'settings'|'records';
type Control = { id:string; x:number; y:number; width:number; height:number; run:()=>void };
const menuPalette = [[18,137,145],[180,127,34],[207,84,90],[60,117,163]];
function menuColor(time:number) {
  const phase=time/4, index=Math.floor(phase)%menuPalette.length;
  const from=menuPalette[index], to=menuPalette[(index+1)%menuPalette.length];
  const t=phase%1, blend=t*t*(3-2*t);
  return '#'+from.map((value,channel)=>Math.round(value+(to[channel]-value)*blend).toString(16).padStart(2,'0')).join('');
}
export class Table {
  page: Page = 'menu';
  profile: Profile;
  audio: TouchAudio;
  arena: Arena;
  revision = 0;
  private motion: BoardTransition | null = null;
  private menuTime = 0;
  private seriesWins: [number,number] = [0,0];
  private lastRound: readonly [number,number] = [0,0];
  private roundRecorded = false;
  private controls: Control[] = [];
  private pressed = '';
  private start: Point | null = null;
  private scroll = 0;
  private scrollStart = 0;
  private slider: 'musicVolume'|'soundVolume'|null = null;
  private tr = (zh:string,en:string) => this.profile.options.english ? en : zh;
  private sound = (name:string,force?:number,size?:number) => this.audio.cue(name,force,size);
  constructor(storage?: StoragePort) {
    this.profile = new Profile(storage); this.audio = new TouchAudio(this.profile.options);
    this.arena = new Arena(this.sound);
  }
  get match() { return this.arena.match; }
  private go(page: Page) {
    this.cancel(); this.controls = []; this.page = page; this.revision++;
  }
  get inSeries() { return this.page==='play' || this.page==='pause' || this.page==='result'; }
  private slide(kind:Movement, page:Page, gap:number, wash:number) {
    this.go(page);
    this.motion=new BoardTransition(kind,gap,wash);
  }
  private begin(next=false) {
    const starter:Player=next?(1-this.match.starter) as Player:0;
    if (!next) this.seriesWins=[0,0];
    this.arena=new Arena(this.sound);
    this.match.player=this.match.starter=starter;
    this.roundRecorded=false;
    this.slide(next?'next':'enter','play',1,.24);
    this.sound('resume');
  }
  private pause() {
    this.slide('pause','pause',this.motion?.gap??0,this.motion?.wash??0);
    this.sound('pause');
  }
  private resume() { this.slide('resume','play',pauseGap,1); this.sound('resume'); }
  private leave() {
    if (this.page==='pause') this.slide('leave','menu',pauseGap,1);
    else this.go('menu');
    this.seriesWins=[0,0];
  }
  back() {
    if (this.page==='play') { this.pause(); return true; }
    if (this.motion || this.page==='pause') return true;
    if (this.page==='result') { this.leave(); return true; }
    if (this.page==='menu') return false;
    this.go('menu'); return true;
  }
  background() { if (this.page==='play') this.pause(); this.cancel(); this.audio.sleep(true); }
  foreground() { this.audio.sleep(false); }
  cancel() {
    this.arena.cancel(); this.pressed=''; this.start=null; this.slider=null; this.revision++;
  }
  private hit(point:Point) { return this.controls.find(control=>Math.abs(point.x-control.x)<=control.width/2 && Math.abs(point.y-control.y)<=control.height/2); }
  private atEdge(point:Point) { return Math.min(point.x,field.right-point.x)<=field.right*.065; }
  down(point:Point) {
    this.audio.unlock(); this.start=point; this.revision++;
    if (this.motion) { this.start=null; return; }
    const hit=this.hit(point);
    if (hit) {
      this.pressed=hit.id;
      if (hit.id === 'musicVolume' || hit.id === 'soundVolume') { this.slider=hit.id; this.setVolume(point); }
      return;
    }
    if (this.page === 'rules') this.scrollStart=this.scroll;
    if (this.page === 'play' && !this.atEdge(point)) this.arena.down(point);
  }
  private setVolume(point:Point) {
    if (!this.slider) return;
    this.profile.options[this.slider]=Math.round(100*bounded((point.x/field.right-0.15)/0.7,0,1))/100; this.profile.save();
  }
  move(point:Point) {
    if (!this.start) return;
    if (this.slider) { this.setVolume(point); return; }
    if (this.pressed) return;
    if (this.page === 'rules') this.scroll=bounded(this.scrollStart+this.start.y-point.y,0,(rules.length-1)*105-535);
    if (this.page === 'play') this.arena.move(point);
    this.revision++;
  }
  up(point:Point) {
    if (!this.start) return;
    if (this.page==='play' && this.atEdge(this.start)) {
      const dx=point.x-this.start.x, dy=point.y-this.start.y;
      const inward=this.start.x<field.right/2?dx:-dx;
      if (inward>field.right*.15 && Math.abs(dy)<inward*.6) {
        this.back(); return;
      }
      // Reserve dots also live at the edge. Commit their tap after ruling out a back swipe.
      if (Math.hypot(dx,dy)<field.right*.045) this.arena.down(this.start);
    }
    this.move(point);
    const pressed=this.pressed, hit=this.hit(point), slider=this.slider;
    this.pressed=''; this.start=null; this.slider=null;
    if (slider) { this.sound('select'); return; }
    if (pressed) {
      if (hit?.id===pressed) { this.sound('click'); hit.run(); }
      this.revision++; return;
    }
    if (this.page==='play') this.arena.up(point);
    this.revision++;
  }
  private winningTrack() { const [blue,red]=this.match.score(); return blue===red ? 'draw' : blue>red ? 'blue' : 'red'; }
  tick(seconds:number) {
    const dt=bounded(seconds,0,0.1); this.revision++;
    if (this.page==='menu' || this.motion?.kind==='enter') this.menuTime+=dt;
    if (this.motion) {
      this.motion.elapsed+=dt;
      if (this.motion.elapsed>=this.motion.duration) this.motion=null;
    } else if (this.page==='play') {
      this.arena.tick(dt);
      if (this.match.phase==='over') {
        if (!this.roundRecorded) {
          this.lastRound=this.match.score();
          const [blue,red]=this.lastRound;
          if (blue!==red) this.seriesWins[blue>red?0:1]++;
          this.profile.finish(this.lastRound);
          this.roundRecorded=true;
        }
        if (!this.arena.busy) { this.slide('finish','result',0,0); this.sound(this.winningTrack()); }
      }
    }
    const menu=['menu','settings','records','rules'].includes(this.page);
    this.audio.update(menu?'menu':this.page==='result'?this.winningTrack():'quiet');
  }
  draw(ink:Ink) {
    this.controls=[];
    const width=field.right, center=width/2, scale=width/768, tr=this.tr, colors=palette;
    const label=(y:number,value:string,size:number,color=colors.ink,x=center) => ink.text(x,y,value,size*scale,color);
    const register=(id:string,x:number,y:number,w:number,h:number,run:()=>void) => {
      if (!this.motion) this.controls.push({id,x,y,width:w,height:h,run});
    };
    const link=(id:string,x:number,y:number,value:string,run:()=>void,w:number,h:number,size=28,color=colors.ink) => {
      label(y,value,this.pressed===id?size*0.94:size,color,x); register(id,x,y,w,h,run);
    };
    const button=(id:string,y:number,value:string,run:()=>void,h=68) =>
      link(id,center,y,value,run,width*0.81,h,32);
    const title=(name:string) => label(170,name,52);
    const home=()=>this.go('menu');
    const motion=this.motion, kind=motion?.kind;
    if (this.page==='play' && !motion) { this.arena.draw(ink); return; }
    const showMenu=this.page==='menu' || kind==='enter';
    const showPause=this.page==='pause' || kind==='resume';
    const showResult=this.page==='result' || kind==='next';
    const [blue,red]=this.lastRound;
    const resultColor=blue===red?'#56989D':blue>red?colors.blue:colors.red;
    const pauseColor='#EADF66';
    const progress=motion?.progress??1;
    const menuTint=menuColor(this.menuTime);
    const backdrop=kind==='leave'?blendColor(pauseColor,menuTint,progress):
      showMenu?menuTint:showPause?pauseColor:
      showResult?blendColor(pauseColor,resultColor,kind==='finish'?progress:1):colors.paper;
    ink.rect(0,0,width,field.height,backdrop);
    if (showMenu) {
      if (kind==='leave' && progress<.4) {
        const fading=blendColor(colors.paper,backdrop,progress/.4);
        label(512,tr('继续','Continue'),42,fading,width*.30);
        label(512,tr('菜单','Menu'),42,fading,width*.70);
      }
      const items=[
        ['start',tr('双人','2 Player'),()=>this.begin()],
        ['rules',tr('规则','Rules'),()=>{this.scroll=0;this.go('rules');}],
        ['settings',tr('设置','Settings'),()=>this.go('settings')],
        ['records',tr('记录','Records'),()=>this.go('records')]
      ] as const;
      const opacity=kind==='enter'?1-progress:
        kind==='leave'?bounded((progress-.4)/.6,0,1):1;
      items.forEach(([id,value,run],index) =>
        link(id,width*(0.17+0.22*index),512,value,run,width*0.22,116,32,blendColor(backdrop,colors.paper,opacity)));
    } else if (showPause || showResult) {
      if (showResult) {
        ink.text(center,296,String(red),280*scale,colors.paper,true,true);
        ink.text(center,728,String(blue),280*scale,colors.paper,false,true);
        ink.text(width*.16,85,tr('红方总胜 ','Red wins ')+this.seriesWins[1],30*scale,colors.paper,true);
        ink.text(width*.84,939,tr('蓝方总胜 ','Blue wins ')+this.seriesWins[0],30*scale,colors.paper);
      }
      const y=showResult?491:512;
      link('continue',width*.30,y,tr('继续','Continue'),()=>showResult?this.begin(true):this.resume(),width*.38,110,42,colors.paper);
      link('menu',width*.70,y,tr('菜单','Menu'),()=>this.leave(),width*.38,110,42,colors.paper);
    }
    if (motion || this.page==='pause') {
      const gap=motion?.gap??pauseGap, wash=motion?.wash??1;
      if (gap<1) {
        const shadow=(1-bounded(gap/(showPause || kind==='leave'?pauseGap:.84),0,1))*.63;
        if (gap>0 && shadow>0) ink.rect(0,field.middle*(1-gap),width,field.height*gap,
          '#000000'+Math.round(shadow*255).toString(16).padStart(2,'0'));
        this.arena.draw(splitInk(ink,gap,wash),kind!=='enter' && kind!=='next');
      }
      return;
    }
    if (this.page==='rules') {
      title(tr('游戏规则','Rulebook'));
      rules.forEach((item,index)=>{
        const pos=273+index*105-this.scroll;
        if (pos>214 && pos<882) {
          label(pos,tr(item[0],item[2]),30);
          label(pos+39,tr(item[1],item[3]),23,colors.muted);
        }
      });
      button('back',957,tr('返回','Back'),home);
    } else if (this.page==='settings') {
      title(tr('本地设置','Settings'));
      const opts=this.profile.options;
      const toggle=(key:'music'|'sound'|'haptic'|'english',y:number,name:string)=>{
        const value=key==='english'?(opts.english?'English':'简体中文'):opts[key]?tr('开','On'):tr('关','Off');
        button(key,y,name+'      '+value,()=>{opts[key]=!opts[key];this.profile.save();},55);
      };
      const slider=(key:'musicVolume'|'soundVolume',y:number)=>{
        const amount=opts[key], left=width*0.15, length=width*0.7;
        ink.rect(left,y-2,length,4,colors.mist); ink.rect(left,y-2,length*amount,4,colors.blue);
        ink.dot(left+length*amount,y,10*scale,colors.ink); label(y+30,Math.round(amount*100)+'%',19,colors.muted);
        register(key,center,y,length+22*scale,48,()=>{});
      };
      toggle('music',305,tr('背景音乐','Music')); slider('musicVolume',374);
      toggle('sound',455,tr('操作音效','Sound')); slider('soundVolume',523);
      toggle('haptic',612,tr('震动反馈','Vibration')); toggle('english',688,tr('语言','Language'));
      button('back',945,tr('返回','Back'),home);
    } else if (this.page==='records') {
      title(tr('对局记录','Match records'));
      const record=this.profile.ledger;
      label(350,String(record.games),85); label(425,tr('已完成对局','Completed matches'),26,colors.muted);
      label(527,tr('蓝胜   /   平局   /   红胜','Blue wins   /   Draws   /   Red wins'),24,colors.muted);
      label(582,[record.blue,record.draws,record.red].join('       '),45);
      label(678,tr('累计得分','Lifetime points')+'     '+record.bluePoints+' : '+record.redPoints,28);
      label(742,tr('最高连胜','Longest streak')+'     '+record.best,28);
      button('back',917,tr('返回主菜单','Main menu'),home);
    }
  }
}
