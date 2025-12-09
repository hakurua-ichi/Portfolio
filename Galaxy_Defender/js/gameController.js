/**
 * gameController.js
 * * 개발 순서 8단계: 게임 컨트롤러 생성
 * * 이 파일은 모든 매니저와 객체(프로토타입)를 초기화하고,
 * * 메인 게임 루프(update, render)를 관리하는 총지휘자입니다.
 */

console.log('🚀 gameController.js 파일 로드됨!');

// --- 1. GameController 클래스 정의 ---
class GameController {
    constructor() {
        // 캔버스 및 컨텍스트 (gameState.js에서 참조)
        this.ctx = ctx;
        this.canvas = DOM.canvas;

        // --- 매니저 초기화 ---
        this.langManager = new LanguageManager();
        this.uiManager = new UIManager(this.ctx, this.langManager);
        this.audioManager = new AudioManager();
        this.dbManager = new DatabaseManager();

        // --- 게임 객체 ---
        this.background = new Background(); // 배경 추가
        this.player = null;
        this.boss = null;
        this.playerBullets = [];
        this.enemyBullets = [];
        this.enemies = [];
        this.items = [];
        this.explosions = []; // 폭발 애니메이션 배열

        // --- 게임 상태 ---
        this.gameTime = 0; // 스테이지 진행 시간
        this.spawnTimer = 0; // 적 스폰 타이머
        this.stageSpawnData = null; // 현재 스테이지 스폰 정보
        
        // (DeltaTime은 gameState.js의 timeState 객체 사용)

        // 이벤트 리스너는 init()에서 바인딩
    }

    /**
     * 게임 시작 및 모든 매니저 초기화
     */
    init() {
        console.log("Game Controller 초기화 중...");
        
        // 모든 이벤트 리스너 바인딩 (DOM이 완전히 로드된 후)
        this.bindEvents();
        
        // 매니저 초기화
        this.langManager.init(); // 언어 적용
        this.uiManager.init(); // UI 초기화
        this.dbManager.loadRanking(); // 랭킹 불러오기
        
        // 컨트롤 버튼 상태 초기화
        this.uiManager.toggleGameControls(false, false);
        
        // 캐릭터 선택 모달 표시
        this.showCharacterSelection();
        
        // 메인 게임 루프 시작
        this.gameLoop(0); // 0 = performance.now() (최초)
    }

    /**
     * 모든 이벤트 리스너 바인딩
     */
    bindEvents() {
        console.log('=== bindEvents 시작 ===');
        
        // --- 키보드 이벤트 ---
        window.addEventListener('keydown', (e) => {
            // 방향키와 Shift는 그대로, 문자 키는 소문자로 변환
            const key = (e.key.startsWith('Arrow') || e.key === 'Shift') ? e.key : e.key.toLowerCase();
            if (inputState.hasOwnProperty(key)) {
                inputState[key] = true;
                e.preventDefault();
            }
            // P키로 일시정지
            if (key === 'p') {
                this.togglePause();
            }
        });
        window.addEventListener('keyup', (e) => {
            // 방향키와 Shift는 그대로, 문자 키는 소문자로 변환
            const key = (e.key.startsWith('Arrow') || e.key === 'Shift') ? e.key : e.key.toLowerCase();
            if (inputState.hasOwnProperty(key)) {
                inputState[key] = false;
                e.preventDefault();
            }
        });

        // --- 헤더 UI 이벤트 ---
        DOM.startButton.addEventListener('click', () => this.startGame());
        DOM.pauseButton.addEventListener('click', () => this.togglePause());
        DOM.resetButton.addEventListener('click', () => this.resetGame());
        DOM.difficultySelector.addEventListener('change', (e) => {
            this.uiManager.updateDifficulty(e.target.value);
        });

        // --- 브라우저 이벤트 ---
        // 기획서: "다른탭으로 이동... 일시정지 기능이 활성화"
        window.addEventListener('blur', () => {
            if (gameState.isRunning && !gameState.isPaused) {
                this.togglePause(true); // 강제 일시정지
            }
        });
        
        // 기획서: "플레이어 클릭 = 재생" (오디오 정책 우회)
        window.addEventListener('click', () => {
            this.audioManager.initAudioContext();
        }, { once: false }); // (버튼 클릭도 포함)
        
        // --- 캐릭터 선택 모달 이벤트 ---
        console.log('bindCharacterSelection 호출 직전');
        this.bindCharacterSelection();
        console.log('bindCharacterSelection 호출 완료');
        console.log('=== bindEvents 완료 ===');
    }
    
