# Ball Merge Game - Bug Report

**対象ファイル**: `C:/Users/show8/Documents/ClaudeWork/BallMergeGame/index.html`
**レビュー日**: 2026-02-13
**レビュー担当**: QA Debugger (Claude Opus 4.6)

---

## BUG-001: checkDeadline に固定 FIXED_DT を渡しているが、accumulator ループ外で1回だけ呼ばれる

- **重大度**: Major
- **該当行**: 759-760行目
- **カテゴリ**: 物理演算 / タイマー不整合

### 問題の説明

ゲームループ（`loop` 関数）は固定タイムステップの accumulator パターンを実装しており、`while (accumulator >= FIXED_DT)` のループ内で `Engine.update` と `processMerges` を呼んでいる。これは正しい。

しかし `checkDeadline(FIXED_DT)` はこのループの**外側**（759行目の後、760行目）で呼ばれている。物理演算が1フレーム内で複数回ステップされた場合（例: 30FPSで動作中は accumulator ループが2回回る）、`checkDeadline` は1回分の `FIXED_DT` しかカウントしない。

逆に、accumulator が `FIXED_DT` 未満の場合（フレームが非常に短い場合）、物理演算は0回実行されるが `checkDeadline(FIXED_DT)` は呼ばれる。つまり物理的にボールが動いていないのにデッドラインタイマーだけが進む。

```
実フレーム時間: 33ms（30FPS）
accumulator ループ: 2回 (16.67ms x 2)
checkDeadline 呼び出し: 1回 (16.67ms) ← 物理は33ms分進んだのにデッドラインは16.67ms分しか進まない

実フレーム時間: 8ms
accumulator ループ: 0回
checkDeadline 呼び出し: 1回 (16.67ms) ← 物理は0ms分なのにデッドラインが16.67ms分進む
```

### 修正案

`checkDeadline` を accumulator ループ内に移動するか、実際の経過時間 `elapsed` を渡す:

```javascript
// 方法A: accumulator ループ内に移動
while (accumulator >= FIXED_DT) {
  Engine.update(engine, FIXED_DT);
  processMerges();
  accumulator -= FIXED_DT;
}
frameAllBodies = Composite.allBodies(world);
checkDeadline(elapsed); // 実フレーム時間を渡す

// 方法B: ループ内でステップごとに呼ぶ
while (accumulator >= FIXED_DT) {
  Engine.update(engine, FIXED_DT);
  processMerges();
  frameAllBodies = Composite.allBodies(world);
  checkDeadline(FIXED_DT);
  accumulator -= FIXED_DT;
}
```

---

## BUG-002: 連鎖判定が Date.now() ベースで、物理タイムステップと無関係

- **重大度**: Major
- **該当行**: 281-287行目
- **カテゴリ**: スコア計算 / 連鎖ボーナス

### 問題の説明

連鎖判定は `chainTimer` に `Date.now()` を保存し、次の合体時に `(now - chainTimer) < CHAIN_TIMEOUT (1500ms)` で判定している。

固定タイムステップの accumulator パターンでは、1回の `requestAnimationFrame` コールバック内で `Engine.update` が複数回呼ばれる。これらの更新はすべて同じ実時間（同じ `Date.now()` 値）で実行されるため、accumulator ループ内で発生した合体はすべて `now - chainTimer` がほぼ0になり、常に連鎖と判定される。

これは意図した動作かもしれないが、以下の問題がある:

1. **低FPS環境での有利**: 30FPSの場合、accumulator ループが2回回り、2回分の物理ステップが同一の `Date.now()` で処理される。60FPSでは1回ずつ。低FPS環境では同じ実時間内により多くの合体が「同時」に処理されるため、連鎖判定で有利になる。
2. **タブが非アクティブからアクティブに戻った場合**: `elapsed` は50msにクランプされるが、`Date.now()` はクランプされない。非アクティブ中に時間が経過しているため、`chainTimer` との差が `CHAIN_TIMEOUT` を超え、連鎖がリセットされる（これは正しい動作だが、`Date.now()` と物理時間の混在は設計として一貫性がない）。

### 修正案

物理ステップ数ベースのカウンタを使う:

