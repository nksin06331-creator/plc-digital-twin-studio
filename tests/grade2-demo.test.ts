import { describe, it, expect } from "vitest";
import { PLC, validate } from "../src/core/engine";
import { ExamPlant, defaultWiring } from "../src/core/plant/exam";
import { parseText } from "../src/parser";
import { buildLadder } from "../src/core/ladder";
import csv from "../samples/grade2_comprehensive.csv?raw";
const program = parseText(csv),
  w = defaultWiring();
function rig(code = 7, dsw = 2) {
  const plc = new PLC(),
    plant = new ExamPlant();
  plant.palletCode = code;
  plant.digitalSwitch = dsw;
  plant.travelMs = 1000;
  const tick = (n = 1) => {
    for (let i = 0; i < n; i++) {
      plant.advance(plc.memory, w, 100);
      plc.inputs = plant.inputImage(w);
      plc.scan(program, 100);
      expect(!!plc.read("Y30") && !!plc.read("Y31")).toBe(false);
    }
  };
  const until = (condition: () => boolean, max = 200) => {
    for (let i = 0; i < max; i++) {
      if (condition()) return;
      tick();
    }
    throw Error(
      "工程が指定状態へ到達しません: " +
        JSON.stringify({
          position: plant.position,
          M10: plc.read("M10"),
          M11: plc.read("M11"),
          M12: plc.read("M12"),
          alarm: plc.read("M900"),
        }),
    );
  };
  const start = () => {
    plant.selectors.SS0 = true;
    plant.pressed.PB1 = true;
    tick();
    plant.pressed.PB1 = false;
  };
  return { plc, plant, tick, until, start };
}
describe("grade 2 comprehensive practice circuit", () => {
  it("parses and creates equivalent ladder without unsupported instructions", () => {
    expect(program.diagnostics).toEqual([]);
    expect(validate(program)).toEqual([]);
    expect(buildLadder(program).errors).toEqual([]);
    expect(program.instructions.length).toBeGreaterThan(100);
  });
  it.each([1, 2, 3, 4, 5, 6, 7])(
    "reads pallet code %i, displays it, displays product, counts exactly one cycle",
    (code) => {
      const r = rig(code, 2);
      r.start();
      r.until(() => !!r.plc.read("M11"));
      expect(r.plc.read("D10")).toBe(code);
      expect(r.plant.display(r.plc.memory, w)).toBe(
        String(code).padStart(2, "0"),
      );
      expect(r.plc.read("D1")).toBe(20);
      r.until(() => !!r.plc.read("M12"));
      expect(r.plc.read("D12")).toBe(code * 2);
      expect(r.plant.display(r.plc.memory, w)).toBe(
        String(code * 2).padStart(2, "0"),
      );
      r.until(() => r.plc.read("D20") === 1);
      expect(r.plant.position).toBe(1);
      expect(r.plc.read("M10") | r.plc.read("M11") | r.plc.read("M12")).toBe(0);
      expect(r.plant.display(r.plc.memory, w)).toBe("01");
      r.tick(15);
      expect(r.plc.read("D20")).toBe(1);
    },
  );
  it("latches DSW for a complete round trip despite changes at the panel", () => {
    const r = rig(7, 1);
    r.start();
    r.until(() => !!r.plc.read("M11"));
    r.plant.digitalSwitch = 9;
    r.tick(8);
    expect(r.plc.read("M11")).toBe(1);
    expect(r.plc.read("D30")).toBe(9);
    expect(r.plc.read("D0")).toBe(1);
    expect(r.plc.read("D1")).toBe(10);
    r.tick();
    expect(r.plc.read("M12")).toBe(1);
    expect(r.plant.display(r.plc.memory, w)).toBe("07");
  });
  it("does not read PB1 as a fourth pallet bit when the start button remains held", () => {
    const r = rig(5, 2);
    r.plant.selectors.SS0 = true;
    r.plant.pressed.PB1 = true;
    r.tick();
    r.until(() => !!r.plc.read("M11"));
    expect(r.plc.read("D10")).toBe(5);
    expect(r.plc.read("X15")).toBe(1);
    r.plant.palletCode = 2;
    r.tick();
    expect(r.plc.read("D10")).toBe(5);
  });
  it("covers maximum DSW/product and counter rollover", () => {
    const r = rig(7, 9);
    r.plc.set("D20", 99);
    r.start();
    r.until(() => !!r.plc.read("M12"));
    expect(r.plc.read("D12")).toBe(63);
    expect(r.plant.display(r.plc.memory, w)).toBe("63");
    r.until(() => r.plant.position === 1);
    expect(r.plc.read("D20")).toBe(0);
    expect(r.plant.display(r.plc.memory, w)).toBe("00");
  });
  it("repeats with SS1 and samples a new DSW at the next trip, then stops when SS1 turns off", () => {
    const r = rig();
    r.plant.selectors.SS1 = true;
    r.start();
    r.until(() => !!r.plc.read("M12"));
    r.plant.digitalSwitch = 3;
    r.until(() => r.plc.read("D20") === 1);
    expect(r.plc.read("M10")).toBe(1);
    expect(r.plc.read("D0")).toBe(3);
    r.plant.selectors.SS1 = false;
    r.until(() => r.plc.read("D20") === 2);
    expect(r.plc.read("M10") | r.plc.read("M11") | r.plc.read("M12")).toBe(0);
    r.tick(5);
    expect(r.plc.read("D20")).toBe(2);
  });
  it("implements manual first-pressed priority in either direction and stops at limits", () => {
    for (const first of ["PB2", "PB3"] as const) {
      const r = rig();
      r.plant.position = 0.5;
      r.plant.pressed[first] = true;
      r.tick();
      const second = first === "PB2" ? "PB3" : "PB2";
      r.plant.pressed[second] = true;
      r.tick();
      expect(r.plc.read(first === "PB2" ? "Y30" : "Y31")).toBe(1);
      expect(r.plc.read(first === "PB2" ? "Y31" : "Y30")).toBe(0);
      r.plant.pressed[first] = false;
      r.tick();
      expect(r.plc.read("Y30") | r.plc.read("Y31")).toBe(0);
      r.tick();
      expect(r.plc.read(second === "PB2" ? "Y30" : "Y31")).toBe(1);
      r.tick(15);
      expect(r.plc.read("Y30") | r.plc.read("Y31")).toBe(0);
    }
  });
  it("rejects automatic start away from right end without moving", () => {
    const r = rig();
    r.plant.position = 0.5;
    r.start();
    r.tick(10);
    expect(r.plant.position).toBe(0.5);
    expect(r.plc.read("M9")).toBe(0);
  });
  it("latches emergency fault, blinks PL4, and requires a new manual reset after safe release", () => {
    const r = rig();
    r.start();
    r.tick(2);
    r.plant.pressed.PB5 = true;
    r.tick();
    expect(r.plc.read("M900")).toBe(1);
    expect(r.plant.display(r.plc.memory, w)).toBe("99");
    const stopped = r.plant.position;
    r.plant.pressed.PB4 = true;
    r.tick();
    r.plant.pressed.PB5 = false;
    r.plant.selectors.SS0 = false;
    const lamp = new Set<number>();
    for (let i = 0; i < 20; i++) {
      r.tick();
      lamp.add(r.plc.read("Y35"));
    }
    expect(r.plant.position).toBe(stopped);
    expect(lamp).toEqual(new Set([0, 1]));
    expect(r.plc.read("M900")).toBe(1);
    r.plant.pressed.PB4 = false;
    r.tick();
    r.plant.pressed.PB4 = true;
    r.tick();
    expect(r.plc.read("M900")).toBe(0);
    expect(r.plc.read("D20")).toBe(0);
    expect(r.plc.read("Y30") | r.plc.read("Y31")).toBe(0);
  });
  it("switching to manual during auto stops and latches a fault", () => {
    const r = rig();
    r.start();
    r.tick();
    r.plant.selectors.SS0 = false;
    r.tick();
    expect(r.plc.read("M900")).toBe(1);
    expect(r.plc.read("Y30") | r.plc.read("Y31")).toBe(0);
  });
  it("rejects DSW zero at start and pallet zero at left without starting return", () => {
    const zeroDsw = rig(7, 0);
    zeroDsw.start();
    expect(zeroDsw.plc.read("M900")).toBe(1);
    expect(zeroDsw.plant.position).toBe(1);
    const zeroPallet = rig(0, 1);
    zeroPallet.start();
    zeroPallet.until(() => !!zeroPallet.plc.read("M900"));
    expect(zeroPallet.plant.position).toBe(0);
    expect(zeroPallet.plc.read("Y31")).toBe(0);
    expect(zeroPallet.plant.display(zeroPallet.plc.memory, w)).toBe("99");
  });
  it("manual PB1 displays count, PB4 requires all motion buttons released to clear it", () => {
    const r = rig();
    r.plc.set("D20", 12);
    r.plant.pressed.PB1 = true;
    r.tick();
    expect(r.plant.display(r.plc.memory, w)).toBe("12");
    r.plant.pressed.PB4 = true;
    r.tick();
    expect(r.plc.read("D20")).toBe(12);
    r.plant.pressed.PB1 = false;
    r.tick();
    expect(r.plc.read("D20")).toBe(12);
    r.plant.pressed.PB4 = false;
    r.tick();
    r.plant.pressed.PB4 = true;
    r.tick();
    expect(r.plc.read("D20")).toBe(0);
  });
});
