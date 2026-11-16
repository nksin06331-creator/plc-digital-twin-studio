import { useEffect, useRef, useState } from "react";
import type { Memory } from "../core/engine";
import {
  ExamPlant,
  inputPoints,
  outputPoints,
  parseWiring,
  normalizeWiring,
  defaultWiring,
  type ExamWiring,
  type PushButton,
} from "../core/plant/exam";
import { AutoRunHelp } from "./AutoRunHelp";
interface Props {
  demoKind?: "grade2" | "basic" | null;
  plant: ExamPlant;
  wiring: ExamWiring;
  memory: Memory;
  running: boolean;
  blocked: boolean;
  onOperate: (operation: (plant: ExamPlant) => void) => void;
  onWiring: (w: ExamWiring) => void;
  onRun: () => void;
  onStop: () => void;
}
function Momentary({
  name,
  pressed,
  onPress,
}: {
  name: PushButton;
  pressed: boolean;
  onPress: (pressed: boolean) => void;
}) {
  const held = useRef(false),
    current = useRef(onPress);
  current.current = onPress;
  const release = () => {
    if (held.current) {
      held.current = false;
      current.current(false);
    }
  };
  useEffect(() => {
    const blur = () => {
      if (held.current) {
        held.current = false;
        current.current(false);
      }
    };
    window.addEventListener("blur", blur);
    return () => window.removeEventListener("blur", blur);
  }, []);
  return (
    <button
      className={
        "exam-push " +
        (name === "PB5" ? "emergency " : "") +
        (pressed ? "pressed" : "")
      }
      aria-label={name + " 押しボタン"}
      aria-pressed={pressed}
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.focus();
        e.currentTarget.setPointerCapture(e.pointerId);
        held.current = true;
        onPress(true);
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
      onBlur={release}
      onKeyDown={(e) => {
        if ([" ", "Enter"].includes(e.key)) {
          e.preventDefault();
          if (!e.repeat) {
            held.current = true;
            onPress(true);
          }
        }
      }}
      onKeyUp={(e) => {
        if ([" ", "Enter"].includes(e.key)) {
          e.preventDefault();
          release();
        }
      }}
    >
      <span />
    </button>
  );
}
export function ExamPanel({
  demoKind = null,
  plant,
  wiring,
  memory,
  running,
  blocked,
  onOperate,
  onWiring,
  onRun,
  onStop,
}: Props) {
  const [draft, setDraft] = useState<ExamWiring>(() => structuredClone(wiring)),
    [message, setMessage] = useState("");
  useEffect(() => {
    setDraft(structuredClone(wiring));
  }, [wiring]);
  const pendingChanges =
    inputPoints.filter(([key]) => draft.inputs[key] !== wiring.inputs[key])
      .length +
    outputPoints.filter(([key]) => draft.outputs[key] !== wiring.outputs[key])
      .length;
  const stageRef = useRef<HTMLDivElement>(null);
  const [stageScale, setStageScale] = useState(1);
  const [fitBoard, setFitBoard] = useState(true);
  useEffect(() => {
    const target = stageRef.current;
    if (!target) return;
    const panel = target.closest("#board") as HTMLElement | null;
    const observer = new ResizeObserver(() => {
      const stage = target.firstElementChild as HTMLElement | null;
      if (!stage || !panel || target.clientWidth <= 0) return;
      const availableHeight = Math.max(
        160,
        panel.clientHeight - target.offsetTop - 16,
      );
      // Zoom rounds text metrics, so sub-percent adjustments can alternate
      // between two line layouts forever. Round down to stable 1% steps.
      const scale =
        Math.floor(
          100 *
            Math.min(
              1,
              target.clientWidth / 700,
              availableHeight / Math.max(1, stage.offsetHeight),
            ),
        ) / 100;
      setStageScale((previous) =>
        Math.abs(previous - scale) < 0.002 ? previous : scale,
      );
    });
    observer.observe(target);
    if (panel) {
      observer.observe(panel);
      const guide = panel.querySelector(".auto-run-help");
      if (guide) observer.observe(guide);
    }
    return () => observer.disconnect();
  }, []);
  const controls = useRef(onOperate);
  controls.current = onOperate;
  useEffect(() => {
    const held = new Set<PushButton>(),
      keys: Record<string, PushButton> = {
        KeyZ: "PB1",
        KeyX: "PB2",
        KeyC: "PB3",
        KeyV: "PB4",
        KeyB: "PB5",
      };
    const down = (e: KeyboardEvent) => {
      const target = e.target;
      if (
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        (target instanceof Element &&
          target.closest("input,select,textarea,[contenteditable=true]"))
      )
        return;
      const key = keys[e.code];
      if (key && !e.repeat) {
        e.preventDefault();
        held.add(key);
        controls.current((p) => {
          p.pressed[key] = true;
        });
      }
    };
    const up = (e: KeyboardEvent) => {
      const key = keys[e.code];
      if (key && held.has(key)) {
        held.delete(key);
        controls.current((p) => {
          p.pressed[key] = false;
        });
      }
    };
    const blur = () => {
      if (held.size) {
        const active = [...held];
        held.clear();
        controls.current((p) => {
          for (const key of active) p.pressed[key] = false;
        });
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, []);
  const signals = plant.signals(),
    outputs = plant.outputs(memory, wiring),
    drive = plant.drive(memory, wiring),
    image = plant.inputImage(wiring);
  const pressed = (name: PushButton, value: boolean) =>
    onOperate((p) => {
      p.pressed[name] = value;
    });
  const direction = drive.conflict
    ? "同時指令・相互インターロック"
    : drive.left
      ? "左行"
      : drive.right
        ? "右行"
        : "停止";
  function apply(value: ExamWiring) {
    try {
      const normalized = normalizeWiring(value);
      onWiring(normalized);
      setDraft(structuredClone(normalized));
      setMessage("割付を適用し、PLCメモリと盤を初期化しました");
    } catch (error) {
      setMessage((error as Error).message);
    }
  }
  function download() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(wiring, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "exam-panel-wiring.json";
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <section id="board" className="panel exam-panel">
      <div className="panel-title">
        <div>
          <p className="caption">SEQUENCE CONTROL / GRADE 2</p>
          <h2>2級 シーケンス制御 試験盤</h2>
        </div>
        <button
          className="run-button"
          disabled={blocked && !running}
          onClick={running ? onStop : onRun}
        >
          {running ? "■ 試験運転停止" : "▶ 試験運転開始"}
        </button>
      </div>
      <AutoRunHelp
        kind={demoKind}
        plant={plant}
        memory={memory}
        wiring={wiring}
        running={running}
        blocked={blocked}
      />
      <p className="exam-reference">
        2019年2級器具配置図・FA-T-P01公開資料に基づく2Dモデル
      </p>
      <div className="board-view-controls">
        <button aria-pressed={!fitBoard} onClick={() => setFitBoard((v) => !v)}>
          {fitBoard ? "盤を100%で表示" : "盤を枠に合わせる"}
        </button>
      </div>
      <div className="exam-stage-scroll" ref={stageRef}>
        <div
          className="exam-stage"
          style={{
            zoom: fitBoard ? stageScale : 1,
            width: 700,
            minWidth: 700,
            maxWidth: "none",
          }}
        >
          <i className="mounting-screw screw-tl" />
          <i className="mounting-screw screw-tr" />
          <i className="mounting-screw screw-bl" />
          <i className="mounting-screw screw-br" />
          <div className="exam-terminal">
            <span>TB / DC24V</span>
            <div className="terminal-cells">
              {Array.from({ length: 20 }, (_, i) => (
                <div className="terminal-cell" key={i}>
                  {i < 4 ? (
                    <>
                      <b>＋</b>
                      <b>−</b>
                    </>
                  ) : (
                    <>
                      <b
                        className={
                          outputs[outputPoints[i - 4]?.[0]]
                            ? "terminal-active"
                            : ""
                        }
                        title={
                          outputPoints[i - 4]
                            ? outputPoints[i - 4][0] +
                              " → " +
                              wiring.outputs[outputPoints[i - 4][0]]
                            : ""
                        }
                      >
                        {i < 18 ? i + 16 : "—"}
                      </b>
                      <b
                        className={
                          image[wiring.inputs[inputPoints[i - 4][0]]]
                            ? "terminal-active"
                            : ""
                        }
                        title={
                          inputPoints[i - 4][0] +
                          " → " +
                          wiring.inputs[inputPoints[i - 4][0]]
                        }
                      >
                        {i - 3}
                      </b>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="exam-upper">
            <div className="exam-breaker">
              <strong>CP1</strong>
              <button
                aria-label="CP1 盤電源"
                aria-pressed={plant.power}
                onClick={() =>
                  onOperate((p) => {
                    p.power = !p.power;
                    p.releaseButtons();
                  })
                }
              >
                <small>ON</small>
                <b className={plant.power ? "breaker-on" : ""} />
                <small>OFF</small>
              </button>
              <small>サーキットプロテクタ</small>
            </div>
            <div className="exam-relays">
              {(["RY1", "RY2"] as const).map((name, index) => (
                <div key={name}>
                  <strong>{name}</strong>
                  <div
                    role="status"
                    aria-label={name + " リレー"}
                    className={
                      "relay-case " +
                      ((name === "RY1" ? drive.left : drive.right)
                        ? "energized"
                        : "")
                    }
                  >
                    <span className="relay-coil" />
                    <i />
                    <small>
                      {(name === "RY1" ? drive.left : drive.right)
                        ? "ON"
                        : "OFF"}
                    </small>
                  </div>
                  <small>
                    {index === 0 ? "左行" : "右行"} / {wiring.outputs[name]}
                  </small>
                </div>
              ))}
            </div>
            <div className="exam-outlet">
              <span>コンセント</span>
              <div>
                Ⅱ<br />⊙
              </div>
              <small>外形表示のみ</small>
            </div>
          </div>
          <div className="exam-conveyor-title">
            <strong>コンベア・ワークブロック</strong>
            <span role="status" aria-label="搬送状態">
              {running ? direction : "スキャン停止"} /{" "}
              {(plant.position * 100).toFixed(0)}%
            </span>
          </div>
          <div
            className={
              "exam-conveyor " +
              (running && (drive.left || drive.right) ? "moving " : "") +
              (drive.left ? "to-left" : "to-right")
            }
          >
            <div className="conveyor-rail rail-top" />
            <div className="conveyor-belt" />
            <div className="conveyor-roller roller-left" />
            <div className="conveyor-roller roller-right" />
            <div
              className="work-pallet"
              aria-label="パレット"
              data-position={plant.position.toFixed(4)}
              style={{ left: `${18 + plant.position * 68}%` }}
            >
              <small>NO.{plant.palletCode}</small>
              {[2, 1, 0].map((bit) => (
                <button
                  key={bit}
                  type="button"
                  className="pallet-bolt"
                  aria-label={`ネジ LS${bit + 3}（重み${1 << bit}）`}
                  aria-pressed={!!(plant.palletCode & (1 << bit))}
                  title={`LS${bit + 3} / 重み${1 << bit}: ${plant.palletCode & (1 << bit) ? "取り付け済み（クリックで外す）" : "取り外し済み（クリックで付ける）"}`}
                  onClick={() =>
                    onOperate((p) => {
                      p.palletCode ^= 1 << bit;
                    })
                  }
                >
                  <span
                    className={
                      plant.palletCode & (1 << bit) ? "bolt fitted" : "bolt"
                    }
                  />
                </button>
              ))}
            </div>
            <div className="left-sensors">
              {(["LS5", "LS4", "LS3", "LS2"] as const).map((name) => (
                <div
                  className={
                    "limit-sensor " +
                    (plant.power && signals[name] ? "detected" : "")
                  }
                  role="status"
                  aria-label={name + " センサー"}
                  key={name}
                >
                  <b>{name}</b>
                  <i />
                  {signals[name] && plant.power ? "ON" : "OFF"}
                </div>
              ))}
            </div>
            <div
              className={
                "limit-sensor right-sensor " +
                (plant.power && signals.LS1 ? "detected" : "")
              }
              role="status"
              aria-label="LS1 センサー"
            >
              <b>LS1</b>
              <i />
              {signals.LS1 && plant.power ? "ON" : "OFF"}
            </div>
            <span className="conveyor-left-label">左端</span>
            <span className="conveyor-right-label">右端</span>
            <div className="conveyor-rail rail-bottom" />
          </div>
          <div className="exam-lamps">
            <div>
              <span>電源</span>
              <div
                role="status"
                aria-label="電源表示灯"
                className={
                  "pilot-lamp power-lamp " + (plant.power ? "illuminated" : "")
                }
              />
            </div>
            {(["PL1", "PL2", "PL3", "PL4"] as const).map((name) => (
              <div key={name}>
                <span>{name}</span>
                <div
                  role="status"
                  aria-label={name + " 表示灯"}
                  className={
                    "pilot-lamp " + (outputs[name] ? "illuminated" : "")
                  }
                />
                <small>{wiring.outputs[name]}</small>
              </div>
            ))}
          </div>
          <div className="exam-operators">
            {(["SS0", "SS1"] as const).map((name) => (
              <div className="exam-control" key={name}>
                <span>{name === "SS0" ? "手動・自動" : "連続 切・入"}</span>
                <button
                  aria-label={name + " 切替スイッチ"}
                  className={
                    "exam-selector " + (plant.selectors[name] ? "engaged" : "")
                  }
                  aria-pressed={plant.selectors[name]}
                  onClick={() =>
                    onOperate((p) => {
                      p.selectors[name] = !p.selectors[name];
                    })
                  }
                >
                  <i />
                </button>
                <strong>{name}</strong>
                <small>
                  {plant.selectors[name]
                    ? name === "SS0"
                      ? "自動"
                      : "入"
                    : name === "SS0"
                      ? "手動"
                      : "切"}
                </small>
              </div>
            ))}
            {(["PB1", "PB2", "PB3", "PB4", "PB5"] as PushButton[]).map(
              (name, i) => (
                <div className="exam-control" key={name}>
                  <span>{name}</span>
                  <Momentary
                    name={name}
                    pressed={plant.pressed[name]}
                    onPress={(value) => pressed(name, value)}
                  />
                  <small>{["Z", "X", "C", "V", "B"][i]}</small>
                </div>
              ),
            )}
            <div className="exam-control dsw-control">
              <span>DSW</span>
              <div className="dsw-thumbwheel">
                <button
                  type="button"
                  className="dsw-step"
                  aria-label="DSWを1増やす"
                  title="1増やす（9の次は0）"
                  onClick={() =>
                    onOperate((p) => {
                      p.digitalSwitch = (p.digitalSwitch + 1) % 10;
                    })
                  }
                >
                  ＋
                </button>
                <select
                  aria-label="DSW デジタルスイッチ"
                  value={plant.digitalSwitch}
                  onChange={(e) =>
                    onOperate((p) => {
                      p.digitalSwitch = Number(e.target.value);
                    })
                  }
                >
                  {Array.from({ length: 10 }, (_, n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
                <button
                  type="button"
                  className="dsw-step"
                  aria-label="DSWを1減らす"
                  title="1減らす（0の前は9）"
                  onClick={() =>
                    onOperate((p) => {
                      p.digitalSwitch = (p.digitalSwitch + 9) % 10;
                    })
                  }
                >
                  −
                </button>
              </div>
              <small>BCD</small>
            </div>
            <div className="exam-display">
              <span>DPL2 DPL1</span>
              <output aria-label="DPL 数値表示">
                {plant.display(memory, wiring)}
              </output>
              <small>10位 / 1位</small>
            </div>
          </div>
          <p className="exam-nameplate">
            SEQUENCE TRAINING PANEL <span>PLC DIGITAL TWIN STUDIO</span>
          </p>
        </div>
      </div>
      {drive.conflict && (
        <p className="error" role="alert">
          RY1・RY2同時指令：相互インターロックとして搬送を停止しています。
        </p>
      )}
      <p className="pallet-help">
        パレット上のネジをクリックすると脱着できます。上から重み4・2・1で、番号と左端のLS5・LS4・LS3に連動します。
      </p>
      <div className="exam-fixture">
        <label>
          パレット番号
          <select
            aria-label="パレット番号"
            value={plant.palletCode}
            onChange={(e) =>
              onOperate((p) => {
                p.palletCode = Number(e.target.value);
              })
            }
          >
            {Array.from({ length: 8 }, (_, n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
        <div>
          <span>試験用に配置：</span>
          {[
            ["左端", 0],
            ["中央", 0.5],
            ["右端", 1],
          ].map(([label, pos]) => (
            <button
              key={label}
              onClick={() =>
                onOperate((p) => {
                  p.position = Number(pos);
                })
              }
            >
              {label}
            </button>
          ))}
        </div>
        <label>
          片道時間
          <select
            aria-label="搬送片道時間"
            value={plant.travelMs}
            onChange={(e) =>
              onOperate((p) => {
                p.travelMs = Number(e.target.value);
              })
            }
          >
            <option value="1000">1秒</option>
            <option value="4000">4秒</option>
            <option value="8000">8秒</option>
          </select>
        </label>
      </div>
      <details className="exam-wiring">
        <summary>
          I/O割付・接点状態（CSVに合わせて設定）
          {pendingChanges ? ` — 未適用 ${pendingChanges}件` : ""}
        </summary>
        <p
          className={pendingChanges ? "wiring-pending" : "wiring-applied"}
          role="status"
          aria-label="割付の適用状態"
        >
          {pendingChanges
            ? `未適用の変更が${pendingChanges}件あります。動作は「適用中の番地」を使用しています。`
            : "編集内容はすべて適用済みです。"}
        </p>
        <p>
          TB番号は盤の端子番号です。PLCアドレスは固定ではありません。初期値は公開デモ用のX10/Y30連番です。PB5は自動復帰b接点、LSは検出時ONのモデルです。
        </p>
        <div className="wiring-tables">
          {(["inputs", "outputs"] as const).map((side) => (
            <table key={side}>
              <thead>
                <tr>
                  <th>TB</th>
                  <th>機器</th>
                  <th>
                    編集する
                    <br />
                    番地
                  </th>
                  <th>
                    適用中の
                    <br />
                    番地
                  </th>
                  <th>
                    適用中の
                    <br />
                    状態
                  </th>
                </tr>
              </thead>
              <tbody>
                {(side === "inputs" ? inputPoints : outputPoints).map(
                  ([key, label], index) => (
                    <tr
                      key={key}
                      data-wiring-point={key}
                      className={
                        (draft[side] as Record<string, string>)[key] !==
                        (wiring[side] as Record<string, string>)[key]
                          ? "wiring-row-pending"
                          : ""
                      }
                    >
                      <td>{side === "inputs" ? index + 1 : index + 20}</td>
                      <td title={label}>{key}</td>
                      <td>
                        <input
                          aria-label={key + " PLC割付"}
                          value={(draft[side] as Record<string, string>)[key]}
                          onChange={(e) =>
                            setDraft((d) => ({
                              ...d,
                              [side]: {
                                ...d[side],
                                [key]: e.target.value.toUpperCase(),
                              },
                            }))
                          }
                        />
                        {(draft[side] as Record<string, string>)[key] !==
                          (wiring[side] as Record<string, string>)[key] && (
                          <small className="wiring-unsaved">未適用</small>
                        )}
                      </td>
                      <td aria-label={key + " 適用中の番地"}>
                        <code>
                          {(wiring[side] as Record<string, string>)[key]}
                        </code>
                      </td>
                      <td aria-label={key + " 適用中の状態"}>
                        {side === "inputs"
                          ? image[
                              wiring.inputs[key as keyof ExamWiring["inputs"]]
                            ]
                            ? "ON"
                            : "OFF"
                          : outputs[key as keyof ExamWiring["outputs"]]
                            ? "ON"
                            : "OFF"}
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          ))}
        </div>
        <div className="wiring-actions">
          <button onClick={() => apply(draft)}>割付を適用・初期化</button>
          <button
            disabled={!pendingChanges}
            onClick={() => {
              setDraft(structuredClone(wiring));
              setMessage(
                "編集を破棄しました。適用中の割付・PLC・盤は変更していません",
              );
            }}
          >
            編集を破棄
          </button>
          <button
            onClick={() => {
              setDraft(defaultWiring());
              setMessage(
                "標準割付を編集欄へ読込みました。適用ボタンで確定します",
              );
            }}
          >
            標準割付へ戻す
          </button>
          <button onClick={download}>割付JSON出力</button>
          <label className="file">
            割付JSON読込
            <input
              type="file"
              accept=".json,application/json"
              onChange={async (e) => {
                const input = e.currentTarget,
                  f = input.files?.[0];
                if (!f) return;
                try {
                  if (f.size > 16384)
                    throw Error("割付ファイルは16 KiBまでです");
                  const w = parseWiring(await f.text());
                  setDraft(w);
                  setMessage(
                    "割付を編集欄へ読込みました。適用ボタンで確定します",
                  );
                } catch (err) {
                  setMessage((err as Error).message);
                }
                input.value = "";
              }}
            />
          </label>
        </div>
        <p className="muted">
          適用するとPLCと盤を初期化します。JSON出力は適用中の割付です。割付表を変えてもCSV内の番地は書き換わりません。
        </p>
        {message && (
          <p role="status" className="wiring-message">
            {message}
          </p>
        )}
      </details>
      <details className="exam-sources">
        <summary>再現の根拠・モデルの範囲</summary>
        <p>
          上段TB、中段CP1・RY1/2・コンベア・LS1〜5、下段電源灯・PL1〜4・SS0/1・PB1〜5・DSW・DPL2/1の配置を公開資料から再構成しました。写真・図版の転載ではありません。最新年度・全会場の同一性や実寸は保証しません。
        </p>
        <p>
          搬送は0〜1の一次元モデル。一定速度・端部クランプ・左端で番号3bitを検出します。速度・検出幅・慣性・故障・実配線電気特性は再現していません。CP1は盤の入出力を無電源化し、PLC自体の電源は別として扱います。
        </p>
        <ul>
          <li>
            <a
              href="https://sespp.mhlw.go.jp/2025/vietnam/public_ja/SequenceSkillLevel2_ja.pdf"
              target="_blank"
              rel="noreferrer"
            >
              厚生労働省公開：2019年1月度2級試験概要 p.5–7
            </a>
          </li>
          <li>
            <a
              href="https://www.mee.co.jp/sales/fa/meefan/system_maintenance/training.html"
              target="_blank"
              rel="noreferrer"
            >
              三菱電機エンジニアリング：FA-T-P01 器具配置・配線図
            </a>
          </li>
          <li>
            <a
              href="https://store.fa.omron.co.jp/associates/skill/exam/sequence.html"
              target="_blank"
              rel="noreferrer"
            >
              オムロン：KENTEI-PLC 構成・外観
            </a>
          </li>
        </ul>
      </details>
    </section>
  );
}