```javascript
let chainStepCounter = 0; // 物理ステップ数カウンタ
let lastMergeStep = -Infinity;
const CHAIN_TIMEOUT_STEPS = 90; // 90ステップ = 約1.5秒 (60fps)

// accumulator ループ内でインクリメント
while (accumulator >= FIXED_DT) {
  Engine.update(engine, FIXED_DT);
  chainStepCounter++;
  processMerges();
  accumulator -= FIXED_DT;
}

// processMerges内:
if (chainStepCounter - lastMergeStep < CHAIN_TIMEOUT_STEPS) {
  chainCount++;
} else {
  chainCount = 1;
}
lastMergeStep = chainStepCounter;
```

---

## BUG-003: タッチ操作でゲームオーバー遷移中にリトライが意図せず発動する可能性

- **重大度**: Minor
- **該当行**: 699-711行目
- **カテゴリ**: 操作（タッチ） / 状態遷移

### 問題の説明

以下のシナリオでリトライが意図せず発動する:

1. `touchstart` → `gameOver = false` のため、`touchActive = true` がセットされる
2. ボールがドロップされ、即座にデッドライン超過でゲームオーバーが発動 → `gameOver = true`
3. `touchend` → 先に `gameOver` チェック → `tryRetry()` が呼ばれる

プレイヤーはゲームオーバーを認識する前にリトライが発動し、ゲームオーバー画面を見ることなく新しいゲームが始まる。

ボタン座標の偶然の一致が必要なため発生頻度は低いが、リトライボタンがゲームエリアの中央付近にあるため、ドロップ操作の指位置と重なる可能性がある。

### 修正案

ゲームオーバー発生時刻を記録し、一定時間の入力を無視する:

```javascript
let gameOverTime = 0;

function triggerGameOver() {
  gameOver = true;
  gameOverTime = Date.now();
  // ... 既存コード ...
}

function tryRetry(mx, my) {
  // ゲームオーバーから500ms未満は入力を無視
  if (Date.now() - gameOverTime < 500) return;
  if (mx >= RETRY_BTN.x && mx <= RETRY_BTN.x + RETRY_BTN.w &&
      my >= RETRY_BTN.y && my <= RETRY_BTN.y + RETRY_BTN.h) {
    resetGame();
  }
}
```

---

## BUG-004: ボム爆発でスコア加算時に localStorage への保存が行われない

- **重大度**: Minor
- **該当行**: 380-407行目
- **カテゴリ**: スコア保存

### 問題の説明

`processBombExplosion` 関数の末尾（405-407行目）で `score > highScore` のチェックとメモリ上の `highScore` 更新は行われているが、`localStorage.setItem` は呼ばれていない。

一方、通常の合体で `processMerges` 内（333-335行目）でも同様にメモリ上の `highScore` のみ更新している。

`localStorage` への保存はゲームオーバー時（`triggerGameOver` 内、610-613行目）にのみ行われるため、**ボム爆発でハイスコアを更新した直後にブラウザがクラッシュしたりタブを閉じた場合、ハイスコアが失われる**。

これは `processMerges` 内のスコア更新でも同じ問題があるため、ゲーム全体のスコア保存ポリシーの問題。

### 修正案

ゲームオーバー時の保存で十分だが、安全性を高めるなら定期的に保存する:

```javascript
let lastSaveTime = 0;
const SAVE_INTERVAL = 5000; // 5秒ごと

// processMerges / processBombExplosion 内のスコア更新後:
if (score > highScore) {
  highScore = score;
  const now = Date.now();
  if (now - lastSaveTime > SAVE_INTERVAL) {
    localStorage.setItem('ballMergeHighScore', highScore);
    lastSaveTime = now;
  }
}
```

---

## BUG-005: ボム衝突判定で、ボムが壁に衝突した場合も爆発トリガーが発動する

- **重大度**: Major
- **該当行**: 225-241行目
- **カテゴリ**: ボムシステム

### 問題の説明

`onCollision` のボム判定（230-241行目）は、衝突ペアの片方が `bomb` ラベルであれば即座に `mergeQueue` にボム爆発エントリを追加する。

しかし、衝突相手のチェックがない。壁（`isStatic: true`、ラベルなし）との衝突でもボム爆発が発動する。具体的には:

1. ボムをドロップする
2. ボムが床（底の壁）に着地する → `collisionStart` が発火
3. ボム爆発が発動する

これ自体は「何かにぶつかると爆発」という設計意図に合致している可能性があるが、以下の問題がある:

