import { device } from "./model";
export function constant(s: string): number | null {
  if (/^K-?\d+$/.test(s)) {
    const n = Number(s.slice(1));
    return Number.isSafeInteger(n) && n >= -32768 && n <= 65535 ? n : null;
  }
  if (/^H[0-9A-F]{1,4}$/.test(s)) return parseInt(s.slice(1), 16);
  return null;
}
export function group(s: string) {
  const m = /^K([1-4])((?:X|Y|M)[0-9A-F]+)$/.exec(s);
  if (!m) return null;
  const start = device(m[2]);
  const count = Number(m[1]) * 4;
  return start && Number.isSafeInteger(start.address + count - 1)
    ? { start, count }
    : null;
}
export function offset(name: string, n: number) {
  const d = device(name);
  if (
    !d ||
    !Number.isSafeInteger(n) ||
    n < 0 ||
    !Number.isSafeInteger(d.address + n)
  )
    throw Error("不正なデバイス");
  return (
    d.kind +
    (d.address + n)
      .toString(["X", "Y"].includes(d.kind) ? 16 : 10)
      .toUpperCase()
  );
}
export function isBit(s: string) {
  const d = device(s);
  return !!d && (["X", "Y", "M", "T"].includes(d.kind) || d.name === "SM400");
}
export function isWord(s: string) {
  const d = device(s);
  return constant(s) !== null || d?.kind === "D" || !!group(s);
}
export function isDestination(s: string) {
  const g = group(s);
  return device(s)?.kind === "D" || (!!g && ["Y", "M"].includes(g.start.kind));
}
export const comparison = /^(LD|AND|OR)(=|<>|>=|<=|>|<)$/;