    /**
     * 캐릭터 선택 모달 이벤트 바인딩
     */
    bindCharacterSelection() {
        console.log('=== bindCharacterSelection 시작 ===');
        
        const modal = document.getElementById('character-select-modal');
        console.log('모달 요소:', modal);
        
        const characterOptions = document.querySelectorAll('.character-option');
        console.log('캐릭터 옵션들:', characterOptions);
        console.log('캐릭터 옵션 개수:', characterOptions.length);
        
        if (!modal) {
            console.error('❌ 캐릭터 선택 모달을 찾을 수 없습니다.');
            return;
        }
        
        if (!characterOptions.length) {
            console.error('❌ 캐릭터 옵션을 찾을 수 없습니다.');
            console.log('HTML 구조 확인:', document.body.innerHTML.substring(0, 500));
            return;
        }
        
        console.log(`✅ ${characterOptions.length}개의 캐릭터 옵션을 찾았습니다.`);
        
        // 이벤트 위임 방식으로 변경 (더 안정적)
        modal.addEventListener('click', (e) => {
            console.log('모달 클릭 이벤트 발생!', e.target);
            
            // 클릭한 요소가 character-option이거나 그 자식인 경우
            const option = e.target.closest('.character-option');
            
            if (option) {
                console.log('✅ 캐릭터 옵션 클릭됨!', option);
                const selectedType = option.getAttribute('data-type');
                console.log(`선택된 타입: ${selectedType}`);
                
                if (selectedType) {
                    gameState.playerType = selectedType;
                    modal.classList.add('hidden');
                    console.log(`✅ 캐릭터 선택 완료: ${selectedType}`);
                }
            }
        });
        
        console.log('=== bindCharacterSelection 완료 ===');
    }

    /**
     * "시작" 버튼 클릭 시
     */
    startGame() {
        if (gameState.isRunning) return;
        
        // 캐릭터가 선택되지 않았다면 모달 표시
        if (!gameState.playerType) {
            this.showCharacterSelection();
            alert('Please select a ship first!');
            return;
        }

        console.log(`게임 시작! (난이도: ${gameState.currentDifficulty}, 캐릭터: ${gameState.playerType})`);
        
        // 게임 상태 설정
        gameState.isRunning = true;
        gameState.isPaused = false;
        gameState.isGameOver = false;
        gameState.currentStage = 1;
        gameState.lives = 3;
        gameState.spells = 3;
        gameState.score = 0;
        gameState.power = 0;

        // 플레이어 생성
        this.player = new Player(CANVAS_WIDTH / 2, CANVAS_HEIGHT * 0.8, gameState.playerType, this.audioManager); // audioManager 전달

        // UI 업데이트
        this.uiManager.updateLives(gameState.lives);
        this.uiManager.updateSpells(gameState.spells);
        this.uiManager.updatePower(gameState.power);
        this.uiManager.updateScore(gameState.score);
        // 시작 버튼 비활성화, 일시정지 버튼 활성화
        this.uiManager.toggleGameControls(true, false);

        // 스테이지 1 시작
        this.startStage(1);
    }
    
