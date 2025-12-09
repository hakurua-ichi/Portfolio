/**
 * 📄 js/player.js
 * * GameObject를 상속받아 '플레이어' 클래스를 정의합니다.
 * * 모든 물리 계산, 입력 처리, 애니메이션 상태 관리를 담당합니다.
 */
import { GameObject } from './gamePrototypes.js';
import { GAME_CONSTANTS } from './gameState.js';
export class Player extends GameObject {
    constructor(x, y, sprites = null) {
        // 히트박스와 스프라이트 크기를 분리 (super 이전에는 this 사용 불가)
    // 히트박스 너비를 줄여서 머리 부분이 충돌 판정에 포함되지 않도록 함
    // (기본 64 -> 48으로 축소: 좌우 각 8px씩 여유를 둡니다)
    const hitboxWidth = 42;
        const hitboxHeight = 64;
        super(x, y, hitboxWidth, hitboxHeight);
        this.hitboxWidth = hitboxWidth;
        this.hitboxHeight = hitboxHeight;
        this.spriteWidth = 96;
        this.spriteHeight = 96;
    // 히트박스를 화면 기준으로 위로 이동시키고 싶으면 양수 값 사용
    // (기존 값에 추가로 +5px를 적용하여 실제 충돌 판정을 더 위에서 발생시킵니다)
    this.hitboxOffsetY = 10; // 기본값: 10px (히트박스를 위로 올림)
    this.hitboxOffsetX = 0;

    // 스프라이트와 히트박스는 아트워크 기준으로 완전히 일치하지 않을 수 있음.
    // spriteOffsetY는 '스프라이트를 시각적으로 아래로(+) 또는 위로(-) 옮기는 오프셋' 입니다.
    // 히트박스를 실제로 올린 뒤 시각적으로 발이 땅에 닿게 하기 위해 기본 5px 아래로 보정합니다.
    // 시각적 보정: 스프라이트를 아래로 이동시키는 픽셀 값
    // (값을 크게 할수록 스프라이트가 더 아래로 그려져 발이 바닥에 더 가깝게 보임)
    this.spriteOffsetY = 12; // 이전 5 -> 조정: 12px로 늘려 발이 닿게 보정
        
    // 히트박스 X 오프셋
    // (hitboxOffsetX는 좌우 보정이 필요하면 조절하세요)
        
        // 스프라이트 이미지 배열
        this.sprites = sprites;
        
        // --- 1. 물리 상태 ---
        this.velocityX = 0; // x축 속도
        this.velocityY = 0; // y축 속도
        this.isOnGround = false; // 땅에 닿아있는가?
        this.isHit = false; // 장애물에 맞았는가?
        this.hitTimer = 0; // 피격 스턴 타이머
        
        // 이전 프레임 위치 (터널링 방지용)
        this.previousX = x;
        this.previousY = y;
        
        // --- 2. 점프 상태 ---
        this.isChargingJump = false; // 점프를 차징 중인가?
        this.jumpCharge = 0;         // 현재 점프 차지량

    // --- 3. 애니메이션 상태 ---
        this.currentAnimation = 'IDLE'; // 현재 애니메이션 (IDLE, RUN, RISE, FALL, HIT)
        this.currentFrame = 0;          // 현재 프레임 번호
        this.frameTimer = 0;            // 프레임 변경 타이머
        this.spriteFlip = 'right';      // 스프라이트 좌우 반전 ('right' or 'left')

    // 디버그: 머리 위에 표시되는 프레임 텍스트를 토글
    // 기본은 false(숨김) - 배포 시 보이지 않게
    this.showFrameDebug = false;

        // --- 4. 충돌 상태 ---
        // (IceFloor 위) 마찰 계수 조절용
        this.currentFriction = GAME_CONSTANTS.PLAYER.FRICTION; 
    }

    /**
     * 히트박스(충돌 판정) 현재 사각형을 반환합니다.
     * @returns {{x:number,y:number,width:number,height:number}}
     */
    getHitboxRect() {
        return {
            x: this.x + this.hitboxOffsetX,
            y: this.y - this.hitboxOffsetY,
            width: this.hitboxWidth,
            height: this.hitboxHeight
        };
    }

    /**
     * 이전 프레임의 히트박스 사각형을 반환합니다.
     */
    getPreviousHitboxRect() {
        return {
            x: this.previousX + (this.hitboxOffsetX || 0),
            y: this.previousY - (this.hitboxOffsetY || 0),
            width: this.hitboxWidth,
            height: this.hitboxHeight
        };
    }

