import { supported, type Program } from "../core/model";
export const MAX_BYTES = 2 * 1024 * 1024;
export const MAX_ROWS = 20000;
// Explicit demonstration adapter; never infer a GX Works2 schema from column positions.
export const sampleHeader = ["step", "instruction", "operand", "comment"];
export function parseCsv(
  text: string,
  delimiter = ",",
): { rows: string[][]; lines: number[] } {
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
    } else if (c === delimiter) {
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
    const clean = text.replace(/^\uFEFF/, "");
    const isGx = clean
      .split(/\r?\n/)
      .slice(0, 4)
      .some((line) => line.startsWith('"ステップ番号"\t"行間ステートメント"'));
    const { rows, lines } = parseCsv(clean, isGx ? "\t" : ",");
    result.preview = rows.slice(0, 8);
    if (!rows.length) throw Error("空ファイルです");
    if (isGx) {
      const header = [
        "ステップ番号",
        "行間ステートメント",
        "命令",
        "I/O(デバイス)",
        "空欄",
        "PIステートメント",
        "ノート",
      ];
      const index = rows.findIndex(
        (r) => JSON.stringify(r) === JSON.stringify(header),
      );
      if (index < 0 || index > 3) throw Error("未知のGX Works2列構成です");
      result.adapter = "gx-works2-list-ja-v1";
      let previous = -1;
      for (let n = index + 1; n < rows.length; n++) {
        const r = rows[n],
          sourceLine = lines[n];
        if (r.every((v) => !v.trim())) continue;
        if (r.length !== 7 || r[4].trim()) {
          result.diagnostics.push({
            severity: "error",
            sourceLine,
            message: "GX行の列数または空欄列が不正です",
          });
          continue;
        }
        const comment = [r[1], r[5], r[6]].filter(Boolean).join(" / ");
        if (!r[0] && !r[2] && r[3].trim()) {
          const last = result.instructions.at(-1);
          if (!last)
            result.diagnostics.push({
              severity: "error",
              sourceLine,
              message: "先行命令のないオペランド継続行",
            });
          else {
            last.operands.push(r[3].trim().toUpperCase());
            last.operandSourceLines?.push(sourceLine);
            if (comment) last.comment += (last.comment ? " / " : "") + comment;
          }
          continue;
        }
        if (!r[0] && !r[2] && !r[3] && comment) {
          result.diagnostics.push({
            severity: "warning",
            sourceLine,
            message: "ステートメント行: " + comment,
          });
          continue;
        }
        if (
          !/^\d+$/.test(r[0]) ||
          !Number.isSafeInteger(Number(r[0])) ||
          !r[2].trim()
        ) {
          result.diagnostics.push({
            severity: "error",
            sourceLine,
            message: "GX行のステップまたは命令が不正です",
          });
          continue;
        }
        const step = Number(r[0]),
          opcode = r[2].trim().toUpperCase();
        if (step <= previous)
          result.diagnostics.push({
            severity: "error",
            sourceLine,
            message: "ステップ番号が重複または逆順です",
          });
        previous = step;
        result.instructions.push({
          step,
          opcode,
          operands: r[3].trim() ? [r[3].trim().toUpperCase()] : [],
          sourceLine,
          operandSourceLines: r[3].trim() ? [sourceLine] : [],
          comment,
        });
        if (!supported.has(opcode))
          result.diagnostics.push({
            severity: "warning",
            sourceLine,
            message: "未対応命令: " + opcode,
          });
      }
      if (!result.instructions.length) throw Error("命令がありません");
      return result;
    }
    if (JSON.stringify(rows[0]) !== JSON.stringify(sampleHeader))
      throw Error(
        "未知の列構成です。検証済みGX Works2ヘッダーまたはサンプル用ヘッダーと一致しません",
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
  choice: "auto" | "utf-8" | "shift_jis" | "utf-16le" | "utf-16be" = "auto",
): Program {
  if (bytes.length > MAX_BYTES)
    return {
      ...parseText(""),
      diagnostics: [
        { severity: "error", message: "入力サイズ上限は2 MiBです" },
      ],
    };
  let encoding =
    choice === "auto"
      ? bytes[0] === 0xff && bytes[1] === 0xfe
        ? "utf-16le"
        : bytes[0] === 0xfe && bytes[1] === 0xff
          ? "utf-16be"
          : "utf-8"
      : choice;
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