- `collisionActive` イベントでも `onCollision` が呼ばれるため（137行目）、ボムが壁に触れ続けると毎フレーム `mergeQueue` にエントリが追加される。`mergedThisFrame` で1フレーム内の重複は防がれるが、`mergedThisFrame` は `processMerges` の最後（337行目）でクリアされるため、次の物理ステップで再度追加される。
- ただし `processBombExplosion` で `allBodiesSet.has(bomb.id)` チェック（342行目）があるため、2回目以降は早期リターンする。

**実際の問題**: `collisionActive` が `collisionStart` より先に発火するケースはないが、accumulator ループ内で `Engine.update` が複数回呼ばれる場合、1回目の `Engine.update` でボムが壁に衝突 → `mergeQueue` に追加 → `processMerges` でボム処理＋`mergedThisFrame` クリア → 2回目の `Engine.update` → ボムは既にワールドから削除されているので問題なし。

結論として、現在のコードでは二重爆発は発生しないが、`collisionActive` をリッスンしている以上、`mergeQueue` に不要なエントリが毎フレーム追加され、`processBombExplosion` の `allBodiesSet.has(bomb.id)` チェックで弾かれるという無駄な処理が発生する。

### 修正案

ボム衝突時に `mergedThisFrame` だけでなく、爆発済みフラグを設定する:

```javascript
function onCollision(event) {
  for (const pair of event.pairs) {
    const a = pair.bodyA, b = pair.bodyB;

    const aIsBomb = a.label === 'bomb';
    const bIsBomb = b.label === 'bomb';
    if (aIsBomb || bIsBomb) {
      const bomb = aIsBomb ? a : b;
      if (mergedThisFrame.has(bomb.id)) continue;
      if (bomb._bombTriggered) continue; // 爆発済みスキップ
      mergedThisFrame.add(bomb.id);
      bomb._bombTriggered = true;
      const info = ballBodies.get(bomb.id);
      if (info) {
        mergeQueue.push({ type: 'BOMB', bomb, level: info.level });
      }
      continue;
    }
    // ... 残りのコード
  }
}
```

---

## BUG-006: ミッション生成で DESTROY_BOMB の利用可能判定が不正確

- **重大度**: Major
- **該当行**: 415-420行目
- **カテゴリ**: ミッションシステム

### 問題の説明

`generateNextMission()` で `DESTROY_BOMB` ミッションの利用可能条件が `missionCount < 1 || bombStock < 1`（417行目）となっている。つまり「ミッションを1つもクリアしていない」または「ボムの在庫がない」場合は除外される。

しかし、ミッションクリア時に `bombStock++`（500行目）でボムが追加され、`missionTransitionTimer` 経過後（300ms後）に `generateNextMission()` が呼ばれる。

**問題のシナリオ**:

1. ミッション1をクリア → `bombStock` が 0→1 に、`missionCount` が 0→1 に
2. 300ms後に `generateNextMission()` が呼ばれる
3. `bombStock >= 1` かつ `missionCount >= 1` なので `DESTROY_BOMB` が候補に入る
4. プレイヤーがボムを使う → `bombStock` が 1→0 に
5. `DESTROY_BOMB` ミッションが選ばれていた場合、プレイヤーはボムなしでミッションをクリアする方法がない

ミッションが生成される時点でのボム在庫はチェックされるが、ミッション開始後にボムを消費しても ミッションは変更されない。ただし、ボムミッションの存在によりプレイヤーがボムを温存するインセンティブが生まれるため、ゲームデザイン上は意図的かもしれない。

**より深刻な問題**: フォールバック（420行目）で `available.length === 0` の場合、再度 `DESTROY_BOMB` を含む全タイプからフィルタリングするが、`lastMissionType` フィルタが適用されない。同じタイプのミッションが連続して出現する可能性がある。

### 修正案

```javascript
let available = types.filter(t => {
  if (t === 'DESTROY_BOMB' && missionCount < 1) return false; // ボム在庫は不問（獲得手段があるため）
  if (t === lastMissionType) return false;
  return true;
});
if (available.length === 0) {
  available = types.filter(t => {
    if (t === 'DESTROY_BOMB' && missionCount < 1) return false;
    return true; // lastMissionType フィルタは外す（フォールバック）
  });
}
if (available.length === 0) {
  available = ['MERGE_COUNT']; // 最終フォールバック
}
```

---