    /**
     * ⚙️ 매 프레임 호출되는 플레이어의 핵심 로직
     * @param {number} deltaTime - 델타타임
     * @param {object} keys - gameState.keys (사용자 입력 상태)
     */
    update(deltaTime, keys) {
        // 0. 이전 프레임 위치 저장 (충돌 감지용)
        this.previousX = this.x;
        this.previousY = this.y;
        
        // 1. 델타타임 보정 (물리 계산이 FPS에 독립적이도록)
        // (참고: 16.67ms는 60FPS 기준 1프레임)
        const dt_scalar = deltaTime / 16.67; 
        
        // 2. 피격 상태 타이머 감소
        if (this.isHit) {
            this.hitTimer -= deltaTime;
            if (this.hitTimer <= 0) {
                this.isHit = false;
                this.hitTimer = 0;
            }  
        }
        
        // 2. 피격 상태가 아닐 때만 입력 처리
        if (!this.isHit){
            this.handleInput(keys, dt_scalar);
        }
        
        // 3. 물리 계산
        this.applyPhysics(dt_scalar);
        
        // 4. 애니메이션 업데이트
        this.updateAnimation(deltaTime);
        
        // 5. 상태 초기화
        // 매 프레임마다 '땅에 서있지 않다'고 가정하고,
        // gameController의 충돌 검사에서 땅을 밟으면 true로 변경됨.
        this.isOnGround = false;
        // 마찰력도 기본값으로 초기화
        this.currentFriction = GAME_CONSTANTS.PLAYER.FRICTION;
    }

    /**
     * ⌨️ 입력을 받아 물리 상태를 변경하는 메서드
     */
    handleInput(keys, dt_scalar) {
        const { PLAYER } = GAME_CONSTANTS;
        
        // 공중/지상에 따라 다른 이동 속도와 가속도 적용 (기획서: 공중에서 느려져야 함)
        const maxSpeed = this.isOnGround ? PLAYER.MAX_SPEED : PLAYER.MAX_SPEED_AIR;
        const acceleration = this.isOnGround ? PLAYER.ACCELERATION : PLAYER.ACCELERATION_AIR;
        
        // 점프 차징 중에는 이동 속도 감소
        const moveMultiplier = this.isChargingJump ? PLAYER.CHARGING_MOVE_MULT : 1.0;

        // --- 1. 좌/우 이동 ---
        if (keys.left) {
            this.velocityX = Math.max(
                this.velocityX - acceleration * moveMultiplier * dt_scalar, 
                -maxSpeed * moveMultiplier
            );
            this.spriteFlip = 'left';
        } else if (keys.right) {
            this.velocityX = Math.min(
                this.velocityX + acceleration * moveMultiplier * dt_scalar, 
                maxSpeed * moveMultiplier
            );
            this.spriteFlip = 'right';
        } else {
            // 키 입력이 없으면 마찰력 적용 (미끄러짐)
            this.velocityX *= this.isOnGround ? this.currentFriction : PLAYER.AIR_RESISTANCE;
            if (Math.abs(this.velocityX) < 0.1) this.velocityX = 0;
        }

        // --- 2. 점프 차징 ---
        if (keys.space && this.isOnGround) {
            // 땅에 있을 때만 차징 가능
            this.isChargingJump = true;
            this.jumpCharge = Math.min(
                this.jumpCharge + PLAYER.JUMP_CHARGE_RATE * dt_scalar, 
                PLAYER.JUMP_CHARGE_MAX
            );
        }

        // --- 3. 점프 발사 ---
        // 스페이스바를 뗐을 때 (혹은 최대 차지 도달 시)
        if (!keys.space && this.isChargingJump) {
            this.jump();
        }
    }
    
    /**
     * 🚀 점프!
     */
    jump() {
        if (!this.isOnGround) return; // (이중 체크)
        
        this.isChargingJump = false;
        this.isOnGround = false;
        
        // Y축 속도에 차지한 힘을 '음수'로 적용 (캔버스는 위가 0)
        // 최소 점프 힘 보장
        this.velocityY = -(Math.max(this.jumpCharge, GAME_CONSTANTS.PLAYER.JUMP_CHARGE_MIN));
        
        this.jumpCharge = 0; // 차지 리셋
        
        // 점프 사운드 재생
        try {
            if (window.game && window.game.audio && typeof window.game.audio.playSFX === 'function') {
                window.game.audio.playSFX('jump');
            }
        } catch (e) {}
    }

