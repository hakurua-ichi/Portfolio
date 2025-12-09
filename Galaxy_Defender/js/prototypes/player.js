/**
 * prototypes/player.js
 * * 개발 순서 4단계: 게임 객체 생성 (3/5)
 * * 플레이어의 이동, 공격, 스펠, 피격 등을 관리하는 클래스입니다.
 */

class Player {
    /**
     * 플레이어 생성자
     * @param {number} x - 시작 x 좌표
     * @param {number} y - 시작 y 좌표
     * @param {string} type - 플레이어 타입 ('bomb', 'laser', 'timeStop')
     * @param {AudioManager} audioManager - 오디오 매니저 인스턴스
     */
    constructor(x, y, type = 'bomb', audioManager = null) {
        this.x = x;
        this.y = y;
        this.type = type;
        this.audioManager = audioManager;

        // 플레이어 크기 및 히트박스 (임시값, 이미지 크기에 맞게 조정 필요)
        this.width = 32;
        this.height = 48;
        this.hitboxRadius = 5; // 동방 스타일의 작은 히트박스

        // 이동
        this.speed = GAME_CONFIG.playerSpeed; // 기본 속도
        this.focusSpeed = GAME_CONFIG.playerFocusSpeed; // 저속 속도
        this.isFocused = false; // 저속 이동(Shift) 상태

        // 공격
        this.shootCooldown = 0.1; // 기본 공격속도 (최대 파워 시)
        this.shootTimer = 0;
        this.power = gameState.power; // 0
        this.baseDamage = 10;
        this.options = []; // 추가 비행선 (파워업 시 추가)

        // 스펠 (폭탄)
        this.spellCooldown = 1.0; // 스펠 사용 후 1초 쿨타임
        this.spellTimer = 0;
        this.isSpellActive = false; // 스펠 사용 중인지
        this.spellDuration = 0;     // 스펠 지속시간 (타입별로 다름)
        
        // 폭탄 애니메이션
        this.bombRadius = 0; // 폭탄 반경 (애니메이션용)
        this.bombMaxRadius = Math.sqrt(CANVAS_WIDTH * CANVAS_WIDTH + CANVAS_HEIGHT * CANVAS_HEIGHT); // 화면 대각선 길이
        this.bombDamageDealt = false; // 폭탄 데미지를 이미 줬는지 여부 (다단히트 방지)

        // 레이저 스펠 상태
        this.isLaserActive = false;
        this.laserHitTimer = 0;

        // 피격 및 무적
        this.isInvincible = false;
        this.invincibilityTimer = 0;
        this.invincibilityDuration = GAME_CONFIG.playerInvincibleTime; // 1초

        // 에셋 로드
        this.image = new Image();
        this.imageLoaded = false;
        this.image.src = ASSET_PATHS.player;
        this.image.onload = () => {
            this.imageLoaded = true;
            // (참고) 이미지 크기에 맞춰 width/height 동적 할당 가능
            // this.width = this.image.width;
            // this.height = this.image.height;
        };
    }

    /**
     * 매 프레임 플레이어 상태 업데이트
     * @param {number} deltaTime - 프레임 간 시간 차이 (timeState.deltaTime)
     * @param {object} input - 입력 상태 (inputState)
     * @param {Array} playerBullets - 플레이어 총알 배열 (GameController에서 전달)
     */
    update(deltaTime, input, playerBullets) {
        // 타이머 감소
        if (this.shootTimer > 0) this.shootTimer -= deltaTime;
        if (this.spellTimer > 0) this.spellTimer -= deltaTime;
        if (this.invincibilityTimer > 0) this.invincibilityTimer -= deltaTime;
        
        // 무적 시간 종료
        if (this.isInvincible && this.invincibilityTimer <= 0) {
            this.isInvincible = false;
        }

        // 스펠 지속시간 관리
        if (this.isSpellActive) {
            this.spellDuration -= deltaTime;
            
            // 폭탄 애니메이션 업데이트
            if (this.type === 'bomb' && this.bombRadius < this.bombMaxRadius) {
                this.bombRadius += deltaTime * 2000; // 초당 2000픽셀 확장
            }
            
            if (this.spellDuration <= 0) {
                this.isSpellActive = false;
                this.bombRadius = 0; // 폭탄 반경 초기화
                this.bombDamageDealt = false; // 폭탄 데미지 플래그 초기화
                // 스펠 종료 시 처리 (예: 레이저 끄기, 시간 정지 풀기)
                if (this.type === 'laser') this.isLaserActive = false;
                if (this.type === 'timeStop') gameState.isTimeStopped = false;
            }
        }
        
        // 이동, 공격, 스펠 처리
        this.handleMovement(deltaTime, input);
        this.handleShooting(deltaTime, input, playerBullets);
        this.handleSpell(input);

        // 추가 비행선(Options) 업데이트
        this.updateOptions(deltaTime, playerBullets);
    }

