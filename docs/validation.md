# MVP validation

この実装のローカル確認結果:

- Node.js 24.22.1 / npm 11.9.0
- `npm run build`: TypeScript検証とVite production bundle作成が成功
- `npm run test`: Vitest 28件成功
- `npm run lint`: ESLint成功
- `CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e`: 6件成功

E2E対象: 初期サンプル、X切替、Y出力、連続スキャン、停止、リセット、CSVダウンロード、未知形式プレビュー、HTML文字列の非実行、MOVのD値、390px幅でのはみ出し確認、D負数の逐次入力と確定、不正値・取消時のメモリ保持、スキャン後の選択ステップ維持。

実GX Works2 CSV、実PLCとの照合、GitHub-hosted Actions、Pagesへの実公開はこの結果の対象外です。CIはリポジトリへのpush後に実行され、Pages設定は管理者が行います。
