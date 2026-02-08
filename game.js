// ゲームの設定
const config = {
    type: Phaser.AUTO,
    width: 600,
    height: 800,
    parent: 'game-container',
    backgroundColor: '#fef5e8',
    physics: {
        default: 'matter',
        matter: {
            gravity: { y: 2 },
            debug: false,
            enableSleeping: false
        }
    },
    scene: {
        create: create,
        update: update
    }
};

// スポーツボールの種類（小さい順）
const BALLS = [
    { name: 'ピンポン球', radius: 15, color: 0xFFFFFF, strokeColor: 0xFF6B00 },
    { name: 'ゴルフボール', radius: 20, color: 0xFFF8DC, strokeColor: 0x8B4513 },
    { name: 'スカッシュボール', radius: 25, color: 0x2F4F4F, strokeColor: 0x000000 },
    { name: '野球ボール', radius: 32, color: 0xFFFFFF, strokeColor: 0xFF0000 },
    { name: 'テニスボール', radius: 38, color: 0xCCFF00, strokeColor: 0xFFFFFF },
    { name: 'ソフトボール', radius: 45, color: 0xFFFF99, strokeColor: 0xFF6347 },
    { name: 'バレーボール', radius: 52, color: 0xFFFFFF, strokeColor: 0x4169E1 },
    { name: 'サッカーボール', radius: 60, color: 0xFFFFFF, strokeColor: 0x000000 },
    { name: 'バスケットボール', radius: 68, color: 0xFF8C00, strokeColor: 0x000000 },
    { name: 'ドッジボール', radius: 76, color: 0xFF6B6B, strokeColor: 0x8B0000 },
    { name: 'バランスボール', radius: 85, color: 0x87CEEB, strokeColor: 0x4169E1 }
];

let scene;
let currentBall = null;
let nextBallType = 0;
let score = 0;
let scoreText;
let nextBallText;
let canDrop = true;
let droppedBalls = [];
let mergeScheduled = new Set();

function create() {
    scene = this;
    
    // 背景
    this.add.rectangle(300, 400, 600, 800, 0xfef5e8);
    
    // コンテナの枠線
    const containerGraphics = this.add.graphics();
    containerGraphics.lineStyle(4, 0x8B4513);
    containerGraphics.strokeRect(50, 150, 500, 600);
    
    // スコア表示
    scoreText = this.add.text(300, 30, 'スコア: 0', {
        fontSize: '32px',
        fill: '#4a3728',
        fontStyle: 'bold'
    }).setOrigin(0.5);
    
    // 次のボール表示
    nextBallText = this.add.text(300, 70, '', {
        fontSize: '20px',
        fill: '#4a3728'
    }).setOrigin(0.5);
    
    // ドロップライン
    const dropLine = this.add.graphics();
    dropLine.lineStyle(2, 0xff6b6b, 0.5);
    dropLine.lineBetween(50, 150, 550, 150);
    
    // 壁と床を作成（Matterの物理ボディとして）
    this.matter.add.rectangle(300, 755, 500, 10, { 
        isStatic: true,
        friction: 0.5,
        restitution: 0.3
    });
    this.matter.add.rectangle(48, 450, 10, 600, { 
        isStatic: true,
        friction: 0.5,
        restitution: 0.3
    });
    this.matter.add.rectangle(552, 450, 10, 600, { 
        isStatic: true,
        friction: 0.5,
        restitution: 0.3
    });
    
    // 衝突イベント
    this.matter.world.on('collisionstart', handleCollision);
    
    // 最初のボールを準備
    prepareNextBall();
    
    // クリック/タップでボールをドロップ
    this.input.on('pointerdown', dropBall);
}

function update() {
    // 現在のボールをマウスに追従
    if (currentBall && canDrop) {
        const pointer = scene.input.activePointer;
        const clampedX = Phaser.Math.Clamp(pointer.x, 70, 530);
        currentBall.setPosition(clampedX, 100);
    }
    
    // 各ボールの見た目を物理ボディに同期
    droppedBalls.forEach(ball => {
        if (ball.body && ball.graphics) {
            ball.graphics.setPosition(ball.body.position.x, ball.body.position.y);
            ball.graphics.setRotation(ball.body.angle);
        }
    });
}

