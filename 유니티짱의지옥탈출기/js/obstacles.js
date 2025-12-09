/**
 * 📄 js/obstacles.js
 * * GameObject를 상속받아 '발판'과 '장애물', '탄막' 클래스를 정의합니다.
 */

// --- 1. 기본 발판 (Platform) ---
import { GameObject } from './gamePrototypes.js';
/**
 * @class Platform
 * 플레이어가 밟고 설 수 있는 가장 기본적인 발판입니다.
 * GameObject를 상속받지만, 특별한 update 로직은 없습니다.
 */
export class Platform extends GameObject {
    constructor(x, y, width, height) {
        // 부모(GameObject)의 생성자 호출
        super(x, y, width, height);
        this.type = 'platform'; // 충돌 감지를 위한 타입
    }

    // 그리기(draw) 메서드는 부모의 것을 사용하거나, 
    // 나중에 스프라이트를 입힐 경우 여기서 재정의(override)합니다.
    draw(ctx, camera) {
        // 예시: 갈색 발판으로 그리기
        const drawX = this.x - camera.x;
        const drawY = this.y - camera.y;
        
        ctx.fillStyle = '#8B4513'; // 갈색
        ctx.fillRect(drawX, drawY, this.width, this.height);
    }
}

// --- 2. 특수 장판 (Special Floors) ---

/**
 * @class LethalFloor (붉은 장판)
 * 밟으면 플레이어를 날려버리는(죽이는) 장판입니다.
 */
export class LethalFloor extends GameObject {
    constructor(x, y, width, height) {
        super(x, y, width, height);
        this.type = 'lethalFloor';
    }

    draw(ctx, camera) {
        const drawX = this.x - camera.x;
        const drawY = this.y - camera.y;
        
        ctx.fillStyle = '#FF0000'; // 붉은색
        ctx.fillRect(drawX, drawY, this.width, this.height);
    }
}

/**
 * @class IceFloor (회색 장판)
 * 밟으면 마찰력이 대폭 감소하여 미끄러집니다.
 */
export class IceFloor extends GameObject {
    constructor(x, y, width, height) {
        super(x, y, width, height);
        this.type = 'iceFloor';
    }

    draw(ctx, camera) {
        const drawX = this.x - camera.x;
        const drawY = this.y - camera.y;
        
        ctx.fillStyle = '#B0C4DE'; // 회색빛 파란색
        ctx.fillRect(drawX, drawY, this.width, this.height);
    }
}

// --- 3. 상호작용 장애물 (Interactive Obstacles) ---

/**
 * @class Spring (스프링 / 점프 패드)
 * 닿으면 플레이어를 좌우로 튕겨냅니다.
 */
export class Spring extends GameObject {
    constructor(x, y, width, height, bounceForce = 15, direction = 'right') {
        super(x, y, width, height);
        this.type = 'spring';
        this.bounceForce = bounceForce; // 튕겨내는 힘
        this.direction = direction; // 'left' 또는 'right'
    }

    draw(ctx, camera) {
        const drawX = this.x - camera.x;
        const drawY = this.y - camera.y;
        
        ctx.fillStyle = '#00FF00'; // 녹색
        ctx.fillRect(drawX, drawY, this.width, this.height);
        
        // 방향 표시 (화살표)
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '20px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const arrow = this.direction === 'right' ? '→' : '←';
        ctx.fillText(arrow, drawX + this.width / 2, drawY + this.height / 2);
    }
}

/**
 * @class Wall (벽)
 * 플레이어가 통과할 수 없는 고체 벽입니다.
 * 점프를 방해하거나 경로를 막는 용도로 사용됩니다.
 */
export class Wall extends GameObject {
    constructor(x, y, width, height) {
        super(x, y, width, height);
        this.type = 'wall';
    }

    draw(ctx, camera) {
        const drawX = this.x - camera.x;
        const drawY = this.y - camera.y;
        
        ctx.fillStyle = '#404040'; // 어두운 회색
        ctx.fillRect(drawX, drawY, this.width, this.height);
        
        // 벽돌 패턴
        ctx.strokeStyle = '#202020';
        ctx.lineWidth = 2;
        for (let i = 0; i < this.height; i += 20) {
            ctx.beginPath();
            ctx.moveTo(drawX, drawY + i);
            ctx.lineTo(drawX + this.width, drawY + i);
            ctx.stroke();
        }
        for (let i = 0; i < this.width; i += 30) {
            ctx.beginPath();
            ctx.moveTo(drawX + i, drawY);
            ctx.lineTo(drawX + i, drawY + this.height);
            ctx.stroke();
        }
    }
}

