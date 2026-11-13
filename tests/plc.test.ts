import { describe, it, expect } from "vitest";
import { parseText, parseBytes, MAX_BYTES, MAX_ROWS } from "../src/parser";
import { PLC, validate } from "../src/core/engine";
import { signed16, unsigned16 } from "../src/core/model";
import { analyze, exportDevices } from "../src/analyzer";
import basic from "../samples/basic_and.csv?raw";
import hold from "../samples/self_hold.csv?raw";
import mov from "../samples/mov_example.csv?raw";
const program = (lines: string[]) =>
  parseText(
    "step,instruction,operand,comment\n" +
      lines.map((l, i) => `${i},${l},`).join("\n"),
  );
describe("CSV adapters and decoding", () => {
  it("normalizes source lines, steps, multiline comments and BOM", () => {
    const p = parseText(
      '\uFEFFstep,instruction,operand,comment\r\n0,LD,X0,"a\n""b"""\r\n5,OUT,Y0,c\r\n6,END,,',
    );
    expect(p.instructions[0].comment).toBe('a\n"b"');
    expect(p.instructions[1]).toMatchObject({
      sourceLine: 4,
      step: 5,
      opcode: "OUT",
    });
  });
  it("accepts UTF-8 and UTF-8 BOM", () => {
    for (const prefix of ["", "\uFEFF"])
      expect(
        parseBytes(new TextEncoder().encode(prefix + basic)).instructions,
      ).toHaveLength(4);
  });
  it("decodes Japanese CP932-compatible bytes and offers explicit encoding", () => {
    const bytes = new Uint8Array([
      ...new TextEncoder().encode("step,instruction,operand,comment\n0,END,,"),
      0x93,
      0xfa,
      0x96,
      0x7b,
    ]);
    const p = parseBytes(bytes);
    expect(p.encoding).toBe("shift_jis");
    expect(p.instructions[0].comment).toBe("日本");
    expect(parseBytes(bytes, "utf-8").diagnostics[0].severity).toBe("error");
  });
  it("rejects unknown columns without positional guessing", () => {
    const p = parseText("ステップ,命令\n0,END");
    expect(p.adapter).toBeNull();
    expect(p.preview).toHaveLength(2);
    expect(p.instructions).toEqual([]);
  });
  it.each([
    "",
    "step,instruction,operand,comment\n0,LD,X0",
    'step,instruction,operand,comment\n0,LD,X0,"oops',
    "step,instruction,operand,comment\n0,END,,\n0,END,,",
  ])("blocks malformed or empty CSV %s", (text) => {
    expect(validate(parseText(text)).length).toBeGreaterThan(0);
  });
  it("limits bytes and row counts", () => {
    expect(
      parseBytes(new Uint8Array(MAX_BYTES + 1)).diagnostics[0].severity,
    ).toBe("error");
    expect(
      parseText("a\n".repeat(MAX_ROWS + 1)).diagnostics.some(
        (d) => d.severity === "error",
      ),
    ).toBe(true);
  });
  it("detects unknown instructions and unanalyzable rows", () => {
    const p = parseText(
      "step,instruction,operand,comment\n0,MYSTERY,M0,\nbad,OUT,Y0,\n2,END,,",
    );
    expect(p.diagnostics.some((d) => d.message.includes("MYSTERY"))).toBe(true);
    expect(p.diagnostics.some((d) => d.sourceLine === 3)).toBe(true);
  });
});
describe("PLC scan semantics", () => {
  it("AND circuit samples X inputs each scan", () => {
    const plc = new PLC(),
      p = parseText(basic);
    plc.set("X0", 1);
    expect(plc.read("X0")).toBe(0);
    plc.scan(p);
    expect(plc.read("Y0")).toBe(0);
    plc.set("X1", 1);
    plc.scan(p);
    expect(plc.read("Y0")).toBe(1);
    plc.set("X0", 0);
    plc.scan(p);
    expect(plc.read("Y0")).toBe(0);
  });
  it("self holding circuit remains on then stops", () => {
    const plc = new PLC(),
      p = parseText(hold);
    plc.set("X0", 1);
    plc.scan(p);
    plc.set("X0", 0);
    plc.scan(p);
    expect(plc.read("Y0")).toBe(1);
    plc.set("X1", 1);
    plc.scan(p);
    expect(plc.read("Y0")).toBe(0);
  });
  it("LDI, ORI, ANI and OR operate on accumulator", () => {
    const p = program([
      "LDI,X0",
      "AND,X1",
      "ORI,X2",
      "ANI,X3",
      "OR,X4",
      "OUT,M0",
      "END,",
    ]);
    const plc = new PLC();
    plc.scan(p);
    expect(plc.read("M0")).toBe(1);
    plc.set("X2", 1);
    plc.scan(p);
    expect(plc.read("M0")).toBe(0);
    plc.set("X4", 1);
    plc.scan(p);
    expect(plc.read("M0")).toBe(1);
  });
  it("writes Y and M immediately in instruction order, last write wins", () => {
    const plc = new PLC(),
      p = program([
        "LD,X0",
        "OUT,Y0",
        "LD,Y0",
        "OUT,M0",
        "LDI,X0",
        "OUT,Y0",
        "END,",
      ]);
    plc.set("X0", 1);
    plc.scan(p);
    expect(plc.read("M0")).toBe(1);
    expect(plc.read("Y0")).toBe(0);
  });
  it("supports multiple outputs and operations after output", () => {
    const p = program(["LD,X0", "OUT,Y0", "AND,X1", "OUT,M0", "END,"]),
      plc = new PLC();
    plc.set("X0", 1);
    plc.scan(p);
    expect(plc.read("Y0")).toBe(1);
    expect(plc.read("M0")).toBe(0);
  });
  it("MOV is conditional and SET/RST retain across scans", () => {
    const plc = new PLC(),
      p = parseText(mov);
    plc.scan(p);
    expect(plc.read("D0")).toBe(0);
    plc.set("X0", 1);
    plc.scan(p);
    expect(plc.read("D1")).toBe(65535);
    expect(plc.read("M0")).toBe(1);
    plc.set("X0", 0);
    plc.set("D0", 42);
    plc.scan(p);
    expect(plc.read("D1")).toBe(65535);
    expect(plc.read("M0")).toBe(1);
    plc.set("X1", 1);
    plc.scan(p);
    expect(plc.read("M0")).toBe(0);
  });
  it("SET followed by RST uses the last conditional write", () => {
    const plc = new PLC();
    plc.set("X0", 1);
    plc.scan(program(["LD,X0", "SET,M0", "RST,M0", "END,"]));
    expect(plc.read("M0")).toBe(0);
  });
  it("16bit conversion, hex constant and reset", () => {
    expect(unsigned16(-1)).toBe(65535);
    expect(signed16(32768)).toBe(-32768);
    expect(signed16(65535)).toBe(-1);
    const plc = new PLC();
    plc.set("D0", -32768);
    expect(plc.read("D0")).toBe(32768);
    plc.set("X0", 1);
    plc.scan(program(["LD,X0", "MOV,HFFFF D1", "END,"]));
    expect(plc.read("D1")).toBe(65535);
    plc.reset();
    expect(plc.memory).toEqual({});
    expect(plc.inputs).toEqual({});
    expect(plc.scans).toBe(0);
  });
  it.each([
    ["LD,X0", "ANB,", "OUT,Y0", "END,"],
    ["LD,X0", "LD,X1", "ORB,", "OUT,Y0", "END,"],
    ["LD,X0", "MOV,K1 X0", "END,"],
    ["LD,D0", "OUT,Y0", "END,"],
    ["LD,X0", "OUT,Y0"],
    ["AND,X0", "END,"],
    ["END,", "OUT,Y0"],
    ["LD,X0", "MOV,K65536 D0", "END,"],
  ])(
    "blocks invalid/unsupported program before any mutation %s",
    (...lines) => {
      const plc = new PLC();
      plc.set("X0", 1);
      const p = program(lines);
      expect(() => plc.scan(p)).toThrow();
      expect(plc.memory).toEqual({});
      expect(plc.scans).toBe(0);
    },
  );
});
describe("analysis", () => {
  it("cross references read/write, counts, source mapping and duplicate writes", () => {
    const p = program(["LD,X0", "OUT,M0", "LD,M0", "SET,M0", "END,"]);
    const a = analyze(p);
    expect(a.devices.get("M0")?.map((r) => r.access)).toEqual([
      "write",
      "read",
      "write",
    ]);
    expect(a.devices.get("M0")?.[0]).toMatchObject({ step: 1, sourceLine: 3 });
    expect(a.counts.get("LD")).toBe(2);
    expect(a.warnings).toHaveLength(1);
    expect(exportDevices(p)).toContain('"M0","1","3","write","OUT"');
  });
  it("retains BMOV range information without pretending to execute it", () => {
    const p = program(["LD,X0", "BMOV,D0 D10 K4", "OUT,T0", "RST,C0", "END,"]);
    expect(analyze(p).ranges.map((r) => [r.start, r.count, r.access])).toEqual([
      ["D0", 4, "read"],
      ["D10", 4, "write"],
    ]);
    expect(validate(p).length).toBeGreaterThan(0);
  });
});
