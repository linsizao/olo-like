export const rules = [
  ['游戏目标','将更多己方圆片停在远端同色区。','The objective','Land more discs in your far matching zone.'],
  ['圆片与库存','每人六枚，小、中、大各两枚。','Your stock','Six discs each: two of every size.'],
  ['弹射','点小圆点换球。按住球在白区摆位，向前推并松手。','Slide and release','Tap a dot to swap. Hold, position, then push and release.'],
  ['暂停','从任一侧屏幕边缘向内滑，点「继续」回到棋盘。','Pause','Swipe inward from either edge. Tap Continue to resume.'],
  ['未出发射区','全场停稳时，从未离开己方白区的球会碎裂。','Short shots','Once all discs stop, a shot that never left home breaks.'],
  ['得分与失分','同色区内出现白环，停稳计分；被撞出则失分。','Scoring','White rings show goals. Scores settle after motion.'],
  ['碰撞与反弹','四边都能反弹，白区里的球也能被撞回场内。','Contact','Bank off any edge or knock a disc out of a strip.'],
  ['回收与复用','全场停稳后，回到己方白区的球归入己方库存。','Recycling','Once all discs stop, discs back home return to stock.'],
  ['夺取控制权','全场停稳后，留在对方白区的球归对方。','Capture','Once all discs stop, the rival claims discs in their strip.'],
  ['Death Finger','已复用三次的球，全场停稳时留在白区就淘汰。','Death Finger','After three reuses, ending a turn in either strip retires the disc.'],
  ['结束与胜负','两边库存用尽且全场静止才结算；同分为平局。','End of play','Empty stocks and a still board end play. Ties stand.'],
  ['连续对局','胜一局记一胜，平局双方不加。回菜单结束本组。','Series','Wins add one. Ties add none. Menu ends the series.']
] as const;
