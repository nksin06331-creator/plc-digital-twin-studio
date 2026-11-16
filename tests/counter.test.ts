import { describe, expect, it } from "vitest";
import { PLC, validate } from "../src/core/engine";
import { parseText } from "../src/parser";
import { analyze } from "../src/analyzer";
import { buildLadder } from "../src/core/ladder";
const program = (lines: string[]) =>
  parseText(
    "step,instruction,operand,comment\n" +
      lines.map((line, i) => `${i},${line},`).join("\n"),
  );
const basic = program([
  "LD,X0",
  "OUT,C0 K2",
  "LD,X1",
  "RST,C0",
  "LD,C0",
  "OUT,Y0",
  "LD,SM400",
  "MOV,C0 D0",
  "END,",
]);
describe("normal 16-bit up counters", () => {
  it("counts rising edges, retains on coil OFF, and latches the contact at the preset", () => {
    const plc = new PLC();
    expect(validate(basic)).toEqual([]);
    plc.set("X0", 1);
    plc.scan(basic, 0);
    expect(plc.counters.C0).toBe(1);
    expect(plc.read("C0")).toBe(0);
    expect(plc.read("D0")).toBe(1);
    for (let i = 0; i < 10; i++) plc.scan(basic, 100);
    expect(plc.counters.C0).toBe(1);
    plc.set("X0", 0);
    plc.scan(basic, 0);
    expect(plc.counters.C0).toBe(1);
    plc.set("X0", 1);
    plc.scan(basic, 0);
    expect(plc.counters.C0).toBe(2);
    expect(plc.read("C0")).toBe(1);
    expect(plc.read("Y0")).toBe(1);
    for (let i = 0; i < 4; i++) {
      plc.set("X0", 0);
      plc.scan(basic);
      plc.set("X0", 1);
      plc.scan(basic);
    }
    expect(plc.counters.C0).toBe(2);
    expect(plc.read("C0")).toBe(1);
  });
  it("conditional RST clears value/contact without creating an edge on a held input", () => {
    const plc = new PLC();
    plc.set("X0", 1);
    plc.scan(basic);
    plc.set("X1", 1);
    plc.scan(basic);
    expect(plc.counters.C0).toBe(0);
    expect(plc.read("C0")).toBe(0);
    plc.set("X1", 0);
    plc.scan(basic);
    expect(plc.counters.C0).toBe(0);
    plc.set("X0", 0);
    plc.scan(basic);
    plc.set("X0", 1);
    plc.scan(basic);
    expect(plc.counters.C0).toBe(1);
  });
  it.each([false, true])(
    "respects RST/OUT instruction order (reset first: %s)",
    (resetFirst) => {
      const count = ["LD,X0", "OUT,C0 K1"],
        reset = ["LD,X1", "RST,C0"];
      const p = program([
        ...(resetFirst ? [...reset, ...count] : [...count, ...reset]),
        "END,",
      ]);
      const plc = new PLC();
      plc.set("X0", 1);
      plc.set("X1", 1);
      plc.scan(p);
      expect(plc.counters.C0).toBe(resetFirst ? 1 : 0);
      expect(plc.read("C0")).toBe(resetFirst ? 1 : 0);
    },
  );
  it("uses current value for word operands and the completion bit for contacts", () => {
    const p = program([
      "LD,X0",
      "OUT,C0 K3",
      "LD,C0",
      "OUT,Y0",
      "LDI,C0",
      "OUT,Y1",
      "LD=,C0 K1",
      "OUT,Y2",
      "LD,SM400",
      "MOV,C0 D0",
      "BCD,C0 K2Y10",
      "END,",
    ]);
    const plc = new PLC();
    plc.set("X0", 1);
    plc.scan(p);
    expect([
      plc.read("D0"),
      plc.read("Y0"),
      plc.read("Y1"),
      plc.read("Y2"),
      plc.read("Y10"),
    ]).toEqual([1, 0, 1, 1, 1]);
    expect(buildLadder(p).errors).toEqual([]);
    expect(
      analyze(p)
        .devices.get("C0")
        ?.map((r) => r.access),
    ).toContain("read/write");
  });
  it("supports independent counters and variable presets; completed counters hold until RST", () => {
    const p = program(["LD,X0", "OUT,C0 D0", "OUT,C1 K3", "END,"]),
      plc = new PLC();
    plc.set("D0", 1);
    plc.set("X0", 1);
    plc.scan(p);
    plc.set("D0", 3);
    plc.set("X0", 0);
    plc.scan(p);
    plc.set("X0", 1);
    plc.scan(p);
    expect(plc.counters).toEqual({ C0: 1, C1: 2 });
    expect(plc.read("C0")).toBe(1);
    expect(plc.read("C1")).toBe(0);
  });
  it("handles the 32767 upper bound without overflow", () => {
    const p = program(["LD,X0", "OUT,C0 K32767", "END,"]),
      plc = new PLC();
    plc.counters.C0 = 32766;
    plc.set("X0", 1);
    plc.scan(p);
    expect(plc.counters.C0).toBe(32767);
    expect(plc.read("C0")).toBe(1);
    plc.set("X0", 0);
    plc.scan(p);
    plc.set("X0", 1);
    plc.scan(p);
    expect(plc.counters.C0).toBe(32767);
  });
  it.each(["K0", "K-1", "K32768", "K65535", "H8000"])(
    "blocks invalid literal preset %s before mutation",
    (preset) => {
      const p = program(["LD,X0", `OUT,C0 ${preset}`, "END,"]),
        plc = new PLC();
      expect(validate(p).join()).toContain("カウンター");
      expect(() => plc.scan(p)).toThrow();
      expect(plc.scans).toBe(0);
      expect(plc.counters).toEqual({});
    },
  );
  it.each([0, -1, 32768])(
    "rolls back an invalid variable preset %s and preserves a pending edge",
    (value) => {
      const p = program(["LD,X0", "OUT,C0 K2", "OUT,C1 D0", "END,"]),
        plc = new PLC();
      plc.set("D0", value);
      plc.set("X0", 1);
      const before = { ...plc.memory };
      expect(() => plc.scan(p)).toThrow("カウンター");
      expect(plc.memory).toEqual(before);
      expect(plc.counters).toEqual({});
      expect(plc.scans).toBe(0);
      plc.set("D0", 2);
      plc.scan(p);
      expect(plc.counters).toEqual({ C0: 1, C1: 1 });
    },
  );
  it("rolls back counters and edges when a later BCD instruction fails", () => {
    const p = program(["LD,X0", "OUT,C0 K2", "BCD,D0 K2Y0", "END,"]),
      plc = new PLC();
    plc.set("X0", 1);
    plc.set("D0", 10000);
    expect(() => plc.scan(p)).toThrow("BCD");
    expect(plc.counters).toEqual({});
    plc.set("D0", 1);
    plc.scan(p);
    expect(plc.counters.C0).toBe(1);
    plc.reset();
    expect(plc.counters).toEqual({});
    expect(plc.read("C0")).toBe(0);
    plc.set("X0", 1);
    plc.scan(p);
    expect(plc.counters.C0).toBe(1);
  });
  it.each([
    ["LD,X0", "OUT,C0 K2", "OUT,C00 K2", "END,"],
    ["LD,X0", "SET,C0", "END,"],
    ["LD,X0", "MOV,K1 C0", "END,"],
    ["LD,X0", "OUT,C0", "END,"],
  ])(
    "rejects duplicate coils and unsupported counter writes: %s",
    (...lines) => {
      const p = program(lines),
        plc = new PLC();
      expect(validate(p).length).toBeGreaterThan(0);
      expect(() => plc.scan(p)).toThrow();
      expect(plc.counters).toEqual({});
    },
  );
});