// --- 4. 탄막 및 대포 (Projectiles & Cannons) ---

/**
 * @class Bullet (일반 탄막)
 * 대포에서 발사되는 기본적인 탄막입니다.
 * GameObject를 상속받아, 스스로 움직이는 update 로직을 가집니다.
 */
export class Bullet extends GameObject {
    constructor(x, y, width, height, velocityX, velocityY) {
        super(x, y, width, height);
        this.type = 'bullet';
        this.velocityX = velocityX;
        this.velocityY = velocityY;
    }

    update(deltaTime) {
        // 델타타임을 고려하여 속도 계산 (추후 gameController에서)
        // 여기서는 간단히 위치 이동만 정의
        this.x += this.velocityX;
        this.y += this.velocityY;
    }

    draw(ctx, camera) {
        const drawX = this.x - camera.x;
        const drawY = this.y - camera.y;
        
        ctx.fillStyle = '#FFFF00'; // 노란색
        ctx.beginPath();
        ctx.arc(drawX + this.width / 2, drawY + this.height / 2, this.width / 2, 0, Math.PI * 2);
        ctx.fill();
    }
}

/**
 * @class Cannon (대포)
 * 설정된 주기로 탄막(Bullet)을 발사합니다.
 * direction이 'homing'일 경우 유도 미사일을 발사합니다.
 */
export class Cannon extends GameObject {
    constructor(x, y, width, height, fireRate = 2000, direction = 'left') {
        super(x, y, width, height);
        this.type = 'cannon';
        this.fireRate = fireRate; // 발사 주기 (ms)
        this.direction = direction; // 발사 방향 ('left', 'right', 'up', 'down', 'homing')
        this.lastFireTime = 0; // 마지막 발사 시간
    }

    update(deltaTime, player) { // gameController에서 player를 넘겨줘야 함
        const now = Date.now();
        
        if (now - this.lastFireTime > this.fireRate) {
            this.lastFireTime = now;
            return this.fire(player); // 유도 미사일을 위해 player 전달
        }
        
        return null; // 발사하지 않으면 null 반환
    }

    fire(player) {
        // 발사 로그 제거: 콘솔 스팸을 막기 위해 출력하지 않음
        
        let vx = 0, vy = 0;
        
        if (this.direction === 'homing' && player) {
            // 유도 미사일: 플레이어 방향 계산
            const dx = player.x - this.x;
            const dy = player.y - this.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance > 0) {
                const speed = 3;
                vx = (dx / distance) * speed;
                vy = (dy / distance) * speed;
            }
            
            // 유도 미사일 생성
            return new HomingMissile(
                this.x + this.width / 2 - 7.5, 
                this.y + this.height / 2 - 7.5, 
                15, 15, 3, player
            );
        } else {
            // 일반 탄막
            if (this.direction === 'left') vx = -5;
            if (this.direction === 'right') vx = 5;
            if (this.direction === 'up') vy = -5;
            if (this.direction === 'down') vy = 5;

            return new Bullet(
                this.x + this.width / 2 - 5, 
                this.y + this.height / 2 - 5, 
                10, 10, vx, vy
            );
        }
    }

    draw(ctx, camera) {
        const drawX = this.x - camera.x;
        const drawY = this.y - camera.y;
        
        // 유도 미사일 대포는 다른 색으로 표시
        ctx.fillStyle = this.direction === 'homing' ? '#FF4500' : '#555555';
        ctx.fillRect(drawX, drawY, this.width, this.height);
        
        // 방향 표시
        if (this.direction !== 'homing') {
            ctx.fillStyle = '#FFFFFF';
            ctx.font = '20px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            let arrow = '';
            if (this.direction === 'left') arrow = '←';
            if (this.direction === 'right') arrow = '→';
            if (this.direction === 'up') arrow = '↑';
            if (this.direction === 'down') arrow = '↓';
            ctx.fillText(arrow, drawX + this.width / 2, drawY + this.height / 2);
        } else {
            // 유도 미사일 표시 (H)
            ctx.fillStyle = '#FFFFFF';
            ctx.font = '20px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('H', drawX + this.width / 2, drawY + this.height / 2);
        }
    }
}