    /**
     * 플레이어 이동 처리
     * @param {number} deltaTime - 델타 타임
     * @param {object} input - 입력 상태
     */
    handleMovement(deltaTime, input) {
        this.isFocused = (input['Shift']);
        const currentSpeed = this.isFocused ? this.focusSpeed : this.speed;
        
        let dx = 0;
        let dy = 0;

        if (input['ArrowLeft'] || input['a']) dx -= 1;
        if (input['ArrowRight'] || input['d']) dx += 1;
        if (input['ArrowUp'] || input['w']) dy -= 1;
        if (input['ArrowDown'] || input['s']) dy += 1;

        // 대각선 이동 시 속도 보정 (정규화)
        if (dx !== 0 && dy !== 0) {
            const magnitude = Math.sqrt(dx * dx + dy * dy);
            dx = (dx / magnitude);
            dy = (dy / magnitude);
        }

        this.x += dx * currentSpeed * deltaTime;
        this.y += dy * currentSpeed * deltaTime;

        // 캔버스 밖으로 나가지 못하게 제한
        this.x = Math.max(this.hitboxRadius, Math.min(CANVAS_WIDTH - this.hitboxRadius, this.x));
        this.y = Math.max(this.hitboxRadius, Math.min(CANVAS_HEIGHT - this.hitboxRadius, this.y));
    }

    /**
     * 플레이어 공격(총알 발사) 처리
     * @param {number} deltaTime - 델타 타임
     * @param {object} input - 입력 상태
     * @param {Array} playerBullets - 플레이어 총알 배열
     */
    handleShooting(deltaTime, input, playerBullets) {
        // 파워에 비례한 공격 속도 계산
        // 파워 0: 0.5초 (매우 느림)
        // 파워 60: 0.1초 (최대 속도)
        // 공식: 0.5 - (power / 60) * 0.4 = 0.5 ~ 0.1
        const currentShootCooldown = 0.5 - (Math.min(60, this.power) / 60) * 0.4;
        
        if (input['z'] && this.shootTimer <= 0) {
            this.shootTimer = currentShootCooldown;
            
            // 기획서: 플레이어의 공격 방향은 1자로 위쪽
            const angle = -Math.PI / 2; // 위쪽 (라디안)
            const speed = 800;
            const damage = this.baseDamage + (this.power * 0.15); // 파워 비례 데미지 (0.2 -> 0.15 너프)
            
            // 기본 총알
            playerBullets.push(new Bullet(this.x, this.y - 20, speed, angle, damage, 'player', 5, 15, '#99FFFF'));

            // 사운드 재생
            if (this.audioManager) {
                this.audioManager.play('playerShoot', false);
            }

            // 추가 비행선(Options) 발사
            this.options.forEach(option => {
                option.shoot(speed, angle, damage, playerBullets);
            });
        }
    }

    /**
     * 추가 비행선(Option) 관리
     * (간단한 Option 클래스를 내부에 정의)
     */
    updateOptions(deltaTime, playerBullets) {
        // 파워 레벨에 따라 옵션 수 조절 (파워 15마다 1개, 최대 4개)
        const targetOptionCount = Math.min(4, Math.floor(this.power / 15));
        
        // 옵션 추가
        while (this.options.length < targetOptionCount) {
            this.options.push(new PlayerOption(this, this.options.length));
        }
        // 옵션 제거 (파워 다운 시)
        while (this.options.length > targetOptionCount) {
            this.options.pop();
        }

        // 옵션 위치 업데이트
        this.options.forEach((option, index) => {
            option.update(deltaTime, this, index, this.options.length, this.isFocused);
        });
    }


    /**
     * 스펠(폭탄) 사용 처리
     * @param {object} input - 입력 상태
     */
    handleSpell(input) {
        if (input['x'] && gameState.spells > 0 && this.spellTimer <= 0 && !this.isSpellActive) {
            gameState.spells--;
            this.spellTimer = this.spellCooldown; // 사용 후 쿨타임
            this.isSpellActive = true;
            this.isInvincible = true; // 스펠 사용 시 무적
            
            // UI 업데이트 플래그 설정 (GameController가 감지)
            gameState.spellUsed = true;

            // 기획서: 플레이어 타입별 분기
            switch (this.type) {
                case 'bomb':
                    this.spellDuration = 0.8; // 폭탄은 0.8초간 확장
                    this.invincibilityTimer = this.spellDuration;
                    this.bombRadius = 0; // 애니메이션 시작
                    this.bombDamageDealt = false; // 데미지 플래그 초기화
                    this.useBombSpell();
                    break;
                case 'laser':
                    this.spellDuration = 5.0; // 기획: 5초간 지속
                    this.invincibilityTimer = this.spellDuration; // 5초간 무적
                    this.isLaserActive = true;
                    this.laserHitTimer = 0;
                    break;
                case 'timeStop':
                    this.spellDuration = 10.0; // 기획: 10초간 지속
                    this.invincibilityTimer = this.spellDuration; // 10초간 무적
                    this.useTimeStopSpell();
                    break;
            }
        }
    }