    /**
     * 새 스테이지 시작
     * @param {number} stageNum
     */
    startStage(stageNum) {
        gameState.currentStage = stageNum;
        gameState.isBossActive = false;
        gameState.isStageTransition = false;
        this.boss = null;
        this.enemies = [];
        this.playerBullets = [];
        this.enemyBullets = [];
        this.items = [];
        this.explosions = []; // 폭발 애니메이션 초기화
        
        this.gameTime = 0;
        this.uiManager.stageTimer = 0;
        this.uiManager.stageDuration = 60; // [수정] (임시) 60초 -> 5초 (테스트용)
        
        // UI 업데이트: 현재 스테이지 표시
        this.uiManager.updateStageDisplay(stageNum);
        this.uiManager.updateStageProgress(0);
        
        // TODO: 스테이지별 적 스폰 데이터 로드
        // this.stageSpawnData = ... 
        
        // 스테이지 BGM 재생
        this.audioManager.stopAll();
        this.audioManager.play(`stage${stageNum}BGM`, true);
    }

    /**
     * "초기화" 버튼 클릭 시
     */
    resetGame() {
        console.log("게임 초기화.");
        
        // 모든 상태 되돌리기
        gameState.isRunning = false;
        gameState.isPaused = false;
        gameState.isGameOver = false;
        gameState.isTimeStopped = false;
        gameState.isBossActive = false;
        gameState.playerType = null; // 캐릭터 선택 초기화

        this.player = null;
        this.boss = null;
        this.enemies = [];
        this.playerBullets = [];
        this.enemyBullets = [];
        this.items = [];
        this.explosions = []; // 폭발 애니메이션 초기화
        
        this.gameTime = 0;
        this.uiManager.stageTimer = 0;
        this.uiManager.updateStageProgress(0);
        
        // UI 컨트롤 활성화
        this.uiManager.toggleGameControls(false, false);
        
        // 사운드 정지
        this.audioManager.stopAll();
        
        // 캐릭터 선택 모달 다시 보여주기
        this.showCharacterSelection();
    }
    
    /**
     * 캐릭터 선택 모달 표시
     */
    showCharacterSelection() {
        const modal = document.getElementById('character-select-modal');
        if (modal) {
            modal.classList.remove('hidden');
        }
    }

    /**
     * "일시정지" 버튼 또는 P키
     * @param {boolean} [forcePause] - (true: 강제 일시정지, false: 토글)
     */
    togglePause(forcePause = false) {
        if (!gameState.isRunning || gameState.isGameOver) return;

        if (forcePause) {
            gameState.isPaused = true;
        } else {
            gameState.isPaused = !gameState.isPaused;
        }
        
        console.log(`일시정지: ${gameState.isPaused}`);
        this.uiManager.toggleGameControls(true, gameState.isPaused);
        
        // BGM 일시정지/재개 (선택사항)
        // if (gameState.isPaused) this.audioManager.currentBGM?.pause();
        // else this.audioManager.currentBGM?.play();
    }
    
    /**
     * 게임 오버 처리
     */
    gameOver() {
        if (gameState.isGameOver) return;
        
        console.log("게임 오버");
        gameState.isRunning = false;
        gameState.isGameOver = true;
        
        this.uiManager.toggleGameControls(false, false);
        
        // 랭킹 저장 시도
        // (임시) 이름 묻는 로직
        const playerName = prompt("랭킹에 등록할 이름을 입력하세요:", "Player1");
        if (playerName) {
            this.dbManager.saveScore(
                playerName, 
                gameState.score, 
                gameState.currentDifficulty, 
                gameState.currentStage - 1 // (클리어한 스테이지)
            );
        }
    }


    // --- 2. 메인 게임 루프 ---
    
    /**
     * UI 업데이트 헬퍼 (Lives와 Power를 함께 업데이트)
     */
    updatePlayerUI() {
        this.uiManager.updateLives(gameState.lives);
        this.uiManager.updatePower(gameState.power);
    }

