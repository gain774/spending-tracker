# 支出トラッカー（GitHub Pages 公開用）

クレジットカード利用通知から、利用額・請求予定（口座別）・カテゴリ・収支計算を見られるアプリです。
React等はすべて `app.js` に同梱済みで、相対パスで作ってあるため `https://ユーザー名.github.io/リポジトリ名/` のサブパスでもそのまま動きます。
データは端末（ブラウザのlocalStorage）にのみ保存され、外部送信はありません。

## 公開する手順（ビルド不要）
1. GitHub で新しいリポジトリを作成（名前は任意 / Public）
2. リポジトリ画面で「Add file → Upload files」を開き、このフォルダ直下のファイルを全部アップロード
   - `index.html` `app.js` `sw.js` `manifest.webmanifest` `icon-192.png` `icon-512.png` `.nojekyll`
   - `source/` フォルダは編集用なので任意（無くても動きます）
   - ※ `.nojekyll` が見当たらない場合は「Add file → Create new file」でファイル名 `.nojekyll` を作って空のままコミット（推奨）
3. Commit する
4. Settings → Pages → Build and deployment
   - Source: **Deploy from a branch**
   - Branch: **main** / フォルダ **/ (root)** → Save
5. 1〜2分待つとページ上部に公開URL（`https://ユーザー名.github.io/リポジトリ名/`）が表示される

## スマホ（Android）にインストール
1. Chrome で公開URLを開く
2. 右上「︙」→「アプリをインストール」または「ホーム画面に追加」
3. 全画面アプリとして起動できます（オフライン対応）

> iPhone は Safari でURLを開く →共有→「ホーム画面に追加」

## 補足
- 初回は Pages のビルド完了前だと表示されないことがあります。数分後に再読み込みしてください。
- 表示中の明細は 2026-05-21 時点のスナップショットです。
- アプリを編集して作り直す場合は `source/BUILD.md` を参照（Node.js 必要）。

## ファイル構成
```
/ (リポジトリ直下＝公開対象)
├ index.html          アプリ
├ app.js              バンドル済み本体（React/Recharts同梱）
├ sw.js               オフライン用 Service Worker
├ manifest.webmanifest インストール用
├ icon-192.png / icon-512.png  アイコン
├ .nojekyll           （推奨）Pagesの加工を無効化
└ source/             編集用ソース（公開には不要）
```