    /**
     * 폭탄형 스펠 로직
     * (실제 탄막/적 제거는 GameController에서 이 상태를 감지하여 처리)
     */
    useBombSpell() {
        // GameController가 'bombActive' 상태를 감지하고 처리하도록 플래그 설정
        gameState.bombActive = true; 
        // (Player 클래스는 enemy, enemyBullets 배열에 접근 권한이 없으므로
        // GameController가 이 플래그를 보고 직접 제거 로직을 수행해야 함)
    }

    /**
     * 시간 정지형 스펠 로직
     */
    useTimeStopSpell() {
        // 기획서: 플레이어를 제외한 모든 것, 게임 진행 시간 정지
        // GameController가 이 플래그를 보고 적, 탄막, 시간 업데이트를 멈춰야 함
        gameState.isTimeStopped = true;
    }

    /**
     * 피격 처리
     */
    takeDamage() {
        if (this.isInvincible) return; // 무적 상태면 데미지 입지 않음

        gameState.lives--;
        
        // 파워 다운 (gameState와 player 인스턴스 모두 업데이트)
        gameState.power = Math.max(0, gameState.power - 5);
        this.power = gameState.power;
        
        this.isInvincible = true;
        this.invincibilityTimer = this.invincibilityDuration;

        // (Game Over 처리는 GameController에서 gameState.lives를 확인)
    }

    /**
     * 캔버스에 플레이어 그리기
     * @param {CanvasRenderingContext2D} ctx - 캔버스 2D 컨텍스트
     */
    draw(ctx) {
        // 무적 상태일 때 깜빡임 효과
        if (this.isInvincible) {
            // 0.1초마다 깜빡임
            if (Math.floor(this.invincibilityTimer * 10) % 2 === 0) {
                ctx.globalAlpha = 0.5; // 반투명
            }
        }

        // 1. 플레이어 본체 그리기
        if (this.imageLoaded) {
            ctx.drawImage(this.image, this.x - this.width / 2, this.y - this.height / 2, this.width, this.height);
        } else {
            // 이미지 로드 실패 시 임시 사각형
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(this.x - this.width / 2, this.y - this.height / 2, this.width, this.height);
        }
        
        ctx.globalAlpha = 1.0; // 투명도 복구

        // 2. 추가 비행선(Options) 그리기
        this.options.forEach(option => option.draw(ctx));

        // 3. 레이저 스펠 그리기
        if (this.isLaserActive) {
            // 기획: 정면으로 레이저 발사 (더 넓게)
            ctx.fillStyle = 'rgba(255, 100, 100, 0.8)';
            ctx.fillRect(this.x - 30, 0, 60, this.y); // 60픽셀 폭으로 확대
            ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.fillRect(this.x - 15, 0, 30, this.y); // 중앙 밝은 부분도 확대
        }
        
        // 3-1. 폭탄 스펠 애니메이션 그리기
        if (this.type === 'bomb' && this.isSpellActive && this.bombRadius > 0) {
            // 외곽선
            ctx.strokeStyle = 'rgba(255, 200, 50, 0.8)';
            ctx.lineWidth = 10;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.bombRadius, 0, Math.PI * 2);
            ctx.stroke();
            
            // 내부 채우기 (반투명)
            ctx.fillStyle = 'rgba(255, 150, 0, 0.3)';
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.bombRadius, 0, Math.PI * 2);
            ctx.fill();
        }

        // 4. 히트박스 그리기 (저속 이동 시)
        if (this.isFocused) {
            ctx.fillStyle = 'cyan';
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.hitboxRadius, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}


/**
 * PlayerOption (추가 비행선) 클래스
 * Player 클래스 내부에서만 사용됩니다.
 */
class PlayerOption {
    constructor(player, index) {
        this.baseX = player.x;
        this.baseY = player.y;
        this.x = player.x;
        this.y = player.y;
        this.index = index;
        this.width = 10;
        this.height = 10;
        this.color = '#FFFF99';
        this.angle = 0; // 플레이어 주변을 맴도는 각도
        this.followSpeed = 15; // 플레이어 따라가는 속도
    }

    update(deltaTime, player, index, totalOptions, isFocused) {
        let targetX, targetY;
        
        if (isFocused) {
            // 저속 이동 시: 플레이어 양옆에 고정 (동방 스타일)
            const spacing = 40;
            const side = (index % 2 === 0) ? -1 : 1;
            const rank = Math.floor(index / 2) + 1;
            targetX = player.x + (side * spacing * rank);
            targetY = player.y;
        } else {
            // 고속 이동 시: 플레이어 뒤를 따라다님
            // (간단한 딜레이 추적 구현)
            targetX = player.x;
            targetY = player.y;
        }
        
        // 부드럽게 따라가기 (Lerp)
        this.x += (targetX - this.x) * this.followSpeed * deltaTime;
        this.y += (targetY - this.y) * this.followSpeed * deltaTime;
    }

    shoot(speed, angle, damage, playerBullets) {
        // 옵션도 총알 발사 (데미지 20%로 너프)
        playerBullets.push(new Bullet(this.x, this.y, speed, angle, damage * 0.2, 'player', 3, 10, '#FFFF99'));
    }

    draw(ctx) {
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.width / 2, 0, Math.PI * 2);
        ctx.fill();
    }
}