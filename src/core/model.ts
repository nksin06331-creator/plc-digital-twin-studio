export interface Instruction {
  step: number;
  opcode: string;
  operands: string[];
  sourceLine: number;
  comment: string;
  operandSourceLines?: number[];
}
export interface Diagnostic {
  severity: "error" | "warning";
  message: string;
  sourceLine?: number;
}
export interface Program {
  instructions: Instruction[];
  diagnostics: Diagnostic[];
  preview: string[][];
  encoding: string;
  adapter: string | null;
}
export const loadInstructions = ["LD", "LDI", "LDP", "LDF"];
export const andInstructions = ["AND", "ANI", "ANDP", "ANDF"];
export const orInstructions = ["OR", "ORI", "ORP", "ORF"];
export const outputInstructions = [
  "OUT",
  "SET",
  "RST",
  "MOV",
  "MOVP",
  "BCD",
  "BIN",
  "*",
  "+",
  "-",
  "/",
  "INCP",
  "INC",
  "DEC",
  "PLS",
  "PLF",
  "CMP",
];
export const supported = new Set([
  ...loadInstructions,
  ...andInstructions,
  ...orInstructions,
  ...outputInstructions,
  "END",
  "ANB",
  "ORB",
  "MPS",
  "MRD",
  "MPP",
  "LD=",
  "LD>",
  "LD>=",
  "LD<",
  "LD<=",
  "LD<>",
  "AND=",
  "AND>",
  "AND>=",
  "AND<",
  "AND<=",
  "AND<>",
  "OR=",
  "OR>",
  "OR>=",
  "OR<",
  "OR<=",
  "OR<>",
]);
export function device(value: string) {
  const m = /^(SM|X|Y|M|D|T|C)([0-9A-F]+)$/i.exec(value);
  if (!m) return null;
  const kind = m[1].toUpperCase();
  if (!["X", "Y"].includes(kind) && !/^\d+$/.test(m[2])) return null;
  if (
    !Number.isSafeInteger(parseInt(m[2], ["X", "Y"].includes(kind) ? 16 : 10))
  )
    return null;
  return {
    kind,
    address: parseInt(m[2], ["X", "Y"].includes(kind) ? 16 : 10),
    name:
      kind +
      parseInt(m[2], ["X", "Y"].includes(kind) ? 16 : 10)
        .toString(["X", "Y"].includes(kind) ? 16 : 10)
        .toUpperCase(),
  };
}
export const unsigned16 = (n: number) => ((n % 65536) + 65536) % 65536;
export const signed16 = (n: number) =>
  unsigned16(n) >= 32768 ? unsigned16(n) - 65536 : unsigned16(n);
