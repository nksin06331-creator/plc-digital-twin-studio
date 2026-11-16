import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { parseBytes, parseText, MAX_BYTES } from "../parser";
import { PLC, validate, type ScanTrace } from "../core/engine";
import { signed16, device } from "../core/model";
import { analyze, exportDevices } from "../analyzer";
import basic from "../../samples/basic_and.csv?raw";
import hold from "../../samples/self_hold.csv?raw";
import mov from "../../samples/mov_example.csv?raw";
import { group } from "../core/operands";
import { LadderView } from "./LadderView";
import { TrainingPanel } from "./TrainingPanel";
import { ExamPanel } from "./ExamPanel";
import { ExamPlant, defaultWiring, type ExamWiring } from "../core/plant/exam";
import { PagedList } from "./PagedList";
import { Grade2Guide } from "./Grade2Guide";
import grade2 from "../../samples/grade2_comprehensive.csv?raw";
import exam from "../../samples/exam_conveyor.csv?raw";
import training from "../../samples/training_demo.csv?raw";
import counter from "../../samples/counter_example.csv?raw";
const samples: Record<string, string> = {
  counter_example: counter,
  grade2_comprehensive: grade2,
  exam_conveyor: exam,
  basic_and: basic,
  training_demo: training,
  self_hold: hold,
  mov_example: mov,
};
export function App() {
  const [program, setProgram] = useState(() => parseText(exam)),
    [filename, setFilename] = useState("exam_conveyor.csv"),
    [encoding, setEncoding] = useState<
      "auto" | "utf-8" | "shift_jis" | "utf-16le" | "utf-16be"
    >("auto"),
    [running, setRunning] = useState(false),
    [revision, refresh] = useState(0),
    [selected, setSelected] = useState<number | null>(null),
    [logs, setLogs] = useState<string[]>([]),
    [extra, setExtra] = useState<string[]>([]),
    [newDevice, setNewDevice] = useState("M0");
  const [showGrade2Guide, setShowGrade2Guide] = useState(false);
  const [analysisExpanded, setAnalysisExpanded] = useState(false);
  const [ladderExpanded, setLadderExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  function closeMenu() {
    setMenuOpen(false);
    mainRef.current?.focus({ preventScroll: true });
  }
  const [activeDemo, setActiveDemo] = useState<string | null>("exam_conveyor");
  const [lastTrace, setLastTrace] = useState<ScanTrace[]>([]);
  const [boardMode, setBoardMode] = useState<"exam" | "generic">("exam");
  const [wiring, setWiring] = useState<ExamWiring>(defaultWiring);
  const plant = useRef(new ExamPlant());
  const plc = useRef(new PLC());
  function resetSimulation() {
    plc.current.reset();
    plant.current.reset();
    if (boardMode === "exam")
      plc.current.inputs = plant.current.inputImage(wiring);
    setLastTrace([]);
  }
  useEffect(() => {
    if (boardMode === "exam") {
      plc.current.inputs = plant.current.inputImage(wiring);
      refresh((n) => n + 1);
    }
  }, [boardMode, wiring]);
  const loadVersion = useRef(0);
  const analysis = useMemo(() => analyze(program), [program]),
    errors = useMemo(
      () => [
        ...new Set([
          ...validate(program),
          ...analysis.diagnostics
            .filter((d) => d.severity === "error")
            .map((d) => d.message),
        ]),
      ],
      [program, analysis],
    );
  const deviceEntries = useMemo(() => [...analysis.devices], [analysis]);
  const programWarnings = useMemo(
    () => program.diagnostics.filter((d) => d.severity === "warning"),
    [program],
  );
  const selectedIndex = useMemo(
    () => program.instructions.findIndex((i) => i.step === selected),
    [program, selected],
  );
  const log = useCallback(
    (s: string) => setLogs((l) => [s, ...l].slice(0, 100)),
    [],
  );
  const scan = useCallback(
    (elapsedMs = 100, singleStep = false) => {
      const previousPosition = plant.current.position,
        previousInputs = { ...plc.current.inputs };
      try {
        if (boardMode === "exam") {
          // Continuous ticks account for motion since the previous evaluation.
          // A paused single step must first evaluate inputs changed while stopped.
          plant.current.advance(
            plc.current.memory,
            wiring,
            singleStep ? 0 : elapsedMs,
          );
          plc.current.inputs = plant.current.inputImage(wiring);
        }
        const trace = plc.current.scan(program, elapsedMs);
        if (boardMode === "exam" && singleStep) {
          plant.current.advance(plc.current.memory, wiring, elapsedMs);
          plc.current.inputs = plant.current.inputImage(wiring);
        }
        setLastTrace(trace);
        refresh((n) => n + 1);
        log(
          `${elapsedMs === 0 ? "入力変化・" : ""}スキャン ${plc.current.scans} 完了 · ${trace.length}命令`,
        );
        return true;
      } catch (e) {
        plant.current.position = previousPosition;
        plc.current.inputs = previousInputs;
        setRunning(false);
        log((e as Error).message);
        return false;
      }
    },
    [program, log, boardMode, wiring],
  );
  function changeInputs(values: Record<string, number>) {
    for (const [name, value] of Object.entries(values))
      plc.current.set(name, value);
    if (running) scan(0);
    else refresh((n) => n + 1);
  }
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(scan, 100);
    return () => window.clearInterval(id);
  }, [running, scan]);
  function load(text: string, name: string) {
    loadVersion.current++;
    setRunning(false);
    setProgram(parseText(text));
    setFilename(name);
    setActiveDemo(name.replace(/\.csv$/, ""));
    if (name === "grade2_comprehensive.csv") {
      const nextWiring = defaultWiring();
      setBoardMode("exam");
      setWiring(nextWiring);
      plc.current.reset();
      plant.current.reset();
      plant.current.digitalSwitch = 2;
      plc.current.inputs = plant.current.inputImage(nextWiring);
      setLastTrace([]);
    } else resetSimulation();
    setShowGrade2Guide(name === "grade2_comprehensive.csv");
    refresh((n) => n + 1);
    setSelected(null);
    setLogs([]);
    setExtra([]);
  }
  async function file(f: File) {
    const version = ++loadVersion.current;
    setRunning(false);
    if (f.size > MAX_BYTES) {
      log("ファイル上限は2 MiBです");
      return;
    }
    try {
      const p = parseBytes(new Uint8Array(await f.arrayBuffer()), encoding);
      if (version !== loadVersion.current) return;
      setRunning(false);
      setProgram(p);
      if (!p.adapter) setAnalysisExpanded(true);
      setFilename(f.name);
      setShowGrade2Guide(false);
      setActiveDemo(null);
      resetSimulation();
      refresh((n) => n + 1);
      setLogs([]);
      setSelected(null);
      setExtra([]);
      closeMenu();
    } catch (e) {
      log((e as Error).message);
    }
  }
  function download() {
    const url = URL.createObjectURL(
      new Blob([exportDevices(program)], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "devices.csv";
    a.click();
    URL.revokeObjectURL(url);
  }
  const names = useMemo(
    () => [...new Set([...analysis.devices.keys(), ...extra])].sort(),
    [analysis, extra],
  );
  const inputNames = useMemo(
    () => names.filter((n) => device(n)?.kind === "X"),
    [names],
  );
  const outputNames = useMemo(
    () => names.filter((n) => device(n)?.kind === "Y"),
    [names],
  );
  return (
    <div className="studio" data-revision={revision}>
      <div
        className="sidebar-shell"
        onPointerEnter={(e) => {
          if (e.pointerType === "mouse") setMenuOpen(true);
        }}
        onPointerLeave={(e) => {
          if (
            e.pointerType === "mouse" &&
            !e.currentTarget.contains(document.activeElement)
          )
            setMenuOpen(false);
        }}
        onFocusCapture={() => setMenuOpen(true)}
        onBlurCapture={(e) => {
          if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget))
            setMenuOpen(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            closeMenu();
          }
        }}
      >
        <button
          className="sidebar-trigger"
          aria-label="メニューを開く"
          aria-controls="studio-menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(true)}
        >
          ☰<span>メニュー</span>
        </button>
        <aside
          id="studio-menu"
          className={"sidebar-drawer" + (menuOpen ? " is-open" : "")}
          aria-hidden={!menuOpen}
          inert={!menuOpen}
        >
          <button
            className="sidebar-close"
            aria-label="メニューを閉じる"
            onClick={closeMenu}
          >
            ✕ 閉じる
          </button>
          <div className="brand">
            ◈ PLC<span>DIGITAL TWIN STUDIO</span>
          </div>
          <p className="caption">WORKSPACE / ローカル解析</p>
          <nav>
            {[
              ["import", "01 ファイル読込"],
              ["board", "02 試験盤"],
              ["ladder", "03 ラダー図"],
              ["program", "命令一覧"],
              ["devices", "詳細デバイス"],
              ["simulation", "スキャン操作"],
              ["diagnostics", "診断・ログ"],
            ].map(([id, label]) => (
              <a
                href={"#" + id}
                key={id}
                onClick={() => {
                  if (["program", "devices"].includes(id)) {
                    setAnalysisExpanded(true);
                  }
                  closeMenu();
                }}
              >
                {label}
              </a>
            ))}
          </nav>
          <section
            id="import"
            className="drop"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files[0];
              if (f) void file(f);
            }}
          >
            <strong>CSVをドロップ</strong>
            <p>端末内で解析 · 最大2 MiB</p>
            <label className="file">
              ファイルを選択
              <input
                type="file"
                aria-label="CSV・リストファイルを選択"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void file(f);
                  e.target.value = "";
                }}
              />
            </label>
            <p>
              拡張子で絞り込みません。選択後に内容を検証します。ZIP内のファイルは先に展開してください。
            </p>
          </section>
          <label>
            文字コード
            <select
              value={encoding}
              onChange={(e) => setEncoding(e.target.value as typeof encoding)}
            >
              <option value="auto">自動（推定）</option>
              <option value="utf-8">UTF-8</option>
              <option value="utf-16le">UTF-16LE（GX Works2）</option>
              <option value="utf-16be">UTF-16BE</option>
              <option value="shift_jis">Shift_JIS / CP932</option>
            </select>
          </label>
          <label className="panel-mode">
            盤モデル
            <select
              aria-label="盤モデル"
              value={boardMode}
              onChange={(e) => {
                setRunning(false);
                plc.current.reset();
                plant.current.reset();
                setLastTrace([]);
                setBoardMode(e.target.value as "exam" | "generic");
                refresh((n) => n + 1);
              }}
            >
              <option value="exam">2級試験盤（コンベア）</option>
              <option value="generic">汎用スイッチ・モーター盤</option>
            </select>
          </label>
          <h3>デモ回路</h3>
          {Object.keys(samples).map((s) => (
            <button
              key={s}
              aria-pressed={activeDemo === s}
              title={
                s === "grade2_comprehensive"
                  ? "試験盤・標準割付・右端・番号7・DSW2へ初期化"
                  : undefined
              }
              onClick={() => {
                load(samples[s], s + ".csv");
                closeMenu();
              }}
            >
              {s === "grade2_comprehensive"
                ? "2級対策・総合演習"
                : s === "counter_example"
                  ? "カウンター演習"
                  : s}
            </button>
          ))}
          <p className="notice">
            サンプルCSVと検証済み日本語GX
            Works2リスト形式に対応。未知の列は拒否します。
          </p>
          <p className="privacy">
            ● ブラウザ内で完結
            <br />
            CSVの外部送信なし
          </p>
        </aside>
      </div>
      <main
        ref={mainRef}
        tabIndex={-1}
        onPointerDown={() => setMenuOpen(false)}
      >
        <section
          className="current-program"
          aria-label="現在のプログラム"
          aria-live="polite"
        >
          <div className="current-program-name">
            <span>現在のプログラム</span>
            <strong>{filename}</strong>
          </div>
          <div className="current-program-meta">
            <span className="program-source">
              {activeDemo ? "デモ回路" : "選択したファイル"}
            </span>
            {activeDemo === "grade2_comprehensive" && (
              <span>2級対策・総合演習</span>
            )}
            <span>{program.instructions.length}命令</span>
            <span className={errors.length ? "error" : "on"}>
              {errors.length ? "実行不可・診断を確認" : "読込済み"}
            </span>
          </div>
        </section>
        <header>
          <div>
            <p className="caption">PROGRAM ANALYSIS & SCAN SIMULATION</p>
            <h1>PLC Digital Twin Studio</h1>
            <p>
              {filename} <span className="badge">{program.encoding}</span>{" "}
              <span className="badge">{program.adapter ?? "未認識"}</span>
            </p>
          </div>
          <span className={running ? "status on" : "status"}>
            {running ? "● RUNNING" : "● STOPPED"}
          </span>
        </header>
        <div className="metrics">
          <div>
            <b>{program.instructions.length}</b>命令
          </div>
          <div>
            <b>{analysis.devices.size}</b>デバイス
          </div>
          <div>
            <b>{plc.current.scans}</b>スキャン
          </div>
          <div>
            <b>{errors.length}</b>実行ブロッカー
          </div>
        </div>
        <section id="simulation" className="toolbar">
          <button
            disabled={running || !!errors.length}
            onClick={() => scan(100, true)}
          >
            ▶ 1スキャン
          </button>
          <button
            disabled={running || !!errors.length}
            onClick={() => {
              if (scan(0)) setRunning(true);
            }}
          >
            ▷ 連続実行
          </button>
          <button disabled={!running} onClick={() => setRunning(false)}>
            ■ 停止
          </button>
          <button
            onClick={() => {
              setRunning(false);
              resetSimulation();
              refresh((n) => n + 1);
              log("全メモリ・入力イメージを初期化");
            }}
          >
            ↺ 全メモリ初期化
          </button>
          <span>100 ms / scan</span>
        </section>
        <p className="notice">
          教育用の簡易モデルです。実機との完全一致を保証しません。実設備の検証・制御には使用しないでください。
        </p>
        <div
          className={
            "live-workbench" + (ladderExpanded ? " ladder-expanded" : "")
          }
        >
          <LadderView
            program={program}
            trace={lastTrace}
            selected={selected}
            onSelect={setSelected}
            expanded={ladderExpanded}
            onToggleExpanded={() => setLadderExpanded((value) => !value)}
          />
          {boardMode === "exam" ? (
            <ExamPanel
              demoKind={
                showGrade2Guide
                  ? "grade2"
                  : activeDemo === "exam_conveyor"
                    ? "basic"
                    : null
              }
              plant={plant.current}
              wiring={wiring}
              memory={plc.current.memory}
              running={running}
              blocked={!!errors.length}
              onOperate={(operation) => {
                operation(plant.current);
                plc.current.inputs = plant.current.inputImage(wiring);
                if (running) scan(0);
                else refresh((n) => n + 1);
              }}
              onWiring={(value) => {
                setRunning(false);
                plc.current.reset();
                plant.current.reset();
                setLastTrace([]);
                setWiring(value);
                refresh((n) => n + 1);
              }}
              onRun={() => {
                if (scan(0)) setRunning(true);
              }}
              onStop={() => {
                plant.current.releaseButtons();
                plc.current.inputs = plant.current.inputImage(wiring);
                setRunning(false);
                refresh((n) => n + 1);
              }}
            />
          ) : (
            <TrainingPanel
              key={filename}
              inputs={inputNames}
              outputs={outputNames}
              memory={plc.current.memory}
              inputImage={plc.current.inputs}
              running={running}
              blocked={!!errors.length}
              defaultBcdInput={
                program.instructions
                  .flatMap((i) => i.operands)
                  .map(group)
                  .find((g) => g?.start.kind === "X" && g.count === 4)?.start
                  .name
              }
              defaultBcdOutput={
                program.instructions
                  .flatMap((i) => i.operands)
                  .map(group)
                  .find((g) => g?.start.kind === "Y" && g.count === 8)?.start
                  .name
              }
              defaultForward={filename === "training_demo.csv" ? "Y1" : ""}
              defaultReverse={filename === "training_demo.csv" ? "Y2" : ""}
              onInput={(name, value) => changeInputs({ [name]: value })}
              onInputs={changeInputs}
              onRun={() => {
                if (scan(0)) setRunning(true);
              }}
              onStop={() => setRunning(false)}
            />
          )}
        </div>
        {showGrade2Guide && (
          <Grade2Guide
            key={program.instructions[0]?.comment}
            memory={plc.current.memory}
            running={running}
          />
        )}
        <details
          className="analysis-tools"
          open={analysisExpanded}
          onToggle={(e) => setAnalysisExpanded(e.currentTarget.open)}
        >
          <summary>命令一覧・デバイス・クロスリファレンス（詳細解析）</summary>
          {analysisExpanded && (
            <>
              <div className="workspace">
                <section id="program" className="panel">
                  <div className="panel-title">
                    <h2>命令リスト</h2>
                    <span>選択 STEP {selected ?? "—"}</span>
                  </div>
                  <PagedList
                    items={program.instructions}
                    label="命令一覧"
                    pageSize={100}
                    selectedIndex={selectedIndex}
                  >
                    {(visibleInstructions) => (
                      <div className="scroll">
                        <table>
                          <thead>
                            <tr>
                              <th>STEP</th>
                              <th>命令</th>
                              <th>オペランド</th>
                              <th>行</th>
                              <th>コメント</th>
                            </tr>
                          </thead>
                          <tbody>
                            {visibleInstructions.map((i, index) => (
                              <tr
                                key={index}
                                className={
                                  selected === i.step ? "selected" : ""
                                }
                                onClick={() => setSelected(i.step)}
                              >
                                <td>
                                  <button
                                    className="step"
                                    onClick={() => setSelected(i.step)}
                                  >
                                    {i.step}
                                  </button>
                                </td>
                                <td className="opcode">{i.opcode}</td>
                                <td>{i.operands.join(" ")}</td>
                                <td>{i.sourceLine}</td>
                                <td>{i.comment}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </PagedList>
                  {!program.adapter && (
                    <div className="preview">
                      <h3>未認識CSVのプレビュー（最大8行）</h3>
                      <pre>
                        {program.preview
                          .map((r) => JSON.stringify(r))
                          .join("\n")}
                      </pre>
                    </div>
                  )}
                </section>
                <section className="panel monitor">
                  <div className="panel-title">
                    <h2>デバイスモニター</h2>
                    <span>LIVE MEMORY</span>
                  </div>
                  <p className="muted">
                    Xは次スキャンの入力イメージ。試験盤モデルではXを盤側で操作します。停止中に初期値を設定できます。D値はEnterまたはフォーカス移動で確定、Escで取消。
                  </p>
                  <PagedList
                    items={names}
                    label="モニターデバイス"
                    pageSize={50}
                  >
                    {(visibleNames) => (
                      <>
                        {visibleNames.map((name) => {
                          const d = device(name)!;
                          const value =
                            d.kind === "X"
                              ? (plc.current.inputs[name] ?? 0)
                              : plc.current.read(name);
                          const editable = ["X", "Y", "M", "D"].includes(
                            d.kind,
                          );
                          const controllable =
                            editable &&
                            (d.kind !== "X" || boardMode === "generic");
                          const monitored =
                            editable ||
                            ["T", "C"].includes(d.kind) ||
                            name === "SM400";
                          return (
                            <div className="device" key={name}>
                              <strong>{name}</strong>
                              {d.kind === "D" ? (
                                <label>
                                  U16 / I16{" "}
                                  <input
                                    aria-label={name + " 初期値"}
                                    type="number"
                                    min="-32768"
                                    max="65535"
                                    disabled={running}
                                    key={`${name}:${revision}`}
                                    defaultValue={value}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter")
                                        e.currentTarget.blur();
                                      if (e.key === "Escape") {
                                        e.currentTarget.value = String(value);
                                        e.currentTarget.blur();
                                      }
                                    }}
                                    onBlur={(e) => {
                                      try {
                                        if (
                                          !/^-?\d+$/.test(e.currentTarget.value)
                                        )
                                          throw Error(
                                            "D初期値は−32768〜65535の整数で指定してください",
                                          );
                                        plc.current.set(
                                          name,
                                          Number(e.currentTarget.value),
                                        );
                                        refresh((n) => n + 1);
                                      } catch (err) {
                                        e.currentTarget.value = String(value);
                                        log((err as Error).message);
                                      }
                                    }}
                                  />
                                  <small>
                                    {value} / {signed16(value)}
                                  </small>
                                </label>
                              ) : d.kind === "C" ? (
                                <div
                                  className="counter-monitor"
                                  aria-label={name + " カウンター"}
                                >
                                  <output aria-label={name + " 現在値"}>
                                    {plc.current.counters[name] ?? 0}
                                  </output>
                                  <span className={value ? "on" : ""}>
                                    接点 {value ? "ON" : "OFF"}
                                  </span>
                                </div>
                              ) : (
                                <button
                                  disabled={
                                    !controllable || (running && d.kind !== "X")
                                  }
                                  className={value ? "on" : ""}
                                  onClick={() => {
                                    plc.current.set(name, value ? 0 : 1);
                                    refresh((n) => n + 1);
                                  }}
                                >
                                  {monitored
                                    ? value
                                      ? "● ON"
                                      : "○ OFF"
                                    : "監視対象外"}
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </>
                    )}
                  </PagedList>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const d = device(newDevice);
                      if (d && ["X", "Y", "M", "D", "C"].includes(d.kind))
                        setExtra((a) => [...a, d.name]);
                      else log("X/Y/M/D/Cを指定してください");
                    }}
                  >
                    <input
                      aria-label="監視デバイス追加"
                      value={newDevice}
                      onChange={(e) =>
                        setNewDevice(e.target.value.toUpperCase())
                      }
                    />
                    <button>追加</button>
                  </form>
                </section>
              </div>
              <section id="devices" className="panel">
                <div className="panel-title">
                  <h2>クロスリファレンス</h2>
                  <button onClick={download}>CSV出力 ↓</button>
                </div>
                <PagedList
                  items={deviceEntries}
                  label="デバイス一覧"
                  pageSize={50}
                >
                  {(visibleDevices) => (
                    <div className="scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>デバイス</th>
                            <th>使用箇所（step / source line / access）</th>
                          </tr>
                        </thead>
                        <tbody>
                          {visibleDevices.map(([name, refs]) => (
                            <tr key={name}>
                              <td>{name}</td>
                              <td>
                                <PagedList
                                  items={refs}
                                  label={name + " 使用箇所"}
                                  pageSize={50}
                                >
                                  {(visibleRefs) => (
                                    <>
                                      {visibleRefs.map((r, i) => (
                                        <button
                                          key={i}
                                          onClick={() => {
                                            setSelected(r.step);
                                            document
                                              .getElementById("program")
                                              ?.scrollIntoView();
                                          }}
                                        >
                                          S{r.step} / L{r.sourceLine} /{" "}
                                          {r.access}
                                        </button>
                                      ))}
                                    </>
                                  )}
                                </PagedList>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </PagedList>
                <p className="muted">
                  命令集計:{" "}
                  {[...analysis.counts]
                    .map(([k, v]) => `${k}: ${v}`)
                    .join(" · ")}
                </p>
                <PagedList
                  items={analysis.ranges}
                  label="範囲情報"
                  pageSize={50}
                >
                  {(visibleRanges) => (
                    <>
                      {visibleRanges.map((r, i) => (
                        <p key={i}>
                          範囲: {r.start} / {r.count ?? "不明"}点 / {r.access}
                          （桁指定は展開済み。BMOVの実行は未対応）
                        </p>
                      ))}
                    </>
                  )}
                </PagedList>
              </section>
            </>
          )}
        </details>
        <section id="diagnostics" className="panel">
          <h2>診断・実行ログ</h2>
          <PagedList items={errors} label="実行エラー" pageSize={50}>
            {(items) => (
              <>
                {items.map((e, i) => (
                  <p className="error" key={i}>
                    BLOCK · {e}
                  </p>
                ))}
              </>
            )}
          </PagedList>
          <PagedList items={programWarnings} label="解析警告" pageSize={50}>
            {(items) => (
              <>
                {items.map((d, i) => (
                  <p className="notice" key={i}>
                    L{d.sourceLine ?? "—"} · {d.message}
                  </p>
                ))}
              </>
            )}
          </PagedList>
          <PagedList
            items={analysis.warnings}
            label="複数書込み警告"
            pageSize={50}
          >
            {(items) => (
              <>
                {items.map((w, i) => (
                  <p className="notice" key={i}>
                    {w}
                  </p>
                ))}
              </>
            )}
          </PagedList>
          {!errors.length && (
            <p className="on">● 基本命令のスキャンを実行できます</p>
          )}
          <div className="logs">
            {logs.map((l, i) => (
              <div key={i}>{l}</div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
