import { useMemo } from "react";
import { buildLadder, type Logic } from "../core/ladder";
import type { Program } from "../core/model";
import type { ScanTrace } from "../core/engine";
function Contact({
  node,
  trace,
  onSelect,
}: {
  node: Logic;
  trace: Map<number, ScanTrace>;
  onSelect: (step: number) => void;
}) {
  if (node.kind === "and")
    return (
      <div className="ladder-series">
        <Contact node={node.left} trace={trace} onSelect={onSelect} />
        <Contact node={node.right} trace={trace} onSelect={onSelect} />
      </div>
    );
  if (node.kind === "or")
    return (
      <div className="ladder-parallel">
        <div>
          <Contact node={node.left} trace={trace} onSelect={onSelect} />
        </div>
        <div>
          <Contact node={node.right} trace={trace} onSelect={onSelect} />
        </div>
      </div>
    );
  const i = node.instruction,
    negative = ["LDI", "ANI", "ORI"].includes(i.opcode),
    pulse = i.opcode === "LDP",
    active = trace.get(i.step)?.contact;
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
      onClick={() => onSelect(i.step)}
    >
      <span>{i.operands.join(" ")}</span>
      <b>
        {/^(LD|AND|OR)(=|<>|>=|<=|>|<)$/.test(i.opcode)
          ? `[ ${i.opcode.replace(/^(LD|AND|OR)/, "")} ]`
          : negative
            ? "─|/|─"
            : pulse
              ? "─|↑|─"
              : "─| |─"}
      </b>
      <small>
        S{i.step}
        {active === undefined ? "" : active ? " · 導通" : " · 非導通"}
      </small>
    </button>
  );
}
export function LadderView({
  program,
  trace,
  selected,
  onSelect,
}: {
  program: Program;
  trace: ScanTrace[];
  selected: number | null;
  onSelect: (step: number) => void;
}) {
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
      <p className="muted">
        命令から復元した等価ラダーです。元の配置は再現しません。接点は最終スキャンの評価、右端は各出力命令の実行条件を表示します。
      </p>
      {ladder.errors.length ? (
        <div className="error">{ladder.errors[0]}</div>
      ) : (
        <div className="ladder-canvas">
          {ladder.rungs.map(({ condition, output }, index) => {
            const active = states.get(output.step)?.result;
            return (
              <div
                className={
                  "ladder-rung " + (selected === output.step ? "selected" : "")
                }
                key={output.step}
              >
                <span className="rung-number">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div className="left-rail" />
                <Contact node={condition} trace={states} onSelect={onSelect} />
                <div
                  className={"ladder-wire " + (active ? "conducting" : "")}
                />
                <button
                  className={"ladder-output " + (active ? "conducting" : "")}
                  onClick={() => onSelect(output.step)}
                  title={`元行 ${output.sourceLine}`}
                >
                  <span>{output.operands.join(" ")}</span>
                  <b>
                    {["OUT", "SET", "RST"].includes(output.opcode)
                      ? `( ${output.opcode === "OUT" ? "" : output.opcode === "SET" ? "S" : "R"} )`
                      : `[ ${output.opcode} ]`}
                  </b>
                  <small>
                    S{output.step}{" "}
                    {active === undefined
                      ? "未実行"
                      : active
                        ? "条件ON"
                        : "条件OFF"}
                  </small>
                </button>
                <div className="right-rail" />
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
