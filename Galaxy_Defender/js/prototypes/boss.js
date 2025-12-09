/**
 * prototypes/boss.js
 * * 개발 순서 4단계: 게임 객체 생성 (보스)
 * * 스테이지별 보스의 탄막 패턴과 특수 기믹을 관리합니다.
 */

class Boss {
    /**
     * @param {number} stage - 현재 스테이지 (1~5)
     */
    constructor(stage) {
        this.stage = stage;
        
        // 보스 기본 스탯 (스테이지별로 설정)
        this.x = CANVAS_WIDTH / 2;
        this.y = -100; // 스폰 위치
        this.width = 100; // (임시)
        this.height = 100; // (임시)
        this.speed = 100;
        
        // 스테이지별 체력 (기획서: 선형적 증가)
        this.maxHealth = 1000 * stage;
        this.health = this.maxHealth;
        this.points = 10000 * stage;
        
        // 상태
        this.isSpawning = true; // 등장 연출 중
        this.isDead = false;
        this.spawnTimer = 2.0; // 2초간 등장 (진입)
        this.targetY = 150; // 등장 후 목표 위치
        
        this.img = new Image();
        this.img.src = ASSET_PATHS[`boss${stage}`] || ASSET_PATHS.placeholder;
        this.img.onerror = () => { this.img = null; };
        
        // 패턴 타이머
        this.patternTimer = 3.0; // 3초마다 기본 패턴 사용
        this.gimmickTimer = 10.0; // 10초마다 특수 기믹 사용

        // S3 (텔레포트) 상태
        this.isTeleporting = false;
        this.teleportState = 0; // 0:시작, 1:암전, 2:이동, 3:복구
        this.teleportEffectTimer = 0;

        // S4 (레이저) 상태
        this.isLaserActive = false;
        this.laserDuration = 10.0; // 기획: 10초
        this.laserTimer = 0;
        this.laserAngles = []; // 레이저 발사 시 각도 고정
    }

    /**
     * 보스 로직 업데이트
     * @param {number} deltaTime 
     * @param {Player} player 
     * @param {Array<Bullet>} enemyBullets - (Gimmick S3용)
     * @param {Array<Enemy>} enemies - (Gimmick S2용)
     */
    update(deltaTime, player, enemyBullets, enemies) {
        if (this.isDead) return;

        // 1. 등장 (Spawning)
        if (this.isSpawning) {
            this.y += (this.targetY - this.y) * 0.05; // 부드럽게 이동
            this.spawnTimer -= deltaTime;
            if (this.spawnTimer <= 0) {
                this.isSpawning = false;
                this.y = this.targetY;
            }
            return;
        }

        // 2. S3 (텔레포트) 기믹 실행 중
        if (this.isTeleporting) {
            this.updateGimmickS3(deltaTime, player, enemyBullets);
            return; // 텔레포트 중에는 다른 행동 중지
        }
        
        // 시간 정지 중이면 멈춤 (S3 기믹 제외)
        if (gameState.isTimeStopped) return;

        // 3. 기본 이동 (좌우)
        // (임시: 좌우 왕복)
        this.x += this.speed * deltaTime;
        if (this.x > CANVAS_WIDTH - this.width / 2 || this.x < this.width / 2) {
            this.speed *= -1;
        }

        // 4. 기본 패턴 타이머
        this.patternTimer -= deltaTime;
        if (this.patternTimer <= 0) {
            this.patternTimer = 0.4; // 0.4초 쿨타임 (매우 빠른 발사)
            
            // 3가지 패턴 중 랜덤 실행
            const patternIndex = Math.floor(Math.random() * 3);
            switch(patternIndex) {
                case 0: // 3점사 (기획)
                    this.usePattern('aimed-burst-3', player, enemyBullets);
                    break;
                case 1: // 원형탄 (기획)
                    this.usePattern('circular-12', player, enemyBullets);
                    break;
                case 2: // 5갈래탄 (기획)
                    this.usePattern('aimed-5way', player, enemyBullets);
                    break;
            }
        }
        
        // 5. 특수 기믹 타이머
        this.gimmickTimer -= deltaTime;
        if (this.gimmickTimer <= 0) {
            this.gimmickTimer = 15.0; // 15초 쿨타임 (기획 10초)
            this.useGimmick(player, enemies, enemyBullets);
        }
        
        // 6. 특수 기믹 (지속형) 업데이트
        if (this.isLaserActive) { // S4 레이저
            this.updateGimmickS4(deltaTime, player);
        }
    }