## BUG-007: タイトル画面でゲームループが物理演算なしで回り続けるが、エフェクトの updateEffects が毎フレーム呼ばれる

- **重大度**: Minor
- **該当行**: 750-766行目
- **カテゴリ**: パフォーマンス

### 問題の説明

`loop` 関数内で `showTitle` が `true` の場合、`if (!gameOver && !showTitle)` ブロックはスキップされるが、`updateEffects(FIXED_DT)`（763行目）は常に呼ばれる。

タイトル画面表示中はエフェクト（particles, floatTexts, chainTexts, bombExplosions）は空配列のはずだが、毎フレーム空配列の `filter` や `for...of` ループが実行される。

パフォーマンスへの影響は極めて軽微だが、タイトル画面では `drawTitleScreen()` 内の `Date.now()` ベースのアニメーション（698行目 "TAP TO START" のパルス、1150行目ボム導火線のスパーク）が動くため、`requestAnimationFrame` は必要。

### 修正案

```javascript
if (!showTitle) {
  updateEffects(FIXED_DT);
}
```

---

## BUG-008: タイトル画面からゲーム開始時、ボールが既にスポーン済み

- **重大度**: Minor
- **該当行**: 123-143行目、664-665行目
- **カテゴリ**: 状態管理

### 問題の説明

`init()` 関数（123行目）で、タイトル画面表示前にすべてのゲーム初期化が行われる:
- `createWalls()` → 壁生成
- `currentLevel = randLevel()` → レベル決定
- `spawnHeldBall()` → ボールをワールドに追加（`isStatic: true`）
- `Events.on(engine, ...)` → 衝突イベント登録
- `generateNextMission()` → ミッション生成

タイトル画面表示中（`showTitle = true`）、物理演算とゲームループは停止しているが、保持中のボール（`currentBall`）はワールド内に存在し、`isStatic: true` で待機している。

`mousedown` / `touchstart` で `showTitle = false` にセットされた瞬間、次の `requestAnimationFrame` で物理演算が開始される。保持中のボールはすでにスポーン済みなので、即座にプレイ可能。

**問題点**: タイトル画面の「TAP TO START」をクリック/タップした座標が、ゲーム開始後のボールの落下位置として使われる。`mousedown` ハンドラ（664-665行目）で `showTitle = false` にして早期リターンするため、`pointerX` は更新されず `doDrop()` も呼ばれない。しかし `pointerX` の初期値は `AREA_X + AREA_W / 2`（102行目）なので中央からスタートする。

厳密にはバグではないが、タイトルタップ位置がゲームエリア外（左端や右端の余白）の場合でも `pointerX` は初期値のまま中央を維持するため、ユーザーの期待と一致する。

ただし、`touchstart` では `touchActive` がセットされずに返るため、直後の `touchend` で `doDrop()` が呼ばれない。これは正しい。`mousedown` でもゲーム開始のクリックでは `doDrop()` が呼ばれない。初回のドロップには追加のクリック/タッチが必要。

**残る問題**: `mousemove` ハンドラ（657-661行目）は `showTitle` が `true` の場合は早期リターンするが、タイトル画面中にマウスを動かしていて、クリックで `showTitle = false` になった瞬間から `mousemove` が反映される。マウスがゲームエリア外にあった場合、`pointerX` がエリア外の値になるが、`clampDropX` でクランプされるため問題ない。

### 修正案

特に大きな問題はないが、タイトル画面表示中はボールを生成しないようにすることで不要なリソースを削減できる:

```javascript
function init() {
  // ... 既存の初期化 ...
  // spawnHeldBall(); // タイトル画面中は生成しない
  // ...
}

// タイトル画面を閉じた後にボールを生成
canvas.addEventListener('mousedown', (e) => {
  if (showTitle) {
    showTitle = false;
    spawnHeldBall(); // ここで初めてスポーン
    return;
  }
  // ...
});
```

---

## BUG-009: 合体で生成されたボールの clampedY が上方向にクランプされない

- **重大度**: Major
- **該当行**: 305-306行目
- **カテゴリ**: 物理演算 / エッジケース

### 問題の説明

合体時の新ボール生成位置（305-306行目）:
```javascript
const clampedX = Math.max(AREA_X + nd.r + 1, Math.min(AREA_X + AREA_W - nd.r - 1, midX));
const clampedY = Math.min(AREA_Y + AREA_H - nd.r - 1, midY);
```

