import { device } from "../model";
import { offset } from "../operands";
import type { Memory } from "../engine";
export const inputPoints = [
  ["LS1", "コンベア右端"],
  ["LS2", "コンベア左端"],
  ["LS3", "番号 2⁰"],
  ["LS4", "番号 2¹"],
  ["LS5", "番号 2²"],
  ["PB1", "押ボタン1"],
  ["PB2", "押ボタン2"],
  ["PB3", "押ボタン3"],
  ["PB4", "押ボタン4"],
  ["PB5", "非常停止 b接点"],
  ["SS1", "連続運転"],
  ["SS0", "手動／自動"],
  ["DSW1", "DSW 1"],
  ["DSW2", "DSW 2"],
  ["DSW4", "DSW 4"],
  ["DSW8", "DSW 8"],
] as const;
export const outputPoints = [
  ["RY1", "左行"],
  ["RY2", "右行"],
  ["PL1", "表示灯1"],
  ["PL2", "表示灯2"],
  ["PL3", "表示灯3"],
  ["PL4", "表示灯4"],
  ["DPL1_1", "表示1 1"],
  ["DPL1_2", "表示1 2"],
  ["DPL1_4", "表示1 4"],
  ["DPL1_8", "表示1 8"],
  ["DPL2_1", "表示2 1"],
  ["DPL2_2", "表示2 2"],
  ["DPL2_4", "表示2 4"],
  ["DPL2_8", "表示2 8"],
] as const;
export type InputPoint = (typeof inputPoints)[number][0];
export type OutputPoint = (typeof outputPoints)[number][0];
export type PushButton = "PB1" | "PB2" | "PB3" | "PB4" | "PB5";
export interface ExamWiring {
  inputs: Record<InputPoint, string>;
  outputs: Record<OutputPoint, string>;
}
export function defaultWiring(): ExamWiring {
  return {
    inputs: Object.fromEntries(
      inputPoints.map(([key], i) => [key, offset("X10", i)]),
    ) as ExamWiring["inputs"],
    outputs: Object.fromEntries(
      outputPoints.map(([key], i) => [key, offset("Y30", i)]),
    ) as ExamWiring["outputs"],
  };
}
export function validateWiring(value: unknown): string[] {
  if (!value || typeof value !== "object")
    return ["割付はオブジェクトで指定してください"];
  const w = value as ExamWiring;
  const errors: string[] = [];
  for (const [table, points, kind] of [
    ["inputs", inputPoints, "X"],
    ["outputs", outputPoints, "Y"],
  ] as const) {
    const names = new Set<string>();
    for (const [key] of points) {
      const s = w[table]?.[key as keyof (typeof w)[typeof table]];
      if (typeof s !== "string" || device(s)?.kind !== kind) {
        errors.push(`${key}: ${kind}デバイスを指定してください`);
        continue;
      }
      const name = device(s)!.name;
      if (names.has(name)) errors.push(`${key}: ${name}が重複しています`);
      names.add(name);
    }
  }
  return errors;
}
export function normalizeWiring(value: unknown): ExamWiring {
  const errors = validateWiring(value);
  if (errors.length) throw Error(errors.join("\n"));
  const w = value as ExamWiring;
  return {
    inputs: Object.fromEntries(
      inputPoints.map(([k]) => [k, device(w.inputs[k])!.name]),
    ) as ExamWiring["inputs"],
    outputs: Object.fromEntries(
      outputPoints.map(([k]) => [k, device(w.outputs[k])!.name]),
    ) as ExamWiring["outputs"],
  };
}
export function parseWiring(text: string): ExamWiring {
  if (text.length > 16384) throw Error("割付ファイルは16 KiBまでです");
  return normalizeWiring(JSON.parse(text));
}
export class ExamPlant {
  power = true;
  position = 1;
  palletCode = 7;
  digitalSwitch = 0;
  travelMs = 4000;
  pressed: Record<PushButton, boolean> = {
    PB1: false,
    PB2: false,
    PB3: false,
    PB4: false,
    PB5: false,
  };
  selectors = { SS0: false, SS1: false };
  reset() {
    this.power = true;
    this.position = 1;
    this.palletCode = 7;
    this.digitalSwitch = 0;
    this.travelMs = 4000;
    this.releaseButtons();
    this.selectors = { SS0: false, SS1: false };
  }
  releaseButtons() {
    for (const key of Object.keys(this.pressed) as PushButton[])
      this.pressed[key] = false;
  }
  sensors() {
    const left = this.position <= 0.001,
      right = this.position >= 0.999;
    return {
      LS1: right,
      LS2: left,
      LS3: left && !!(this.palletCode & 1),
      LS4: left && !!(this.palletCode & 2),
      LS5: left && !!(this.palletCode & 4),
    };
  }
  signals(): Record<InputPoint, boolean> {
    return {
      ...this.sensors(),
      ...this.pressed,
      PB5: !this.pressed.PB5,
      ...this.selectors,
      DSW1: !!(this.digitalSwitch & 1),
      DSW2: !!(this.digitalSwitch & 2),
      DSW4: !!(this.digitalSwitch & 4),
      DSW8: !!(this.digitalSwitch & 8),
    };
  }
  inputImage(w: ExamWiring): Memory {
    const errors = validateWiring(w);
    if (errors.length) throw Error(errors.join("\n"));
    const signals = this.signals();
    return Object.fromEntries(
      inputPoints.map(([k]) => [
        device(w.inputs[k])!.name,
        this.power && signals[k] ? 1 : 0,
      ]),
    );
  }
  outputs(memory: Memory, w: ExamWiring): Record<OutputPoint, boolean> {
    return Object.fromEntries(
      outputPoints.map(([k]) => [
        k,
        this.power && !!memory[device(w.outputs[k])?.name ?? ""],
      ]),
    ) as Record<OutputPoint, boolean>;
  }
  drive(memory: Memory, w: ExamWiring) {
    const outputs = this.outputs(memory, w),
      conflict = outputs.RY1 && outputs.RY2;
    return {
      left: outputs.RY1 && !conflict,
      right: outputs.RY2 && !conflict,
      conflict,
    };
  }
  advance(memory: Memory, w: ExamWiring, elapsedMs: number) {
    if (
      !Number.isFinite(elapsedMs) ||
      elapsedMs < 0 ||
      elapsedMs > 10000 ||
      !Number.isFinite(this.travelMs) ||
      this.travelMs < 500
    )
      throw Error("搬送時間が不正です");
    const drive = this.drive(memory, w);
    const direction = drive.left ? -1 : drive.right ? 1 : 0;
    const next = Math.max(
      0,
      Math.min(1, this.position + (direction * elapsedMs) / this.travelMs),
    );
    this.position = next <= 0.001 ? 0 : next >= 0.999 ? 1 : next;
  }
  display(memory: Memory, w: ExamWiring) {
    const out = this.outputs(memory, w);
    const digit = (name: "DPL1" | "DPL2") => {
      const n = [1, 2, 4, 8].reduce(
        (v, bit) => v + (out[`${name}_${bit}` as OutputPoint] ? bit : 0),
        0,
      );
      return n > 9 ? "—" : String(n);
    };
    return this.power ? digit("DPL2") + digit("DPL1") : "  ";
  }
}