    /**
     * 🌍 중력과 속도를 적용하는 메서드
     */
    applyPhysics(dt_scalar) {
        // 1. 중력 적용
        this.velocityY += GAME_CONSTANTS.GRAVITY * dt_scalar;
        
        // 2. 최대 낙하 속도 제한 (터미널 속도)
        if (this.velocityY > 20) {
            this.velocityY = 20;
        }

        // 3. 속도를 위치에 반영
        this.x += this.velocityX * dt_scalar;
        this.y += this.velocityY * dt_scalar;
    }

    /**
     * 🎞️ 애니메이션 상태를 갱신하는 메서드
     * (기획서에 맞춘 복잡한 로직)
     */
    updateAnimation(deltaTime) {
        this.frameTimer += deltaTime;
        let newState = 'IDLE';

        // --- 1. 상태 결정 ---
        if (this.isHit) {
            newState = 'HIT'; // 피격 (3-4)
        } else if (this.isChargingJump) {
            newState = 'IDLE'; // 점프 차징 중 = IDLE (0-2)
        } else if (!this.isOnGround) {
            // 공중
            if (this.velocityY < -1) { // 상승 중
                newState = 'JUMP'; // 점프 (13-16)
            } else { // 하강 중
                newState = 'FALL'; // 낙하 (17-19)
            }
        } else if (Math.abs(this.velocityX) > 0.1) {
            newState = 'RUN'; // 달리기 (5-12)
        } else {
            newState = 'IDLE'; // 기본 상태 (0-2)
        }
        
        // --- 2. 상태 변경 시 프레임 리셋 ---
        if (this.currentAnimation !== newState) {
            this.currentAnimation = newState;
            this.frameTimer = 0;
            // 각 애니메이션의 시작 프레임 설정
            switch (newState) {
                case 'IDLE': this.currentFrame = 0; break;
                case 'RUN': this.currentFrame = 5; break;
                case 'JUMP': this.currentFrame = 13; break;
                case 'FALL': this.currentFrame = 17; break;
                case 'HIT': this.currentFrame = 3; break;
            }
        }

        // --- 3. 프레임 업데이트 ---
        const ANIM_SPEED = 100; // 100ms 마다 프레임 변경
        
        switch (this.currentAnimation) {
            case 'IDLE': // 0-2 루프
                if (this.frameTimer > ANIM_SPEED) {
                    this.frameTimer = 0;
                    this.currentFrame = (this.currentFrame - 0) % 3 + 0;
                    this.currentFrame++;
                    if (this.currentFrame > 2) this.currentFrame = 0;
                }
                break;
            case 'RUN': // 5-12 루프 (8프레임)
                if (this.frameTimer > ANIM_SPEED / 2) { // 2배 빠름
                    this.frameTimer = 0;
                    this.currentFrame++;
                    if (this.currentFrame > 12) this.currentFrame = 5;
                }
                break;
            case 'JUMP': // 13-16 (속도 비례)
                if (this.velocityY < -8) this.currentFrame = 13;      // 빠른 상승
                else if (this.velocityY < -4) this.currentFrame = 14; // 중간
                else if (this.velocityY < -1) this.currentFrame = 15; // 느린 상승
                else this.currentFrame = 16;                          // 정점
                break;
            case 'FALL': // 17-19 (속도 비례)
                if (this.velocityY > 12) this.currentFrame = 19;     // 빠른 하강
                else if (this.velocityY > 5) this.currentFrame = 18; // 중간
                else this.currentFrame = 17;                         // 낙하 시작
                break;
            case 'HIT': // 3-4 루프
                if (this.frameTimer > ANIM_SPEED / 2) {
                    this.frameTimer = 0;
                    this.currentFrame++;
                    if (this.currentFrame > 4) this.currentFrame = 3;
                }
                break;
        }
    }
    
