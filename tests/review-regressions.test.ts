import { describe, it, expect } from "vitest";
import { buildLadder, type Logic } from "../src/core/ladder";
import { PLC, validate } from "../src/core/engine";
import { parseText, MAX_ROWS } from "../src/parser";
import { analyze, exportDevices } from "../src/analyzer";
import { defaultWiring, normalizeWiring } from "../src/core/plant/exam";
const program = (lines: string[]) =>
  parseText(
    "step,instruction,operand,comment\n" +
      lines.map((s, i) => `${i},${s},`).join("\n"),
  );
describe("review regression cases", () => {
  it("rejects repeated timer coils including aliases before any state changes", () => {
    const p = program(["LD,SM400", "OUT,T0 K10", "OUT,T00 K10", "END,"]),
      plc = new PLC();
    plc.set("D0", 42);
    const before = { ...plc.memory };
    expect(validate(p).join()).toContain("T0への複数OUT");
    expect(() => plc.scan(p, 100)).toThrow("タイマー重複");
    expect(plc.memory).toEqual(before);
    expect(plc.timers).toEqual({});
    expect(plc.scans).toBe(0);
  });
  it("allows separate timers to accumulate the same elapsed time independently", () => {
    const plc = new PLC();
    plc.scan(program(["LD,SM400", "OUT,T0 K10", "OUT,T1 K10", "END,"]), 100);
    expect(plc.timers).toEqual({ T0: 100, T1: 100 });
  });
  it("diagnoses invalid expanded addresses while retaining the valid starting device", () => {
    const p = program(["LD,SM400", "*,K1 K1 D9007199254740991", "END,"]);
    const result = analyze(p);
    expect(result.diagnostics[0]).toMatchObject({
      severity: "error",
      sourceLine: 3,
    });
    expect(result.devices.get("D9007199254740991")).toHaveLength(1);
    expect(validate(p)).not.toHaveLength(0);
  });
  it("normalizes edited input/output aliases and does not mutate draft data", () => {
    const draft = defaultWiring();
    draft.inputs.LS1 = "x0010";
    draft.outputs.RY1 = "y0030";
    const actual = normalizeWiring(draft);
    expect(actual.inputs.LS1).toBe("X10");
    expect(actual.outputs.RY1).toBe("Y30");
    expect(draft.inputs.LS1).toBe("x0010");
  });
  it("analyzes a maximum-row valid input with all expanded references intact", () => {
    const count = MAX_ROWS - 3;
    const p = program([
      "LD,SM400",
      ...Array.from({ length: count }, () => "MOV,K4M0 K4M0"),
      "END,",
    ]);
    expect(p.diagnostics).toEqual([]);
    const result = analyze(p);
    expect(result.diagnostics).toEqual([]);
    expect(result.devices.size).toBe(17);
    expect(result.devices.get("M0")).toHaveLength(count * 2);
    expect(result.devices.get("M15")?.at(-1)?.step).toBe(count);
    expect(result.warnings).toHaveLength(16);
  }, 10000);
  it("exports references beyond display page limits", () => {
    const p = program([
      "LD,SM400",
      ...Array.from({ length: 150 }, () => "OUT,M0"),
      "END,",
    ]);
    const csv = exportDevices(p);
    expect(csv).toContain('"M0","150","152","write","OUT"');
    expect(csv.split("\r\n")).toHaveLength(152);
  });
});

describe("restored branch conditions", () => {
  const evaluate = (node: Logic, values: Record<string, number>): boolean =>
    node.kind === "contact"
      ? !!values[node.instruction.operands[0]]
      : node.kind === "and"
        ? evaluate(node.left, values) && evaluate(node.right, values)
        : evaluate(node.left, values) || evaluate(node.right, values);

  it.each(["ANB", "ORB"])(
    "combines LD blocks after MRD and MPP with %s",
    (join) => {
      const p = program([
        "LD,X0",
        "MPS,",
        "AND,X1",
        "OUT,Y0",
        "MRD,",
        "LD,X2",
        "OR,X3",
        join + ",",
        "OUT,Y1",
        "MPP,",
        "LD,X4",
        "OR,X5",
        join + ",",
        "OUT,Y2",
        "END,",
      ]);
      expect(validate(p)).toEqual([]);
      const ladder = buildLadder(p);
      expect(ladder.errors).toEqual([]);
      expect(ladder.rungs).toHaveLength(3);
      for (let mask = 0; mask < 64; mask++) {
        const values = Object.fromEntries(
          Array.from({ length: 6 }, (_, n) => ["X" + n, (mask >> n) & 1]),
        );
        const plc = new PLC();
        for (const [name, value] of Object.entries(values))
          plc.set(name, value);
        plc.scan(p);
        const combine = (a: boolean, b: boolean) =>
          join === "ANB" ? a && b : a || b;
        const expected = [
          !!values.X0 && !!values.X1,
          combine(!!values.X0, !!(values.X2 || values.X3)),
          combine(!!values.X0, !!(values.X4 || values.X5)),
        ];
        for (let n = 0; n < expected.length; n++) {
          expect(plc.read("Y" + n)).toBe(Number(expected[n]));
          expect(evaluate(ladder.rungs[n].condition, values)).toBe(expected[n]);
        }
      }
    },
  );
});