    /**
     * 메인 게임 루프 (매 프레임 호출)
     * @param {number} timestamp - requestAnimationFrame이 제공하는 시간
     */
    gameLoop(timestamp) {
        // DeltaTime 계산
        timeState.deltaTime = (timestamp - timeState.lastTime) / 1000; // 초 단위
        timeState.lastTime = timestamp;

        // (디버깅용) FPS가 너무 낮으면 델타타임 고정
        if (timeState.deltaTime > 0.1) timeState.deltaTime = 0.1;

        // 1. 상태 업데이트
        this.update(timeState.deltaTime);
        
        // 2. 그리기
        this.render();

        // 다음 프레임 요청
        requestAnimationFrame((t) => this.gameLoop(t));
    }

    /**
     * 1. 상태 업데이트 (로직)
     * @param {number} deltaTime - 델타 타임
     */
    update(deltaTime) {
        // UI는 항상 업데이트 (일시정지 메뉴 등)
        this.uiManager.update(deltaTime);

        // 일시정지, 게임오버 시 배경과 로직 모두 중단
        if (gameState.isPaused || gameState.isGameOver) return;
        
        // 배경은 게임이 실행 중이고 일시정지/시간정지가 아닐 때만 업데이트
        if (gameState.isRunning && !gameState.isTimeStopped) {
            this.background.update(deltaTime);
        }
        
        // 시간정지(S3, S-Time) 시 로직 중단
        if (gameState.isTimeStopped && !this.boss?.isTeleporting) {
            // 시간 정지 중에는 플레이어만 업데이트
            this.player?.update(deltaTime, inputState, this.playerBullets);
            return;
        }
        if (!gameState.isRunning || !this.player) return;

        // --- 게임 진행 시간 (시간정지가 아닐 때만 증가) ---
        if (!gameState.isTimeStopped) {
            this.gameTime += deltaTime;
        }
        
        // --- 객체 업데이트 (순서 중요) ---
        // 1. 플레이어
        this.player.update(deltaTime, inputState, this.playerBullets);
        // 플레이어 스펠(폭탄) 효과음 (X키 눌렀을 때)
        if (inputState['x'] && gameState.spells > 0) {
            // (player.js에서 실제 스펠 사용 로직이 돌아감)
            // this.audioManager.play('spellEffect'); // (사운드 추가 필요)
        }
        // 플레이어 총알 효과음 (Z키 눌렀을 때)
        if (inputState['z'] && this.player.shootTimer <= 0) {
             this.audioManager.play('playerShoot');
        }

        // 2. 적 (Enemies)
        this.enemies.forEach(enemy => enemy.update(deltaTime, this.player, this.enemyBullets));
        
        // 3. 보스 (Boss)
        this.boss?.update(deltaTime, this.player, this.enemyBullets, this.enemies);

        // 4. 총알 (Bullets)
        this.playerBullets.forEach(bullet => bullet.update(deltaTime));
        this.enemyBullets.forEach(bullet => bullet.update(deltaTime));
        
        // 5. 아이템 (Items)
        this.items.forEach(item => item.update(deltaTime, this.player));
        
        // 6. 폭발 애니메이션 (Explosions)
        this.explosions.forEach(explosion => explosion.update(deltaTime));

        // --- 스폰 로직 ---
        if (!gameState.isBossActive && !gameState.isStageTransition) {
        this.spawnEnemy(deltaTime);
        // ... (보스 스폰 로직)
        if (this.gameTime > this.uiManager.stageDuration) {
            this.spawnBoss();
        }
    }
        
        // (기획) 아이템 필드 드랍 (낮은 확률)
        if (Math.random() < 0.001) { // (임시 확률 0.1%)
            // this.spawnItem(Math.random() * CANVAS_WIDTH, 0);
        }

        // --- 충돌 처리 ---
        this.checkCollisions(deltaTime);

        // --- 메모리 관리 (화면 밖 객체 제거) ---
        this.cleanupObjects();
        
        // --- 게임 상태 확인 ---
        if (gameState.lives <= 0) {
            this.gameOver();
        }
    }

