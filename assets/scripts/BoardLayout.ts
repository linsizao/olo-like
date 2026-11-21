export interface BoardLayout { strip: number; upperRow: number; clearance: number; haloSpread: number }
export const classicStrip = 171;
export const haloPeak = 0.578;
type WindowMetrics = { windowHeight?: number; statusBarHeight?: number; safeArea?: { top: number; bottom: number } };
interface WeChatWindow {
  getMenuButtonBoundingClientRect?(): { bottom: number };
  getWindowInfo?(): WindowMetrics;
  getSystemInfoSync?(): WindowMetrics;
}
declare const wx: WeChatWindow | undefined;

export function wechatClearance(windowHeight: number, boardHeight: number) {
  if (typeof wx === 'undefined') return 0;
  let info: WindowMetrics = {}, bottom = 0;
  try { info = wx.getWindowInfo?.() ?? wx.getSystemInfoSync?.() ?? {}; } catch {}
  try { bottom = wx.getMenuButtonBoundingClientRect?.().bottom ?? 0; } catch {}
  const height = info.windowHeight || windowHeight;
  const safeTop = info.safeArea?.top || info.statusBarHeight || 0;
  if (!(bottom > 0 && bottom < height / 2)) bottom = safeTop + 40;
  const inset = Math.max(bottom, safeTop, height - (info.safeArea?.bottom || height));
  return (inset + 4) * boardHeight / height;
}

export function fitBoard(height: number, largestRadius: number, inset: number): BoardLayout {
  if (!inset) return { strip: classicStrip, upperRow: classicStrip/2, clearance: 0, haloSpread: 1 };

  // Keep full-sized discs. Tight screens only compress the decorative rings.
  const target = height * 0.14;
  const minimumSpread = 0.35;
  const minimumExtent = Math.max(32, largestRadius*(1+haloPeak*minimumSpread));
  const clearance = Math.min(inset, height/2 - 2*minimumExtent - 1);
  const available = (target-clearance)/2;
  const haloSpread = Math.max(minimumSpread, Math.min(1, (available/largestRadius-1)/haloPeak));
  const extent = Math.max(32, largestRadius*(1+haloPeak*haloSpread));
  const strip = Math.max(target, clearance + 2*extent);
  return { strip, upperRow: (clearance+strip)/2, clearance, haloSpread };
}