    /**
     * 보스 그리기
     * @param {CanvasRenderingContext2D} ctx 
     */
    draw(ctx) {
        if (this.isDead) return;

        // S3 (텔레포트) 암전 효과
        if (this.isTeleporting && this.teleportState === 1) {
            ctx.fillStyle = `rgba(0, 0, 0, ${this.teleportEffectTimer / 0.5})`; // 0.5초간 암전
            ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
            return; // 암전 중에는 보스 안 그림
        }
        if (this.isTeleporting && this.teleportState === 3) {
            ctx.fillStyle = `rgba(0, 0, 0, ${1.0 - (this.teleportEffectTimer / 0.5)})`; // 0.5초간 복구
            ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        }

        // 보스 본체 (180도 회전)
        if (this.img) {
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.rotate(Math.PI); // 180도 회전
            ctx.drawImage(this.img, -this.width / 2, -this.height / 2, this.width, this.height);
            ctx.restore();
        } else {
            ctx.fillStyle = 'purple';
            ctx.fillRect(this.x - this.width / 2, this.y - this.height / 2, this.width, this.height);
        }

        // S4 (레이저) 그리기
        if (this.isLaserActive) {
            this.drawGimmickS4(ctx);
        }

        // 체력바
        if (!this.isSpawning) {
            const barWidth = CANVAS_WIDTH * 0.8;
            const barX = (CANVAS_WIDTH - barWidth) / 2;
            ctx.fillStyle = '#500';
            ctx.fillRect(barX, 10, barWidth, 15);
            
            const healthPercent = this.health / this.maxHealth;
            ctx.fillStyle = healthPercent > 0.5 ? '#0F0' : (healthPercent > 0.2 ? '#FF0' : '#F00');
            ctx.fillRect(barX, 10, barWidth * healthPercent, 15);
        }
    }

    /**
     * 데미지 받기
     * @param {number} damage 
     */
    takeDamage(damage) {
        if (this.isSpawning || this.isDead) return;
        
        this.health -= damage;
        if (this.health <= 0) {
            this.health = 0;
            this.isDead = true;
            // (사운드, 이펙트 등은 GameController에서 처리)
        }
    }

    // --- 기본 탄막 패턴 ---

    /**
     * 기본 탄막 패턴 실행
     * @param {string} patternName 
     * @param {Player} player 
     * @param {Array<Bullet>} enemyBullets 
     */
    usePattern(patternName, player, enemyBullets) {
        const angleToPlayer = Math.atan2(player.y - this.y, player.x - this.x);

        switch(patternName) {
            // 기획: 플레이어 방향 3점사 (이동 고려)
            case 'aimed-burst-3': {
                const speed = 120; // 느리게 조정 (200 -> 120)
                // 0.1초 간격으로 3발
                for (let i = 0; i < 3; i++) {
                    setTimeout(() => {
                        // [버그 수정] : 발사 시점의 플레이어 위치를 다시 계산
                        const currentAngle = Math.atan2(player.y - this.y, player.x - this.x);
                        // [수정] spawnBullet에 enemyBullets 전달
                        this.spawnBullet(currentAngle, speed, 10, 'red', enemyBullets); 
                    }, i * 100);
                }
                break;
            }
                
            // 기획: 원형 탄환 발사
            case 'circular-12': {
                const bulletsCount = 12;
                const speed = 100; // 느리게 조정 (150 -> 100)
                for (let i = 0; i < bulletsCount; i++) {
                    const angle = (Math.PI * 2 / bulletsCount) * i;
                    // [수정] spawnBullet에 enemyBullets 전달
                    this.spawnBullet(angle, speed, 10, 'blue', enemyBullets);
                }
                break;
            }
                
            // 기획: 5갈래탄 (이동 고려)
            case 'aimed-5way': {
                const speed = 110; // 느리게 조정 (180 -> 110)
                const spread = Math.PI / 18; // 약 10도
                for (let i = -2; i <= 2; i++) {
                    const angle = angleToPlayer + (spread * i);
                    // [수정] spawnBullet에 enemyBullets 전달
                    this.spawnBullet(angle, speed, 10, 'yellow', enemyBullets);
                }
                break;
            }
        }
    }

    /**
     * 총알 생성 (Boss -> enemyBullets 배열)
     * @param {number} angle 
     * @param {number} speed 
     * @param {number} damage 
     * @param {string} color 
     * @param {Array<Bullet>} enemyBullets - [수정] 이 배열을 받아야 함
     */
    spawnBullet(angle, speed, damage, color, enemyBullets) {
        // [수정] enemyBullets가 undefined가 아닌지 확인
        if (!enemyBullets) {
            console.error("Boss.spawnBullet: enemyBullets 배열이 전달되지 않았습니다.");
            return;
        }
        
        const bullet = new Bullet(
            this.x, 
            this.y, 
            speed,
            angle,
            damage, 
            'enemy', 
            10,       // 7. width
            10,       // 8. height
            color     // 9. color (마지막 파라미터)
        );
        enemyBullets.push(bullet);
    }

    // --- 특수 기믹 (Gimmick) ---
    