    /**
     * 2. 그리기 (렌더링)
     */
    render() {
        // 캔버스 클리어
        this.ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        
        // --- 객체 그리기 (순서 중요) ---
        // 0. 배경 (맨 뒤)
        this.background.draw(this.ctx);
        
        // 1. 아이템
        this.items.forEach(item => item.draw(this.ctx));
        
        // 2. 적
        this.enemies.forEach(enemy => enemy.draw(this.ctx));
        
        // 3. 보스
        this.boss?.draw(this.ctx);

        // 4. 플레이어
        this.player?.draw(this.ctx);
        
        // 5. 총알 (맨 앞)
        this.playerBullets.forEach(bullet => bullet.draw(this.ctx));
        this.enemyBullets.forEach(bullet => bullet.draw(this.ctx));
        
        // 5-1. 폭발 애니메이션 (총알 위에)
        this.explosions.forEach(explosion => explosion.draw(this.ctx));

        // 6. 캔버스 UI (일시정지/게임오버 오버레이 - 맨 위)
        this.uiManager.draw();
    }
    
    // --- 3. 충돌 및 스폰 로직 ---
    
    /**
     * 충돌 처리
     * (간단한 AABB 또는 원형 충돌 사용)
     * @param {number} deltaTime - (레이저 다단히트용)
     */
    checkCollisions(deltaTime) {
        if (!this.player) return;

        // AABB (사각형) 충돌 감지 함수
        const checkAABB = (r1, r2) => {
            return (r1.x - r1.width / 2 < r2.x + r2.width / 2 &&
                    r1.x + r1.width / 2 > r2.x - r2.width / 2 &&
                    r1.y - r1.height / 2 < r2.y + r2.height / 2 &&
                    r1.y + r1.height / 2 > r2.y - r2.height / 2);
        };
        // 원형 (히트박스) 충돌 감지 함수
        const checkCircle = (c1, r1, c2, r2) => {
            const dx = c1.x - c2.x;
            const dy = c1.y - c2.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            return dist < r1 + r2;
        };

        // 1. 플레이어 총알 vs 적/보스
        this.playerBullets.forEach(bullet => {
            // vs Enemies
            this.enemies.forEach(enemy => {
                if (checkAABB(bullet, enemy)) {
                    bullet.isOffScreen = true; // 총알 소멸
                    enemy.takeDamage(bullet.damage);
                    if (enemy.isDead) {
                        gameState.score += enemy.points;
                        this.uiManager.updateScore(gameState.score);
                    }
                }
            });
            // vs Boss
            if (this.boss && !this.boss.isSpawning && checkAABB(bullet, this.boss)) {
                bullet.isOffScreen = true;
                this.boss.takeDamage(bullet.damage);
                if (this.boss.isDead) {
                    gameState.score += 50000; // (임시 보스 점수)
                    this.uiManager.updateScore(gameState.score);
                }
            }
        });

        // 2. 적 총알 vs 플레이어
        const playerHitbox = { x: this.player.x, y: this.player.y, radius: this.player.hitboxRadius };
        this.enemyBullets.forEach(bullet => {
            const bulletHitbox = { x: bullet.x, y: bullet.y, radius: (bullet.width + bullet.height) / 4 };
            if (checkCircle(playerHitbox, playerHitbox.radius, bulletHitbox, bulletHitbox.radius)) {
                bullet.isOffScreen = true; // 총알 소멸
                this.player.takeDamage();
                this.updatePlayerUI();
            }
        });

        // 3. 플레이어 vs 아이템
        this.items.forEach(item => {
            if (checkAABB(this.player, item)) {
                item.isCollected = true;
                this.collectItem(item.type);
            }
        });
        
        // 4. 플레이어 vs 적 (충돌 데미지)
        this.enemies.forEach(enemy => {
            // 호밍 미사일 충돌
            if (enemy.type === 'homing' && checkCircle(playerHitbox, playerHitbox.radius, enemy, enemy.width / 2)) {
                enemy.isDead = true; // 1회용
                this.player.takeDamage();
                this.updatePlayerUI();
            }
            // 일반 적 충돌 (호밍 제외)
            else if (enemy.type !== 'homing' && checkCircle(playerHitbox, playerHitbox.radius, enemy, enemy.width / 2)) {
                this.player.takeDamage();
                this.updatePlayerUI();
            }
        });
        
        // 4-1. 플레이어 vs 보스 (충돌 데미지)
        if (this.boss && !this.boss.isSpawning && checkCircle(playerHitbox, playerHitbox.radius, this.boss, this.boss.width / 2)) {
            this.player.takeDamage();
            this.updatePlayerUI();
        }
        
        // 5. 플레이어 vs 적 레이저/보스 레이저 (특수 처리)
        // (S4 적 레이저)
        this.enemies.forEach(enemy => {
            if (enemy.isLaserActive && enemy.laserTimer < enemy.laserDuration - 0.2) { // 예비선 제외
                if (this.player.x > enemy.x - enemy.laserWidth / 2 &&
                    this.player.x < enemy.x + enemy.laserWidth / 2 &&
                    this.player.y > enemy.y) {
                    this.player.takeDamage();
                    this.updatePlayerUI();
                }
            }
        });
        
        // (S4 보스 레이저)
        if (this.boss && this.boss.isLaserActive && this.boss.laserAngles) {
            // 플레이어와 레이저 선분 사이의 거리 계산
            const playerPos = { x: this.player.x, y: this.player.y };
            const bossPos = { x: this.boss.x, y: this.boss.y };
            
            for (let angle of this.boss.laserAngles) {
                // 레이저 끝점
                const laserEnd = {
                    x: this.boss.x + Math.cos(angle) * 2000,
                    y: this.boss.y + Math.sin(angle) * 2000
                };
                
                // 선분-점 거리 계산 (간단한 방법)
                const dx = laserEnd.x - bossPos.x;
                const dy = laserEnd.y - bossPos.y;
                const lenSq = dx * dx + dy * dy;
                const t = Math.max(0, Math.min(1, ((playerPos.x - bossPos.x) * dx + (playerPos.y - bossPos.y) * dy) / lenSq));
                const nearestX = bossPos.x + t * dx;
                const nearestY = bossPos.y + t * dy;
                const distSq = (playerPos.x - nearestX) ** 2 + (playerPos.y - nearestY) ** 2;
                
                // 레이저 두께 고려 (약 5픽셀)
                if (distSq < 25) { // 5^2
                    this.player.takeDamage();
                    this.updatePlayerUI();
                    break;
                }
            }
        }
        
        // (S2 플레이어 레이저)
        if (this.player.isLaserActive) {
            // 레이저 범위 (더 넓게)
            const laserLeft = this.player.x - 30; // 좌측 경계
            const laserRight = this.player.x + 30; // 우측 경계 (60픽셀 폭)
            const laserTop = 0; // 화면 상단
            const laserBottom = this.player.y; // 플레이어 위치까지
            
            this.player.laserHitTimer -= deltaTime;
            
            // 레이저가 적 공격
            this.enemies.forEach(enemy => {
                if (enemy.x + enemy.width / 2 > laserLeft && 
                    enemy.x - enemy.width / 2 < laserRight &&
                    enemy.y + enemy.height / 2 > laserTop &&
                    enemy.y - enemy.height / 2 < laserBottom) {
                    if (this.player.laserHitTimer <= 0) enemy.takeDamage(this.player.baseDamage * 1.5);
                }
            });
            
            if (this.boss) {
                if (this.boss.x + this.boss.width / 2 > laserLeft && 
                    this.boss.x - this.boss.width / 2 < laserRight &&
                    this.boss.y + this.boss.height / 2 > laserTop &&
                    this.boss.y - this.boss.height / 2 < laserBottom) {
                    if (this.player.laserHitTimer <= 0) this.boss.takeDamage(this.player.baseDamage * 1.5);
                }
            }
            
            // 레이저가 적 탄막 제거 (단순 x좌표 범위 체크)
            this.enemyBullets = this.enemyBullets.filter(bullet => {
                // 탄막이 레이저 범위 내에 있고, 플레이어보다 위에 있으면 제거
                if (bullet.x > laserLeft && 
                    bullet.x < laserRight && 
                    bullet.y < laserBottom) {
                    return false; // 레이저에 맞은 탄막 제거
                }
                return true;
            });
            
            if (this.player.laserHitTimer <= 0) this.player.laserHitTimer = 0.2; // 0.2초 쿨타임
        }

        // 6. 플레이어 '폭탄' 스펠 (S1) - 범위 내 탄막 제거
        if (this.player.type === 'bomb' && this.player.isSpellActive && this.player.bombRadius > 0) {
            // 폭탄 범위 내의 적 탄막 제거
            this.enemyBullets = this.enemyBullets.filter(bullet => {
                const dx = bullet.x - this.player.x;
                const dy = bullet.y - this.player.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                
                if (dist < this.player.bombRadius) {
                    return false; // 범위 내 탄막 제거
                }
                return true;
            });
            
            // 폭탄 범위 내의 적 데미지
            this.enemies.forEach(enemy => {
                const dx = enemy.x - this.player.x;
                const dy = enemy.y - this.player.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                
                if (dist < this.player.bombRadius) {
                    enemy.takeDamage(this.player.baseDamage * 1.5); // 폭탄 데미지
                }
            });
            
            // 보스도 범위 내라면 데미지
            if (this.boss) {
                const dx = this.boss.x - this.player.x;
                const dy = this.boss.y - this.player.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                
                if (dist < this.player.bombRadius) {
                    this.boss.takeDamage(this.player.baseDamage * 0.1);
                }
            }
        }
        
        // 6-1. 폭탄 스펠 플래그 처리 (구 로직 호환)
        if (gameState.bombActive) {
            gameState.bombActive = false; // 1회성
        }
        
        // 6-2. 스펠 사용 플래그 처리 (모든 스펠 타입)
        if (gameState.spellUsed) {
            this.uiManager.updateSpells(gameState.spells);
            gameState.spellUsed = false; // 1회성
        }
    }
    
