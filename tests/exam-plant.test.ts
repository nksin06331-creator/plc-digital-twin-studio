import { describe, it, expect } from "vitest";
import {
  ExamPlant,
  defaultWiring,
  validateWiring,
  parseWiring,
  inputPoints,
  outputPoints,
} from "../src/core/plant/exam";
import { PLC } from "../src/core/engine";
import { parseText } from "../src/parser";
import demo from "../samples/exam_conveyor.csv?raw";
const w = defaultWiring();
const program = parseText(demo);
const tick = (plant: ExamPlant, plc: PLC) => {
  plant.advance(plc.memory, w, 100);
  plc.inputs = plant.inputImage(w);
  plc.scan(program, 100);
};
describe("physical grade 2 panel model", () => {
  it("has the documented 16 inputs, 14 outputs and non-assumed PLC assignment", () => {
    expect(inputPoints).toHaveLength(16);
    expect(outputPoints).toHaveLength(14);
    expect(w.inputs.LS1).toBe("X10");
    expect(w.inputs.PB5).toBe("X19");
    expect(w.inputs.SS0).toBe("X1B");
    expect(w.outputs.DPL2_8).toBe("Y3D");
    expect(validateWiring(w)).toEqual([]);
  });
  it("initializes at right limit, NC emergency contact closed, no pallet detection at right", () => {
    const plant = new ExamPlant();
    expect(plant.inputImage(w)).toMatchObject({
      X10: 1,
      X11: 0,
      X12: 0,
      X13: 0,
      X14: 0,
      X19: 1,
    });
    plant.pressed.PB5 = true;
    expect(plant.inputImage(w).X19).toBe(0);
    plant.releaseButtons();
    expect(plant.inputImage(w).X19).toBe(1);
  });
  it("updates left limit and 3-bit bolt code only at left for all eight pallets", () => {
    const plant = new ExamPlant();
    for (let code = 0; code < 8; code++) {
      plant.palletCode = code;
      plant.position = 0;
      const image = plant.inputImage(w);
      expect(image.X11).toBe(1);
      expect(image.X10).toBe(0);
      expect([image.X12, image.X13, image.X14]).toEqual([
        code & 1,
        (code >> 1) & 1,
        (code >> 2) & 1,
      ]);
      plant.position = 0.5;
      expect(plant.inputImage(w)).toMatchObject({
        X10: 0,
        X11: 0,
        X12: 0,
        X13: 0,
        X14: 0,
      });
    }
  });
  it("moves on relay commands, clamps endpoints, stops on conflict or loss of power", () => {
    const plant = new ExamPlant();
    plant.travelMs = 1000;
    plant.advance({ Y30: 1 }, w, 500);
    expect(plant.position).toBe(0.5);
    plant.advance({ Y30: 1 }, w, 1000);
    expect(plant.position).toBe(0);
    plant.advance({ Y31: 1 }, w, 500);
    expect(plant.position).toBe(0.5);
    plant.advance({ Y30: 1, Y31: 1 }, w, 500);
    expect(plant.position).toBe(0.5);
    expect(plant.drive({ Y30: 1, Y31: 1 }, w).conflict).toBe(true);
    plant.power = false;
    plant.advance({ Y31: 1 }, w, 1000);
    expect(plant.position).toBe(0.5);
    expect(Object.values(plant.inputImage(w)).every((v) => v === 0)).toBe(true);
    expect(Object.values(plant.outputs({ Y32: 1 }, w)).every((v) => !v)).toBe(
      true,
    );
  });
  it("encodes digital switch as 4 bits and decodes both displayed digits", () => {
    const plant = new ExamPlant();
    plant.digitalSwitch = 9;
    expect(plant.inputImage(w)).toMatchObject({
      X1C: 1,
      X1D: 0,
      X1E: 0,
      X1F: 1,
    });
    expect(plant.display({ Y36: 1, Y39: 1, Y3B: 1 }, w)).toBe("29");
    expect(plant.display({ Y37: 1, Y39: 1 }, w)).toBe("0—");
    plant.power = false;
    expect(plant.display({}, w)).toBe("  ");
  });
  it("validates and canonicalizes wiring imports, rejects duplicate aliases and malformed files", () => {
    const original = defaultWiring();
    original.inputs.LS1 = "x0010";
    expect(parseWiring(JSON.stringify(original)).inputs.LS1).toBe("X10");
    original.inputs.LS2 = "X10";
    expect(() => parseWiring(JSON.stringify(original))).toThrow("重複");
    expect(() => parseWiring("{")).toThrow();
    expect(() => parseWiring(" ".repeat(16385))).toThrow("16 KiB");
    expect(validateWiring({ inputs: null }).length).toBeGreaterThan(0);
  });
  it("rejects invalid simulation time and resets the fixture state", () => {
    const plant = new ExamPlant();
    expect(() => plant.advance({}, w, NaN)).toThrow();
    plant.position = 0.4;
    plant.pressed.PB1 = true;
    plant.power = false;
    plant.reset();
    expect(plant.position).toBe(1);
    expect(plant.power).toBe(true);
    expect(plant.pressed.PB1).toBe(false);
  });
});
describe("closed loop PLC + moving panel", () => {
  it("manual PB2 moves left, LS2 stops output, releasing PB stops motion", () => {
    const plant = new ExamPlant(),
      plc = new PLC();
    plant.travelMs = 1000;
    plant.pressed.PB2 = true;
    tick(plant, plc);
    for (let i = 0; i < 5; i++) tick(plant, plc);
    expect(plant.position).toBeCloseTo(0.5);
    expect(plc.read("Y30")).toBe(1);
    plant.pressed.PB2 = false;
    tick(plant, plc);
    const stopped = plant.position;
    tick(plant, plc);
    expect(plant.position).toBe(stopped);
    plant.pressed.PB2 = true;
    for (let i = 0; i < 15; i++) tick(plant, plc);
    expect(plant.position).toBe(0);
    expect(plc.read("X11")).toBe(1);
    expect(plc.read("Y30")).toBe(0);
  });
  it("auto start performs a full left/right cycle and stops at right", () => {
    const plant = new ExamPlant(),
      plc = new PLC();
    plant.travelMs = 1000;
    plant.selectors.SS0 = true;
    plant.pressed.PB1 = true;
    tick(plant, plc);
    plant.pressed.PB1 = false;
    let reachedLeft = false;
    for (let i = 0; i < 35; i++) {
      tick(plant, plc);
      if (plant.position === 0) reachedLeft = true;
    }
    expect(reachedLeft).toBe(true);
    expect(plant.position).toBe(1);
    expect(plc.read("M12")).toBe(0);
    expect(plc.read("Y30")).toBe(0);
    expect(plc.read("Y31")).toBe(0);
  });
  it("continuous selector repeats and PB5 opens the circuit on next scan", () => {
    const plant = new ExamPlant(),
      plc = new PLC();
    plant.travelMs = 1000;
    plant.selectors = { SS0: true, SS1: true };
    plant.pressed.PB1 = true;
    tick(plant, plc);
    plant.pressed.PB1 = false;
    for (let i = 0; i < 28; i++) tick(plant, plc);
    expect(plc.read("M12")).toBe(1);
    plant.pressed.PB5 = true;
    tick(plant, plc);
    expect(plc.read("Y30")).toBe(0);
    expect(plc.read("Y31")).toBe(0);
    expect(plc.read("Y35")).toBe(1);
    const stopped = plant.position;
    for (let i = 0; i < 5; i++) tick(plant, plc);
    expect(plant.position).toBe(stopped);
  });
});
