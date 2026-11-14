import { useState } from "react";
import type { Memory } from "../core/engine";
const checks = [
  "手動の左右先押し優先と端部停止を説明・確認する",
  "3本のネジを変更し左端の番号表示と復路の積を確認する",
  "DSWの待ち時間と往復中の設定保持を確認する",
  "単発・連続往復と完了回数の1回計数を確認する",
  "非常停止・運転中の手動切替・番号0の異常を確認する",
  "非常停止解除だけでは再始動せず手動PB4で復帰することを確認する",
];
export function Grade2Guide({
  memory,
  running,
}: {
  memory: Memory;
  running: boolean;
}) {
  const [done, setDone] = useState<boolean[]>(() => checks.map(() => false));
  const phase = memory.M900
    ? "異常保持・要復帰"
    : memory.M12
      ? "右行・積を表示"
      : memory.M11
        ? "左端待機・番号を表示"
        : memory.M10
          ? "左行"
          : "待機 / 手動";
  return (
    <section className="panel grade2-guide">
      <div className="panel-title">
        <h2>2級対策・総合演習</h2>
        <span>
          {phase}
          {running ? "" : "（スキャン停止）"}
        </span>
      </div>
      <p>
        自作の練習課題です。実際の過去問の解答や合格保証ではありません。配線作業・学科等は別途学習してください。
      </p>
      <ol>
        <li>
          DSWは<strong>1〜9</strong>
          （読込時は2）。試験運転開始後、手動PB2/PB3で左右の先押し優先と端部停止を試します。
        </li>
        <li>
          右端に置き、SS0を自動にしてPB1を押して離します。左行 → ネジ番号を読取
          → DSW秒待機 → 右行 → 右端で計数・停止します。
        </li>
        <li>
          ネジ番号7・DSW2なら、左端で<strong>07</strong>、右行中に
          <strong>14</strong>、1往復完了時に<strong>01</strong>
          を表示。番号は左端到達時、DSWは往復開始時に保持します。
        </li>
        <li>
          SS1を入にすると連続往復。手動でPB1を押すと完了回数を表示し、PB4で回数を初期化します。
        </li>
        <li>
          PB5、運転中の手動切替、番号0、DSW0での自動始動は異常99＋PL4点滅。PB5を離し、手動へ切替え、PB1〜3を離して
          <strong>PB4を新しく押す</strong>
          と復帰します。復帰後は手動で右端へ戻してから自動始動します。
        </li>
      </ol>
      <div className="exercise-values">
        {[
          ["D30", "DSW現在値"],
          ["D0", "保持DSW"],
          ["D10", "保持ネジ番号"],
          ["D12", "番号×DSW"],
          ["D20", "完了回数"],
        ].map(([key, label]) => (
          <div key={key}>
            <span>
              {label} <code>{key}</code>
            </span>
            <strong>{memory[key] ?? 0}</strong>
          </div>
        ))}
      </div>
      <details>
        <summary>
          確認チェックリスト {done.filter(Boolean).length}/{checks.length}
        </summary>
        {checks.map((text, i) => (
          <label className="exercise-check" key={text}>
            <input
              type="checkbox"
              checked={done[i]}
              onChange={(e) =>
                setDone((values) =>
                  values.map((v, n) => (n === i ? e.target.checked : v)),
                )
              }
            />
            {text}
          </label>
        ))}
        <p>
          番号0はネジ全外しです。DSW0は自動始動時または連続運転の次の往復開始時に拒否します。同一スキャンで左右が同時に押された場合は左を優先します。左右の切替には1スキャンの無出力期間を入れます。表示99は「異常」と「完了回数99」の両方で使用するため、PL4点滅と併せて判断します。
        </p>
      </details>
    </section>
  );
}
