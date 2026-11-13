import { describe, it, expect } from "vitest";
import { parseText, parseBytes } from "../src/parser";
import { PLC, validate } from "../src/core/engine";
import { buildLadder } from "../src/core/ladder";
import { analyze } from "../src/analyzer";
const p = (lines: string[]) =>
  parseText(
    "step,instruction,operand,comment\n" +
      lines.map((l, i) => `${i},${l},`).join("\n"),
  );
const gx = (rows: string[][]) =>
  [
    ["Synthetic test program"],
    ["PC情報:", "QCPU(Qモード) Q03UDE"],
    [
      "ステップ番号",
      "行間ステートメント",
      "命令",
      "I/O(デバイス)",
      "空欄",
      "PIステートメント",
      "ノート",
    ],
    ...rows,
  ]
    .map((r) => r.map((c) => '"' + c.replaceAll('"', '""') + '"').join("\t"))
    .join("\r\n");
describe("observed GX Works2 schema (synthetic fixtures)", () => {
  it("decodes UTF16LE BOM, tab columns and operand continuation source lines", () => {
    const text = gx([
      ["0", "", "LD", "X1B", "", "", ""],
      ["1", "", "MOV", "K1X1C", "", "", ""],
      ["", "", "", "D5", "", "", ""],
      ["4", "", "END", "", "", "", ""],
    ]);
    const bytes = new Uint8Array(2 + text.length * 2);
    bytes[0] = 255;
    bytes[1] = 254;
    for (let i = 0; i < text.length; i++) {
      bytes[2 + i * 2] = text.charCodeAt(i) & 255;
      bytes[3 + i * 2] = text.charCodeAt(i) >> 8;
    }
    const prog = parseBytes(bytes);
    expect(prog.encoding).toBe("utf-16le");
    expect(prog.adapter).toBe("gx-works2-list-ja-v1");
    expect(prog.instructions[1]).toMatchObject({
      step: 1,
      operands: ["K1X1C", "D5"],
      sourceLine: 5,
      operandSourceLines: [5, 6],
    });
    expect(validate(prog)).toEqual([]);
    expect(analyze(prog).devices.get("D5")?.[0].sourceLine).toBe(6);
    expect(analyze(prog).devices.has("X1F")).toBe(true);
  });
  it("rejects orphan continuation and altered GX header", () => {
    expect(
      validate(parseText(gx([["", "", "", "D5", "", "", ""]]))).length,
    ).toBeGreaterThan(0);
    expect(parseText(gx([]).replace("ノート", "未知列")).adapter).toBeNull();
  });
});
describe("block and branch logic", () => {
  it("combines ORB and ANB with nested LD blocks", () => {
    const prog = p([
      "LD,X0",
      "AND,X1",
      "LDI,X0",
      "AND,X2",
      "ORB,",
      "LD,X3",
      "OR,X4",
      "ANB,",
      "OUT,Y0",
      "END,",
    ]);
    expect(validate(prog)).toEqual([]);
    for (let mask = 0; mask < 32; mask++) {
      const plc = new PLC();
      for (let i = 0; i < 5; i++) plc.set("X" + i, (mask >> i) & 1);
      plc.scan(prog);
      const bit = (n: number) => !!((mask >> n) & 1);
      expect(plc.read("Y0")).toBe(
        ((bit(0) && bit(1)) || (!bit(0) && bit(2))) && (bit(3) || bit(4))
          ? 1
          : 0,
      );
    }
    const ladder = buildLadder(prog);
    expect(ladder.errors).toEqual([]);
    expect(ladder.rungs[0].condition.kind).toBe("and");
  });
  it("MPS MRD MPP restore accumulator for branched outputs", () => {
    const prog = p([
      "LD,X0",
      "MPS,",
      "AND,X1",
      "OUT,Y0",
      "MRD,",
      "AND,X2",
      "OUT,Y1",
      "MPP,",
      "ANI,X3",
      "OUT,Y2",
      "END,",
    ]);
    const plc = new PLC();
    plc.set("X0", 1);
    plc.set("X2", 1);
    plc.scan(prog);
    expect([plc.read("Y0"), plc.read("Y1"), plc.read("Y2")]).toEqual([0, 1, 1]);
    expect(buildLadder(prog).rungs).toHaveLength(3);
  });
  it.each([
    ["LD,X0", "ORB,", "END,"],
    ["LD,X0", "MRD,", "END,"],
    ["LD,X0", "MPS,", "OUT,Y0", "END,"],
    ["LD,X0", "LD,X1", "OUT,Y0", "END,"],
  ])("blocks stack mismatch before mutation %s", (...lines) => {
    const plc = new PLC();
    expect(() => plc.scan(p(lines))).toThrow();
    expect(plc.memory).toEqual({});
  });
});
describe("training circuit operations", () => {
  it("LDP and INCP pulse once per rising edge, including rearm and reset", () => {
    const prog = p(["LDP,X0", "MOV,K3 D0", "LD,X0", "INCP,D1", "END,"]),
      plc = new PLC();
    plc.set("X0", 1);
    plc.scan(prog);
    expect(plc.read("D0")).toBe(3);
    plc.set("D0", 8);
    plc.scan(prog);
    expect(plc.read("D0")).toBe(8);
    expect(plc.read("D1")).toBe(1);
    plc.set("X0", 0);
    plc.scan(prog);
    plc.set("X0", 1);
    plc.scan(prog);
    expect(plc.read("D1")).toBe(2);
    plc.reset();
    plc.set("X0", 1);
    plc.scan(prog);
    expect(plc.read("D1")).toBe(1);
  });
  it("100ms nonretentive timer expires and resets deterministically", () => {
    const prog = p(["LD,X0", "OUT,T8 K3", "LD,T8", "OUT,Y0", "END,"]),
      plc = new PLC();
    plc.set("X0", 1);
    plc.scan(prog);
    plc.scan(prog);
    expect(plc.read("Y0")).toBe(0);
    plc.scan(prog);
    expect(plc.read("Y0")).toBe(1);
    plc.set("X0", 0);
    plc.scan(prog);
    expect(plc.read("T8")).toBe(0);
    expect(plc.timers.T8).toBe(0);
  });
  it("SM400, digit input, signed multiply, BCD and digit output", () => {
    const prog = p([
        "LD,SM400",
        "MOV,K1X1C D5",
        "*,D5 K10 D6",
        "BCD,D6 K2Y36",
        "END,",
      ]),
      plc = new PLC();
    plc.set("X1C", 1);
    plc.set("X1E", 1);
    plc.scan(prog);
    expect(plc.read("D5")).toBe(5);
    expect(plc.read("D6")).toBe(50);
    expect(plc.read("D7")).toBe(0);
    expect(plc.read("Y3A")).toBe(1);
    expect(plc.read("Y3C")).toBe(1);
    expect(plc.read("Y36")).toBe(0);
    const negative = p(["LD,SM400", "*,K-2 K3 D0", "END,"]);
    plc.scan(negative);
    expect(plc.read("D0")).toBe(65530);
    expect(plc.read("D1")).toBe(65535);
  });
  it("signed comparisons combine LD AND OR correctly", () => {
    const prog = p([
        "LD=,D0 K-1",
        "AND>,K20 D1",
        "OR>=,D2 K6",
        "OUT,Y0",
        "END,",
      ]),
      plc = new PLC();
    plc.set("D0", -1);
    plc.set("D1", 19);
    plc.scan(prog);
    expect(plc.read("Y0")).toBe(1);
    plc.set("D1", 20);
    plc.scan(prog);
    expect(plc.read("Y0")).toBe(0);
    plc.set("D2", 6);
    plc.scan(prog);
    expect(plc.read("Y0")).toBe(1);
  });
  it("rolls back entire scan on invalid BCD values", () => {
    const prog = p(["LD,SM400", "OUT,Y0", "BCD,D0 K2Y0", "END,"]),
      plc = new PLC();
    plc.set("D0", 10000);
    const before = { ...plc.memory };
    expect(() => plc.scan(prog)).toThrow("BCD");
    expect(plc.memory).toEqual(before);
    expect(plc.scans).toBe(0);
  });
});
