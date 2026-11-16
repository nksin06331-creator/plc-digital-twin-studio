import {
  device,
  loadInstructions,
  andInstructions,
  orInstructions,
  type Instruction,
  type Program,
  type Diagnostic,
} from "../core/model";
import { group, offset, comparison } from "../core/operands";
export interface Reference {
  step: number;
  sourceLine: number;
  access: "read" | "write" | "read/write" | "unknown";
  opcode: string;
}
export interface RangeAccess {
  instruction: Instruction;
  start: string;
  count: number | null;
  access: "read" | "write" | "read/write" | "unknown";
}
export function analyze(p: Program) {
  const devices = new Map<string, Reference[]>(),
    counts = new Map<string, number>(),
    ranges: RangeAccess[] = [],
    diagnostics: Diagnostic[] = [];
  for (const i of p.instructions) {
    counts.set(i.opcode, (counts.get(i.opcode) ?? 0) + 1);
    i.operands.forEach((s, index) => {
      const g = group(s);
      const d = g?.start ?? device(s);
      if (!d) return;
      let access: Reference["access"] = "unknown";
      if (
        [...loadInstructions, ...andInstructions, ...orInstructions].includes(
          i.opcode,
        ) ||
        comparison.test(i.opcode)
      )
        access = "read";
      if (
        ["OUT", "SET", "RST", "INCP", "INC", "DEC", "PLS", "PLF"].includes(
          i.opcode,
        )
      )
        access = index === 0 ? "write" : "read";
      if (
        ["INCP", "INC", "DEC"].includes(i.opcode) ||
        (i.opcode === "OUT" && index === 0 && d.kind === "C")
      )
        access = "read/write";
      if (["MOV", "MOVP", "BCD", "BIN"].includes(i.opcode))
        access = index === 1 ? "write" : "read";
      if (["*", "/", "+", "-", "CMP"].includes(i.opcode))
        access = index === 2 ? "write" : "read";
      if (i.opcode === "BMOV") {
        access = index === 1 ? "write" : "read";
        ranges.push({
          instruction: i,
          start: d.name,
          count: /^K\d+$/.test(i.operands[2] ?? "")
            ? Number(i.operands[2].slice(1))
            : null,
          access,
        });
      }
      const count =
        g?.count ??
        (["*", "/", "CMP"].includes(i.opcode) && index === 2
          ? i.opcode === "CMP"
            ? 3
            : 2
          : 1);
      if (g || count > 1)
        ranges.push({ instruction: i, start: d.name, count, access });
      const validEnd = Number.isSafeInteger(d.address + (count - 1));
      if (!validEnd)
        diagnostics.push({
          severity: "error",
          sourceLine: i.sourceLine,
          message: `ステップ ${i.step}: ${d.name}からの連続アクセス終端番地が不正です`,
        });
      for (let n = 0; n < (validEnd ? count : 1); n++) {
        const name = offset(d.name, n);
        let refs = devices.get(name);
        if (!refs) {
          refs = [];
          devices.set(name, refs);
        }
        refs.push({
          step: i.step,
          sourceLine: i.operandSourceLines?.[index] ?? i.sourceLine,
          access,
          opcode: i.opcode,
        });
      }
    });
  }
  const warnings = [...devices]
    .filter(
      ([, refs]) => refs.filter((r) => r.access.includes("write")).length > 1,
    )
    .map(([d]) => `${d}: 複数書込み（参考警告。命令順を確認）`);
  return { devices, counts, ranges, warnings, diagnostics };
}
const csvCell = (s: string) =>
  '"' + (/^[=+\-@\t\r]/.test(s) ? "'" + s : s).replaceAll('"', '""') + '"';
export function exportDevices(p: Program) {
  return (
    "\uFEFF" +
    [
      ["device", "step", "sourceLine", "access", "instruction"],
      ...[...analyze(p).devices].flatMap(([d, refs]) =>
        refs.map((r) => [
          d,
          String(r.step),
          String(r.sourceLine),
          r.access,
          r.opcode,
        ]),
      ),
    ]
      .map((row) => row.map(csvCell).join(","))
      .join("\r\n")
  );
}