X方向は左右の壁内にクランプされているが、Y方向は**下方向のみクランプ**（`Math.min` で床の内側に制限）。上方向のクランプがない。

2つのボールがゲームエリアの上部で合体した場合、`midY` がエリア上端より上になる可能性がある（デッドラインの上で合体した場合）。新しいボールが `AREA_Y` よりも上に生成されると、ヘッダー領域と重なる位置にボールが出現する。

描画上はクリッピングがあるため見えないが、物理的にはゲームエリア外に存在するボールが壁と重なった状態になり、物理エンジンの不正な挙動を引き起こす可能性がある。

### 修正案

```javascript
const clampedX = Math.max(AREA_X + nd.r + 1, Math.min(AREA_X + AREA_W - nd.r - 1, midX));
const clampedY = Math.max(AREA_Y + nd.r + 1, Math.min(AREA_Y + AREA_H - nd.r - 1, midY));
```

---

## BUG-010: frameAllBodies がゲームオーバー後に更新されない

- **重大度**: Minor
- **該当行**: 750-766行目、819-832行目
- **カテゴリ**: レンダリング

### 問題の説明

`frameAllBodies` は `loop` 関数内の `if (!gameOver && !showTitle)` ブロック内（759行目）でのみ更新される。ゲームオーバー後はこのブロックがスキップされるため、`frameAllBodies` は最後のフレームの値のまま固定される。

`render` 関数（820行目）では `frameAllBodies.length > 0 ? frameAllBodies : Composite.allBodies(world)` でフォールバックがあるため、`frameAllBodies` が空でなければキャッシュ値が使われる。

ゲームオーバー後もボールは描画される必要がある（ゲームオーバー画面の背景として）。ゲームオーバー後に物理演算は停止しているが、ボールは慣性で動き続ける可能性がある（`Engine.update` が呼ばれないため実際には動かない）。

しかし `resetGame()` で `World.remove` を使ってボールを削除しても、`frameAllBodies` は更新されず、削除済みのボディへの参照を保持し続ける。`resetGame` 直後に `loop` が呼ばれてゲームが再開されるため、次のフレームで `frameAllBodies` は更新されるが、一瞬だけ古いデータで描画される可能性がある。

### 修正案

`resetGame` の最後で `frameAllBodies` をクリアする:

```javascript
function resetGame() {
  // ... 既存のリセットコード ...
  frameAllBodies = [];
}
```

---

## BUG-011: 保持中ボールの描画がクリップ領域内で行われるが、DROP_Y がクリップ上端より上の場合がある

- **重大度**: Minor
- **該当行**: 813-841行目、46行目
- **カテゴリ**: レンダリング

### 問題の説明

`render` 関数でボール描画はクリップ領域 `ctx.rect(AREA_X, AREA_Y, AREA_W, AREA_H)`（816行目）内に制限されている。

保持中のボール（`currentBall`）は `DROP_Y = AREA_Y + 35`（46行目）に配置される。`AREA_Y = 140` なので `DROP_Y = 175`。クリップ領域の上端は `AREA_Y = 140` なので、ボールの中心は領域内にある。

しかしレベル1のボール（r=15）の上端は `175 - 15 = 160 > 140` で収まるが、レベル5（r=41）の上端は `175 - 41 = 134 < 140` でクリップされる。つまり大きなレベルのボールは上部がクリップで切れる。

これは初回ドロップ候補のレベルは1-5（`randLevel`が1-5を返す、170-172行目）なので、レベル5の場合にボールの上部6pxが見えなくなる。微小な視覚的問題。

### 修正案

クリップ領域を上に拡張するか、保持中のボールをクリップ外で描画する:

```javascript
// 方法: 保持中ボールはクリップ外で描画
ctx.restore(); // クリップ解除

// Held ball (outside clip so it's not cut off)
if (currentBall && !gameOver) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(AREA_X, AREA_Y - 50, AREA_W, AREA_H + 50); // 上に拡張
  ctx.clip();
  if (bombMode && bombStock > 0) {
    drawBombBall(currentBall, currentLevel, 0.85);
  } else {
    drawBall(currentBall, currentLevel, 0.85);
  }
  ctx.restore();
}
```

---

## BUG-012: ミッション進捗で CREATE_LEVEL の progress 表示がレベル値になり、プログレスバーが不正確

