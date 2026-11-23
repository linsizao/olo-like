export const rules = [
  ['游戏目标','将更多己方圆片停在远端同色区。','The objective','Land more discs in your far matching zone.'],
  ['圆片与库存','每人六枚，小、中、大各两枚，点小圆点换球。','Your stock','Two of each size. Tap a dot to swap.'],
  ['弹射','白区内摆位，前推到边线即出手，也可提前松手。','Slide and release','Push to the edge to shoot, or release inside your strip.'],
  ['暂停','拉开中线暂停，将任一滑块推向中线再松手继续。','Pause','Pull to pause. Slide either handle inward to resume.'],
  ['未出发射区','没出己方白区，也没撞球或撞边，停稳后才碎裂。','Short shots','A shot breaks only if it stays home and hits nothing.'],
  ['得分与失分','同色区内出现白环，停稳计分；被撞出则失分。','Scoring','White rings show goals. Scores settle after motion.'],
  ['碰撞与反弹','四边都能反弹，白区里的球也能被撞回场内。','Contact','Bank off any edge or knock a disc out of a strip.'],
  ['回收与复用','全场停稳后，回到己方白区的球归入己方库存。','Recycling','Once all discs stop, discs back home return to stock.'],
  ['夺取控制权','全场停稳后，留在对方白区的球归对方。','Capture','Once all discs stop, the rival claims discs in their strip.'],
  ['结束与胜负','两边库存用尽且全场静止才结算；同分为平局。','End of play','Empty stocks and a still board end play. Ties stand.'],
  ['连续对局','胜一局记一胜，平局双方不加。回菜单结束本组。','Series','Wins add one. Ties add none. Menu ends the series.']
] as const;