it("evaluates all basic C contact operations using the completion bit", () => {
  const p = program([
    "LD,X0",
    "OUT,C0 K2",
    "LD,C0",
    "OUT,Y0",
    "LDI,C0",
    "OUT,Y1",
    "LD,SM400",
    "AND,C0",
    "OUT,Y2",
    "LD,SM400",
    "ANI,C0",
    "OUT,Y3",
    "LD,X2",
    "OR,C0",
    "OUT,Y4",
    "LD,X2",
    "ORI,C0",
    "OUT,Y5",
    "END,",
  ]);
  const plc = new PLC();
  plc.set("X0", 1);
  plc.scan(p);
  expect(Array.from({ length: 6 }, (_, i) => plc.read("Y" + i))).toEqual([
    0, 1, 0, 1, 0, 1,
  ]);
  plc.set("X0", 0);
  plc.scan(p);
  plc.set("X0", 1);
  plc.scan(p);
  expect(Array.from({ length: 6 }, (_, i) => plc.read("Y" + i))).toEqual([
    1, 0, 1, 0, 1, 0,
  ]);
});

it("parses a GX list counter preset continuation and executes its contact", () => {
  const rows = [
    [
      "ステップ番号",
      "行間ステートメント",
      "命令",
      "I/O(デバイス)",
      "空欄",
      "PIステートメント",
      "ノート",
    ],
    ["0", "", "LD", "X0", "", "", ""],
    ["1", "", "OUT", "C0", "", "", ""],
    ["", "", "", "K2", "", "", ""],
    ["4", "", "LD", "C0", "", "", ""],
    ["5", "", "OUT", "Y0", "", "", ""],
    ["6", "", "END", "", "", "", ""],
  ];
  const p = parseText(
    rows.map((r) => r.map((s) => `"${s}"`).join("\t")).join("\r\n"),
  );
  expect(p.adapter).toBe("gx-works2-list-ja-v1");
  expect(validate(p)).toEqual([]);
  expect(p.instructions[1].operandSourceLines).toEqual([3, 4]);
  const plc = new PLC();
  plc.set("X0", 1);
  plc.scan(p);
  expect(plc.read("Y0")).toBe(0);
  plc.set("X0", 0);
  plc.scan(p);
  plc.set("X0", 1);
  plc.scan(p);
  expect(plc.read("Y0")).toBe(1);
});