- **重大度**: Minor
- **該当行**: 465-469行目、950-968行目
- **カテゴリ**: ミッションシステム / UI表示

### 問題の説明

`CREATE_LEVEL` ミッションの `progress` は `Math.max(currentMission.progress, event.newLevel)` で更新される（467行目）。つまり `progress` は「これまでに作った最大レベル」を保持する。

ミッション行の描画（956行目）では:
```javascript
const progress = Math.min(currentMission.progress / currentMission.goal, 1);
```

例えば「Lv.7を作れ！」（goal=7）のミッション中にLv.4を作った場合:
- `progress = 4`, `goal = 7`
- 表示: `4/7`, バー = 57%

これはプレイヤーに「Lv.4まで進んだ」と伝えるには適切だが、実際の達成に必要な作業量とは無関係。Lv.4からLv.7を作るには何回もの合体が必要だが、バーは「あと少し」に見える。

プログレスバーの表示としては正確（4/7という数値は正しい）だが、ゲーム体験としてはバーの進み方がリニアでないため、プレイヤーに誤解を与える可能性がある。

### 修正案

表示を変更して、ターゲットレベルに対する到達度をより直感的にする:

```javascript
// CREATE_LEVEL ミッションの場合は「現在の最大Lv / 目標Lv」ではなく
// テキスト表示を変更
if (currentMission.type === 'CREATE_LEVEL') {
  const txt = 'Lv.' + currentMission.progress + ' → Lv.' + currentMission.goal;
  ctx.fillText(txt, barX + barW + 4, barY + 3);
} else {
  ctx.fillText(currentMission.progress + '/' + currentMission.goal, barX + barW + 4, barY + 3);
}
```

---

## BUG-013: ゲームオーバー時に bombMode がリセットされるが、ゲームオーバー画面上にボムボタンの視覚残像が残る

- **重大度**: Info
- **該当行**: 606行目、878-880行目
- **カテゴリ**: UI表示

### 問題の説明

`triggerGameOver()` で `bombMode = false`（606行目）が設定される。`render()` では `drawHeader()`（878行目）が呼ばれ、その中で `drawBombButton()`（978行目）が呼ばれる。

ゲームオーバー画面の `drawGameOverScreen()`（880行目）は半透明の黒い overlay を全画面に描画する（1737行目: `rgba(0,0,0,0.72)`）。ヘッダー部分はこの overlay の下に透けて見える。

ボムボタンは `drawHeader` 内で描画され、`drawGameOverScreen` でその上に半透明 overlay が重なるため、ボムボタンが薄く見える。これは意図した動作の可能性があるが、ゲームオーバー中にボムボタンが見えると紛らわしい。

### 修正案

`drawHeader` 内でゲームオーバー時にボムボタンの描画をスキップ:

```javascript
function drawMissionRow() {
  // ...
  if (!gameOver) drawBombButton();
}
```

---

## BUG-014: Composite.allBodies(world) が processMerges 内と processBombExplosion 内で重複呼び出し

- **重大度**: Minor
- **該当行**: 255行目、354-357行目
- **カテゴリ**: パフォーマンス

### 問題の説明

`processMerges()` の先頭（255行目）で `Composite.allBodies(world)` を呼んで `allBodies` セットを構築する。しかし `processBombExplosion()` 内（354-357行目）でも `Composite.allBodies(world)` を呼んで `bodyMap` を構築している。

1回の `processMerges` 呼び出し内でボム爆発が発生する場合、合計2回 `Composite.allBodies(world)` が呼ばれる。

ボム爆発は `mergeQueue` の一部として処理されるため、`processMerges` の `allBodies` セットと `processBombExplosion` の `bodyMap` は同じデータから構築される（ただし前者はID集合、後者はID→Bodyマップ）。

### 修正案

`processMerges` でID→Bodyマップを構築し、`processBombExplosion` に渡す:

```javascript
function processMerges() {
  const allBodiesList = Composite.allBodies(world);
  const allBodies = new Set(allBodiesList.map(b => b.id));
  const bodyMap = new Map();
  for (const b of allBodiesList) bodyMap.set(b.id, b);

  while (mergeQueue.length > 0) {
    const entry = mergeQueue.shift();
    if (entry.type === 'BOMB') {
      processBombExplosion(entry, allBodies, bodyMap);
      continue;
    }
    // ...
  }
}

function processBombExplosion(entry, allBodiesSet, bodyMap) {
  // bodyMap を直接使用（Composite.allBodies の再呼び出し不要）
  // ...
}
```

