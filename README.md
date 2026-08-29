# Dopawork - 詰め4コマ

作業ドーパミン中毒のための、知的な息抜き穴埋めパズル。

1〜2分でお題の文章を打ち込むと、Gemini APIがモノクロ線画の4コマ漫画（起承転結）を生成します。空いているコマの文章を考えて埋めるだけで、副産物として1本のシュールな4コマが完成するブラウザ拡張機能です。
<img width="500" alt="dopawork_4koma_20260817022802" src="https://github.com/user-attachments/assets/5ac6a7e9-7cf3-4acd-926b-07548652c31d" />

## 主な機能

- お題の一部（2コマ）が固定表示され、残りをユーザーが入力して4コマを完成させる
- Gemini APIによるモノクロ線画SVGの自動生成
- 入力途中の状態やお気に入りの4コマをローカルに自動保存
- 生成した4コマを画像として保存
- 過去にお気に入り登録した4コマの履歴表示

## 技術スタック

- WebExtension（Manifest V3、Chrome / Firefox対応）
- Gemini API（`generativelanguage.googleapis.com`）
- Vanilla JavaScript（ESモジュール）

## セットアップ

1. [Google AI Studio](https://aistudio.google.com/app/apikey) でGemini APIキーを取得
2. ブラウザの拡張機能管理画面から「パッケージ化されていない拡張機能を読み込む」でこのリポジトリを選択
   - Chrome: `chrome://extensions` → デベロッパーモードON → 「パッケージ化されていない拡張機能を読み込む」
   - Firefox: `about:debugging#/runtime/this-firefox` → 「一時的なアドオンを読み込む」→ `manifest.json` を選択
3. 拡張機能アイコンをクリックし、取得したAPIキーを入力

APIキーは `chrome.storage.local` / `browser.storage.local` にのみ保存され、外部に送信されるのはGemini APIへのリクエスト時のみです。

## ディレクトリ構成

```
.
├── manifest.json       拡張機能マニフェスト
└── src/
    ├── popup.html      ポップアップUI
    ├── popup.css       スタイル
    ├── popup.js        UI制御・状態管理
    ├── auth.js         APIキー検証・認証UI
    ├── api.js          Gemini APIとの通信
    ├── game.js         4コマパズルのゲームロジック
    ├── storage.js      ローカルストレージ操作
    └── tips.js         生成中のTips表示
```
