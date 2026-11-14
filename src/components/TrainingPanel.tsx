import { useEffect, useMemo, useRef, useState } from "react";
import { PagedList } from "./PagedList";
import type { Memory } from "../core/engine";
import { group, offset } from "../core/operands";
interface Props {
  defaultForward?: string;
  defaultReverse?: string;
  defaultBcdInput?: string;
  defaultBcdOutput?: string;
  inputs: string[];
  outputs: string[];
  memory: Memory;
  inputImage: Memory;
  running: boolean;
  blocked: boolean;
  onInput: (name: string, value: number) => void;
  onInputs: (values: Record<string, number>) => void;
  onRun: () => void;
  onStop: () => void;
}
function PushButton({
  name,
  value,
  onInput,
  nc,
}: {
  name: string;
  value: boolean;
  onInput: (name: string, value: number) => void;
  nc: boolean;
}) {
  const held = useRef(false);
  const press = () => {
    held.current = true;
    onInput(name, nc ? 0 : 1);
  };
  const release = () => {
    if (held.current) {
      held.current = false;
      onInput(name, nc ? 1 : 0);
    }
  };
  useEffect(() => {
    const releaseOnBlur = () => {
      if (held.current) {
        held.current = false;
        onInput(name, nc ? 1 : 0);
      }
    };
    window.addEventListener("blur", releaseOnBlur);
    return () => window.removeEventListener("blur", releaseOnBlur);
  }, [name, nc, onInput]);
  return (
    <button
      className={"physical-button " + (value ? "lit" : "")}
      aria-label={name + " 押しボタン"}
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        press();
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
      onBlur={release}
      onKeyDown={(e) => {
        if ([" ", "Enter"].includes(e.key)) {
          e.preventDefault();
          if (!e.repeat) press();
        }
      }}
      onKeyUp={(e) => {
        if ([" ", "Enter"].includes(e.key)) {
          e.preventDefault();
          release();
        }
      }}
    >
      {nc ? "停止 / NC" : "押す / NO"}
    </button>
  );
}
export function TrainingPanel({
  defaultForward = "",
  defaultReverse = "",
  defaultBcdInput = "X1C",
  defaultBcdOutput = "Y36",
  inputs,
  outputs,
  memory,
  inputImage,
  running,
  blocked,
  onInput,
  onInputs,
  onRun,
  onStop,
}: Props) {
  const [configuring, setConfiguring] = useState(false);
  const [modes, setModes] = useState<Record<string, string>>({}),
    [types, setTypes] = useState<Record<string, string>>({}),
    [labels, setLabels] = useState<Record<string, string>>({}),
    [forward, setForward] = useState(defaultForward),
    [reverse, setReverse] = useState(defaultReverse),
    [bcdInput, setBcdInput] = useState(defaultBcdInput),
    [bcdOutput, setBcdOutput] = useState(defaultBcdOutput);
  const motorForward = !!memory[forward],
    motorReverse = !!memory[reverse],
    conflict = motorForward && motorReverse;
  const bcdValid = /^X/.test(bcdInput) && !!group("K1" + bcdInput),
    displayValid = /^Y/.test(bcdOutput) && !!group("K2" + bcdOutput);
  let dial = 0,
    digits = 0;
  if (bcdValid)
    for (let i = 0; i < 4; i++)
      if (inputImage[offset(bcdInput, i)]) dial |= 1 << i;
  if (displayValid)
    for (let i = 0; i < 8; i++)
      if (memory[offset(bcdOutput, i)]) digits |= 1 << i;
  const filteredInputs = useMemo(
    () =>
      inputs.filter(
        (name) =>
          configuring ||
          !bcdValid ||
          !Array.from({ length: 4 }, (_, i) => offset(bcdInput, i)).includes(
            name,
          ),
      ),
    [inputs, configuring, bcdValid, bcdInput],
  );
  const filteredOutputs = useMemo(
    () =>
      outputs.filter(
        (name) =>
          configuring ||
          !displayValid ||
          !Array.from({ length: 8 }, (_, i) => offset(bcdOutput, i)).includes(
            name,
          ),
      ),
    [outputs, configuring, displayValid, bcdOutput],
  );
  const digitText =
    (digits & 15) > 9 || ((digits >> 4) & 15) > 9
      ? "--"
      : String((digits >> 4) & 15) + String(digits & 15);
  return (
    <section
      id="board"
      className={"panel training-panel " + (configuring ? "configuring" : "")}
    >
      <div className="panel-title">
        <div>
          <p className="caption">VIRTUAL TRAINING PANEL</p>
          <h2>シーケンス制御 実習盤</h2>
        </div>
        <button
          disabled={blocked}
          className={running ? "run-button on" : "run-button"}
          onClick={running ? onStop : onRun}
        >
          {running ? "■ 試験運転停止" : "▶ 試験運転開始"}
        </button>
      </div>
      <p className="notice">
        汎用教育用盤 /
        スイッチ操作前に試験運転を開始。配線は割付設定で変更できます。
      </p>
      <button
        className="configure-board"
        onClick={() => setConfiguring((v) => !v)}
      >
        {configuring ? "割付設定を閉じる" : "割付設定を表示"}
      </button>
      <div className="board-grid">
        <div className="board-section">
          <h3>
            操作スイッチ <span>INPUT</span>
          </h3>
          <PagedList items={filteredInputs} label="盤入力" pageSize={12}>
            {(visibleInputs) => (
              <div className="switch-grid">
                {visibleInputs.map((name) => {
                  const mode =
                      modes[name] ??
                      (defaultForward && ["X0", "X1"].includes(name)
                        ? "no"
                        : "toggle"),
                    value = !!inputImage[name];
                  return (
                    <div className="panel-device" key={name}>
                      <code>{name}</code>
                      <input
                        className="device-label"
                        aria-label={name + " 機器名"}
                        value={
                          labels[name] ??
                          (defaultForward
                            ? ((
                                {
                                  X0: "始動",
                                  X1: "停止",
                                  X2: "正逆切替",
                                  Y0: "運転灯",
                                  Y1: "正転出力",
                                  Y2: "逆転出力",
                                } as Record<string, string>
                              )[name] ?? "")
                            : "")
                        }
                        placeholder="機器名を設定"
                        onChange={(e) =>
                          setLabels((l) => ({ ...l, [name]: e.target.value }))
                        }
                      />
                      {mode === "toggle" ? (
                        <button
                          className={"selector-switch " + (value ? "lit" : "")}
                          aria-label={name + " 切替スイッチ"}
                          aria-pressed={value}
                          onClick={() => onInput(name, value ? 0 : 1)}
                        >
                          <span className="switch-lever" />
                          {value ? "ON" : "OFF"}
                        </button>
                      ) : (
                        <PushButton
                          name={name}
                          value={value}
                          onInput={onInput}
                          nc={mode === "nc"}
                        />
                      )}
                      <small>入力接点 {value ? "ON" : "OFF"}</small>
                      <select
                        aria-label={name + " 接点種別"}
                        value={mode}
                        onChange={(e) => {
                          setModes((m) => ({ ...m, [name]: e.target.value }));
                          onInput(name, e.target.value === "nc" ? 1 : 0);
                        }}
                      >
                        <option value="toggle">保持スイッチ</option>
                        <option value="no">押しボタン a接点</option>
                        <option value="nc">押しボタン b接点</option>
                      </select>
                    </div>
                  );
                })}
              </div>
            )}
          </PagedList>
        </div>
        <div className="board-section">
          <h3>
            表示灯・負荷 <span>OUTPUT</span>
          </h3>
          <PagedList items={filteredOutputs} label="盤出力" pageSize={12}>
            {(visibleOutputs) => (
              <div className="lamp-grid">
                {visibleOutputs.map((name) => {
                  const active = !!memory[name],
                    type = types[name] ?? "green";
                  return (
                    <div className="panel-device" key={name}>
                      <code>{name}</code>
                      <input
                        className="device-label"
                        aria-label={name + " 機器名"}
                        value={
                          labels[name] ??
                          (defaultForward
                            ? ((
                                {
                                  X0: "始動",
                                  X1: "停止",
                                  X2: "正逆切替",
                                  Y0: "運転灯",
                                  Y1: "正転出力",
                                  Y2: "逆転出力",
                                } as Record<string, string>
                              )[name] ?? "")
                            : "")
                        }
                        placeholder="機器名を設定"
                        onChange={(e) =>
                          setLabels((l) => ({ ...l, [name]: e.target.value }))
                        }
                      />
                      <div
                        role="status"
                        aria-label={name + " 出力"}
                        className={
                          "panel-lamp " + type + (active ? " illuminated" : "")
                        }
                      >
                        <span>
                          {type === "buzzer"
                            ? "♪"
                            : type === "relay"
                              ? "RY"
                              : ""}
                        </span>
                      </div>
                      <strong className={active ? "on" : ""}>
                        {active ? "ON" : "OFF"}
                      </strong>
                      <select
                        aria-label={name + " 機器種類"}
                        value={type}
                        onChange={(e) =>
                          setTypes((t) => ({ ...t, [name]: e.target.value }))
                        }
                      >
                        <option value="green">緑ランプ</option>
                        <option value="red">赤ランプ</option>
                        <option value="amber">黄ランプ</option>
                        <option value="relay">リレー表示</option>
                        <option value="buzzer">ブザー表示（無音）</option>
                      </select>
                    </div>
                  );
                })}
              </div>
            )}
          </PagedList>
        </div>
      </div>
      <div className="board-instruments">
        <div className="instrument">
          <h3>正逆転モーター</h3>
          <div
            className={
              "motor " +
              (running && !conflict && (motorForward || motorReverse)
                ? "rotating "
                : "") +
              (motorReverse ? "reverse " : "") +
              (conflict ? "conflict" : "")
            }
          >
            <div className="rotor">✣</div>
            <span>M</span>
          </div>
          <p role="status" aria-label="モーター状態">
            {conflict
              ? "同時ON異常"
              : motorForward
                ? "正転"
                : motorReverse
                  ? "逆転"
                  : "停止"}
          </p>
          <small>
            正転 {forward || "未割付"} / 逆転 {reverse || "未割付"}
          </small>
          <label>
            正転出力
            <select
              aria-label="モーター正転出力"
              value={forward}
              onChange={(e) => setForward(e.target.value)}
            >
              <option value="">未割付</option>
              {outputs.map((y) => (
                <option key={y}>{y}</option>
              ))}
            </select>
          </label>
          <label>
            逆転出力
            <select
              aria-label="モーター逆転出力"
              value={reverse}
              onChange={(e) => setReverse(e.target.value)}
            >
              <option value="">未割付</option>
              {outputs.map((y) => (
                <option key={y}>{y}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="instrument">
          <h3>BCD設定器（1桁）</h3>
          <label>
            先頭X
            <input
              aria-label="BCD入力先頭"
              value={bcdInput}
              onChange={(e) => setBcdInput(e.target.value.toUpperCase())}
            />
          </label>
          <select
            className="bcd-dial"
            aria-label="BCD設定値"
            disabled={!bcdValid}
            value={dial}
            onChange={(e) => {
              const n = Number(e.target.value);
              onInputs(
                Object.fromEntries(
                  Array.from({ length: 4 }, (_, i) => [
                    offset(bcdInput, i),
                    (n >> i) & 1,
                  ]),
                ),
              );
            }}
          >
            {Array.from({ length: 10 }, (_, n) => (
              <option key={n}>{n}</option>
            ))}
            {dial > 9 && <option value={dial}>不正BCD {dial}</option>}
          </select>
          <p className="muted">
            4点の入力へBCD出力。回路のK1X指定と先頭を合わせてください。
          </p>
        </div>
        <div className="instrument">
          <h3>2桁数値表示器</h3>
          <label>
            先頭Y
            <input
              aria-label="BCD出力先頭"
              value={bcdOutput}
              onChange={(e) => setBcdOutput(e.target.value.toUpperCase())}
            />
          </label>
          <output className="seven-segment" aria-label="BCD数値表示">
            {displayValid ? digitText : "--"}
          </output>
          <p className="muted">
            連続8点のYをBCDとして表示。K2Y指定と先頭を合わせてください。
          </p>
        </div>
      </div>
    </section>
  );
}
