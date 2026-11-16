import {
  useLayoutEffect,
  useRef,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import { buildLadder, type Logic } from "../core/ladder";
import type { Instruction, Program } from "../core/model";
import type { ScanTrace } from "../core/engine";
function Symbol({
  instruction,
  output = false,
}: {
  instruction: Instruction;
  output?: boolean;
}) {
  const o = instruction.opcode;
  const comparison = /^(LD|AND|OR)(=|<>|>=|<=|>|<)$/.exec(o);
  const block = comparison?.[2] ?? o;
  const coil = output && ["OUT", "SET", "RST"].includes(o);
  const contact = !output && !comparison;
  return (
    <svg
      className="ladder-symbol"
      viewBox="0 0 116 40"
      aria-hidden="true"
      focusable="false"
    >
      {contact ? (
        <>
          <path d="M0 20H42 M74 20H116 M42 5V35 M74 5V35" />
          {["LDI", "ANI", "ORI"].includes(o) && <path d="M46 31L70 9" />}
          {["LDP", "ANDP", "ORP"].includes(o) && (
            <path d="M58 31V9 M52 15L58 9L64 15" />
          )}
          {["LDF", "ANDF", "ORF"].includes(o) && (
            <path d="M58 9V31 M52 25L58 31L64 25" />
          )}
        </>
      ) : coil ? (
        <>
          <path d="M0 20H38 M78 20H116 M50 5C34 5 34 35 50 35 M66 5C82 5 82 35 66 35" />
          {o !== "OUT" && (
            <text x="58" y="25" textAnchor="middle">
              {o === "SET" ? "S" : "R"}
            </text>
          )}
        </>
      ) : (
        <>
          <path d="M0 20H16 M100 20H116" />
          <rect x="16" y="4" width="84" height="32" rx="3" />
          <text x="58" y="25" textAnchor="middle">
            {block}
          </text>
        </>
      )}
    </svg>
  );
}
function Contact({
  node,
  trace,
  selected,
  onSelect,
}: {
  node: Logic;
  trace: Map<number, ScanTrace>;
  selected: number | null;
  onSelect: (step: number) => void;
}) {
  if (node.kind === "and")
    return (
      <div className="ladder-series">
        <Contact
          node={node.left}
          trace={trace}
          selected={selected}
          onSelect={onSelect}
        />
        <Contact
          node={node.right}
          trace={trace}
          selected={selected}
          onSelect={onSelect}
        />
      </div>
    );
  if (node.kind === "or")
    return (
      <div className="ladder-parallel">
        <div>
          <Contact
            node={node.left}
            trace={trace}
            selected={selected}
            onSelect={onSelect}
          />
        </div>
        <div>
          <Contact
            node={node.right}
            trace={trace}
            selected={selected}
            onSelect={onSelect}
          />
        </div>
      </div>
    );
  const i = node.instruction,
    active = trace.get(i.step)?.contact;
  const state = active === undefined ? "未実行" : active ? "導通" : "非導通";
  return (
    <button
      className={
        "ladder-contact " +
        (active === true
          ? "conducting"
          : active === false
            ? "open-contact"
            : "")
      }
      title={`STEP ${i.step} / 元行 ${i.sourceLine}: ${i.opcode} ${i.operands.join(" ")}`}
      aria-label={`${i.opcode} ${i.operands.join(" ")} · STEP ${i.step} · ${state}`}
      aria-pressed={selected === i.step}
      data-step={i.step}
      onClick={() => onSelect(i.step)}
    >
      <span>{i.operands.join(" ")}</span>
      <Symbol instruction={i} />
      <small>
        <span className="ladder-detail">
          S{i.step} · {i.opcode} ·{" "}
        </span>
        {state}
      </small>
    </button>
  );
}
function commentFor(condition: Logic, output: Instruction) {
  if (output.comment) return output.comment;
  let node = condition;
  while (node.kind !== "contact") node = node.left;
  return node.instruction.comment;
}
const zoomLevels = [40, 50, 60, 80, 100, 125, 150, 200];
export function LadderView({
  filename,
  update,
  program,
  trace,
  selected,
  onSelect,
  expanded,
  onToggleExpanded,
}: {
  filename: string;
  update: number;
  program: Program;
  trace: ScanTrace[];
  selected: number | null;
  onSelect: (step: number) => void;
  expanded: boolean;
  onToggleExpanded: () => void;
}) {
  const [zoom, setZoom] = useState(50);
  const canvasRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    canvasRef.current?.scrollTo({ top: 0, left: 0 });
  }, [program]);
  const ladder = useMemo(
    () =>
      program.instructions.length > 1000
        ? {
            rungs: [],
            errors: [
              "ラダー表示は1000命令までです。命令一覧で確認してください。",
            ],
          }
        : buildLadder(program),
    [program],
  );
  const states = new Map(trace.map((t) => [t.step, t]));
  return (
    <section id="ladder" className="panel ladder-panel">
      <div className="panel-title">
        <h2>ラダーモニター</h2>
        <span>
          {ladder.rungs.length} 出力回路 /{" "}
          {trace.length ? "最終スキャン" : "未実行"}
        </span>
      </div>
      <p className="ladder-program" aria-label="ラダー表示中のプログラム">
        <strong>{filename}</strong> · 更新 #{update} ·{" "}
        {program.instructions.length}命令 / {ladder.rungs.length}出力回路
      </p>
      <div className="ladder-controls" aria-label="ラダー表示操作">
        <button onClick={() => setZoom(50)}>全体表示（50%）</button>
        <button
          aria-label="ラダーを縮小"
          disabled={zoom === zoomLevels[0]}
          onClick={() => setZoom(zoomLevels[zoomLevels.indexOf(zoom) - 1])}
        >
          −
        </button>
        <label>
          表示倍率
          <select
            aria-label="ラダー表示倍率"
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
          >
            {zoomLevels.map((level) => (
              <option key={level} value={level}>
                {level}%
              </option>
            ))}
          </select>
        </label>
        <button
          aria-label="ラダーを拡大"
          disabled={zoom === zoomLevels.at(-1)}
          onClick={() => setZoom(zoomLevels[zoomLevels.indexOf(zoom) + 1])}
        >
          ＋
        </button>
        <button
          aria-label="ラダーの倍率を100%に戻す"
          onClick={() => setZoom(100)}
        >
          100%に戻す
        </button>
        <button
          className="ladder-expand"
          aria-pressed={expanded}
          onClick={onToggleExpanded}
        >
          {expanded ? "幅を均等に戻す" : "回路の幅を広げる"}
        </button>
      </div>
      <p className="ladder-help">
        接点は <span>緑：導通</span> ／
        灰：非導通。出力は命令の実行条件を表示します。保持された値はデバイスモニターで確認してください。長い回路は横へスクロールできます。
      </p>
      {ladder.errors.length ? (
        <div className="error">{ladder.errors[0]}</div>
      ) : (
        <div
          ref={canvasRef}
          className={"ladder-canvas" + (zoom <= 60 ? " ladder-compact" : "")}
          role="region"
          aria-label="ラダー回路（縦横スクロール）"
          tabIndex={0}
          style={{ "--ladder-scale": zoom / 100 } as CSSProperties}
        >
          <div className="ladder-sheet">
            {ladder.rungs.map(({ condition, output }, index) => {
              const active = states.get(output.step)?.result;
              const state =
                active === undefined ? "未実行" : active ? "条件ON" : "条件OFF";
              const comment = commentFor(condition, output);
              return (
                <div
                  className={
                    "ladder-network " +
                    (selected === output.step ? "selected" : "")
                  }
                  key={output.step}
                >
                  <div className="ladder-network-title">
                    <b>回路 {String(index + 1).padStart(2, "0")}</b>
                    <span>出力 STEP {output.step}</span>
                    {comment && (
                      <span className="ladder-comment">{comment}</span>
                    )}
                  </div>
                  <div className="ladder-rung">
                    <div className="left-rail" />
                    <Contact
                      node={condition}
                      trace={states}
                      selected={selected}
                      onSelect={onSelect}
                    />
                    <div
                      className={"ladder-wire " + (active ? "conducting" : "")}
                    />
                    <button
                      className={
                        "ladder-output " + (active ? "conducting" : "")
                      }
                      onClick={() => onSelect(output.step)}
                      aria-label={`${output.opcode} ${output.operands.join(" ")} · STEP ${output.step} · ${state}`}
                      aria-pressed={selected === output.step}
                      data-step={output.step}
                      title={`元行 ${output.sourceLine}`}
                    >
                      <span>{output.operands.join(" ")}</span>
                      <Symbol instruction={output} output />
                      <small>
                        <span className="ladder-detail">
                          S{output.step} · {output.opcode} ·{" "}
                        </span>
                        {state}
                      </small>
                    </button>
                    <div className="right-rail" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      <p className="ladder-footnote">
        CSVから復元した等価ラダーです。元の配置は再現しません。接点や出力をクリックすると、そのステップを選択できます。
      </p>
    </section>
  );
}