---

## BUG-015: resetGame() で accumulator がリセットされるが lastTime がリセットされない

- **重大度**: Minor
- **該当行**: 631行目、742-749行目
- **カテゴリ**: ゲームリセット / タイミング

### 問題の説明

`resetGame()` で `accumulator = 0`（631行目）がリセットされるが、`lastTime`（742行目）はリセットされない。

リセット後の最初の `loop` コールバックで:
```javascript
const elapsed = lastTime ? Math.min(ts - lastTime, 50) : FIXED_DT;
```

`lastTime` がリセット前の値のままなので、`ts - lastTime` は通常のフレーム間隔（~16ms）になり、特に問題は生じない。

しかし、リセットボタンを押す前にゲームオーバー画面で長時間放置した場合:
- `lastTime` はゲームオーバー直前のタイムスタンプ
- ゲームオーバー後もループは回り続けるので `lastTime` は更新される

実際にはゲームオーバー後もループが動いているため `lastTime` は常に最新値を持つ。よって大きな問題ではない。

### 修正案

安全のためリセット時に `lastTime` もリセット:

```javascript
function resetGame() {
  // ... 既存のリセットコード ...
  lastTime = 0;
  accumulator = 0;
}
```

---

## BUG-016: ゲームオーバー後も requestAnimationFrame が60FPSで回り続ける

- **重大度**: Info
- **該当行**: 747-766行目
- **カテゴリ**: パフォーマンス / バッテリー消費

### 問題の説明

ゲームオーバー後、物理演算は停止するが `requestAnimationFrame(loop)` は毎フレーム呼ばれ続ける。ゲームオーバー画面は静的（エフェクト消滅後はリトライボタンのみ）であるため、毎フレームの全画面再描画は不要。

特にモバイル端末ではバッテリー消費に影響する。

### 修正案

ゲームオーバー後かつエフェクト終了後はフレームレートを下げる:

```javascript
function loop(ts) {
  // ... 既存コード ...

  const isIdle = (gameOver || showTitle) &&
    particles.length === 0 && floatTexts.length === 0 &&
    chainTexts.length === 0 && bombExplosions.length === 0;

  if (isIdle && !showTitle) {
    // ゲームオーバー画面は変化なし、低頻度で再描画
    setTimeout(() => requestAnimationFrame(loop), 200);
  } else {
    requestAnimationFrame(loop);
  }
}
```

注意: タイトル画面は "TAP TO START" のパルスアニメーションがあるため、60FPSを維持する必要がある。

---

## BUG-017: handleResize で DPR 変更への対応が不十分

- **重大度**: Info
- **該当行**: 146-157行目
- **カテゴリ**: レンダリング / エッジケース

### 問題の説明

`handleResize()` は `window.devicePixelRatio` を取得してキャンバスの物理ピクセルサイズを設定し、`ctx.setTransform(dpr, 0, 0, dpr, 0, 0)` でスケーリングする。

しかし、ユーザーがブラウザのズーム倍率を変更した場合、`devicePixelRatio` が変化する。`resize` イベントではズーム変更が検出されない場合がある（ブラウザによる）。

また、デュアルモニター環境でウィンドウをDPRの異なるモニターに移動した場合、`devicePixelRatio` が変化するが `resize` イベントが発火しない可能性がある。

### 修正案

`matchMedia` で DPR 変更を監視:

```javascript
function setupDPRListener() {
  const mq = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
  mq.addEventListener('change', () => {
    handleResize();
    setupDPRListener(); // 新しい DPR で再登録
  }, { once: true });
}
setupDPRListener();
```

---

## BUG-018: ボムモード中にボム在庫が0になった場合のUI不整合

- **重大度**: Minor
- **該当行**: 200-205行目、836-841行目
- **カテゴリ**: ボムシステム / UI

### 問題の説明

理論上は、ボムモード ON (`bombMode = true`) の状態でボム在庫が減ることはない（ドロップ時にのみ消費される）。しかし、以下のコードパスで不整合が生じる可能性がある:

保持中ボールの描画（836-841行目）:
```javascript
if (bombMode && bombStock > 0) {
  drawBombBall(currentBall, currentLevel, 0.85);
} else {
  drawBall(currentBall, currentLevel, 0.85);
}
```