    /**
     * 아이템 획득 처리
     * @param {string} type - 'power', 'life', 'spell'
     */
    collectItem(type) {
        switch(type) {
            case 'power':
                if (gameState.power < 60) {
                    gameState.power = Math.min(60, gameState.power + 1); // 최대 파워 60
                    this.player.power = gameState.power; // 플레이어 객체에도 반영
                    this.uiManager.updatePower(gameState.power);
                } else {
                    this.addOverflowScore();
                }
                break;
            case 'life':
                if (gameState.lives < 4) {
                    gameState.lives = Math.min(4, gameState.lives + 1); // 최대 4목숨
                    this.uiManager.updateLives(gameState.lives);
                } else {
                    this.addOverflowScore();
                }
                break;
            case 'spell':
                if (gameState.spells < 4) {
                    gameState.spells = Math.min(4, gameState.spells + 1); // 최대 4스펠
                    this.uiManager.updateSpells(gameState.spells);
                } else {
                    this.addOverflowScore();
                }
                break;
        }
    }
    
    /**
     * 아이템 최대치 초과 시 점수 추가
     */
    addOverflowScore() {
        gameState.score += 100;
        this.uiManager.updateScore(gameState.score);
    }

    /**
     * 화면 밖으로 나가거나 죽은 객체들 배열에서 제거
     */
    cleanupObjects() {
        this.playerBullets = this.playerBullets.filter(b => !b.isOffScreen);
        this.enemyBullets = this.enemyBullets.filter(b => !b.isOffScreen);
        this.items = this.items.filter(i => !i.isOffScreen && !i.isCollected);
        
        // 폭발 애니메이션 제거 (완료된 것만)
        this.explosions = this.explosions.filter(explosion => !explosion.isFinished);
        
        // 적 제거 (아이템 드랍 + 폭발 애니메이션 생성)
        this.enemies = this.enemies.filter(enemy => {
            if (enemy.isDead) {
                this.spawnItem(enemy.x, enemy.y);
                // 적 폭발 애니메이션 생성
                this.explosions.push(new Explosion(enemy.x, enemy.y, 'enemy'));
                return false;
            }
            return !enemy.isOffScreen;
        });
        
        // 보스 제거 (스테이지 클리어 + 폭발 애니메이션)
        if (this.boss && this.boss.isDead) {
            // 보스 폭발 애니메이션 생성
            this.explosions.push(new Explosion(this.boss.x, this.boss.y, 'boss'));
            this.stageClear();
        }
    }
    
