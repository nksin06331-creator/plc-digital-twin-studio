import { device, type Instruction, type Program } from "../core/model";
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
    ranges: RangeAccess[] = [];
  for (const i of p.instructions) {
    counts.set(i.opcode, (counts.get(i.opcode) ?? 0) + 1);
    i.operands.forEach((s, index) => {
      const g = group(s);
      const d = g?.start ?? device(s);
      if (!d) return;
      let access: Reference["access"] = "unknown";
      if (
        ["LD", "LDI", "LDP", "AND", "ANI", "OR", "ORI"].includes(i.opcode) ||
        comparison.test(i.opcode)
      )
        access = "read";
      if (["OUT", "SET", "RST", "INCP"].includes(i.opcode))
        access = index === 0 ? "write" : "read";
      if (i.opcode === "INCP") access = "read/write";
      if (["MOV", "BCD"].includes(i.opcode))
        access = index === 1 ? "write" : "read";
      if (i.opcode === "*") access = index === 2 ? "write" : "read";
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
      const count = g?.count ?? (i.opcode === "*" && index === 2 ? 2 : 1);
      if (g || count > 1)
        ranges.push({ instruction: i, start: d.name, count, access });
      for (let n = 0; n < count; n++) {
        const name = offset(d.name, n);
        devices.set(name, [
          ...(devices.get(name) ?? []),
          {
            step: i.step,
            sourceLine: i.operandSourceLines?.[index] ?? i.sourceLine,
            access,
            opcode: i.opcode,
          },
        ]);
      }
    });
  }
  const warnings = [...devices]
    .filter(
      ([, refs]) => refs.filter((r) => r.access.includes("write")).length > 1,
    )
    .map(([d]) => `${d}: 複数書込み（参考警告。命令順を確認）`);
  return { devices, counts, ranges, warnings };
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
