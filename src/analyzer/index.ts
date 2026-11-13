import { device, type Instruction, type Program } from "../core/model";
export interface Reference {
  step: number;
  sourceLine: number;
  access: "read" | "write" | "unknown";
  opcode: string;
}
export interface RangeAccess {
  instruction: Instruction;
  start: string;
  count: number | null;
  access: "read" | "write" | "unknown";
}
export function analyze(p: Program) {
  const devices = new Map<string, Reference[]>(),
    counts = new Map<string, number>(),
    ranges: RangeAccess[] = [];
  for (const i of p.instructions) {
    counts.set(i.opcode, (counts.get(i.opcode) ?? 0) + 1);
    i.operands.forEach((s, index) => {
      const d = device(s);
      if (!d) return;
      let access: Reference["access"] = "unknown";
      if (["LD", "LDI", "AND", "ANI", "OR", "ORI"].includes(i.opcode))
        access = "read";
      if (["OUT", "SET", "RST"].includes(i.opcode)) access = "write";
      if (i.opcode === "MOV") access = index === 1 ? "write" : "read";
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
      devices.set(d.name, [
        ...(devices.get(d.name) ?? []),
        { step: i.step, sourceLine: i.sourceLine, access, opcode: i.opcode },
      ]);
    });
  }
  const warnings = [...devices]
    .filter(([, refs]) => refs.filter((r) => r.access === "write").length > 1)
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
