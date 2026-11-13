import { supported, type Program } from "../core/model";
export const MAX_BYTES = 2 * 1024 * 1024;
export const MAX_ROWS = 20000;
// Explicit demonstration adapter; never infer a GX Works2 schema from column positions.
export const sampleHeader = ["step", "instruction", "operand", "comment"];
export function parseCsv(text: string): { rows: string[][]; lines: number[] } {
  const rows: string[][] = [],
    lines: number[] = [];
  let row: string[] = [],
    field = "",
    quoted = false,
    closed = false,
    line = 1,
    start = 1;
  const cell = () => {
    row.push(field);
    field = "";
    closed = false;
  };
  const record = () => {
    cell();
    rows.push(row);
    lines.push(start);
    row = [];
    if (rows.length > MAX_ROWS) throw Error("行数上限を超えています");
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else {
        field += c;
        if (c === "\n") line++;
      }
      continue;
    }
    if (c === '"') {
      if (field || closed) throw Error("不正な引用符");
      quoted = true;
    } else if (c === ",") {
      cell();
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      record();
      line++;
      start = line;
    } else {
      if (closed) throw Error("引用符の後に不正な文字");
      field += c;
    }
  }
  if (quoted) throw Error("引用符が閉じていません");
  if (field || row.length || closed) record();
  return { rows, lines };
}
export function parseText(text: string, encoding = "UTF-8"): Program {
  const result: Program = {
    instructions: [],
    diagnostics: [],
    preview: [],
    encoding,
    adapter: null,
  };
  try {
    if (new TextEncoder().encode(text).length > MAX_BYTES)
      throw Error("入力サイズ上限は2 MiBです");
    const { rows, lines } = parseCsv(text.replace(/^\uFEFF/, ""));
    result.preview = rows.slice(0, 8);
    if (!rows.length) throw Error("空ファイルです");
    if (JSON.stringify(rows[0]) !== JSON.stringify(sampleHeader))
      throw Error(
        "未知の列構成です。GX Works2実CSVは未検証です。サンプル用ヘッダーと一致しません",
      );
    result.adapter = "sample-v1";
    let previous = -1;
    rows.slice(1).forEach((r, i) => {
      if (r.every((v) => !v.trim())) return;
      const sourceLine = lines[i + 1];
      if (
        r.length !== 4 ||
        !/^\d+$/.test(r[0]) ||
        !Number.isSafeInteger(Number(r[0])) ||
        !r[1].trim()
      ) {
        result.diagnostics.push({
          severity: "error",
          sourceLine,
          message: "解析不能行: 列数・ステップ・命令を確認してください",
        });
        return;
      }
      const step = Number(r[0]);
      if (step <= previous)
        result.diagnostics.push({
          severity: "error",
          sourceLine,
          message: "ステップ番号は昇順かつ重複なしで指定してください",
        });
      previous = step;
      const opcode = r[1].trim().toUpperCase();
      result.instructions.push({
        step,
        opcode,
        operands: r[2].trim().toUpperCase().split(/\s+/).filter(Boolean),
        sourceLine,
        comment: r[3],
      });
      if (!supported.has(opcode))
        result.diagnostics.push({
          severity: "warning",
          sourceLine,
          message: `未対応命令: ${opcode}`,
        });
    });
    if (!result.instructions.length) throw Error("命令がありません");
  } catch (e) {
    result.diagnostics.push({
      severity: "error",
      message: (e as Error).message,
    });
  }
  return result;
}
export function parseBytes(
  bytes: Uint8Array,
  choice: "auto" | "utf-8" | "shift_jis" = "auto",
): Program {
  if (bytes.length > MAX_BYTES)
    return {
      ...parseText(""),
      diagnostics: [
        { severity: "error", message: "入力サイズ上限は2 MiBです" },
      ],
    };
  let encoding = choice === "auto" ? "utf-8" : choice;
  let text: string;
  try {
    text = new TextDecoder(encoding, { fatal: true }).decode(bytes);
  } catch {
    if (choice !== "auto")
      return {
        ...parseText(""),
        diagnostics: [
          { severity: "error", message: "指定文字コードでデコードできません" },
        ],
      };
    encoding = "shift_jis";
    try {
      text = new TextDecoder(encoding, { fatal: true }).decode(bytes);
    } catch {
      return {
        ...parseText(""),
        diagnostics: [
          { severity: "error", message: "文字コードを解釈できません" },
        ],
      };
    }
  }
  const p = parseText(text, encoding);
  if (choice === "auto" && encoding === "shift_jis")
    p.diagnostics.unshift({
      severity: "warning",
      message:
        "UTF-8として不正なためShift_JIS/CP932互換で読込。自動判定は推定です",
    });
  return p;
}
