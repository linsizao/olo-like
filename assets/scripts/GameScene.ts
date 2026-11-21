import { _decorator, Camera, Canvas, Color, Component, EventKeyboard, EventTouch, game, Game, Graphics, input, Input, KeyCode, Label, Layers, Node, ResolutionPolicy, screen, sys, UITransform, view } from 'cc';
import { field, pieceScale, Point } from './Match';
import { boardViewport, fitBoard } from './BoardLayout';
import { Ink, Table } from './Table';

const { ccclass } = _decorator;

@ccclass('GameScene')
export class GameScene extends Component implements Ink {
  private table = new Table(sys.localStorage);
  private board!: Node;
  private marks: { node: Node; shape?: Graphics; label?: Label; key: string }[] = [];
  private cursor = 0;
  private finger: number | null = null;
  private drawn = -1;
  private hidden = false;
  private historyActive = false;
  private wasShowingBoard = false;
  private screenWidth = 0;
  private screenHeight = 0;
  private get browser() { return sys.isBrowser && typeof window!=='undefined' ? window : undefined; }

  onLoad() {
    this.node.layer = Layers.Enum.UI_2D;
    const cameraNode = new Node('TableCamera'); this.node.addChild(cameraNode);
    cameraNode.setPosition(0, 0, 1000);
    const camera = cameraNode.addComponent(Camera);
    camera.projection = Camera.ProjectionType.ORTHO; camera.visibility = Layers.Enum.UI_2D;
    camera.clearFlags = Camera.ClearFlag.SOLID_COLOR; camera.clearColor = Color.WHITE;
    camera.near = 0.1; camera.far = 2000;
    const canvas = this.node.addComponent(Canvas); canvas.cameraComponent = camera;
    this.board = new Node('Table'); this.board.layer = Layers.Enum.UI_2D; this.node.addChild(this.board);
    this.board.addComponent(UITransform);
    this.resize();
    input.on(Input.EventType.KEY_DOWN,this.keyDown,this);
    this.browser?.addEventListener('popstate',this.popState);
    screen.on('window-resize', this.resize, this);
    this.node.on(Node.EventType.TOUCH_START, this.begin, this);
    this.node.on(Node.EventType.TOUCH_MOVE, this.drag, this);
    this.node.on(Node.EventType.TOUCH_END, this.release, this);
    this.node.on(Node.EventType.TOUCH_CANCEL, this.cancel, this);
    game.on(Game.EVENT_HIDE, this.hide, this); game.on(Game.EVENT_SHOW, this.show, this);
  }
  private resize() {
    const size = screen.windowSize;
    if (this.screenWidth === size.width && this.screenHeight === size.height) return;
    this.screenWidth = size.width;
    this.screenHeight = size.height;
    this.fitControls();
    this.table.cancel(); this.finger = null;
  }
  private fitControls() {
    const viewport = boardViewport(this.screenHeight/(screen.devicePixelRatio || 1));
    const viewportWidth = Math.max(1, field.height*this.screenWidth/(this.screenHeight || 1));
    const width = viewport.inset ? viewportWidth : Math.min(768, viewportWidth);
    const arena = this.table.arena;
    arena.layout = fitBoard(field.height, 50*pieceScale(width), viewport);
    arena.match.resize(width, arena.layout.strip, arena.effects.map(effect => effect.point));
    view.setDesignResolutionSize(width, field.height, ResolutionPolicy.SHOW_ALL);
    this.node.getComponent(UITransform)!.setContentSize(width, field.height);
    this.board.getComponent(UITransform)!.setContentSize(width, field.height);
  }
  private keyDown(event:EventKeyboard) {
    if ([KeyCode.ESCAPE,KeyCode.BACKSPACE,KeyCode.MOBILE_BACK].includes(event.keyCode)) this.table.back();
  }
  private popState=() => {
    if (this.table.inSeries) {
      this.table.back();
      this.historyActive=false;
      this.syncHistory();
    }
  };
  private syncHistory() {
    const history=this.browser?.history, active=this.table.inSeries;
    if (!history || this.historyActive===active) return;
    this.historyActive=active;
    try {
      if (active && !history.state?.oloDuel) history.pushState({oloDuel:true},'');
      if (!active && history.state?.oloDuel) history.back();
    } catch {}
  }
  onDestroy() {
    input.off(Input.EventType.KEY_DOWN,this.keyDown,this);
    this.browser?.removeEventListener('popstate',this.popState);
    this.table.audio.dispose(); screen.off('window-resize', this.resize, this); game.off(Game.EVENT_HIDE, this.hide, this); game.off(Game.EVENT_SHOW, this.show, this); }
  private point(event: EventTouch) {
    const point = event.getUILocation(), size = view.getVisibleSize();
    return { x: point.x - size.width / 2 + field.right / 2, y: size.height / 2 - point.y + field.middle };
  }
  private begin(event: EventTouch) { if (this.finger === null) { this.finger = event.getID() ?? 0; this.table.down(this.point(event)); } }
  private drag(event: EventTouch) { if (this.finger === (event.getID() ?? 0)) this.table.move(this.point(event)); }
  private release(event: EventTouch) { if (this.finger === (event.getID() ?? 0)) { this.table.up(this.point(event)); this.finger = null; } }
  private cancel(event: EventTouch) { if (this.finger === (event.getID() ?? 0)) { this.finger = null; this.table.cancel(); } }
  private hide() { this.hidden = true; this.finger = null; this.table.background(); }
  private show() { this.hidden = false; this.table.foreground(); }
  update(seconds: number) {
    if (this.hidden) return;
    this.table.tick(seconds);
    this.syncHistory();
    const showing = this.table.showsBoard;
    if (showing && !this.wasShowingBoard) this.fitControls();
    this.wasShowingBoard = showing;
    if (this.drawn === this.table.revision) return;
    this.cursor = 0; this.table.draw(this);
    for (let index = this.cursor; index < this.marks.length; index++) this.marks[index].node.active = false;
    this.drawn = this.table.revision;
  }
  private mark(text: boolean) {
    const index = this.cursor++;
    let mark = this.marks[index];
    if (!mark || Boolean(mark.label) !== text) {
      if (mark) { mark.node.removeFromParent(); mark.node.destroy(); }
      const node = new Node(text ? 'Caption' : 'Ink'); node.layer = Layers.Enum.UI_2D; this.board.addChild(node); node.setSiblingIndex(index);
      mark = text ? { node, label: node.addComponent(Label), key: '' } : { node, shape: node.addComponent(Graphics), key: '' };
      this.marks[index] = mark;
    }
    mark.node.active = true; return mark;
  }
  rect(x: number, y: number, width: number, height: number, color: string) {
    const mark = this.mark(false), key = `rect:${width}:${height}:${color}`;
    mark.node.setPosition(x - field.right / 2, 512 - y);
    if (mark.key === key) return;
    const pen = mark.shape!; pen.clear(); pen.fillColor = new Color().fromHEX(color); pen.rect(0, -height, width, height); pen.fill(); mark.key = key;
  }
  dot(x: number, y: number, radius: number, color: string, cut?: {height:number;upper:boolean}) {
    const mark = this.mark(false), key = `dot:${radius}:${color}:${cut?.height}:${cut?.upper}`;
    mark.node.setPosition(x - field.right / 2, 512 - y);
    if (mark.key === key) return;
    const pen = mark.shape!; pen.clear(); pen.fillColor = new Color().fromHEX(color);
    if (cut) {
      const angle=Math.asin(Math.max(-1,Math.min(1,cut.height/radius)));
      pen.arc(0,0,radius,angle,Math.PI-angle,cut.upper);
      pen.close();
    } else pen.circle(0,0,radius);
    pen.fill(); mark.key=key;
  }
  polygon(points: Point[], color: string) {
    const mark = this.mark(false), pen = mark.shape!;
    mark.key = ''; mark.node.setPosition(0,0);
    pen.clear(); pen.fillColor = new Color().fromHEX(color);
    const [first, ...rest] = points;
    pen.moveTo(first.x-field.right/2,field.middle-first.y);
    for (const p of rest) pen.lineTo(p.x-field.right/2,field.middle-p.y);
    pen.close(); pen.fill();
  }
  text(x: number, y: number, value: string, size: number, color: string, inverted = false, thin = false) {
    const mark = this.mark(true), key = `${size}:${color}:${value}:${inverted}:${thin}`;
    mark.node.setPosition(x - field.right / 2, 512 - y);
    if (mark.key === key) return;
    mark.node.angle = inverted ? 180 : 0;
    const label = mark.label!; label.fontSize = size; label.lineHeight = size + 3; label.isBold = false;
    label.fontFamily = thin ? '"HelveticaNeue-UltraLight", "Roboto Thin", "Helvetica Neue", sans-serif' : 'Helvetica Neue';
    label.color = new Color().fromHEX(color); label.string = value; mark.key = key;
  }
}