    /**
     * 스테이지별 특수 기믹 실행
     * @param {Player} player 
     * @param {Array<Enemy>} enemies 
     * @param {Array<Bullet>} enemyBullets 
     */
    useGimmick(player, enemies, enemyBullets) {
        console.log(`스테이지 ${this.stage} 특수 기믹 발동!`);
        switch(this.stage) {
            case 1: // 없음
                break;
            
            case 2: // 미사일 enemy 2기 소환
                enemies.push(new Enemy(this.x - 50, this.y, 'homing', null, 1, 0, ASSET_PATHS.enemy2_homing));
                enemies.push(new Enemy(this.x + 50, this.y, 'homing', null, 1, 0, ASSET_PATHS.enemy2_homing));
                break;
            
            case 3: // 일시정지, 암전, 텔레포트
                this.isTeleporting = true;
                this.teleportState = 0;
                this.teleportEffectTimer = 0;
                break;
            
            case 4: // 4갈래 레이저 10초
                this.isLaserActive = true;
                this.laserTimer = this.laserDuration;
                // 기획: 2번과 3번 레이저 사이에 플레이어가 위치하도록 중심 잡기
                const angleToPlayer = Math.atan2(player.y - this.y, player.x - this.x);
                // 부채꼴 모양: 플레이어 방향을 기준으로 4갈래 (약 30도씩 간격)
                const spreadAngle = Math.PI / 6; // 30도
                this.laserAngles = [
                    angleToPlayer - spreadAngle * 1.5,  // 레이저 0
                    angleToPlayer - spreadAngle * 0.5,  // 레이저 1
                    angleToPlayer + spreadAngle * 0.5,  // 레이저 2 (플레이어는 1과 2 사이)
                    angleToPlayer + spreadAngle * 1.5   // 레이저 3
                ];
                break;
            
            case 5: // 고속 저격탄
                this.usePattern('aimed-snipe', player, enemyBullets);
                // (aimed-snipe 패턴 정의 필요 - 임시)
                this.spawnBullet(Math.atan2(player.y - this.y, player.x - this.x), 500, 20, 'orange', enemyBullets);
                break;
        }
    }

    /**
     * (S3) 텔레포트 기믹 업데이트
     * @param {number} deltaTime 
     * @param {Player} player 
     * @param {Array<Bullet>} enemyBullets 
     */
    updateGimmickS3(deltaTime, player, enemyBullets) {
        this.teleportEffectTimer += deltaTime;
        
        switch (this.teleportState) {
            case 0: // 1. 플레이어 이동 불가
                player.canMove = false;
                gameState.isTimeStopped = true; // 모든 탄환 정지
                this.teleportEffectTimer = 0;
                this.teleportState = 1;
                break;
            
            case 1: // 2. 암전 (0.5초)
                if (this.teleportEffectTimer > 0.5) {
                    this.teleportEffectTimer = 0;
                    this.teleportState = 2;
                }
                break;
            
            case 2: // 3. 실제 이동 (즉시)
                // 보스 랜덤 위치
                this.x = (Math.random() * (CANVAS_WIDTH - 200)) + 100;
                this.y = (Math.random() * (CANVAS_HEIGHT / 2 - 100)) + 100;
                // 탄환 랜덤 위치
                enemyBullets.forEach(bullet => {
                    bullet.x = Math.random() * CANVAS_WIDTH;
                    bullet.y = Math.random() * CANVAS_HEIGHT;
                });
                this.teleportState = 3;
                break;
            
            case 3: // 4. 복구 (0.5초)
                if (this.teleportEffectTimer > 0.5) {
                    this.teleportEffectTimer = 0;
                    this.teleportState = 0;
                    this.isTeleporting = false;
                    player.canMove = true; // 플레이어 이동 가능
                    gameState.isTimeStopped = false; // 탄환 이동 재개
                }
                break;
        }
    }
    
    /**
     * (S4) 레이저 기믹 업데이트
     * @param {number} deltaTime 
     * @param {Player} player 
     */
    updateGimmickS4(deltaTime, player) {
        this.laserTimer -= deltaTime;
        if (this.laserTimer <= 0) {
            this.isLaserActive = false;
            return;
        }
        
        // 레이저 충돌 감지 (GameController가 아닌 Boss가 직접 처리)
        // (간단한 선-원 충돌 감지 필요 - 임시)
        // (GameController에서 처리하도록 수정하는 것이 나을 수 있음)
    }

    /**
     * (S4) 레이저 그리기
     * @param {CanvasRenderingContext2D} ctx 
     */
    drawGimmickS4(ctx) {
        // 기획: 레이저가 발사된 뒤에는 보스를 따라가면 안됨 (고정된 각도 사용)
        if (!this.laserAngles || this.laserAngles.length !== 4) return;
        
        for (let i = 0; i < 4; i++) {
            const angle = this.laserAngles[i];
            
            const endX = this.x + Math.cos(angle) * 2000;
            const endY = this.y + Math.sin(angle) * 2000;
            
            // 레이저 예비선 (얇게)
            ctx.strokeStyle = 'rgba(255, 0, 255, 0.3)';
            ctx.lineWidth = 10;
            ctx.beginPath();
            ctx.moveTo(this.x, this.y);
            ctx.lineTo(endX, endY);
            ctx.stroke();

            // 실제 레이저 (굵게)
            ctx.strokeStyle = 'rgba(255, 100, 255, 0.8)';
            ctx.lineWidth = 6;
            ctx.beginPath();
            ctx.moveTo(this.x, this.y);
            ctx.lineTo(endX, endY);
            ctx.stroke();
        }
    }
}