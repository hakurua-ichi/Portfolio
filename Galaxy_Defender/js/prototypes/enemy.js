/**
 * prototypes/enemy.js
 * * 개발 순서 4단계: 게임 객체 생성 (4/5)
 * * 적(Enemy)의 생성, 이동, 5가지 공격 패턴, 피격 등을 관리하는 클래스입니다.
 */

class Enemy {
    /**
     * 적 생성자
     * @param {number} x - 시작 x 좌표
     * @param {number} y - 시작 y 좌표
     * @param {string} type - 적의 행동 타입 ('normal', 'homing', 'teleporter', 'laser', 'circular')
     * @param {string} shootPattern - 총알 발사 패턴 ('none', 'aimed', 'aimed-3way')
     * @param {number} health - 체력
     * @param {number} points - 처치 시 획득 점수
     * @param {string} imageSrc - 사용할 이미지 경로
     */
    constructor(x, y, type, shootPattern, health, points, imageSrc) {
        this.x = x;
        this.y = y;
        this.type = type;
        this.shootPattern = shootPattern;
        this.baseHealth = health;
        this.health = health;
        this.points = points;

        // 크기 및 히트박스 (임시)
        this.width = 40;
        this.height = 40;

        this.isDead = false;
        this.isOffScreen = false;

        // 이동
        this.vx = 0;
        this.vy = 100; // 기본 아래로 이동 속도

        // 공격
        this.shootCooldown = 2.0; // 2초마다 발사
        this.shootTimer = Math.random() * this.shootCooldown; // 스폰 타이밍 겹치지 않게 랜덤화

        // 특수 패턴 상태
        // (S2 - homing)
        this.homingAcceleration = 50; // 초당 가속도
        this.homingSpeed = 50; // 시작 속도
        this.homingMaxSpeed = 400;
        this.homingTurnSpeed = 2; // 초당 라디안 (회전 속도)
        this.homingAngle = Math.PI / 2; // 아래쪽
        
        // (S4 - laser)
        this.isLaserActive = false;
        this.laserDuration = 2.0; // 기획: 2초
        this.laserTimer = 0;
        this.laserWidth = 10;
        
        // 에셋 로드
        this.image = new Image();
        this.imageLoaded = false;
        this.image.src = imageSrc;
        this.image.onload = () => {
            this.imageLoaded = true;
            // this.width = this.image.width;
            // this.height = this.image.height;
        };
    }

    /**
     * 매 프레임 적 상태 업데이트
     * @param {number} deltaTime - 델타 타임
     * @param {Player} player - 플레이어 객체 (조준용)
     * @param {Array} enemyBullets - 적 총알 배열 (GameController에서 전달)
     */
    update(deltaTime, player, enemyBullets) {
        // 시간 정지 상태면 업데이트 중지
        if (gameState.isTimeStopped) return;

        // 기본 이동
        this.x += this.vx * deltaTime;
        this.y += this.vy * deltaTime;

        // 타입별 특수 행동 업데이트
        this.updateBehavior(deltaTime, player, enemyBullets);

        // 화면 밖으로 나갔는지 확인
        if (this.y > CANVAS_HEIGHT + this.height || this.x < -this.width || this.x > CANVAS_WIDTH + this.width) {
            this.isOffScreen = true;
        }
    }

    /**
     * 타입별 특수 행동 관리
     * @param {number} deltaTime - 델타 타임
     * @param {Player} player - 플레이어 객체
     * @param {Array} enemyBullets - 적 총알 배열
     */
    updateBehavior(deltaTime, player, enemyBullets) {
        if (this.shootTimer > 0) this.shootTimer -= deltaTime;
        
        switch (this.type) {
            case 'normal':
                this.handleShooting(deltaTime, player, enemyBullets);
                break;
                
            case 'homing':
                // 기획 (S2): 미사일처럼 플레이어에게 박치기
                // 기획: 느리게 발사되어서 점점 빨라져야한다.
                this.homingSpeed = Math.min(this.homingMaxSpeed, this.homingSpeed + this.homingAcceleration * deltaTime);
                
                // 기획: 부드럽게 이동되야한다. (각도 보간)
                const targetAngle = Math.atan2(player.y - this.y, player.x - this.x);
                
                // 각도 차이 계산 (shortest angle)
                let angleDiff = targetAngle - this.homingAngle;
                while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

                // 회전
                this.homingAngle += Math.max(-this.homingTurnSpeed, Math.min(this.homingTurnSpeed, angleDiff)) * deltaTime;

                this.vx = Math.cos(this.homingAngle) * this.homingSpeed;
                this.vy = Math.sin(this.homingAngle) * this.homingSpeed;
                break;
                
            case 'teleporter':
                // 기획 (S3): 총알 발사하고 쿨타임 절반이상 남을경우 랜덤 이동
                if (this.handleShooting(deltaTime, player, enemyBullets)) {
                    // 총알을 발사했다면
                    if (this.shootTimer > this.shootCooldown / 2) {
                        // 캔버스 상단 40% 이내, 좌우 캔버스 내
                        this.x = Math.random() * CANVAS_WIDTH;
                        this.y = Math.random() * (CANVAS_HEIGHT * 0.4);
                    }
                }
                break;
                
            case 'laser':
                // 기획 (S4): 세로로만 떨어져야한다.
                this.vx = 0; // x 이동 금지
                this.handleLaser(deltaTime, player, enemyBullets);
                break;
                
            case 'circular':
                // 기획 (S5): 원형 탄막 발사
                this.handleCircularShot(deltaTime, player, enemyBullets);
                break;
        }
    }

