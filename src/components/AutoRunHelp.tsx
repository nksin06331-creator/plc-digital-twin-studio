import type { ExamPlant, ExamWiring } from "../core/plant/exam";
import type { Memory } from "../core/engine";
export function AutoRunHelp({
  kind,
  plant,
  memory,
  wiring,
  running,
  blocked,
}: {
  kind: "grade2" | "basic" | null;
  plant: ExamPlant;
  memory: Memory;
  wiring: ExamWiring;
  running: boolean;
  blocked: boolean;
}) {
  const signals = plant.signals(),
    drive = plant.drive(memory, wiring);
  let message: string;
  let ready = false;
  if (blocked)
    message = "未対応命令などで実行できません。下部の診断を確認してください。";
  else if (!plant.power) message = "盤電源がOFFです。CP1をONにしてください。";
  else if (!running)
    message =
      "スキャン停止中です。まず「試験運転開始」を押してください。これはPLCをRUNにする操作で、搬送開始とは別です。";
  else if (drive.conflict)
    message =
      "左右の搬送指令が同時にONです。インターロックで停止しています。回路・割付を確認してください。";
  else if (kind === "grade2" && memory.M900)
    message =
      "異常保持中（表示99）です。PB5を離し、SS0を手動へ切替え、PB1〜3を離してからPB4を押してください。復帰後は右端に戻して自動始動します。";
  else if (kind && !signals.PB5)
    message = "PB5が押されています。非常停止ボタンを離してください。";
  else if (
    kind &&
    plant.selectors.SS0 &&
    ((kind === "grade2" && (memory.M10 || memory.M11 || memory.M12)) ||
      (kind === "basic" && memory.M12))
  )
    message =
      kind === "grade2" && memory.M11
        ? "左端でタイマー待機中です。待ち時間が終わると右行します。"
        : "自動運転中です。左端・右端のLS入力に従って搬送します。";
  else if (!kind)
    message =
      drive.left || drive.right
        ? "PLCから搬送指令が出ています。"
        : "PLCから搬送指令が出ていません。読み込んだ回路の始動条件とRY1/RY2の割付を確認してください。";
  else if (!plant.selectors.SS0)
    message =
      "SS0が手動です。自動運転するにはSS0をクリックして「自動」に切り替えてください。";
  else if (!signals.LS1)
    message =
      "右端LS1がOFFのため始動できません。SS0を手動にし、PB3で右端へ戻してから自動に切り替えてください。「右端」の試験配置も使えます。";
  else if (kind === "grade2" && plant.digitalSwitch === 0)
    message = "DSWが0です。1〜9に設定してからPB1を押してください。";
  else if (kind === "grade2" && (plant.pressed.PB2 || plant.pressed.PB3))
    message = "PB2・PB3を離してからPB1を押してください。";
  else if (kind === "grade2" && plant.pressed.PB1)
    message =
      "PB1を一度離してから押し直してください。自動への切替後に新しく押す必要があります。";
  else {
    message = "自動始動の準備OKです。PB1を押して離すと搬送を開始します。";
    ready = true;
  }
  return (
    <div
      className={"auto-run-help " + (ready ? "ready" : "")}
      role="status"
      aria-label="自動運転の状態"
    >
      <strong>{ready ? "始動待ち" : "運転ガイド"}</strong>
      <p>{message}</p>
      <div className="auto-run-signals">
        <span>{running ? "PLC RUN" : "PLC STOP"}</span>
        <span>SS0 {plant.selectors.SS0 ? "自動" : "手動"}</span>
        <span>LS1 {plant.power && signals.LS1 ? "ON" : "OFF"}</span>
        <span>DSW {plant.digitalSwitch}</span>
        <span>
          RY1 {wiring.outputs.RY1} / RY2 {wiring.outputs.RY2}
        </span>
      </div>
    </div>
  );
}
