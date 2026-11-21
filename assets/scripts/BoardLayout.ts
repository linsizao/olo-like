export interface BoardLayout { strip: number; resultRow: number; upperRow: number; shooterRow: number; clearance: number; haloSpread: number }
export const classicStrip = 171;
export const haloPeak = 0.578;
type WindowMetrics = { windowHeight?: number; statusBarHeight?: number; safeArea?: { top: number; bottom: number } };
interface WeChatWindow {
  getMenuButtonBoundingClientRect?(): { bottom: number };
  getWindowInfo?(): WindowMetrics;
  getSystemInfoSync?(): WindowMetrics;
}
declare const wx: WeChatWindow | undefined;

// WeChat window metrics and the requested control offset both use logical pixels.
export function boardViewport(windowHeight: number) {
  if (typeof wx === 'undefined') return {windowHeight, inset:0};
  let info: WindowMetrics = {}, bottom = 0;
  try { info = wx.getWindowInfo?.() ?? wx.getSystemInfoSync?.() ?? {}; } catch {}
  try { bottom = wx.getMenuButtonBoundingClientRect?.().bottom ?? 0; } catch {}
  const height = info.windowHeight || windowHeight;
  const safeTop = info.safeArea?.top || info.statusBarHeight || 0;
  if (!(bottom > 0 && bottom < height / 2)) bottom = safeTop + 40;
  const inset = Math.max(bottom, safeTop, height - (info.safeArea?.bottom || height));
  return {windowHeight:height, inset:inset+4};
}

export function fitBoard(height: number, largestRadius: number, viewport = {windowHeight:height, inset:0}): BoardLayout {
  const unitsPerPixel = height / (viewport.windowHeight || height);
  let strip = classicStrip, clearance = 0, haloSpread = 1;
  if (viewport.inset > 0) {
    // Keep full-sized discs. Tight screens only compress the decorative rings.
    const target = height * 0.14;
    const minimumSpread = 0.35;
    const minimumExtent = Math.max(32, largestRadius*(1+haloPeak*minimumSpread));
    clearance = Math.min(viewport.inset*unitsPerPixel, height/2 - 2*minimumExtent - 1);
    const available = (target-clearance)/2;
    haloSpread = Math.max(minimumSpread, Math.min(1, (available/largestRadius-1)/haloPeak));
    const extent = Math.max(32, largestRadius*(1+haloPeak*haloSpread));
    strip = Math.max(target, clearance + 2*extent);
  }

  const resultRow = (clearance+strip)/2;
  const shift = 8*unitsPerPixel;
  const upperRow = resultRow-shift;
  const shooterRow = upperRow-Math.min(10, largestRadius/3);
  return { strip, resultRow, upperRow, shooterRow, clearance:Math.max(0,clearance-shift), haloSpread };
}
