import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { parseBytes, parseText, MAX_BYTES } from "../parser";
import { PLC, validate } from "../core/engine";
import { signed16, device } from "../core/model";
import { analyze, exportDevices } from "../analyzer";
import basic from "../../samples/basic_and.csv?raw";
import hold from "../../samples/self_hold.csv?raw";
import mov from "../../samples/mov_example.csv?raw";
const samples: Record<string, string> = {
  basic_and: basic,
  self_hold: hold,
  mov_example: mov,
};
export function App() {
  const [program, setProgram] = useState(() => parseText(basic)),
    [filename, setFilename] = useState("basic_and.csv"),
    [encoding, setEncoding] = useState<"auto" | "utf-8" | "shift_jis">("auto"),
    [running, setRunning] = useState(false),
    [revision, refresh] = useState(0),
    [selected, setSelected] = useState<number | null>(null),
    [logs, setLogs] = useState<string[]>([]),
    [extra, setExtra] = useState<string[]>([]),
    [newDevice, setNewDevice] = useState("M0");
  const plc = useRef(new PLC());
  const loadVersion = useRef(0);
  const analysis = useMemo(() => analyze(program), [program]),
    errors = useMemo(() => validate(program), [program]);
  const log = useCallback(
    (s: string) => setLogs((l) => [s, ...l].slice(0, 100)),
    [],
  );
  const scan = useCallback(() => {
    try {
      const trace = plc.current.scan(program);
      setSelected(trace.at(-1)?.step ?? null);
      refresh((n) => n + 1);
      log(`スキャン ${plc.current.scans} 完了 · ${trace.length}命令`);
    } catch (e) {
      setRunning(false);
      log((e as Error).message);
    }
  }, [program, log]);
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(scan, 200);
    return () => window.clearInterval(id);
  }, [running, scan]);
  function load(text: string, name: string) {
    loadVersion.current++;
    setRunning(false);
    setProgram(parseText(text));
    setFilename(name);
    plc.current.reset();
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
      setFilename(f.name);
      plc.current.reset();
      refresh((n) => n + 1);
      setLogs([]);
      setSelected(null);
      setExtra([]);
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
  const names = [...new Set([...analysis.devices.keys(), ...extra])].sort();
  return (
    <div className="studio" data-revision={revision}>
      <aside>
        <div className="brand">
          ◈ PLC<span>DIGITAL TWIN STUDIO</span>
        </div>
        <p className="caption">WORKSPACE / ローカル解析</p>
        <nav>
          {[
            ["import", "01 ファイル読込"],
            ["program", "02 プログラム"],
            ["devices", "03 デバイス"],
            ["simulation", "04 シミュレーション"],
            ["diagnostics", "05 診断"],
          ].map(([id, label]) => (
            <a href={"#" + id} key={id}>
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
              accept=".csv,text/csv"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void file(f);
                e.target.value = "";
              }}
            />
          </label>
        </section>
        <label>
          文字コード
          <select
            value={encoding}
            onChange={(e) => setEncoding(e.target.value as typeof encoding)}
          >
            <option value="auto">自動（推定）</option>
            <option value="utf-8">UTF-8</option>
            <option value="shift_jis">Shift_JIS / CP932</option>
          </select>
        </label>
        <h3>デモ回路</h3>
        {Object.keys(samples).map((s) => (
          <button key={s} onClick={() => load(samples[s], s + ".csv")}>
            {s}
          </button>
        ))}
        <p className="notice">
          サンプル専用CSV形式です。GX Works2実出力は未検証。
        </p>
        <p className="privacy">
          ● ブラウザ内で完結
          <br />
          CSVの外部送信なし
        </p>
      </aside>
      <main>
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
          <button disabled={running || !!errors.length} onClick={scan}>
            ▶ 1スキャン
          </button>
          <button
            disabled={running || !!errors.length}
            onClick={() => setRunning(true)}
          >
            ▷ 連続実行
          </button>
          <button disabled={!running} onClick={() => setRunning(false)}>
            ■ 停止
          </button>
          <button
            onClick={() => {
              setRunning(false);
              plc.current.reset();
              refresh((n) => n + 1);
              log("全メモリ・入力イメージを初期化");
            }}
          >
            ↺ 全メモリ初期化
          </button>
          <span>200 ms / scan</span>
        </section>
        <p className="notice">
          教育用の簡易モデルです。実機との完全一致を保証しません。実設備の検証・制御には使用しないでください。
        </p>
        <div className="workspace">
          <section id="program" className="panel">
            <div className="panel-title">
              <h2>命令リスト</h2>
              <span>選択 STEP {selected ?? "—"}</span>
            </div>
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
                  {program.instructions.map((i, index) => (
                    <tr
                      key={index}
                      className={selected === i.step ? "selected" : ""}
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
            {!program.adapter && (
              <div className="preview">
                <h3>未認識CSVのプレビュー（最大8行）</h3>
                <pre>
                  {program.preview.map((r) => JSON.stringify(r)).join("\n")}
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
              Xは次スキャンの入力イメージ。停止中に初期値を設定できます。
            </p>
            {names.map((name) => {
              const d = device(name)!;
              const value =
                d.kind === "X"
                  ? (plc.current.inputs[name] ?? 0)
                  : plc.current.read(name);
              const editable = ["X", "Y", "M", "D"].includes(d.kind);
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
                        value={value}
                        onChange={(e) => {
                          try {
                            plc.current.set(name, Number(e.target.value));
                            refresh((n) => n + 1);
                          } catch (err) {
                            log((err as Error).message);
                          }
                        }}
                      />
                      <small>
                        {value} / {signed16(value)}
                      </small>
                    </label>
                  ) : (
                    <button
                      disabled={!editable || (running && d.kind !== "X")}
                      className={value ? "on" : ""}
                      onClick={() => {
                        plc.current.set(name, value ? 0 : 1);
                        refresh((n) => n + 1);
                      }}
                    >
                      {editable ? (value ? "● ON" : "○ OFF") : "監視対象外"}
                    </button>
                  )}
                </div>
              );
            })}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const d = device(newDevice);
                if (d && ["X", "Y", "M", "D"].includes(d.kind))
                  setExtra((a) => [...a, d.name]);
                else log("X/Y/M/Dを指定してください");
              }}
            >
              <input
                aria-label="監視デバイス追加"
                value={newDevice}
                onChange={(e) => setNewDevice(e.target.value.toUpperCase())}
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
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th>デバイス</th>
                  <th>使用箇所（step / source line / access）</th>
                </tr>
              </thead>
              <tbody>
                {[...analysis.devices].map(([name, refs]) => (
                  <tr key={name}>
                    <td>{name}</td>
                    <td>
                      {refs.map((r, i) => (
                        <button
                          key={i}
                          onClick={() => {
                            setSelected(r.step);
                            document
                              .getElementById("program")
                              ?.scrollIntoView();
                          }}
                        >
                          S{r.step} / L{r.sourceLine} / {r.access}
                        </button>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted">
            命令集計:{" "}
            {[...analysis.counts].map(([k, v]) => `${k}: ${v}`).join(" · ")}
          </p>
          {analysis.ranges.map((r, i) => (
            <p key={i}>
              範囲: {r.start} / {r.count ?? "不明"}点 / {r.access}
              （展開・実行は未対応）
            </p>
          ))}
        </section>
        <section id="diagnostics" className="panel">
          <h2>診断・実行ログ</h2>
          {errors.map((e, i) => (
            <p className="error" key={"e" + i}>
              BLOCK · {e}
            </p>
          ))}
          {program.diagnostics
            .filter((d) => d.severity === "warning")
            .map((d, i) => (
              <p className="notice" key={i}>
                L{d.sourceLine ?? "—"} · {d.message}
              </p>
            ))}
          {analysis.warnings.map((w) => (
            <p className="notice" key={w}>
              {w}
            </p>
          ))}
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
