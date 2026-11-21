import { Ink, palette } from './Arena';
import { field } from './Match';
import type { PlayerColors } from './PlayerColors';

export type Movement = 'enter' | 'pause' | 'resume' | 'leave' | 'finish' | 'next';
type Sample = readonly [number, number];

// All board transitions use the menu entrance timing, in seconds and fraction of travel.
const travel: Sample[] = [[0,0],[.08,.025],[.18,.17],[.25,.55],[.32,.93],[.43,.99],[.56,1]];
export const pauseGap = 1/3;

export class BoardTransition {
  elapsed = 0;
  constructor(readonly kind: Movement, private startGap: number, private startWash: number) {}
  get duration() { return travel[travel.length-1][0]; }
  get progress() {
    for (let i=1;i<travel.length;i++) {
      const [t,value]=travel[i];
      if (this.elapsed>t) continue;
      const [prev,from]=travel[i-1];
      return from+(value-from)*(this.elapsed-prev)/(t-prev);
    }
    return 1;
  }
  private get endGap() {
    if (this.kind==='pause') return pauseGap;
    return this.kind==='leave' || this.kind==='finish' ? 1 : 0;
  }
  get gap() {
    return this.startGap+(this.endGap-this.startGap)*this.progress;
  }
  get wash() {
    const endWash=this.endGap>0?1:0;
    return this.startWash+(endWash-this.startWash)*this.progress;
  }
}

export function blendColor(from:string,to:string,amount:number) {
  if (amount<=0) return from;
  if (amount>=1) return to;
  let value='#';
  for (const index of [1,3,5]) {
    const a=parseInt(from.slice(index,index+2),16), b=parseInt(to.slice(index,index+2),16);
    value+=Math.round(a+(b-a)*amount).toString(16).padStart(2,'0');
  }
  return value;
}

// Translate the two clipped halves of the same frozen board, including pieces crossing the seam.
export function splitInk(ink: Ink, gap: number, wash: number, colors: PlayerColors): Ink {
  const seam=field.middle, offset=gap*seam;
  const muted=(color:string) => blendColor(color,color===palette.paper?'#FFFFFF':
    color===colors[0].zone || color===colors[1].zone?'#F5F5FA':'#D4D4D9',wash);
  return {
    rect(x,y,w,h,color) {
      const top=Math.min(y+h,seam)-y, bottom=y+h-Math.max(y,seam);
      if (top>0) ink.rect(x,y-offset,w,top,muted(color));
      if (bottom>0) ink.rect(x,Math.max(y,seam)+offset,w,bottom,muted(color));
    },
    dot(x,y,r,color) {
      const fill=muted(color);
      if (!offset || y+r<=seam || y-r>=seam) {
        ink.dot(x,y+(y<seam?-offset:offset),r,fill);
      } else {
        const height=y-seam;
        ink.dot(x,y-offset,r,fill,{height,upper:true});
        ink.dot(x,y+offset,r,fill,{height,upper:false});
      }
    },
    polygon(points,color) {
      // Shattered discs are entirely within one end of the board.
      const dy = points[0].y < seam ? -offset : offset;
      ink.polygon(points.map(p => ({ x:p.x, y:p.y+dy })), muted(color.slice(0,7))+color.slice(7));
    },
    text(x,y,value,size,color,inverted) {
      ink.text(x,y+(y<seam?-offset:offset),value,size,muted(color),inverted);
    }
  };
}
