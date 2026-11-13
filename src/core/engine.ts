import { device, supported, unsigned16, signed16, type Program } from "./model";
import {
  constant,
  group,
  offset,
  isBit,
  isWord,
  isDestination,
  comparison,
} from "./operands";
export { constant } from "./operands";
export type Memory = Record<string, number>;
export interface ScanTrace {
  step: number;
  result: boolean;
  contact?: boolean;
}
export function validate(p: Program): string[] {
  const errors = p.diagnostics
    .filter((d) => d.severity === "error")
    .map((d) => d.message);
  let active = false,
    outputSeen = false,
    ended = false,
    blocks = 0,
    branches = 0;
  for (const i of p.instructions) {
    const a = i.operands,
      o = i.opcode,
      cmp = comparison.exec(o);
    const fail = (s: string) => errors.push(`ステップ ${i.step}: ${s}`);
    if (ended) {
      fail("END以降の命令は対象外");
      continue;
    }
    if (!supported.has(o)) {
      fail(`未対応命令 ${o}`);
      continue;
    }
    const load = ["LD", "LDI", "LDP"].includes(o) || cmp?.[1] === "LD";
    if (load) {
      if (active && !outputSeen) blocks++;
      if (outputSeen && blocks) fail("結合されていないブロックがあります");
      active = true;
      outputSeen = false;
    } else if (o !== "END" && !active) fail("先行するLD/LDIが必要");
    if (["LD", "LDI", "LDP", "AND", "ANI", "OR", "ORI"].includes(o)) {
      if (a.length !== 1 || !isBit(a[0]))
        fail("接点はX/Y/M/TまたはSM400が必要");
    } else if (cmp) {
      if (a.length !== 2 || !a.every(isWord)) fail("比較は2つの16bit値が必要");
    } else if (["ANB", "ORB"].includes(o)) {
      if (a.length || blocks === 0) fail("結合するブロックがありません");
      else blocks--;
    } else if (o === "MPS") {
      if (a.length) fail("オペランド不要");
      branches++;
    } else if (["MRD", "MPP"].includes(o)) {
      if (a.length || !branches) fail("MPSに対応するスタックがありません");
      else if (o === "MPP") branches--;
    } else if (o === "OUT" && device(a[0])?.kind === "T") {
      if (a.length !== 2 || !isWord(a[1])) fail("タイマーは設定値が必要");
    } else if (["OUT", "SET", "RST"].includes(o)) {
      if (a.length !== 1 || !["Y", "M"].includes(device(a[0])?.kind ?? ""))
        fail("出力先はY/Mのみ");
    } else if (["MOV", "BCD"].includes(o)) {
      if (a.length !== 2 || !isWord(a[0]) || !isDestination(a[1]))
        fail("転送元または転送先が不正");
    } else if (o === "*") {
      if (
        a.length !== 3 ||
        !isWord(a[0]) ||
        !isWord(a[1]) ||
        device(a[2])?.kind !== "D" ||
        !Number.isSafeInteger((device(a[2])?.address ?? 0) + 1)
      )
        fail("乗算は2つの値とD出力先が必要");
    } else if (o === "INCP") {
      if (a.length !== 1 || device(a[0])?.kind !== "D")
        fail("INCP出力先はDのみ");
    } else if (o === "END") {
      if (a.length) fail("ENDにオペランドは指定できません");
      ended = true;
    }
    if (["OUT", "SET", "RST", "MOV", "BCD", "*", "INCP"].includes(o)) {
      if (blocks) fail("未結合ブロックからの出力");
      outputSeen = true;
    }
  }
  if (blocks || branches) errors.push("ブロックまたはMPSスタックが未完了");
  if (!ended) errors.push("ENDが必要です");
  return errors;
}
export class PLC {
  memory: Memory = {};
  inputs: Memory = {};
  scans = 0;
  timers: Memory = {};
  private edges: Record<number, boolean> = {};
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
    this.timers = {};
    this.edges = {};
  }
  scan(p: Program, elapsedMs = 100): ScanTrace[] {
    const errors = validate(p);
    if (errors.length) throw Error(errors.join("\n"));
    if (!Number.isFinite(elapsedMs) || elapsedMs < 0 || elapsedMs > 10000)
      throw Error("スキャン時間が不正です");
    const memory: Memory = { ...this.memory, ...this.inputs, SM400: 1 },
      timers = { ...this.timers },
      edges = { ...this.edges };
    const read = (s: string): number => {
      const k = constant(s);
      if (k !== null) return unsigned16(k);
      const g = group(s);
      if (g) {
        let n = 0;
        for (let j = 0; j < g.count; j++)
          if (memory[offset(g.start.name, j)]) n |= 1 << j;
        return unsigned16(n);
      }
      return memory[device(s)?.name ?? s] ?? 0;
    };
    const write = (s: string, value: number) => {
      const g = group(s);
      if (g) {
        for (let j = 0; j < g.count; j++)
          memory[offset(g.start.name, j)] = (unsigned16(value) >> j) & 1;
      } else memory[device(s)!.name] = unsigned16(value);
    };
    const pulse = (step: number, condition: boolean) => {
      const rising = condition && !this.edges[step];
      edges[step] = condition;
      return rising;
    };
    let acc = false,
      outputSeen = false;
    const blocks: boolean[] = [],
      branches: boolean[] = [],
      trace: ScanTrace[] = [];
    for (const i of p.instructions) {
      const [a, b, c] = i.operands,
        o = i.opcode,
        cmp = comparison.exec(o);
      let contact: boolean | undefined;
      const load = ["LD", "LDI", "LDP"].includes(o) || cmp?.[1] === "LD";
      if (load) {
        if (!outputSeen && trace.length) blocks.push(acc);
        outputSeen = false;
      }
      if (cmp) {
        const x = signed16(read(a)),
          y = signed16(read(b));
        contact =
          cmp[2] === "="
            ? x === y
            : cmp[2] === "<>"
              ? x !== y
              : cmp[2] === ">"
                ? x > y
                : cmp[2] === "<"
                  ? x < y
                  : cmp[2] === ">="
                    ? x >= y
                    : x <= y;
        acc =
          cmp[1] === "LD"
            ? contact
            : cmp[1] === "AND"
              ? acc && contact
              : acc || contact;
      } else
        switch (o) {
          case "LD":
          case "LDI":
          case "LDP":
          case "AND":
          case "ANI":
          case "OR":
          case "ORI": {
            contact = !!read(a);
            if (["LDI", "ANI", "ORI"].includes(o)) contact = !contact;
            if (o === "LDP") contact = pulse(i.step, contact);
            acc = ["LD", "LDI", "LDP"].includes(o)
              ? contact
              : ["AND", "ANI"].includes(o)
                ? acc && contact
                : acc || contact;
            break;
          }
          case "ANB":
            acc = blocks.pop()! && acc;
            break;
          case "ORB":
            acc = blocks.pop()! || acc;
            break;
          case "MPS":
            branches.push(acc);
            break;
          case "MRD":
            acc = branches.at(-1)!;
            break;
          case "MPP":
            acc = branches.pop()!;
            break;
          case "OUT":
            if (device(a)?.kind === "T") {
              const preset = signed16(read(b));
              if (preset < 0)
                throw Error(`ステップ ${i.step}: タイマー設定値が負数です`);
              const name = device(a)!.name;
              timers[name] = acc
                ? Math.min((timers[name] ?? 0) + elapsedMs, preset * 100)
                : 0;
              memory[name] = acc && timers[name] >= preset * 100 ? 1 : 0;
            } else write(a, acc ? 1 : 0);
            break;
          case "SET":
            if (acc) write(a, 1);
            break;
          case "RST":
            if (acc) write(a, 0);
            break;
          case "MOV":
            if (acc) write(b, read(a));
            break;
          case "*":
            if (acc) {
              const n = signed16(read(a)) * signed16(read(b));
              write(c, n);
              write(offset(c, 1), Math.floor(n / 65536));
            }
            break;
          case "BCD":
            if (acc) {
              const n = read(a);
              if (n > 9999)
                throw Error(`ステップ ${i.step}: BCD範囲外（0〜9999）`);
              write(b, parseInt(String(n), 16));
            }
            break;
          case "INCP":
            if (pulse(i.step, acc)) write(a, read(a) + 1);
            break;
        }
      trace.push({ step: i.step, result: acc, contact });
      if (["OUT", "SET", "RST", "MOV", "BCD", "*", "INCP"].includes(o))
        outputSeen = true;
      if (o === "END") break;
    }
    this.memory = memory;
    this.timers = timers;
    this.edges = edges;
    this.scans++;
    return trace;
  }
}
