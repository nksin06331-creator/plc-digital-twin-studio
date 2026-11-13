# Validation

ローカル確認環境: Node.js 24.22.1 / npm 11.9.0 / Chromium。

- `npm run build`: TypeScript検証・Vite production bundle成功
- `npm run test`: Vitest 40件成功
- `npm run lint`: ESLint成功
- `CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e`: ブラウザ11件成功

単体テストは、CSV/TSV、UTF-8/CP932/UTF-16、継続行とソース位置、空/巨大/不正入力、基本接点・保持、スキャン順、16bit、OR/ANDブロックの全入力組合せ、MPS/MRD/MPP、パルス、タイマー、桁指定、BCD、符号付き比較/乗算、実行エラー時の状態取消を確認しています。GX形式のリポジトリfixtureは合成データです。

ブラウザは、押しボタン・保持・NC接点、ランプ、自己保持、正逆転、同時ON異常、BCD設定器と数値表示、ラダー、詳細解析、CSV出力、未認識CSV、HTML非実行、D値編集、ウィンドウ非アクティブ時の押しボタン解放、巨大アドレスの拒否、390px幅の表示を確認しています。

受領した実GX Works2ファイルをリポジトリ外のローカルファイルとして別途検証しました。UTF-16LEの123命令を診断エラーなしで読み、36出力回路に復元し、100スキャンを完了。ブラウザでもCSV読込→入力操作→出力ランプ→割付モーターの正転表示を確認しました。回路の内容やそのファイルをリポジトリ・CI・公開ビルドへコピーしていません。

未検証: 実PLCとの波形/スキャン比較、全GX Works2出力オプション、特定検定盤との機器/配線一致、実CPUのタイマー単位、GitHub-hosted Actionsの結果、Pagesへの公開結果。100msタイマーモデルと汎用仮想盤の検証結果であり、実機一致の証明ではありません。
