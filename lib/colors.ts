const LEGACY_COLORS: Record<string, string> = {
  blue: "#2563EB",
  orange: "#F97316",
  green: "#16A34A",
  purple: "#7C3AED",
  red: "#E11D48",
  teal: "#0F766E",
};

export function colorHex(value: string | null | undefined) {
  const text = (value ?? "").trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(text)) return text.toUpperCase();
  return LEGACY_COLORS[text.toLowerCase()] ?? "#2563EB";
}

export function categoryPalette(count: number) {
  if (count <= 0) return [];
  const step = coprimeStep(count);
  const colors: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const slot = (index * step) % count;
    const hue = (slot * 360) / count;
    const lightness = 0.38 + (index % 3) * 0.09;
    colors.push(hslToHex(hue, 0.78, lightness));
  }
  return colors;
}

export function nextCategoryColor(used: string[]) {
  const taken = new Set(used.map((value) => colorHex(value)));
  if (taken.size === 0) return hslToHex(12, 0.78, 0.46);
  const hues = [...taken].map(hexToHue).sort((a, b) => a - b);
  let gapStart = hues[hues.length - 1];
  let gap = hues[0] + 360 - hues[hues.length - 1];
  for (let index = 0; index < hues.length - 1; index += 1) {
    const candidate = hues[index + 1] - hues[index];
    if (candidate > gap) {
      gap = candidate;
      gapStart = hues[index];
    }
  }
  const hue = (gapStart + gap / 2) % 360;
  const lightness = 0.38 + (taken.size % 3) * 0.09;
  let hex = hslToHex(hue, 0.78, lightness);
  for (let bump = 1; taken.has(hex) && bump < 12; bump += 1) {
    hex = hslToHex((hue + bump * 5) % 360, 0.78, lightness);
  }
  return hex;
}

export function uniqueCategoryColors(colors: string[]) {
  const assigned: string[] = [];
  for (const color of colors) {
    const hex = colorHex(color);
    assigned.push(assigned.includes(hex) ? nextCategoryColor(assigned) : hex);
  }
  return assigned;
}

function coprimeStep(count: number) {
  if (count <= 2) return 1;
  const target = Math.max(1, Math.round(count * 0.381966));
  for (let delta = 0; delta < count; delta += 1) {
    for (const candidate of [target + delta, target - delta]) {
      if (candidate > 1 && candidate < count && gcd(candidate, count) === 1) return candidate;
    }
  }
  return 1;
}

function gcd(a: number, b: number): number {
  let left = Math.abs(a);
  let right = Math.abs(b);
  while (right) {
    const next = left % right;
    left = right;
    right = next;
  }
  return left;
}

function hexToHue(hex: string) {
  const value = Number.parseInt(hex.slice(1), 16);
  const red = ((value >> 16) & 255) / 255;
  const green = ((value >> 8) & 255) / 255;
  const blue = (value & 255) / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  if (delta === 0) return 0;
  const hue =
    max === red ? ((green - blue) / delta) % 6 : max === green ? (blue - red) / delta + 2 : (red - green) / delta + 4;
  return (hue * 60 + 360) % 360;
}

function hslToHex(hue: number, saturation: number, lightness: number) {
  const chroma = saturation * Math.min(lightness, 1 - lightness);
  const channel = (offset: number) => {
    const position = (offset + hue / 30) % 12;
    const amount = lightness - chroma * Math.max(Math.min(position - 3, 9 - position, 1), -1);
    return Math.round(255 * amount)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`.toUpperCase();
}
