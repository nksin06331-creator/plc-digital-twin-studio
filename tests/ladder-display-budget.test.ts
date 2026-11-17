import { it, expect } from "vitest";
import { parseText } from "../src/parser";
import { validate, PLC } from "../src/core/engine";
import { buildLadder } from "../src/core/ladder";
import {
  buildDisplayLadder,
  MAX_LADDER_CONTACTS,
  MAX_LADDER_DEPTH,
} from "../src/components/ladderDisplay";
const program = (lines: string[]) =>
  parseText(
    "step,instruction,operand,comment\n" +
      lines.map((s, n) => `${n},${s},`).join("\n"),
  );
it("blocks repeated output expansion even when its individual condition is shallow", () => {
  const p = program([
    "LD,X0",
    ...Array.from({ length: 49 }, () => "AND,X1"),
    ...Array.from({ length: 499 }, (_, n) => `OUT,M${n}`),
    "END,",
  ]);
  expect(validate(p)).toEqual([]);
  expect(buildLadder(p).rungs).toHaveLength(499);
  expect(buildDisplayLadder(p).rungs).toEqual([]);
  expect(buildDisplayLadder(p).errors.join()).toContain("展開後接点数");
  const plc = new PLC();
  expect(() => plc.scan(p)).not.toThrow();
});
it("accepts the exact contact budget and rejects one additional expansion", () => {
  const conditions = ["LD,X0", ...Array.from({ length: 49 }, () => "AND,X1")];
  const outputs = Array.from(
    { length: MAX_LADDER_CONTACTS / 50 },
    (_, n) => `OUT,M${n}`,
  );
  expect(
    buildDisplayLadder(program([...conditions, ...outputs, "END,"])).errors,
  ).toEqual([]);
  expect(
    buildDisplayLadder(
      program([...conditions, ...outputs, `OUT,M999`, "END,"]),
    ).errors.join(),
  ).toContain("展開後接点数");
});
it("limits nesting independently of expanded contacts", () => {
  const lines = [
    "LD,X0",
    ...Array.from({ length: MAX_LADDER_DEPTH - 1 }, () => "AND,X1"),
  ];
  expect(
    buildDisplayLadder(program([...lines, "OUT,Y0", "END,"])).errors,
  ).toEqual([]);
  expect(
    buildDisplayLadder(
      program([...lines, "AND,X1", "OUT,Y0", "END,"]),
    ).errors.join(),
  ).toContain("条件階層");
});
it("preserves instruction limits and invalid-program diagnostics", () => {
  expect(
    buildDisplayLadder(
      program([
        ...Array.from({ length: 501 }, () => ["LD,X0", "OUT,Y0"]).flat(),
        "END,",
      ]),
    ).errors.join(),
  ).toContain("1000命令");
  expect(
    buildDisplayLadder(program(["LD,X0", "UNKNOWN,Y0", "END,"])).errors.join(),
  ).toContain("未対応命令");
});