    /**
     * 스테이지 클리어
     */
    stageClear() {
        console.log(`스테이지 ${gameState.currentStage} 클리어!`);
        this.audioManager.stopAll();
        this.audioManager.play('stageClear');
        
        gameState.isBossActive = false;
        gameState.isStageTransition = true;
        this.boss = null;
        
        // 점수 보너스
        gameState.score += 10000 * gameState.currentStage;
        this.uiManager.updateScore(gameState.score);
        
        // 다음 스테이지 or 게임 클리어
        if (gameState.currentStage < 5) {
            gameState.currentStage++;
            // (클리어 연출 후)
            setTimeout(() => {
                this.startStage(gameState.currentStage);
            }, 3000); // 3초 후 다음 스테이지
        } else {
            console.log("게임 클리어!");
            this.audioManager.play('gameClear');
            this.gameOver(); // (게임 오버 로직이 랭킹 저장)
        }
    }
    
    /**
     * 적 스폰
     * (임시 로직: S1 적 랜덤 스폰)
     * @param {number} deltaTime
     */
    spawnEnemy(deltaTime) {
        this.spawnTimer -= deltaTime;
        if (this.spawnTimer <= 0) {
            this.spawnTimer = 1.0; // 1초마다 스폰
            
            const x = Math.random() * CANVAS_WIDTH;
            const y = -30;
            const type = 'normal';
            // 50% 확률로 1, 2번 패턴
            const pattern = Math.random() < 0.5 ? 'aimed' : 'aimed-3way'; 
            const health = 1; // 기획: 1스테이지 1방
            const points = 100;
            const img = ASSET_PATHS.enemy1;

            this.enemies.push(new Enemy(x, y, type, pattern, health, points, img));
        }
    }
    