    /**
     * 기본 총알 발사 처리 (normal, teleporter)
     * @returns {boolean} - 총알을 발사했는지 여부
     */
    handleShooting(deltaTime, player, enemyBullets) {
        if (this.shootTimer <= 0) {
            this.shootTimer = this.shootCooldown;
            const angleToPlayer = Math.atan2(player.y - this.y, player.x - this.x);
            const bulletSpeed = 250;
            const bulletDamage = 10;
            const bulletColor = '#FF9999'; // 적 총알 (주황)

            switch (this.shootPattern) {
                case 'aimed':
                    // 기획 (패턴 1): 플레이어 조준
                    enemyBullets.push(new Bullet(this.x, this.y, bulletSpeed, angleToPlayer, bulletDamage, 'enemy', 8, 8, bulletColor));
                    break;
                case 'aimed-3way':
                    // 기획 (패턴 2): 3갈래, 가운데 조준
                    const spread = Math.PI / 18; // 10도
                    enemyBullets.push(new Bullet(this.x, this.y, bulletSpeed, angleToPlayer - spread, bulletDamage, 'enemy', 8, 8, bulletColor));
                    enemyBullets.push(new Bullet(this.x, this.y, bulletSpeed, angleToPlayer, bulletDamage, 'enemy', 8, 8, bulletColor));
                    enemyBullets.push(new Bullet(this.x, this.y, bulletSpeed, angleToPlayer + spread, bulletDamage, 'enemy', 8, 8, bulletColor));
                    break;
            }
            return true; // 발사 성공
        }
        return false; // 발사 안함
    }

    /**
     * 레이저 패턴 처리 (S4)
     */
    handleLaser(deltaTime, player, enemyBullets) {
        if (this.isLaserActive) {
            // 레이저 지속
            this.laserTimer -= deltaTime;
            if (this.laserTimer <= 0) {
                this.isLaserActive = false;
            }
            // (충돌 처리는 GameController에서 isLaserActive와 레이저 영역을 확인)
        } else if (this.shootTimer <= 0) {
            // 레이저 발사 시작
            this.shootTimer = this.shootCooldown * 1.5; // 레이저는 쿨타임 길게
            this.isLaserActive = true;
            this.laserTimer = this.laserDuration;
        }
    }

    /**
     * 원형 탄막 발사 처리 (S5)
     */
    handleCircularShot(deltaTime, player, enemyBullets) {
        if (this.shootTimer <= 0) {
            this.shootTimer = this.shootCooldown;
            const bulletCount = 12; // 12발
            const bulletSpeed = 200;
            const bulletDamage = 10;
            const bulletColor = '#FF99FF'; // 원형탄 (핑크)

            for (let i = 0; i < bulletCount; i++) {
                const angle = (i / bulletCount) * (Math.PI * 2);
                enemyBullets.push(new Bullet(this.x, this.y, bulletSpeed, angle, bulletDamage, 'enemy', 8, 8, bulletColor));
            }
        }
    }


    /**
     * 데미지 받기
     * @param {number} damage - 받을 데미지
     */
    takeDamage(damage) {
        this.health -= damage;
        if (this.health <= 0) {
            this.isDead = true;
            // 아이템 드랍 로직 (GameController에서 처리)
        }
    }

    /**
     * 캔버스에 적 그리기
     * @param {CanvasRenderingContext2D} ctx - 캔버스 2D 컨텍스트
     */
    draw(ctx) {
        // 1. 적 본체 (180도 회전)
        if (this.imageLoaded) {
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.rotate(Math.PI); // 180도 회전
            ctx.drawImage(this.image, -this.width / 2, -this.height / 2, this.width, this.height);
            ctx.restore();
        } else {
            // 임시 사각형
            let color = '#FF5555'; // 기본 빨강
            if (this.type === 'homing') color = '#FFAA00'; // S2 주황
            if (this.type === 'teleporter') color = '#5555FF'; // S3 파랑
            if (this.type === 'laser') color = '#FFFF55'; // S4 노랑
            if (this.type === 'circular') color = '#FF55FF'; // S5 핑크
            ctx.fillStyle = color;
            ctx.fillRect(this.x - this.width / 2, this.y - this.height / 2, this.width, this.height);
        }

        // 2. 레이저 그리기 (S4)
        if (this.isLaserActive) {
            // 기획: 1자 모양 레이저, enemy의 이동방향(수직) 고려
            // (경고/예비선)
            const warnAlpha = Math.max(0, 1.0 - (this.laserDuration - this.laserTimer) * 5); // 0.2초간 예비선
            ctx.fillStyle = `rgba(255, 100, 100, ${0.3 * warnAlpha})`;
            ctx.fillRect(this.x - this.laserWidth / 2, this.y + this.height / 2, this.laserWidth, CANVAS_HEIGHT - this.y);

            // (본체 레이저)
            if (warnAlpha <= 0) {
                const beamAlpha = Math.min(1.0, this.laserTimer * 5); // 0.2초간 밝아짐
                ctx.fillStyle = `rgba(255, 150, 150, ${0.8 * beamAlpha})`;
                ctx.fillRect(this.x - this.laserWidth / 2, this.y + this.height / 2, this.laserWidth, CANVAS_HEIGHT - this.y);
                ctx.fillStyle = `rgba(255, 255, 255, ${0.9 * beamAlpha})`;
                ctx.fillRect(this.x - this.laserWidth / 4, this.y + this.height / 2, this.laserWidth / 2, CANVAS_HEIGHT - this.y);
            }
        }
    }
}