function prepareNextBall() {
    // ランダムに最初の4種類からボールを選ぶ
    nextBallType = Phaser.Math.Between(0, 3);
    const ballData = BALLS[nextBallType];
    
    // 前のボールを削除
    if (currentBall && currentBall.graphics) {
        currentBall.graphics.destroy();
    }
    
    // 新しいボール（物理演算なし、画面上部に表示）
    const graphics = scene.add.graphics();
    graphics.fillStyle(ballData.color);
    graphics.lineStyle(3, ballData.strokeColor);
    graphics.fillCircle(0, 0, ballData.radius);
    graphics.strokeCircle(0, 0, ballData.radius);
    graphics.setPosition(300, 100);
    
    currentBall = {
        graphics: graphics,
        type: nextBallType,
        radius: ballData.radius
    };
    
    nextBallText.setText(`次: ${ballData.name}`);
    canDrop = true;
}

function dropBall(pointer) {
    if (!canDrop || !currentBall) return;
    
    canDrop = false;
    const ballData = BALLS[currentBall.type];
    
    // 物理ボディを作成
    const body = scene.matter.add.circle(
        currentBall.graphics.x,
        currentBall.graphics.y,
        ballData.radius,
        {
            restitution: 0.4,
            friction: 0.5,
            density: 0.001
        }
    );
    
    // グラフィックを作成
    const graphics = scene.add.graphics();
    graphics.fillStyle(ballData.color);
    graphics.lineStyle(3, ballData.strokeColor);
    graphics.fillCircle(0, 0, ballData.radius);
    graphics.strokeCircle(0, 0, ballData.radius);
    
    // ボールを管理配列に追加
    const ball = {
        body: body,
        graphics: graphics,
        type: currentBall.type,
        radius: ballData.radius
    };
    droppedBalls.push(ball);
    
    // カスタムプロパティを設定
    body.ballType = currentBall.type;
    body.ballId = Date.now() + Math.random();
    body.ballObject = ball;
    
    // 現在のボールを削除
    currentBall.graphics.destroy();
    currentBall = null;
    
    // 次のボールを準備
    scene.time.delayedCall(500, prepareNextBall);
}

function handleCollision(event) {
    event.pairs.forEach(pair => {
        const bodyA = pair.bodyA;
        const bodyB = pair.bodyB;
        
        // 両方がボールで、同じ種類かチェック
        if (bodyA.ballType !== undefined && 
            bodyB.ballType !== undefined && 
            bodyA.ballType === bodyB.ballType &&
            bodyA.ballType < BALLS.length - 1) {
            
            // すでにマージ予定のボールはスキップ
            const idA = bodyA.ballId;
            const idB = bodyB.ballId;
            if (mergeScheduled.has(idA) || mergeScheduled.has(idB)) {
                return;
            }
            
            // マージ予定としてマーク
            mergeScheduled.add(idA);
            mergeScheduled.add(idB);
            
            // 少し遅延してマージ
            scene.time.delayedCall(50, () => {
                mergeBalls(bodyA, bodyB);
            });
        }
    });
}

function mergeBalls(bodyA, bodyB) {
    // ボールが既に削除されていないかチェック
    if (!bodyA.ballObject || !bodyB.ballObject) return;
    
    const newType = bodyA.ballType + 1;
    const newBallData = BALLS[newType];
    
    // 中間地点を計算
    const x = (bodyA.position.x + bodyB.position.x) / 2;
    const y = (bodyA.position.y + bodyB.position.y) / 2;
    
    // 古いボールを削除
    const ballObjA = bodyA.ballObject;
    const ballObjB = bodyB.ballObject;
    
    if (ballObjA.graphics) ballObjA.graphics.destroy();
    if (ballObjB.graphics) ballObjB.graphics.destroy();
    
    scene.matter.world.remove(bodyA);
    scene.matter.world.remove(bodyB);
    
    droppedBalls = droppedBalls.filter(b => b !== ballObjA && b !== ballObjB);
    
    // マージスケジュールから削除
    mergeScheduled.delete(bodyA.ballId);
    mergeScheduled.delete(bodyB.ballId);
    
    // 新しいボールを作成
    const newBody = scene.matter.add.circle(x, y, newBallData.radius, {
        restitution: 0.4,
        friction: 0.5,
        density: 0.001
    });
    
    const newGraphics = scene.add.graphics();
    newGraphics.fillStyle(newBallData.color);
    newGraphics.lineStyle(3, newBallData.strokeColor);
    newGraphics.fillCircle(0, 0, newBallData.radius);
    newGraphics.strokeCircle(0, 0, newBallData.radius);
    
    const newBall = {
        body: newBody,
        graphics: newGraphics,
        type: newType,
        radius: newBallData.radius
    };
    
    droppedBalls.push(newBall);
    
    newBody.ballType = newType;
    newBody.ballId = Date.now() + Math.random();
    newBody.ballObject = newBall;
    
    // スコア加算
    score += (newType + 1) * 10;
    scoreText.setText(`スコア: ${score}`);
}

// ゲーム起動
const game = new Phaser.Game(config);