    /**
     * 보스 스폰
     */
    spawnBoss() {
        console.log(`스테이지 ${gameState.currentStage} 보스 등장`);
        gameState.isBossActive = true;
        this.enemies = []; // 잡몹 제거
        this.enemyBullets = []; // 탄막 제거
        
        this.boss = new Boss(gameState.currentStage);
        
        this.audioManager.stopAll();
        this.audioManager.play(`stage${gameState.currentStage}BossBGM`, true);
    }
    
    /**
     * 아이템 스폰 (적 사망 시)
     * @param {number} x 
     * @param {number} y 
     */
    spawnItem(x, y) {
        // 기획: 30% 확률로 드랍
        if (Math.random() <= 0.3) {
            // (임시) 80% 파워, 15% 스펠, 5% 라이프
            const rand = Math.random();
            let type = 'power';
            if (rand > 0.95) type = 'life'; // 기획: 라이프 희귀
            else if (rand > 0.8) type = 'spell';
            
            this.items.push(new Item(x, y, type));
        }
    }
}

// --- 3. 게임 실행 ---
// 모든 JS 파일이 로드된 후(defer), DOM이 준비되면
console.log('📋 DOMContentLoaded 이벤트 리스너 등록 중...');

window.addEventListener('DOMContentLoaded', () => {
    console.log('✅ DOMContentLoaded 이벤트 발생!');
    console.log('🎮 GameController 생성 및 초기화 시작...');
    
    // GameController 인스턴스 생성 및 게임 초기화
    const game = new GameController();
    console.log('GameController 인스턴스 생성 완료');
    
    game.init();
    console.log('game.init() 호출 완료');
});