/**
 * @class HomingMissile (유도 미사일)
 * Bullet을 상속받아, 레이캐스팅 방식으로 플레이어를 추적합니다.
 * 플레이어 위치보다 50% 더 지나간 후 턴하는 방식으로 회피 가능하게 설계.
 */
export class HomingMissile extends Bullet {
    constructor(x, y, width, height, speed = 2, targetPlayer = null) {
        super(x, y, width, height, 0, 0); // 초기 속도는 0
        this.type = 'homingMissile';
        this.speed = speed; // 속도 감소 (2.5 -> 2)
        this.life = 3000; // 미사일 수명 감소 (4000 -> 3000)
        this.spawnTime = Date.now();
        this.targetPlayer = targetPlayer; // 추적할 플레이어 참조
        
        // 레이캐스팅 타겟 (플레이어보다 50% 더 먼 지점)
        this.targetX = x;
        this.targetY = y;
        this.updateInterval = 250; // 250ms마다 타겟 업데이트 (턴 속도 감소)
        this.lastUpdateTime = Date.now();
    }

    update(deltaTime, player) {
        // 플레이어(target)를 향해 방향 벡터 계산
        const target = player || this.targetPlayer;
        if (!target) {
            this.isDead = true;
            return;
        }
        
        // 일정 주기로만 타겟 위치 업데이트 (턴 딜레이 효과)
        const now = Date.now();
        if (now - this.lastUpdateTime > this.updateInterval) {
            const dx = target.x - this.x;
            const dy = target.y - this.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance > 0) {
                // 플레이어 위치보다 50% 더 먼 지점을 타겟으로
                const overshoot = 1.5;
                this.targetX = this.x + (dx / distance) * distance * overshoot;
                this.targetY = this.y + (dy / distance) * distance * overshoot;
            }
            
            this.lastUpdateTime = now;
        }
        
        // 타겟 방향으로 이동
        const dx = this.targetX - this.x;
        const dy = this.targetY - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance > 0) {
            this.velocityX = (dx / distance) * this.speed;
            this.velocityY = (dy / distance) * this.speed;
        }

        // 부모(Bullet)의 update 로직 실행 (위치 이동)
        super.update(deltaTime);

        // 수명 체크
        if (now - this.spawnTime > this.life) {
            this.isDead = true;
        }
    }

    draw(ctx, camera) {
        // 유도탄은 다르게 그리기
        const drawX = this.x - camera.x;
        const drawY = this.y - camera.y;
        
        ctx.fillStyle = '#FF4500'; // 주황색
        ctx.beginPath();
        ctx.arc(drawX + this.width / 2, drawY + this.height / 2, this.width / 2, 0, Math.PI * 2);
        ctx.fill();
    }
}

/**
 * @class Teleporter
 * 밟으면 플레이어를 지정된 스테이지(또는 좌표)로 순간 이동시킵니다.
 * JSON으로 정의할 때 `type: "teleporter"` 및 `targetStage: <number>`를 사용하세요.
 */
export class Teleporter extends GameObject {
    constructor(x, y, width, height, targetStage = 1) {
        super(x, y, width, height);
        this.type = 'teleporter';
        this.targetStage = targetStage;
    }

    draw(ctx, camera) {
        const drawX = this.x - camera.x;
        const drawY = this.y - camera.y;
        ctx.fillStyle = '#800080'; // 보라색
        ctx.fillRect(drawX, drawY, this.width, this.height);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`TP:${this.targetStage}`, drawX + this.width/2, drawY + this.height/2);
    }
}

// HomingCannon은 이제 일반 Cannon으로 통합됨 (direction='homing' 사용)

/**
 * @class Goal
 * 스테이지 클리어용 발판입니다. 플레이어가 위에 착지하면 스테이지 클리어가 발생합니다.
 */
export class Goal extends GameObject {
    constructor(x, y, width, height) {
        super(x, y, width, height);
        this.type = 'goal';
    }

    draw(ctx, camera) {
        const drawX = this.x - camera.x;
        const drawY = this.y - camera.y;
        ctx.fillStyle = '#FFD700'; // 금색
        ctx.fillRect(drawX, drawY, this.width, this.height);
        ctx.fillStyle = '#000000';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('GOAL', drawX + this.width/2, drawY + this.height/2);
    }
}