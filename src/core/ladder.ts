import {
  loadInstructions,
  andInstructions,
  orInstructions,
  type Instruction,
  type Program,
} from "./model";
import { validate } from "./engine";
import { comparison } from "./operands";
export type Logic =
  | { kind: "contact"; instruction: Instruction }
  | { kind: "and"; left: Logic; right: Logic }
  | { kind: "or"; left: Logic; right: Logic };
export interface Rung {
  condition: Logic;
  output: Instruction;
}
export function buildLadder(program: Program): {
  rungs: Rung[];
  errors: string[];
} {
  const errors = validate(program);
  if (errors.length) return { rungs: [], errors };
  let current: Logic | null = null,
    outputSeen = false;
  const blocks: Logic[] = [],
    branches: Logic[] = [],
    rungs: Rung[] = [];
  const join = (kind: "and" | "or", a: Logic, b: Logic): Logic => ({
    kind,
    left: a,
    right: b,
  });
  for (const instruction of program.instructions) {
    const o = instruction.opcode,
      cmp = comparison.exec(o),
      leaf: Logic = { kind: "contact", instruction };
    if (loadInstructions.includes(o) || cmp?.[1] === "LD") {
      if (current && !outputSeen) blocks.push(current);
      current = leaf;
      outputSeen = false;
    } else if (andInstructions.includes(o) || cmp?.[1] === "AND")
      current = join("and", current!, leaf);
    else if (orInstructions.includes(o) || cmp?.[1] === "OR")
      current = join("or", current!, leaf);
    else if (o === "ANB" || o === "ORB")
      current = join(o === "ANB" ? "and" : "or", blocks.pop()!, current!);
    else if (o === "MPS") branches.push(current!);
    else if (o === "MRD" || o === "MPP") {
      current = o === "MRD" ? branches.at(-1)! : branches.pop()!;
      outputSeen = false;
    } else if (o === "END") break;
    else {
      rungs.push({ condition: current!, output: instruction });
      outputSeen = true;
    }
  }
  return { rungs, errors };
}
