import { describe, it, expect } from "vitest";
import { PLC, validate } from "../src/core/engine";
import { parseText } from "../src/parser";
import { analyze } from "../src/analyzer";
import { buildLadder } from "../src/core/ladder";
const program = (...lines: string[]) =>
  parseText(
    "step,instruction,operand,comment\n" +
      lines.map((line, n) => `${n},${line},`).join("\n"),
  );
describe("common 16bit instructions", () => {
  it.each([
    ["+", 65535, 2, 1],
    ["-", 0, 1, 65535],
  ])("%s wraps to a word", (op, a, b, result) => {
    const p = program("LD,X0", `${op},D0 D1 D2`, "END,"),
      plc = new PLC();
    plc.set("D0", a);
    plc.set("D1", b);
    plc.set("D2", 77);
    plc.scan(p);
    expect(plc.read("D2")).toBe(77);
    plc.set("X0", 1);
    plc.scan(p);
    expect(plc.read("D2")).toBe(result);
  });
  it.each([
    [-7, 3, -2, -1],
    [7, -3, -2, 1],
    [-32768, -1, -32768, 0],
  ])("division %s / %s has signed quotient and remainder", (a, b, q, r) => {
    const plc = new PLC();
    plc.set("D0", a);
    plc.set("D1", b);
    plc.scan(program("LD,SM400", "/,D0 D1 D0", "END,"));
    expect(plc.read("D0")).toBe(q & 65535);
    expect(plc.read("D1")).toBe(r & 65535);
  });
  it("rolls back an entire scan on zero division and allows a disabled divide", () => {
    const plc = new PLC(),
      p = program("LD,X0", "MOV,K9 D0", "/,K5 D1 D2", "END,");
    plc.scan(p);
    plc.set("X0", 1);
    const before = { ...plc.memory };
    expect(() => plc.scan(p)).toThrow("ゼロ除算");
    expect(plc.memory).toEqual(before);
  });
  it("INC/DEC run every enabled scan and wrap", () => {
    const plc = new PLC(),
      p = program("LD,X0", "INC,D0", "DEC,D1", "END,");
    plc.set("X0", 1);
    plc.scan(p);
    plc.scan(p);
    expect(plc.read("D0")).toBe(2);
    expect(plc.read("D1")).toBe(65534);
    plc.set("X0", 0);
    plc.scan(p);
    expect(plc.read("D0")).toBe(2);
  });
  it("BIN converts four valid BCD digits and rejects invalid nibbles atomically", () => {
    const plc = new PLC(),
      p = program("LD,SM400", "MOV,K1 D2", "BIN,D0 D1", "END,");
    plc.set("D0", 0x9876);
    plc.scan(p);
    expect(plc.read("D1")).toBe(9876);
    plc.set("D0", 0x1a00);
    const before = { ...plc.memory };
    expect(() => plc.scan(p)).toThrow("BCD");
    expect(plc.memory).toEqual(before);
  });
  it("CMP writes greater/equal/less to three bits and holds while disabled", () => {
    const plc = new PLC(),
      p = program("LD,X0", "CMP,D0 K0 M10", "END,");
    plc.set("X0", 1);
    for (const [n, bits] of [
      [-1, [0, 0, 1]],
      [0, [0, 1, 0]],
      [1, [1, 0, 0]],
    ] as const) {
      plc.set("D0", n);
      plc.scan(p);
      expect([10, 11, 12].map((n) => plc.read("M" + n))).toEqual(bits);
    }
    plc.set("X0", 0);
    plc.set("D0", 0);
    plc.scan(p);
    expect(plc.read("M10")).toBe(1);
  });
  it("MOVP only transfers on a new condition edge", () => {
    const plc = new PLC(),
      p = program("LD,X0", "MOVP,D0 D1", "END,");
    plc.set("D0", 5);
    plc.set("X0", 1);
    plc.scan(p);
    plc.set("D0", 9);
    plc.scan(p);
    expect(plc.read("D1")).toBe(5);
    plc.set("X0", 0);
    plc.scan(p);
    plc.set("X0", 1);
    plc.scan(p);
    expect(plc.read("D1")).toBe(9);
  });
  it.each(["LDP", "LDF", "ANDP", "ANDF", "ORP", "ORF"])(
    "%s samples both edges across multiple scans",
    (op) => {
      const plc = new PLC(),
        p = program(
          ...(op.startsWith("AND")
            ? ["LD,SM400"]
            : op.startsWith("OR")
              ? ["LDI,SM400"]
              : []),
          `${op},X0`,
          "OUT,Y0",
          "END,",
        );
      const actual = [0, 1, 1, 0, 0, 1].map((n) => {
        plc.set("X0", n);
        plc.scan(p);
        return plc.read("Y0");
      });
      expect(actual).toEqual(
        op.endsWith("F") ? [0, 0, 0, 1, 0, 0] : [0, 1, 0, 0, 0, 1],
      );
      expect(buildLadder(p).errors).toEqual([]);
    },
  );
  it.each(["PLS", "PLF"])(
    "%s output is one scan and resets its history on memory reset",
    (op) => {
      const plc = new PLC(),
        p = program("LD,X0", `${op},M0`, "END,");
      expect(
        [0, 1, 1, 0, 0].map((n) => {
          plc.set("X0", n);
          plc.scan(p);
          return plc.read("M0");
        }),
      ).toEqual(op === "PLS" ? [0, 1, 0, 0, 0] : [0, 0, 0, 1, 0]);
      plc.reset();
      plc.scan(p);
      expect(plc.read("M0")).toBe(0);
    },
  );
  it("pulse contact history advances while an upstream AND is false", () => {
    const plc = new PLC(),
      p = program("LD,X0", "ANDP,X1", "OUT,Y0", "END,");
    plc.set("X1", 1);
    plc.scan(p);
    plc.set("X0", 1);
    plc.scan(p);
    expect(plc.read("Y0")).toBe(0);
  });
  it("runtime errors roll back pulse history as well as memory", () => {
    const plc = new PLC(),
      p = program("LD,X0", "MOVP,K5 D1", "BIN,D0 D2", "END,");
    plc.set("X0", 1);
    plc.set("D0", 0xaaaa);
    expect(() => plc.scan(p)).toThrow();
    plc.set("D0", 0x12);
    plc.scan(p);
    expect(plc.read("D1")).toBe(5);
    expect(plc.read("D2")).toBe(12);
  });
  it.each([
    "MOVP,K1 X0",
    "BIN,K1 X0",
    "INC,X0",
    "/,K1 K2 M0",
    "CMP,K0 K1 X0",
    "LDF,D0",
    "PLF,X0",
    "+,K1 D0",
  ])("rejects invalid operands: %s", (line) => {
    expect(validate(program("LD,X0", line, "END,")).length).toBeGreaterThan(0);
  });
  it("analysis includes both division words, three CMP bits and read/write increments", () => {
    const p = program(
        "LD,X0",
        "/,D0 K2 D10",
        "CMP,D0 K1 M10",
        "INC,D20",
        "END,",
      ),
      a = analyze(p);
    expect(a.devices.get("D11")?.[0].access).toBe("write");
    expect(a.devices.get("M12")?.[0].access).toBe("write");
    expect(a.devices.get("D20")?.[0].access).toBe("read/write");
    expect(a.ranges.map((r) => r.count)).toEqual([2, 3]);
    expect(buildLadder(p).rungs).toHaveLength(3);
  });
});