ドロップ時（200-205行目）:
```javascript
const isBomb = bombMode && bombStock > 0;
if (isBomb) {
  currentBall.label = 'bomb';
  bombStock--;
  bombMode = false;
}
```

現在のコードでは `bombMode` は `tryBombButton`（730-738行目）でトグルされ、`bombStock > 0` の場合のみ切り替わる。ボム在庫の増加はミッションクリア時のみ。

**問題**: `bombMode = true` で `bombStock = 1` の状態でドロップ → `bombStock = 0`, `bombMode = false`。次のミッションクリアで `bombStock = 1` になっても `bombMode = false` なので問題なし。

実際にはロジック上の不整合は発生しないが、`doDrop()` で `bombMode = false` にリセットされるため、連続ボム使用にはその都度ボタンを押す必要がある。これは意図した設計。

ただし、ボムボタンの表示テキスト（1009行目 `active ? 'BOMB ON' : 'BOMB x' + bombStock`）は、`bombStock = 0` でも `bombMode` が `false` なら `'BOMB x0'` と表示される。ボタンは無効化されるが表示される。

### 修正案

ボム在庫0の場合はボタン自体を非表示にする:

```javascript
function drawBombButton() {
  if (bombStock <= 0 && !bombMode) return; // 在庫なし＆非アクティブなら非表示
  // ... 既存の描画コード ...
}
```

---

## 重大度サマリー

| 重大度 | 件数 | Bug ID |
|--------|------|--------|
| Critical | 0 | - |
| Major | 4 | BUG-001, BUG-002, BUG-005, BUG-006, BUG-009 |
| Minor | 9 | BUG-003, BUG-004, BUG-007, BUG-008, BUG-010, BUG-011, BUG-012, BUG-014, BUG-015, BUG-018 |
| Info | 3 | BUG-013, BUG-016, BUG-017 |

**合計: 18件** (Major: 5件, Minor: 10件, Info: 3件)

---

## 優先度順の推奨修正順序

### Tier 1: 早期修正推奨（ゲームプレイに直接影響）

1. **BUG-009** (Major): 合体ボールの Y座標が上方向にクランプされない -- 壁の上に生成される物理的不整合
2. **BUG-001** (Major): checkDeadline が accumulator ループ外で固定 FIXED_DT で呼ばれる -- デッドラインタイマーの不正確さ
3. **BUG-005** (Major): ボムが collisionActive でも毎フレーム mergeQueue に追加される -- 不要な処理の蓄積
4. **BUG-006** (Major): DESTROY_BOMB ミッション生成条件の不正確さ -- クリア不可能なミッション生成の可能性

### Tier 2: 品質改善（ユーザー体験向上）

5. **BUG-002** (Major): 連鎖判定が Date.now() ベースで物理ステップと不整合 -- FPS依存の連鎖判定
6. **BUG-003** (Minor): ゲームオーバー直後のリトライ誤発動 -- 操作感の問題
7. **BUG-012** (Minor): CREATE_LEVEL ミッションのプログレスバーが直感的でない -- UX改善
8. **BUG-018** (Minor): ボム在庫0時のUI表示 -- 軽微なUI不整合

### Tier 3: 最適化・保守性改善

9. **BUG-014** (Minor): Composite.allBodies の重複呼び出し -- パフォーマンス最適化
10. **BUG-010** (Minor): frameAllBodies がゲームオーバー後に更新されない -- リセット時の安全性
11. **BUG-015** (Minor): lastTime が resetGame でリセットされない -- 安全性改善
12. **BUG-007** (Minor): タイトル画面中の不要な updateEffects 呼び出し -- 微小最適化
13. **BUG-011** (Minor): 保持中ボールの上部クリッピング -- 視覚的な微修正
14. **BUG-004** (Minor): ボム使用時のハイスコア保存タイミング -- データ耐久性

### Tier 4: 情報・改善提案

15. **BUG-008** (Minor): タイトル画面でのボール事前生成 -- 設計改善提案
16. **BUG-016** (Info): ゲームオーバー後の rAF 継続 -- バッテリー消費改善
17. **BUG-013** (Info): ゲームオーバー画面でのボムボタン透過表示 -- 視覚的改善
18. **BUG-017** (Info): DPR 変更時のキャンバス更新 -- エッジケース対応