    /**
     * 🖼️ 플레이어를 캔버스에 그리는 메서드
     */
    draw(ctx, camera) {
    // 히트박스 시각화 (디버깅용) - 비활성화
    // ctx.save();
    // ctx.globalAlpha = 0.3;
    // ctx.fillStyle = 'lime';
    // ctx.fillRect(this.x - camera.x, this.y - camera.y - this.hitboxOffsetY, this.hitboxWidth, this.hitboxHeight);
    // ctx.restore();

    // 스프라이트는 히트박스보다 크므로 중앙 정렬
    // spriteOffsetY를 더해 시각적으로 스프라이트를 아래로/위로 조정할 수 있음
    const drawX = this.x - camera.x - (this.spriteWidth - this.hitboxWidth) / 2;
    const drawY = this.y - camera.y - (this.spriteHeight - this.hitboxHeight) - this.hitboxOffsetY + (this.spriteOffsetY || 0);

        // 스프라이트가 정상적으로 로드되었는지 확인 (20프레임 기준)
        const spritesLoaded = this.sprites && Array.isArray(this.sprites) && this.sprites.length >= 20 && this.sprites.every(img => img instanceof Image);
        if (!spritesLoaded) {
            // 디버깅: 로딩 전 빨간 사각형 + 콘솔 출력
            ctx.fillStyle = 'red';
            ctx.fillRect(drawX, drawY, this.hitboxWidth, this.hitboxHeight);
            if (!window._spriteDebugOnce) {
                console.log('[디버그] this.sprites:', this.sprites);
                window._spriteDebugOnce = true;
            }
            return;
        }
        const frameIdx = (typeof this.currentFrame === 'number' && this.currentFrame >= 0 && this.currentFrame < this.sprites?.length) ? this.currentFrame : 0;
        ctx.save();
        if (this.spriteFlip === 'left') {
            ctx.scale(-1, 1);
            ctx.drawImage(
                this.sprites[frameIdx],
                -(drawX + this.spriteWidth), drawY,
                this.spriteWidth, this.spriteHeight
            );
        } else {
            ctx.drawImage(
                this.sprites[frameIdx],
                drawX, drawY,
                this.spriteWidth, this.spriteHeight
            );
        }
        ctx.restore();

        // --- [디버깅] 현재 프레임 번호 표시 (showFrameDebug 켜져 있을 때만) ---
        if (this.showFrameDebug) {
            ctx.fillStyle = 'white';
            ctx.font = '12px Arial';
            ctx.fillText(`Frame: ${this.currentFrame}`, drawX, drawY - 5);
        }

        /* --- [미래] 스프라이트 시트 그리기 로직 (예시) ---
        // (Assets/Character/sprite.png 파일이 로드되었다고 가정)
        // const spriteSheet = assetManager.getImage('playerSprite');
        // const frameWidth = 64;
        // const frameHeight = 64;
        // const sx = (this.currentFrame % 10) * frameWidth; // 스프라이트 시트 X
        // const sy = Math.floor(this.currentFrame / 10) * frameHeight; // 스프라이트 시트 Y
        
        ctx.save();
        if (this.spriteFlip === 'left') {
            // 좌우 반전
            ctx.scale(-1, 1);
            ctx.drawImage(spriteSheet, sx, sy, frameWidth, frameHeight, -drawX - this.width, drawY, this.width, this.height);
        } else {
            ctx.drawImage(spriteSheet, sx, sy, frameWidth, frameHeight, drawX, drawY, this.width, this.height);
        }
        ctx.restore();
        */
    }
    
    // --- 5. 충돌 처리 헬퍼 메서드 (gameController가 호출) ---
    
    /**
     * 땅에 착지했을 때
     * @param {number} platformY - 발판의 Y 상단 좌표
     */
    landOn(platformY) {
        // 발판의 윗면을 히트박스의 바닥과 맞춤
        // hitbox.y = this.y - hitboxOffsetY
        // 따라서 this.y = platformY - hitboxHeight + hitboxOffsetY
        this.y = platformY - this.hitboxHeight + this.hitboxOffsetY;
        this.velocityY = 0;
        this.isOnGround = true;
    }
    
    /**
     * 장애물에 맞았을 때
     * @param {number} forceX - 튕겨나갈 X축 힘
     * @param {number} forceY - 튕겨나갈 Y축 힘
     */
    hit(forceX, forceY) {
        this.isHit = true;
        this.hitTimer = 500;
        this.isOnGround = false; // 공중으로 띄움
        this.velocityX = forceX;
        this.velocityY = forceY;
        this.jumpCharge = 0; // 차징 중이었으면 캔슬
        this.isChargingJump = false;
    }
    
    /**
     * 📍 플레이어 좌표를 콘솔에 출력하는 메서드
     */
    printPosition() {
        const hb = this.getHitboxRect();
        console.log(`플레이어 위치: x=${Math.round(this.x)}, y=${Math.round(this.y)} (hitbox: x=${Math.round(hb.x)}, y=${Math.round(hb.y)})`);
    }
}