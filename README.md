# ASTRO DANMAKU // STELLAR ECLIPSE

スマートフォンブラウザでの片手・親指操作に最適化した、ゼロ依存・純粋 ES Modules 製 縦スクロール弾幕シューティング（Danmaku / Bullet-Hell）ゲームです。

A mobile-first, zero-dependency HTML5 Canvas2D vertical bullet-hell (danmaku) shooter powered by pure ES modules and Web Audio synthesis.

## Play / 公開 URL (GitHub Pages)

- **GitHub Pages:** <https://hiyasinnsu.github.io/test_AGY_Hydrogen/>

## Controls / 操作方法

### Mobile Touch (スマートフォン)
- **Move / 移動:** 画面上を **1本指ドラッグ**（相対移動のため指で自機の当たり判定が隠れません）
- **Bomb / ボム:** **2本指タップ** または画面右下の **BOMB** ボタン
- **Auto-Pause:** タブ切り替えやバックグラウンド移行時に自動でポーズされます

### Desktop Keyboard (PC フォールバック)
- **Move / 移動:** `Arrow` キー または `W` `A` `S` `D`
- **Focus (Slow) / 低速移動:** `Shift`
- **Bomb / ボム:** `Z` または `Space`
- **Pause / ポーズ:** `P` または `Esc`

## Features / 特徴

- **Mobile-first 9:16 Playfield:** 論理解像度 `450x800`・DPR 対応 Canvas2D・セーフエリア (`env(safe-area-inset-*)`)・`touch-action: none` 対応
- **3 Difficulties:** `EASY` / `NORMAL` / `LUNATIC` + タッチ感度切替・ハイスコア保存
- **Danmaku Mechanics:** 極小コア当たり判定、グレイズによるボムゲージ蓄積、ボムによる敵弾のジェム化、画面上部 POC ラインでのアイテム自動回収、中ボス＆3フェーズ構成の最終ボス
- **Zero Dependencies:** ビルドステップ不要。標準の ES Modules と Web Audio API シンセのみで動作

## Architecture / ファイル構成

```text
.
├── index.html                  # モバイル向けゲームシェル & オーバーレイ UI
├── styles.css                  # セーフエリア・9:16 レスポンシブレイアウト
├── manifest.webmanifest        # PWA マニフェスト (standalone / portrait)
├── assets/
│   └── icon.svg                # ベクターアプリアイコン
├── src/
│   ├── constants.js            # ゲーム定数・状態・難易度列挙（純粋 ES Module）
│   ├── pool.js                 # GC レスな固定長スワップ削除オブジェクトプール
│   ├── patterns.js             # 難易度倍率・敵定義・ウェーブ・ボス弾幕パターン
│   ├── simulation.js           # 当たり判定・グレイズ・ボム・進行シミュレーション
│   ├── input.js                # 相対タッチドラッグ / 2本指ボム / キーボード入力
│   ├── audio.js                # Web Audio API による効果音・BGM シンセサイザー
│   ├── renderer.js             # オフスクリーンスタンプ等を用いた高速 Canvas2D 描画
│   └── main.js                 # ゲームループ・UI 制御・ライフサイクル管理
├── tests/
│   ├── patterns.test.js        # 弾幕パターン・ステージ構成の単体テスト
│   └── simulation.test.js      # シミュレーション・プール・勝敗遷移の単体テスト
└── .github/workflows/
    └── deploy-pages.yml        # テスト実行 & GitHub Pages 自動デプロイ
```

## Local Run & Test / ローカル実行とテスト

ES Modules を読み込むため、`file://` ではなくローカル HTTP サーバー経由で起動してください。

```bash
# ローカルサーバー起動例（Python / Node）
python -m http.server 8080
# または
npx --yes serve .

# ブラウザで http://localhost:8080/ を開く
```

単体テスト（Node.js 組み込みテストランナー）:

```bash
npm test
# (runs: node --test tests/*.test.js)
```
