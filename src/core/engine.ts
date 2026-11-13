import { device, supported, unsigned16, type Program } from "./model";
export type Memory = Record<string, number>;
const bit = (s: string) => {
  const d = device(s);
  return d && ["X", "Y", "M"].includes(d.kind);
};
const writable = (s: string) => {
  const d = device(s);
  return d && ["Y", "M"].includes(d.kind);
};
const word = (s: string) => device(s)?.kind === "D";
export function constant(s: string): number | null {
  if (/^K-?\d+$/.test(s)) {
    const n = Number(s.slice(1));
    return Number.isSafeInteger(n) && n >= -32768 && n <= 65535 ? n : null;
  }
  if (/^H[0-9A-F]{1,4}$/.test(s)) return parseInt(s.slice(1), 16);
  return null;
}
export function validate(p: Program): string[] {
  const errors = p.diagnostics
    .filter((d) => d.severity === "error")
    .map((d) => d.message);
  let active = false,
    outputSeen = false,
    ended = false;
  for (const i of p.instructions) {
    const a = i.operands,
      o = i.opcode;
    const fail = (s: string) => errors.push(`ステップ ${i.step}: ${s}`);
    if (ended) {
      fail("END以降の命令は対象外");
      continue;
    }
    if (!supported.has(o)) {
      fail(`未対応命令 ${o}`);
      continue;
    }
    if (["LD", "LDI"].includes(o)) {
      if (active && !outputSeen)
        fail("複数LDによるブロック・入れ子演算は未対応");
      active = true;
      outputSeen = false;
    } else if (o !== "END" && !active) fail("先行するLD/LDIが必要");
    if (["LD", "LDI", "AND", "ANI", "OR", "ORI"].includes(o)) {
      if (a.length !== 1 || !bit(a[0])) fail("接点はX/Y/Mの1オペランドが必要");
    } else if (["OUT", "SET", "RST"].includes(o)) {
      if (a.length !== 1 || !writable(a[0])) fail("出力先はY/Mのみ");
    } else if (o === "MOV") {
      if (
        a.length !== 2 ||
        !(word(a[0]) || constant(a[0]) !== null) ||
        !word(a[1])
      )
        fail("MOVはK/H定数またはDからDへの転送のみ");
    } else if (o === "END") {
      if (a.length) fail("ENDにオペランドは指定できません");
      ended = true;
    }
    // A new LD following output starts the next simple rung. Multiple outputs retain the accumulator.
    if (["OUT", "SET", "RST", "MOV"].includes(o)) outputSeen = true;
  }
  if (!ended) errors.push("ENDが必要です");
  return errors;
}
export class PLC {
  memory: Memory = {};
  inputs: Memory = {};
  scans = 0;
  set(name: string, value: number) {
    const d = device(name);
    if (
      !d ||
      !["X", "Y", "M", "D"].includes(d.kind) ||
      !Number.isInteger(value) ||
      value < -32768 ||
      value > 65535
    )
      throw Error("不正なデバイスまたは16bit値");
    if (d.kind === "X") this.inputs[d.name] = value ? 1 : 0;
    else
      this.memory[d.name] = d.kind === "D" ? unsigned16(value) : value ? 1 : 0;
  }
  read(name: string) {
    return this.memory[device(name)?.name ?? name] ?? 0;
  }
  reset() {
    this.memory = {};
    this.inputs = {};
    this.scans = 0;
  }
  scan(p: Program) {
    const errors = validate(p);
    if (errors.length) throw Error(errors.join("\n"));
    Object.assign(this.memory, this.inputs);
    let acc = false;
    const trace: { step: number; result: boolean }[] = [];
    for (const i of p.instructions) {
      const [a, b] = i.operands;
      const v = () => !!this.read(a);
      switch (i.opcode) {
        case "LD":
          acc = v();
          break;
        case "LDI":
          acc = !v();
          break;
        case "AND":
          acc = acc && v();
          break;
        case "ANI":
          acc = acc && !v();
          break;
        case "OR":
          acc = acc || v();
          break;
        case "ORI":
          acc = acc || !v();
          break;
        case "OUT":
          this.set(a, acc ? 1 : 0);
          break;
        case "SET":
          if (acc) this.set(a, 1);
          break;
        case "RST":
          if (acc) this.set(a, 0);
          break;
        case "MOV":
          if (acc) this.set(b, constant(a) ?? this.read(a));
          break;
        case "END":
          break;
      }
      trace.push({ step: i.step, result: acc });
      if (i.opcode === "END") break;
    }
    this.scans++;
    return trace;
  }
}
