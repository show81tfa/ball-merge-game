// ゲームの設定
const config = {
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    parent: 'game-container',
    backgroundColor: '#ffffff',
    physics: {
        default: 'matter',
        matter: {
            gravity: { y: 1 },
            debug: false
        }
    },
    scene: {
        preload: preload,
        create: create,
        update: update
    }
};

// スポーツボールの種類（小さい順）
const BALLS = [
    { name: 'ピンポン球', radius: 20, color: 0xFFFFFF },
    { name: 'ゴルフボール', radius: 25, color: 0xF0F0F0 },
    { name: 'テニスボール', radius: 35, color: 0xCCFF00 },
    { name: '野球ボール', radius: 40, color: 0xFFFFFF },
    { name: 'ソフトボール', radius: 50, color: 0xFFFF99 },
    { name: 'バレーボール', radius: 60, color: 0xFFFFFF },
    { name: 'サッカーボール', radius: 70, color: 0xFFFFFF },
    { name: 'バスケットボール', radius: 75, color: 0xFF8C00 },
    { name: 'ドッジボール', radius: 80, color: 0xFF6B6B },
    { name: 'ビーチボール', radius: 90, color: 0xFF1493 },
    { name: 'バランスボール', radius: 100, color: 0x00BFFF }
];

let game;
let currentBall;
let nextBallType = 0;
let score = 0;
let scoreText;
let nextBallText;
let dropLine;
let canDrop = true;

function preload() {
    // 画像なしでシンプルな円で描画
}

function create() {
    game = this;
    
    // スコア表示
    scoreText = this.add.text(16, 16, 'スコア: 0', {
        fontSize: '28px',
        fill: '#000',
        fontStyle: 'bold'
    });
    
    // 次のボール表示
    nextBallText = this.add.text(16, 50, '', {
        fontSize: '20px',
        fill: '#000'
    });
    
    // ドロップライン
    dropLine = this.add.graphics();
    dropLine.lineStyle(2, 0xff0000, 0.5);
    dropLine.lineBetween(0, 120, 800, 120);
    
    // 壁と床を作成
    const ground = this.matter.add.rectangle(400, 590, 800, 20, { isStatic: true });
    const leftWall = this.matter.add.rectangle(10, 300, 20, 600, { isStatic: true });
    const rightWall = this.matter.add.rectangle(790, 300, 20, 600, { isStatic: true });
    
    // 最初のボールを準備
    prepareNextBall();
    
    // マウスクリックでボールをドロップ
    this.input.on('pointerdown', dropBall);
    
    // 衝突イベント
    this.matter.world.on('collisionstart', onCollision);
}

function update() {
    // 現在のボールをマウスに追従
    if (currentBall && canDrop) {
        const pointer = game.input.activePointer;
        const clampedX = Phaser.Math.Clamp(pointer.x, 50, 750);
        currentBall.x = clampedX;
    }
}

function prepareNextBall() {
    // ランダムに最初の3種類からボールを選ぶ
    nextBallType = Phaser.Math.Between(0, 2);
    const ballData = BALLS[nextBallType];
    
    // 新しいボールを作成（画面上部、物理演算は無効）
    currentBall = game.add.circle(400, 80, ballData.radius, ballData.color);
    currentBall.setStrokeStyle(2, 0x000000);
    currentBall.ballType = nextBallType;
    
    nextBallText.setText(`次: ${ballData.name}`);
    canDrop = true;
}

function dropBall(pointer) {
    if (!canDrop || !currentBall) return;
    
    canDrop = false;
    const ballData = BALLS[currentBall.ballType];
    
    // 物理演算を有効化
    const physicsBody = game.matter.add.circle(
        currentBall.x, 
        currentBall.y, 
        ballData.radius,
        { 
            restitution: 0.3,
            friction: 0.1
        }
    );
    
    physicsBody.ballType = currentBall.ballType;
    physicsBody.gameObject = game.add.circle(
        currentBall.x, 
        currentBall.y, 
        ballData.radius, 
        ballData.color
    );
    physicsBody.gameObject.setStrokeStyle(2, 0x000000);
    
    currentBall.destroy();
    currentBall = null;
    
    // 少し待ってから次のボールを準備
    game.time.delayedCall(500, prepareNextBall);
}

function onCollision(event) {
    event.pairs.forEach(pair => {
        const bodyA = pair.bodyA;
        const bodyB = pair.bodyB;
        
        // 両方がボールで、同じ種類の場合
        if (bodyA.ballType !== undefined && 
            bodyB.ballType !== undefined && 
            bodyA.ballType === bodyB.ballType &&
            bodyA.ballType < BALLS.length - 1) {
            
            // 新しい大きいボールに進化
            const newType = bodyA.ballType + 1;
            const newBallData = BALLS[newType];
            
            // 中間地点に新しいボールを作成
            const x = (bodyA.position.x + bodyB.position.x) / 2;
            const y = (bodyA.position.y + bodyB.position.y) / 2;
            
            // 古いボールを削除
            if (bodyA.gameObject) bodyA.gameObject.destroy();
            if (bodyB.gameObject) bodyB.gameObject.destroy();
            game.matter.world.remove(bodyA);
            game.matter.world.remove(bodyB);
            
            // 新しいボールを作成
            const newBody = game.matter.add.circle(x, y, newBallData.radius, {
                restitution: 0.3,
                friction: 0.1
            });
            newBody.ballType = newType;
            newBody.gameObject = game.add.circle(x, y, newBallData.radius, newBallData.color);
            newBody.gameObject.setStrokeStyle(2, 0x000000);
            
            // スコア加算
            score += (newType + 1) * 10;
            scoreText.setText(`スコア: ${score}`);
        }
    });
}

// ゲーム起動
new Phaser.Game(config);
