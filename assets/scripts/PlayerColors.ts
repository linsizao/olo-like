type DiscColor = {
  disc: string;
  zone: string;
  halo: readonly [string, string, string];
};

export type PlayerColors = readonly [DiscColor, DiscColor];

export const discColors = {
  blue:   { disc: '#29BAE3', zone: '#B3E7F5', halo: ['#E8F7FB', '#C2EAF6', '#9EDFF2'] },
  red:    { disc: '#FF4848', zone: '#FFC9C9', halo: ['#FFF0F0', '#FFD9D9', '#FFBBBB'] },
  yellow: { disc: '#F1C801', zone: '#F2E69A', halo: ['#FEF9E5', '#FBEEB2', '#F8E381'] },
  green:  { disc: '#2AE2A3', zone: '#AFEEDB', halo: ['#EAFDF6', '#BFF6E3', '#95F1D1'] }
} as const;

export function pickPlayerColors(random = Math.random): PlayerColors {
  const choices = Object.values(discColors);
  const [lower] = choices.splice(Math.floor(random() * choices.length), 1);
  const upper = choices[Math.floor(random() * choices.length)];
  return [lower, upper];
}
