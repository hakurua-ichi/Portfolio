/**
 * 📄 js/gameController.js
 * * 게임의 메인 엔진.
 * * 모든 매니저와 객체를 초기화하고, 메인 루프를 실행하며,
 * * 맵 로딩, 충돌 처리, 카메라 제어 등을 담당합니다.
 */
import { gameState, GAME_CONSTANTS, ctx } from './gameState.js';
import { DataManager } from './dataManager.js';
import { audioManager } from './audioManager.js';
import { uiManager } from './uiManager.js';
import { Player } from './player.js';
import { 
    Platform, 
    LethalFloor, 
    IceFloor, 
    Spring,
    Wall,
    Cannon, 
    Bullet,
    HomingMissile,
    Teleporter,
    Goal
} from './obstacles.js';

const USE_LEADERBOARD = false; // 리더보드 활성화 여부
class GameController {
    // --- 세이브/로드 ---
    saveProgress() {
        if (!this.gameState.player) return;
        const saveData = {
            stage: this.gameState.currentStage,
            x: this.gameState.player.x,
            y: this.gameState.player.y
        };
        localStorage.setItem('jumpking_save', JSON.stringify(saveData));
    }

    loadProgress() {
        try {
            const data = localStorage.getItem('jumpking_save');
            if (!data) return null;
            return JSON.parse(data);
        } catch (e) {
            return null;
        }
    }

    clearProgress() {
        localStorage.removeItem('jumpking_save');
    }
    constructor() {
        // --- 1. 상태 및 매니저 참조 ---
        // (gameState.js, uiManager.js 등에서 전역으로 생성됨)
        this.gameState = gameState;
        this.ui = uiManager;
        this.audio = audioManager;
        this.data = DataManager;

        // 델타타임 관리
        this.lastTime = 0;
        
        // 스테이지별 배경 이미지
        this.backgroundImage = null;
        this.backgroundLoaded = false;
        // per-stage background layers (array of { img, parallax, yOffset, repeatX })
        this.stageBackgrounds = [];
        
        // 캐릭터 스프라이트 이미지 (tile000~tile029)
        this.characterSprites = [];
        this.spritesLoaded = false;
    // 스테이지별 Y 범위를 저장 (combined map일 때 각 스테이지의 min/max Y)
    this.stageRanges = [];
    // 각 스테이지의 누적 오프셋(합산)과 playerStart 정보를 저장
    this.stageOffsets = [];
    this.stagePlayerStarts = [];
    // raw loaded stage JSONs (kept so UI can show stageName)
    this.allStages = [];
    // reset 시 다음 자동 저장을 무시할 플래그 (reset() 사용 시 true로 설정)
    this._skipNextAutoSave = false;
    }

    /**
     * @description 리더보드 로드를 최대 3회까지 제한하여 수행합니다.
     * @param {string} reason - 디버깅용 호출 이유
     */
    async loadLeaderboardIfAllowed(reason = '') {
        try {
            console.log('Loading leaderboard...', { reason });
            if (this.ui && typeof this.ui.displayLeaderboard === 'function') {
                this.ui.displayLeaderboard(null, true);
            }
            const data = await this.data.loadLeaderboardFromFirebase();
            if (this.ui && typeof this.ui.displayLeaderboard === 'function') {
                this.ui.displayLeaderboard(data, false);
            }
            return data;
        } catch (e) {
            console.error('loadLeaderboardIfAllowed failed', e);
            if (this.ui && typeof this.ui.displayLeaderboard === 'function') {
                this.ui.displayLeaderboard(null, false);
            }
            return null;
        }
    }

    /**
     * @description 게임 전체 초기화 (페이지 로드 시 1회 실행)
     */
    async init() {
        // 1. 키보드 입력 리스너 설정
        window.addEventListener('keydown', (e) => this.handleKeyDown(e));
        window.addEventListener('keyup', (e) => this.handleKeyUp(e));
        
        // 1-1. 전역 콘솔 명령어 등록
        window.getPlayerPos = () => {
            if (this.gameState.player) {
                this.gameState.player.printPosition();
            } else {
                console.log('게임이 시작되지 않았습니다.');
            }
        };

        // 2. 튜토리얼 상태 로드
        this.gameState.isTutorialDone = this.data.loadTutorialStatus();
        console.log('[GameController] Tutorial status loaded:', this.gameState.isTutorialDone);

        // 콘솔에서 튜토리얼 강제 표시 함수 노출
        window.showTutorial = () => {
            console.log('[Console] Forcing tutorial display...');
            if (this.ui && typeof this.ui.showTutorial === 'function') {
                this.ui.showTutorial();
            } else {
                console.warn('[Console] UI tutorial function not available');
            }
        };
        
        // 콘솔에서 튜토리얼 상태 초기화 함수 노출
        window.resetTutorial = () => {
            console.log('[Console] Resetting tutorial status...');
            localStorage.removeItem('tutorialDone');
            this.gameState.isTutorialDone = false;
            console.log('[Console] Tutorial status reset. Reload page to see tutorial on next start.');
        };

        // 3. UI 매니저 초기화 (콜백 함수 전달)
        this.ui.init({
            onStart: () => this.startGame(),
            onPause: () => this.togglePause(),
            onReset: () => this.resetGame(),
            // debug 패널의 텔레포트/프레임 토글 콜백 연결
            onTeleportStage: (n) => this.teleportToStage(n),
            onTeleportGoal: (n) => this.teleportToGoal(n),
            onLeaderboardSaved: (reason) => this.loadLeaderboardIfAllowed(reason || 'afterSave'),
            onToggleFrame: () => {
                if (this.gameState.player) {
                    this.gameState.player.showFrameDebug = !this.gameState.player.showFrameDebug;
                }
            }
        });
        
        // 4. 플레이어 재배치 이벤트 리스너 등록
        window.addEventListener('repositionPlayer', () => {
            this.repositionPlayerOnPlatform();
        });

        // 4. 리더보드 로드
        if (USE_LEADERBOARD) {
            this.loadLeaderboard();
        }
        else{
            this.ui.displayLeaderboard(null, false, true);
        }
        
        // 5. 캐릭터 스프라이트 로드
        await this.loadCharacterSprites();
        // Preload stage 1 BGM so it's ready when game starts
        try { this.audio.preload(['stage1BGM']); } catch (e) { console.warn('BGM preload failed', e); }
        

        // 6. 항상 전체 맵을 이어붙임. 세이브가 있으면 위치만 이동
        await this.loadCombinedStages();
        // 초기 로드: 페이지 로드 시 리더보드 한 번 불러오기
        try { this.loadLeaderboardIfAllowed('init'); } catch (e) { console.error(e); }
        const save = this.loadProgress();
        if (save && save.x != null && save.y != null) {
            if (this.gameState.player) {
                this.gameState.player.x = save.x;
                this.gameState.player.y = save.y;
                // 이전 프레임 좌표도 저장해서 충돌 판정(터널링)에서 순간적으로 플랫폼 아래로
                // 떨어지는 케이스 방지.
                this.gameState.player.previousX = save.x;
                this.gameState.player.previousY = save.y;
                // 플레이어를 가장 가까운 발판 위로 재배치하면 발 아래로 떨어지는 문제를 보정
                this.repositionPlayerOnPlatform();
                // 카메라도 즉시 갱신
                this.updateCamera();
            }
            if (save.stage) {
                // saved stage -> update gameState and UI (setStage will auto-save)
                if (typeof this.gameState.setStage === 'function') {
                    this.gameState.setStage(save.stage);
                } else {
                    this.gameState.currentStage = save.stage;
                    this.ui.updateStage(save.stage);
                }
            }
        }

        // 7. 튜토리얼 실행 (첫 유저라면)
        if (!this.gameState.isTutorialDone) {
            this.ui.showTutorial();
        }

        // 8. 메인 게임 루프 시작
        // gameLoop 내부의 'this'가 GameController 인스턴스를 가리키도록 bind
        requestAnimationFrame(this.gameLoop.bind(this));
    }

    /**
     * @description 메인 게임 루프 (requestAnimationFrame)
     * @param {number} timestamp - requestAnimationFrame이 제공하는 시간
     */
    gameLoop(timestamp) {
        // 1. 델타타임(deltaTime) 계산 (ms)
        let deltaTime = timestamp - this.lastTime;
        this.lastTime = timestamp;
        
        // 델타타입 폭탄 방지
        const MAX_DELTA_TIME = 100;
        if (deltaTime > MAX_DELTA_TIME) {
            deltaTime = MAX_DELTA_TIME;
        }

        //게임이 멈출때 정의
        if (!this.gameState.isRunning) {
            this.lastTime = timestamp;
            requestAnimationFrame(this.gameLoop.bind(this));
            return;
        }
        // 게임이 일시정지일때 정의
        if (this.gameState.isPaused) {
            
            this.draw();
            this.lastTime = timestamp;
            requestAnimationFrame(this.gameLoop.bind(this));
            return;
        }

        this.update(deltaTime);
        this.draw();

        requestAnimationFrame(this.gameLoop.bind(this));
    }

    /**
     * @description 모든 게임 로직 갱신 (물리, 충돌, AI)
     * @param {number} deltaTime 
     */
    update(deltaTime) {
        const player = this.gameState.player;
        if (!player) return;

        // 1. 플레이어 업데이트 (입력 처리, 물리 적용)
        player.update(deltaTime, this.gameState.keys);

        // 2. 모든 장애물/탄막 업데이트
        const newBullets = []; // 대포가 발사한 새 탄막
        
        // 맵에 현재 호밍 미사일이 있는지 확인
        const hasHomingMissile = this.gameState.obstacles.some(obs => obs.type === 'homingMissile');
        
        this.gameState.obstacles.forEach(obs => {
            if (obs.update) {
                const result = obs.update(deltaTime, player);
                
                // 대포가 총알/미사일 객체를 반환한 경우
                if (result instanceof Bullet || result instanceof HomingMissile) {
                    // 호밍 미사일은 맵에 하나만 존재하도록 제한
                    if (result instanceof HomingMissile && hasHomingMissile) {
                        // 이미 호밍 미사일이 있으면 발사하지 않음
                        return;
                    }
                    newBullets.push(result);
                }
            }
        });

        // 3. 생성된 탄막을 메인 배열에 추가
        if (newBullets.length > 0) {
            this.gameState.obstacles = [...this.gameState.obstacles, ...newBullets];
        }
        
        // 탄막 수명 체크 및 화면 밖 탄막 제거
        this.gameState.obstacles = this.gameState.obstacles.filter(obs => {
            // isDead 플래그로 제거
            if (obs.isDead) return false;
            
            // 호밍 미사일 바닥 충돌 체크
            if (obs.type === 'homingMissile') {
                const mapBottom = this.gameState.mapBounds.minY + this.gameState.mapBounds.height;
                if (obs.y >= mapBottom) {
                    return false; // 바닥에 닿으면 제거
                }
            }
            
            // 탄막이 화면에서 너무 멀리 벗어나면 제거 (메모리 관리)
            if (obs.type === 'bullet' || obs.type === 'homingMissile') {
                const camera = this.gameState.camera;
                const margin = 500; // 화면 밖 500px까지 유지
                
                if (obs.x < camera.x - margin || 
                    obs.x > camera.x + GAME_CONSTANTS.CANVAS_WIDTH + margin ||
                    obs.y < camera.y - margin || 
                    obs.y > camera.y + GAME_CONSTANTS.CANVAS_HEIGHT + margin) {
                    return false;
                }
            }
            
            return true;
        });

        // 4. 충돌 처리
        this.handleCollisions();

        // 5. 카메라 업데이트 (플레이어 추적)
        this.updateCamera();
        // 6. 현재 플레이어 위치로 스테이지 자동 판별 및 UI 동기화
        this.checkAndUpdateStage();
    }

    /**
     * @description 모든 게임 객체를 캔버스에 그리기
     */
    draw() {
        const { camera } = this.gameState;
        // 1. Draw per-stage backgrounds (if any), falling back to black
        const canvasW = GAME_CONSTANTS.CANVAS_WIDTH;
        const canvasH = GAME_CONSTANTS.CANVAS_HEIGHT;
        let drewAny = false;
        
        try {
            // Ensure canvas is cleared before any drawing to avoid leftover artifacts
            ctx.clearRect(0, 0, canvasW, canvasH);
            // Try to draw per-stage backgrounds if we have both backgrounds and ranges
            const hasBackgrounds = this.stageBackgrounds && this.stageBackgrounds.length > 0;
            const hasRanges = this.stageRanges && this.stageRanges.length > 0;
            
            if (hasBackgrounds && hasRanges) {
                // Draw backgrounds for all stages stacked vertically according to stageRanges
                for (let si = 0; si < this.stageBackgrounds.length; si++) {
                    const layers = this.stageBackgrounds[si] || [];
                    const range = this.stageRanges[si];
                    if (!range) continue;
                    const stageTopWorld = range.minY;
                    const stageHeightWorld = Math.max(1, range.maxY - range.minY);

                    // Convert to screen coordinates relative to camera
                    const stageTopScreen = Math.round(stageTopWorld - camera.y);
                    const stageHeightScreen = Math.round(stageHeightWorld);

                    // Skip if stage is completely off-screen vertically (with generous margin)
                    const offscreenMargin = 500;
                    if (stageTopScreen + stageHeightScreen < -offscreenMargin || stageTopScreen > canvasH + offscreenMargin) {
                        continue;
                    }

                    for (let li = 0; li < layers.length; li++) {
                        const layer = layers[li];
                        const img = layer.img;
                        if (!img || !img.complete || !img.naturalWidth) {
                            continue;
                        }

                        // 배경을 스테이지 높이보다 크게 늘려서 위아래 여백 확보 (경계 공백 방지)
                        // 마지막 스테이지는 아래쪽으로 더 확장
                        const isLastStage = si === this.stageBackgrounds.length - 1;
                        const verticalMargin = isLastStage ? 600 : 200; // 마지막 스테이지는 아래로 500px 더 확장
                        const expandedHeight = stageHeightScreen + verticalMargin;
                        
                        const scaleX = canvasW / img.width;
                        const scaleY = expandedHeight / img.height;
                        const coverScale = Math.max(scaleX, scaleY);
                        
                        const dw = Math.round(img.width * coverScale);
                        const dh = Math.round(img.height * coverScale);

                        // 상단에서 약간 위로 올려서 그리기 (위쪽 여백 확보)
                        const dy = stageTopScreen - (isLastStage ? 100 : verticalMargin / 2);
                        const dx = Math.round((canvasW - dw) / 2);

                        try {
                            ctx.drawImage(img, dx, dy, dw, dh);
                            drewAny = true;
                        } catch (e) {
                            console.warn(`draw: failed to draw stage ${si+1} background`, e);
                        }
                    }

                    // 배경이 없으면 검은색으로 채우기
                    if (layers.length === 0 || !layers.some(l => l.img && l.img.complete)) {
                        ctx.fillStyle = '#000000';
                        ctx.fillRect(0, stageTopScreen, canvasW, stageHeightScreen);
                    }
                }
            } else if (hasBackgrounds && !hasRanges) {
                // No stage ranges computed yet, but we have backgrounds: draw first loaded background fullscreen as emergency fallback
                console.warn('draw: no stageRanges available, using emergency fullscreen fallback');
                for (let si = 0; si < this.stageBackgrounds.length; si++) {
                    const layers = this.stageBackgrounds[si] || [];
                    for (let li = 0; li < layers.length; li++) {
                        const img = layers[li].img;
                        if (img && img.complete && img.naturalWidth > 0) {
                            const scale = Math.max(canvasW / img.width, canvasH / img.height);
                            const dw = Math.round(img.width * scale);
                            const dh = Math.round(img.height * scale);
                            const dx = Math.round((canvasW - dw) / 2);
                            const dy = Math.round((canvasH - dh) / 2);
                            ctx.drawImage(img, dx, dy, dw, dh);
                            drewAny = true;
                            break;
                        }
                    }
                    if (drewAny) break;
                }
            }
        } catch (e) {
            console.error('draw: background render failed', e);
        }

        // If no stage-specific background was drawn, try a simple fallback:
        // draw the first successfully loaded background image fullscreen (cover) so we can verify assets loaded.
        if (!drewAny) {
            let fallbackImg = null;
            for (let si = 0; si < (this.stageBackgrounds || []).length; si++) {
                const layers = this.stageBackgrounds[si] || [];
                for (let li = 0; li < layers.length; li++) {
                    const img = layers[li].img;
                    if (img && img.complete && img.naturalWidth > 0) {
                        fallbackImg = img;
                        break;
                    }
                }
                if (fallbackImg) break;
            }

            if (fallbackImg) {
                // cover fit
                const scale = Math.max(canvasW / fallbackImg.width, canvasH / fallbackImg.height);
                const dw = Math.round(fallbackImg.width * scale);
                const dh = Math.round(fallbackImg.height * scale);
                const dx = Math.round((canvasW - dw) / 2);
                const dy = Math.round((canvasH - dh) / 2);
                try {
                    ctx.drawImage(fallbackImg, dx, dy, dw, dh);
                    drewAny = true;
                } catch (e) {
                    // ignore and fall back to black
                }
            }
        }

        if (!drewAny) {
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, canvasW, canvasH);
        }

        // 2. 화면 경계선 그리기 (빨간 벽)
        const WALL_MARGIN = 30; // 줄여서 게임 영역 확대
        ctx.fillStyle = '#ff0000';
        ctx.fillRect(0, 0, WALL_MARGIN, GAME_CONSTANTS.CANVAS_HEIGHT); // 왼쪽 벽
        ctx.fillRect(GAME_CONSTANTS.CANVAS_WIDTH - WALL_MARGIN, 0, WALL_MARGIN, GAME_CONSTANTS.CANVAS_HEIGHT); // 오른쪽 벽

        // 3. 모든 발판 그리기
        this.gameState.platforms.forEach(p => p.draw(ctx, camera));

        // 4. 모든 장애물 그리기
        this.gameState.obstacles.forEach(o => o.draw(ctx, camera));

        // 5. 플레이어 그리기
        this.gameState.player.draw(ctx, camera);
        
        // 6. (디버깅용) 점프 차지 그리기
        if (this.gameState.player.isChargingJump) {
            const charge = this.gameState.player.jumpCharge;
            const maxCharge = GAME_CONSTANTS.PLAYER.JUMP_CHARGE_MAX;
            const chargeWidth = (charge / maxCharge) * 50;
            const hb = this.gameState.player.getHitboxRect();
            const drawX = hb.x - camera.x;
            const drawY = hb.y - camera.y;

            ctx.fillStyle = 'white';
            ctx.fillRect(drawX + (hb.width / 2) - 25, drawY - 20, 50, 5);
            ctx.fillStyle = 'green';
            ctx.fillRect(drawX + (hb.width / 2) - 25, drawY - 20, chargeWidth, 5);
        }

        // Pause overlay: show translucent gray layer and text when paused
        if (this.gameState.isPaused) {
            ctx.save();
            ctx.fillStyle = 'rgba(100,100,100,0.55)';
            ctx.fillRect(0, 0, GAME_CONSTANTS.CANVAS_WIDTH, GAME_CONSTANTS.CANVAS_HEIGHT);
            ctx.fillStyle = 'white';
            ctx.font = '28px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('PAUSED', GAME_CONSTANTS.CANVAS_WIDTH / 2, GAME_CONSTANTS.CANVAS_HEIGHT / 2);
            ctx.restore();
        }
    }

    /**
     * @description 스테이지 좌표를 자동으로 보정하여 연결
     * Stage1의 골 발판을 기준으로 Stage2의 시작 발판이 위에 오도록 오프셋 계산
     */
    calculateStageOffset(stage1Data, stage2Data) {
        // Stage1의 골 발판 찾기 (가장 낮은 y 좌표의 발판)
        let stage1Goal = stage1Data.platforms[0];
        stage1Data.platforms.forEach(p => {
            if (p.y < stage1Goal.y) {
                stage1Goal = p;
            }
        });
        
        // Stage2의 시작 발판 찾기 (가장 높은 y 좌표의 발판)
        let stage2Start = stage2Data.platforms[0];
        stage2Data.platforms.forEach(p => {
            if (p.y > stage2Start.y) {
                stage2Start = p;
            }
        });
        
        // Stage2가 Stage1 골 위에 오도록 오프셋 계산
        // Stage1 골 윗면(y) - 점프 거리(180px) = Stage2 시작 윗면(y + offset)
        const targetY = stage1Goal.y - 180;
        const offset = targetY - stage2Start.y;
        
        console.log(`Stage1 goal at y=${stage1Goal.y}, Stage2 start at y=${stage2Start.y}`);
        console.log(`Calculated offset: ${offset} (Stage2 will be at y=${stage2Start.y + offset})`);
        
        return offset;
    }
    
    /**
     * @description 캐릭터 스프라이트 이미지 로드 (새 에셋: tile000~027)
     */
    async loadCharacterSprites() {
        console.log('Loading character sprites...');
        this.characterSprites = [];
        
        // 새 에셋 타일 매핑
        // IDLE: tile000~002
        // HIT: tile003~004
        // RUN: tile007,008,009,010,014,015,016,017
        // JUMP: tile021~024
        // FALLING: tile025~027
        const tilesToLoad = [
            0, 1, 2,           // IDLE (0-2)
            3, 4,              // HIT (3-4)
            7, 8, 9, 10,       // RUN part 1 (5-8)
            14, 15, 16, 17,    // RUN part 2 (9-12)
            21, 22, 23, 24,    // JUMP (13-16)
            25, 26, 27         // FALLING (17-19)
        ];
        
        const loadPromises = [];
        for (let i = 0; i < tilesToLoad.length; i++) {
            const tileNum = tilesToLoad[i];
            const img = new Image();
            const paddedNum = String(tileNum).padStart(3, '0');
            img.src = `Assets/Character/tile${paddedNum}.png`;
            loadPromises.push(new Promise((resolve, reject) => {
                img.onload = () => {
                    this.characterSprites[i] = img;
                    resolve();
                };
                img.onerror = () => {
                    console.warn(`Failed to load sprite: tile${paddedNum}.png`);
                    resolve();
                };
            }));
        }
        
        await Promise.all(loadPromises);
        this.spritesLoaded = true;
        console.log(`✅ Loaded ${this.characterSprites.filter(s => s).length}/${tilesToLoad.length} character sprites`);
    }

    /**
     * @description 모든 스테이지를 하나의 맵으로 통합 로드 (점프킹 방식)
     */
    async loadCombinedStages() {
        console.log('Loading all stages as one combined map...');
        
        // 0. 기존 객체 초기화
        this.gameState.platforms = [];
        this.gameState.obstacles = [];
        this.gameState.player = null;
        
        // 1. 모든 스테이지 JSON 로드 (자동으로 감지)
        const allStages = [];
        const maxStages = 10; // 최대 10개 스테이지까지 자동 로드 시도
        
        for (let i = 1; i <= maxStages; i++) {
            try {
                const response = await fetch(`Maps/Stage${i}.json`);
                if (response.ok) {
                    const stageData = await response.json();
                    allStages.push(stageData);
                    console.log(`✅ Stage ${i} loaded successfully (${stageData.platforms?.length} platforms, ${stageData.obstacles?.length} obstacles)`);
                } else {
                    // 파일이 없으면 더 이상 로드 중단
                    console.log(`ℹ️ Stage ${i} not found, stopping auto-load`);
                    break;
                }
            } catch (error) {
                console.log(`ℹ️ Stage ${i} not found or error, stopping auto-load`);
                break;
            }
        }
        
        if (allStages.length === 0) {
            console.error('❌ No stages loaded!');
            return;
        }
        
        console.log(`📊 Total stages loaded: ${allStages.length}`);
        
        // 2. 각 스테이지를 순서대로 추가 (오프셋 누적 방식)
        let cumulativeOffset = 0;
        for (let i = 0; i < allStages.length; i++) {
            const currentStage = allStages[i];
            // i==0 -> offset 0, i>0 -> offset = cumulativeOffset + delta
            if (i > 0) {
                const delta = this.calculateStageOffset(allStages[i - 1], currentStage);
                cumulativeOffset += delta;
            }
            const offset = cumulativeOffset;

            // 발판 추가
            let stageMinY = Infinity;
            let stageMaxY = -Infinity;
            currentStage.platforms.forEach(p => {
                const py = p.y + offset;
                stageMinY = Math.min(stageMinY, py);
                stageMaxY = Math.max(stageMaxY, py + p.h);
                this.gameState.platforms.push(new Platform(p.x, py, p.w, p.h));
            });

            // 스테이지 범위와 누적 오프셋 저장
            this.stageRanges[i] = { minY: stageMinY, maxY: stageMaxY };
            this.stageOffsets[i] = offset;
            // 플레이어 시작 위치(오프셋 적용) 저장
            const pStart = currentStage.playerStart || { x: 640, y: 550 };
            this.stagePlayerStarts[i] = { x: pStart.x, y: pStart.y + offset };

            console.log(`Added ${currentStage.platforms.length} platforms from Stage ${i + 1} (offset: ${offset})`);

            // 장애물 추가
            currentStage.obstacles.forEach(o => {
                this.addObstacle(o, offset);
            });
            console.log(`Stage ${i+1} range:`, this.stageRanges[i]);
            console.log(`Added ${currentStage.obstacles.length} obstacles from Stage ${i + 1}`);
        }
        
        // 4. 맵 경계 계산 (모든 발판 기준)
        let minY = Infinity;
        let maxY = -Infinity;
        let maxX = 0;
        
        this.gameState.platforms.forEach(p => {
            minY = Math.min(minY, p.y);
            maxY = Math.max(maxY, p.y + p.height);
            maxX = Math.max(maxX, p.x + p.width);
        });
        
        this.gameState.mapBounds = {
            width: maxX + 500,
            height: maxY + 500,
            minY: minY - 500
        };
        
        console.log('Combined map bounds:', this.gameState.mapBounds);
        // Now that stageRanges and offsets are known, preload backgrounds using explicit mapping if provided
        this.allStages = allStages;
        try { 
            this.preloadStageBackgrounds(allStages);
            // Stage 5 위에 추가 배경 레이어 (하늘 배경 - 지옥 탈출)
            this.addSkyBackground();
        } catch (e) { 
            console.warn('preloadStageBackgrounds failed', e); 
        }
        console.log(`📊 Total: ${this.gameState.platforms.length} platforms, ${this.gameState.obstacles.length} obstacles`);
        
        // 5. 현재 스테이지는 1로 설정 (UI 표시용)
        this.gameState.currentStage = 1;
        // store loaded stages for UI usage and populate debug stage buttons
        if (this.ui && typeof this.ui.populateDebugStages === 'function') {
            this.ui.populateDebugStages(allStages);
        }
        this.ui.updateStage(1, allStages[0]?.stageName);

        // 플레이어는 첫 번째 스테이지의 start 위치로 배치 (오프셋 적용)
        const firstStart = this.stagePlayerStarts[0] || { x: 640, y: 550 };
        this.gameState.player = new Player(firstStart.x, firstStart.y, this.characterSprites);

        // (안전) 스테이지 범위가 비어있으면 현재 플랫폼들로 범위 계산
        if (!this.stageRanges || this.stageRanges.length === 0) {
            let minY = Infinity, maxY = -Infinity;
            this.gameState.platforms.forEach(p => {
                minY = Math.min(minY, p.y);
                maxY = Math.max(maxY, p.y + p.height);
            });
            this.stageRanges = [{ minY, maxY }];
        }

        // 스테이지별로 이동할 때마다 currentStage와 UI를 동기화하는 헬퍼
        this.gameState.setStage = (stageNum) => {
            this.gameState.currentStage = stageNum;
            const name = this.allStages && this.allStages[stageNum - 1] ? this.allStages[stageNum - 1].stageName : undefined;
            this.ui.updateStage(stageNum, name);
            // 스테이지 변경 시 자동 저장
            if (this._skipNextAutoSave) {
                // reset 후 첫 스테이지 저장을 방지하기 위해 한 번만 건너뜀
                console.log('Auto-save suppressed (reset)');
                this._skipNextAutoSave = false;
            } else {
                this.saveProgress();
            }
        };
        
        // 6. 배경은 Stage 1로 시작
        // keep backward compatibility: load single backgroundImage if needed
        this.loadBackgroundImage(1);
        
        // 7. 카메라 위치 초기화
        this.updateCamera();
    }

    /**
     * @description 스테이지 내에서 오프셋 기반으로 플레이어를 텔레포트합니다.
     * 단일 JSON 재로딩을 사용하지 않고, loadCombinedStages로 로드된 맵 내 위치로 이동합니다.
     */
    teleportToStage(stageNumber) {
        if (!this.stagePlayerStarts || this.stagePlayerStarts.length === 0) {
            console.warn('Combined stages not loaded yet - loading now');
            // 비동기 로드가 필요한 경우가 있으므로 호출자에게 loadCombinedStages를 먼저 실행하도록 권장
            this.loadCombinedStages();
            return;
        }

        const idx = stageNumber - 1;
        if (idx < 0 || idx >= this.stagePlayerStarts.length) {
            console.error(`teleportToStage: invalid stageNumber ${stageNumber}`);
            return;
        }

        const start = this.stagePlayerStarts[idx];
        // 플레이어가 없으면 생성, 있으면 위치만 이동
        if (!this.gameState.player) {
            this.gameState.player = new Player(start.x, start.y, this.characterSprites);
        } else {
            this.gameState.player.x = start.x;
            this.gameState.player.y = start.y;
            this.gameState.player.previousX = start.x;
            this.gameState.player.previousY = start.y;
            this.repositionPlayerOnPlatform();
            this.updateCamera();
        }

        // 현재 스테이지 업데이트 및 자동 저장
        if (typeof this.gameState.setStage === 'function') {
            this.gameState.setStage(stageNumber);
        } else {
            this.gameState.currentStage = stageNumber;
            const name = this.allStages && this.allStages[stageNumber - 1] ? this.allStages[stageNumber - 1].stageName : undefined;
            this.ui.updateStage(stageNumber, name);
            this.saveProgress();
        }

        console.log(`Teleported to Stage ${stageNumber} at x=${start.x}, y=${start.y}`);
    }

    /**
     * @description 해당 스테이지의 goal(클리어 발판) 위로 플레이어를 텔레포트합니다.
     * @param {number} stageNumber
     */
    teleportToGoal(stageNumber) {
        const idx = stageNumber - 1;
        if (!this.allStages || idx < 0 || idx >= this.allStages.length) {
            console.error(`teleportToGoal: invalid stage ${stageNumber}`);
            return;
        }

        const stageData = this.allStages[idx];
        if (!stageData || !Array.isArray(stageData.obstacles)) {
            console.error(`teleportToGoal: no obstacles for stage ${stageNumber}`);
            return;
        }

        // Find goal object in stage JSON
        const goalObj = stageData.obstacles.find(o => o.type === 'goal');
        if (!goalObj) {
            console.warn(`teleportToGoal: no goal found in stage ${stageNumber}, teleporting to stage start instead`);
            this.teleportToStage(stageNumber);
            return;
        }

        // Compute world coordinates (Y includes stage offset)
        const offsetY = this.stageOffsets[idx] || 0;
        const worldX = goalObj.x;
        const worldY = goalObj.y + offsetY;

        // Place player at goal coordinates and normalize state
        if (!this.gameState.player) {
            this.gameState.player = new Player(worldX, worldY, this.characterSprites);
        } else {
            this.gameState.player.x = worldX;
            this.gameState.player.y = worldY;
            this.gameState.player.previousX = worldX;
            this.gameState.player.previousY = worldY;
            this.gameState.player.velocityX = 0;
            this.gameState.player.velocityY = 0;
            this.repositionPlayerOnPlatform();
            this.updateCamera();
        }

        // Update stage state and save
        if (typeof this.gameState.setStage === 'function') {
            this.gameState.setStage(stageNumber);
        } else {
            this.gameState.currentStage = stageNumber;
            const name = this.allStages && this.allStages[stageNumber - 1] ? this.allStages[stageNumber - 1].stageName : undefined;
            this.ui.updateStage(stageNumber, name);
            this.saveProgress();
        }

        console.log(`Teleported to Stage ${stageNumber} GOAL at x=${worldX}, y=${worldY}`);
    }

    /**
     * 현재 플레이어 위치를 기준으로 어느 스테이지에 있는지 판별하고
     * 변경이 있으면 gameState와 UI를 동기화합니다.
     */
    checkAndUpdateStage() {
        const player = this.gameState.player;
        if (!player || !this.stageRanges || this.stageRanges.length === 0) return;

        const hb = player.getHitboxRect();
        const playerCenterY = hb.y + hb.height / 2;

        // 개선된 로직:
        // - 각 스테이지 범위의 중앙 Y를 계산하고 플레이어 중심 Y와의 거리가 가장 가까운 스테이지를 선택
        // - 히스테리시스: 현재 스테이지와의 거리가 새 스테이지와의 거리보다 충분히 크지 않으면 변경하지 않음
        let bestStage = 1;
        let bestDist = Infinity;
        const centers = [];
        for (let i = 0; i < this.stageRanges.length; i++) {
            const range = this.stageRanges[i];
            const center = (range.minY + range.maxY) / 2;
            centers.push(center);
            const dist = Math.abs(playerCenterY - center);
            if (dist < bestDist) {
                bestDist = dist;
                bestStage = i + 1;
            }
        }

        // 히스테리시스 적용: 현재 스테이지 중심과의 거리와 비교하여
        // 새 스테이지로 바꾸려면 새 거리(bestDist)가 현재 거리보다 충분히(10px) 작아야 함
        const currentIdx = (this.gameState.currentStage || 1) - 1;
        let currentDist = Infinity;
        if (this.stageRanges[currentIdx]) {
            const curCenter = centers[currentIdx];
            currentDist = Math.abs(playerCenterY - curCenter);
        }

        const HYSTERESIS_PX = 10; // 작게 설정: 미세한 흔들림 방지
        if (bestStage !== this.gameState.currentStage && bestDist + HYSTERESIS_PX < currentDist) {
            this.gameState.setStage(bestStage);
            console.log(`Stage changed -> ${bestStage}`);
        }
    }
    
    /**
     * @description 장애물 생성 헬퍼 함수 (오프셋 적용)
     */
    addObstacle(o, offsetY) {
        const y = o.y + offsetY;
        switch (o.type) {
            case 'lethalFloor':
                this.gameState.obstacles.push(new LethalFloor(o.x, y, o.w, o.h));
                break;
            case 'iceFloor':
                this.gameState.obstacles.push(new IceFloor(o.x, y, o.w, o.h));
                break;
            case 'spring':
                this.gameState.obstacles.push(new Spring(o.x, y, o.w, o.h, o.force, o.direction));
                break;
            case 'wall':
                this.gameState.obstacles.push(new Wall(o.x, y, o.w, o.h));
                break;
            case 'cannon':
                this.gameState.obstacles.push(new Cannon(o.x, y, o.w, o.h, o.rate, o.dir));
                break;
            case 'goal':
                this.gameState.obstacles.push(new Goal(o.x, y, o.w, o.h));
                break;
            case 'homingCannon':
                this.gameState.obstacles.push(new Cannon(o.x, y, o.w, o.h, o.rate, 'homing'));
                break;
        }
    }

    /**
     * @description 맵 데이터(JSON) 로드 및 객체 생성
     * @param {number} stageNumber 
     */
    // NOTE: Single-stage JSON loading is removed per design.
    // Use `loadCombinedStages()` once at init, then `teleportToStage(stageNumber)` to move.
    loadStage(stageNumber) {
        console.warn('loadStage has been deprecated. Use teleportToStage(stageNumber) instead.');
        this.teleportToStage(stageNumber);
    }
    
    /**
     * @description 스테이지별 배경 이미지 로드
     * @param {number} stageNumber - 스테이지 번호
     */
    loadBackgroundImage(stageNumber) {
        this.backgroundLoaded = false;
        this.backgroundImage = null;
        // Try multiple candidate paths (some older code or README used different folders/casing)
        const candidates = [
            `Assets/background/background${stageNumber}.jpg`,
            `Assets/background/background${stageNumber}.png`,
            `Assets/background/background${stageNumber}.webp`,
            `assets/backgrounds/stage${stageNumber}.png`,
            `assets/backgrounds/stage${stageNumber}.jpg`
        ];

        let tried = 0;
        const tryNext = () => {
            if (tried >= candidates.length) {
                console.log(`No background found for stage ${stageNumber}, using default black`);
                this.backgroundLoaded = false;
                this.backgroundImage = null;
                return;
            }
            const path = candidates[tried++];
            const img = new Image();
            img.onload = () => {
                this.backgroundImage = img;
                this.backgroundLoaded = true;
                console.log(`Background loaded: ${path}`);
            };
            img.onerror = () => {
                // try next candidate
                tryNext();
            };
            img.src = path;
        };

        tryNext();
    }

    /**
     * @description Preload per-stage background images using convention Assets/background/background{n}.jpg
     * @param {Array} stages - loaded stage JSONs
     */
    preloadStageBackgrounds(stages = []) {
        this.stageBackgrounds = [];
        for (let i = 0; i < stages.length; i++) {
            const stageIdx = i + 1;
            const layers = [];
            // If stage JSON provides explicit background(s), prefer those
            const stageData = stages[i] || {};
            const bgField = stageData.background || stageData.backgrounds;

            // normalize to array of layer objects: { path, parallax, yOffset, repeatX, vAlign }
            let layerDefs = [];
            if (bgField) {
                if (typeof bgField === 'string') layerDefs = [{ path: bgField }];
                else if (Array.isArray(bgField)) {
                    // array may contain strings or objects
                    layerDefs = bgField.map(b => (typeof b === 'string' ? { path: b } : b));
                } else if (typeof bgField === 'object') {
                    layerDefs = [bgField];
                }
            } else {
                // Fallback to convention-based single-layer path
                layerDefs = [{ path: `Assets/background/background${stageIdx}.jpg` }];
            }

            // Create Image objects and attach layer metadata
            layerDefs.forEach(def => {
                if (!def || !def.path) return;
                const img = new Image();
                img.src = def.path;
                img.onload = () => { console.log(`Stage background loaded: ${def.path}`); };
                img.onerror = () => { console.warn(`Stage background load failed: ${def.path}`); };
                layers.push({
                    img,
                    parallax: typeof def.parallax === 'number' ? def.parallax : 0,
                    yOffset: typeof def.yOffset === 'number' ? def.yOffset : 0,
                    repeatX: !!def.repeatX,
                    vAlign: def.vAlign || 'bottom'
                });
            });

            this.stageBackgrounds[i] = layers;
        }
    }
    
    /**
     * @description Stage 5 위에 하늘 배경 추가 (지옥 탈출 의미 + 검은 공백 제거)
     */
    addSkyBackground() {
        if (!this.stageRanges || this.stageRanges.length === 0) return;
        
        // 마지막 스테이지 범위 가져오기
        const lastStageIdx = this.stageRanges.length - 1;
        const lastRange = this.stageRanges[lastStageIdx];
        if (!lastRange) return;
        
        // 하늘 배경을 마지막 스테이지 위쪽에 배치
        const skyImg = new Image();
        skyImg.src = 'Assets/background/background6.jpg';
        skyImg.onload = () => { console.log('Sky background loaded: background6.jpg'); };
        skyImg.onerror = () => { console.warn('Sky background load failed: background6.jpg'); };
        
        // 가상의 "하늘 스테이지" 범위 생성 (마지막 스테이지 위쪽)
        const skyHeight = 2000; // 하늘 배경 높이
        const skyRange = {
            minY: lastRange.minY - skyHeight,
            maxY: lastRange.minY
        };
        
        // stageRanges와 stageBackgrounds에 추가
        this.stageRanges.push(skyRange);
        this.stageBackgrounds.push([{
            img: skyImg,
            parallax: 0,
            yOffset: 0,
            repeatX: false,
            vAlign: 'top'
        }]);
        
        console.log('Sky background added above Stage 5');
    }
    
    /**
     * @description 플레이어를 가장 가까운 발판 위로 재배치 (창 크기 변경 등의 문제 해결)
     */
    repositionPlayerOnPlatform() {
        const player = this.gameState.player;
        if (!player || this.gameState.platforms.length === 0) return;

        // 온건화: 플레이어가 공중에서 활발히 움직이거나 점프 차징 중이면
        // 재배치를 하지 않음(사용자가 점프할 때 다시 끌려오는 현상 방지).
        // 수직 속도가 작을 때만(거의 정지 상태) 자동 재배치 허용.
        const VERTICAL_VEL_THRESHOLD = 2; // 픽셀/프레임 단위
        if (Math.abs(player.velocityY) > VERTICAL_VEL_THRESHOLD || player.isChargingJump) {
            // 디버그: 필요 시 아래 로그를 활성화
            // console.log('repositionPlayerOnPlatform: skipped due to vertical motion or charging');
            return;
        }

        // 플레이어 하단 중심점 (히트박스 기준)
        const hb = player.getHitboxRect();
        const playerCenterX = hb.x + hb.width / 2;
        const playerBottom = hb.y + hb.height;

        // 가장 가까운 발판 찾기 (플레이어 아래쪽에 있는 발판 우선)
        let closestPlatform = null;
        let minDistance = Infinity;

        this.gameState.platforms.forEach(platform => {
            // 플레이어가 발판 가로 범위 내에 있는지 확인 (히트박스 기준)
            const isInXRange = playerCenterX >= platform.x && 
                               playerCenterX <= platform.x + platform.width;
            
            // 플레이어 아래쪽에 있는 발판인지 확인
            const isBelow = platform.y >= playerBottom - 100; // 100px 여유
            
            if (isInXRange && isBelow) {
                const distance = Math.abs(platform.y - playerBottom);
                if (distance < minDistance) {
                    minDistance = distance;
                    closestPlatform = platform;
                }
            }
        });

        // 가장 가까운 발판을 못 찾았으면 가장 가까운 발판을 찾음 (방향 무관)
        if (!closestPlatform) {
            this.gameState.platforms.forEach(platform => {
                const distance = Math.sqrt(
                    Math.pow(playerCenterX - (platform.x + platform.width / 2), 2) +
                    Math.pow(playerBottom - platform.y, 2)
                );
                if (distance < minDistance) {
                    minDistance = distance;
                    closestPlatform = platform;
                }
            });
        }
        
        // 발판 위로 재배치
        if (closestPlatform) {
            player.landOn(closestPlatform.y);
            player.velocityX = 0;
            player.velocityY = 0;
            console.log(`Player repositioned on platform at y=${closestPlatform.y}`);
        }
    }
    
    /**
     * @description 플레이어와 객체 간 충돌 처리
     */
    handleCollisions() {
        const player = this.gameState.player;
        if (!player) return;

        // AABB 충돌 감지 헬퍼
        const checkCollision = (rect1, rect2) => {
            return rect1.x < rect2.x + rect2.width &&
                   rect1.x + rect1.width > rect2.x &&
                   rect1.y < rect2.y + rect2.height &&
                   rect1.y + rect1.height > rect2.y;
        };

        // --- 1. 플레이어 vs 발판 ---
        // 발판은 위에서 아래로만 착지 가능 (아래에서 위로는 통과)
        this.gameState.platforms.forEach(platform => {
            const pRect = player.getHitboxRect();
            if (checkCollision(pRect, platform)) {
                // 진짜 이전 위치 사용 (터널링 방지)
                const prevRect = player.getPreviousHitboxRect();
                const prevBottom = prevRect.y + prevRect.height;
                
                // 하강 중이고, 이전 프레임에서 발판 위에 있었을 때만 착지
                if (player.velocityY >= 0 && prevBottom <= platform.y) {
                    player.landOn(platform.y);
                }
                // 발판의 측면 충돌은 없음 (통과 가능)
            }
        });

        // --- 1.5. Goal을 발판처럼 처리하여 "위에 올라가 있는 상태"에서도 클리어를 인식하도록 함 ---
        this.gameState.obstacles.forEach(obs => {
            if (obs.type !== 'goal') return;
            const pRectG = player.getHitboxRect();
            const playerCenterX = pRectG.x + pRectG.width / 2;
            const prevRectG = player.getPreviousHitboxRect();
            const prevBottomG = prevRectG.y + prevRectG.height;
            const obsWidth = typeof obs.width === 'number' ? obs.width : (obs.w || 0);
            const inX = playerCenterX >= obs.x && playerCenterX <= obs.x + obsWidth;
            // 플레이어가 goal 위에 수평으로 존재하고, 이전 프레임에서 goal 위에 있거나 아래에서 내려온 경우
            if (inX && (prevBottomG <= obs.y || (pRectG.y + pRectG.height === obs.y))) {
                // 착지 처리: 플레이어가 이미 goal 위에 올라가 있을 때도 landOn 호출
                player.landOn(obs.y);
                player.velocityX = 0;
                player.velocityY = 0;
                // 이제 클리어 처리(기존 obstacles의 'goal' 분기에서 중복 처리될 수 있으므로,
                // 여기서는 UI 호출을 직접 하지 않고, 이후 obstacles 루프에서의 처리를 허용)
                // 다만 디버깅을 위해 로그 남김
                console.log('[GOAL PLATFORM] player placed/settled on goal at y=', obs.y);
            }
        });
        
        // --- 2. 화면 경계 충돌 (좌우 빨간 벽) ---
        const WALL_MARGIN = 30; // 화면 양쪽에 30px 벽 (게임 영역 확대)
        const leftWall = this.gameState.camera.x + WALL_MARGIN;
        const rightWall = this.gameState.camera.x + GAME_CONSTANTS.CANVAS_WIDTH - WALL_MARGIN;
        
        // 화면 경계 충돌 검사 (히트박스 기준)
        const hb = player.getHitboxRect();
        if (hb.x < leftWall) {
            // 왼쪽 벽에 부딪힘 - 오른쪽으로 튕김
            player.x += (leftWall - hb.x);
            player.velocityX = Math.abs(player.velocityX) * 1.2; // 튕겨냄
            this.audio.playSFX('hit');
        } else if (hb.x + hb.width > rightWall) {
            // 오른쪽 벽에 부딪힘 - 왼쪽으로 튕김
            player.x -= (hb.x + hb.width - rightWall);
            player.velocityX = -Math.abs(player.velocityX) * 1.2; // 튕겨냄
            this.audio.playSFX('hit');
        }

        // --- 3. 플레이어 vs 장애물 ---
        this.gameState.obstacles.forEach(obs => {
            const pRect2 = player.getHitboxRect();
            // 충돌 체크: 일반 장애물은 기존 AABB 겹침 기준 사용
            // 단, 'goal'의 경우 플레이어가 발판과 정확히 접촉(touch)한 경우에도
            // 착지 처리를 해주기 위해 접촉(equal)도 허용하는 보완 검사 추가
            let collided = false;
            if (checkCollision(pRect2, obs)) {
                collided = true;
            } else if (obs.type === 'goal') {
                // 플레이어 바닥과 goal.y가 정확히 같거나 매우 근접한 경우를 허용
                const playerBottom = pRect2.y + pRect2.height;
                const eps = 1; // 1px 허용오차
                const withinX = (pRect2.x + pRect2.width) > obs.x && pRect2.x < (obs.x + (obs.width || obs.w || 0));
                if (withinX && Math.abs(playerBottom - obs.y) <= eps) {
                    collided = true;
                }
            }
            if (collided) {
                switch (obs.type) {
                    case 'wall':
                        // 벽: 통과 불가능한 고체 장애물
                        const prevRect = player.getPreviousHitboxRect();
                        const prevRight = prevRect.x + prevRect.width;
                        const prevLeft = prevRect.x;
                        const prevBottom = prevRect.y + prevRect.height;
                        const prevTop = prevRect.y;
                        
                        // 좌우 충돌
                        if (prevRight <= obs.x) {
                            // 왼쪽에서 충돌
                            // player.x는 히트박스 기준이므로 보정하여 위치 설정
                            player.x = obs.x - player.hitboxWidth - (player.hitboxOffsetX || 0);
                            player.velocityX = 0;
                        } else if (prevLeft >= obs.x + obs.width) {
                            // 오른쪽에서 충돌
                            player.x = obs.x + obs.width - (player.hitboxOffsetX || 0);
                            player.velocityX = 0;
                        }
                        
                        // 상하 충돌
                        if (prevBottom <= obs.y && player.velocityY >= 0) {
                            // 위에서 착지
                            player.landOn(obs.y);
                        } else if (prevTop >= obs.y + obs.height && player.velocityY < 0) {
                            // 아래에서 머리 부딪침 - 히트박스 기준 보정
                            player.y = obs.y + obs.height + (player.hitboxOffsetY || 0);
                            player.velocityY = 0;
                        }
                        break;
                    case 'lethalFloor':
                        // 붉은 장판: 튕겨냄 (기획서 4번)
                        player.hit(-player.velocityX * 0.5, -15); // 위로 강하게 튕겨냄
                        this.audio.playSFX('hit');
                        break;
                    case 'iceFloor':
                        // 회색 장판: 마찰력 변경
                        // 일반 마찰값(GAME_CONSTANTS.PLAYER.FRICTION)에 비해
                        // "더 미끄럽게" 만들기 위해 1에 가까운 값으로 설정.
                        // 사용자가 요청한 "2배 더 미끄럽게"는
                        // (1 - distance_to_1) 를 2배 가깝게 만들어 적용합니다.
                        const baseF = GAME_CONSTANTS.PLAYER.FRICTION || 0.95;
                        // distance to 1
                        const dist = 1 - baseF;
                        // halve the distance to make it twice as close to 1
                        const iceFriction = Math.min(0.999, 1 - dist / 2);
                        player.currentFriction = iceFriction;
                        break;
                    case 'spring':
                        // 스프링: 좌우로 튕겨냄 (초록색 점프패드)
                        const springDirection = obs.direction || 'right'; // 기본 오른쪽
                        const horizontalForce = obs.bounceForce || 15;
                        
                        if (springDirection === 'right') {
                            player.hit(horizontalForce, -5); // 오른쪽으로 튕김
                        } else if (springDirection === 'left') {
                            player.hit(-horizontalForce, -5); // 왼쪽으로 튕김
                        } else if (springDirection === 'up') {
                            player.hit(0, -horizontalForce); // 위로 튕김
                        }
                        this.audio.playSFX('spring');
                        break;
                    case 'goal':
                        // 플레이어가 골을 밟으면 스테이지 클리어 처리
                        const prevRectG = player.getPreviousHitboxRect();
                        const prevBottomG = prevRectG.y + prevRectG.height;
                        // 디버그 로그: goal과 충돌했을 때의 값 찍기
                        console.log('[GOAL CHECK] collision detected', {
                            playerRect: pRect2,
                            prevRect: prevRectG,
                            prevBottom: prevBottomG,
                            goal: { x: obs.x, y: obs.y, w: obs.width || obs.w, h: obs.height || obs.h },
                            velY: player.velocityY
                        });
                        // 허용 오차: 매우 작은 위치 차이로 착지 판정이 누락되는 것을 방지합니다.
                        const LANDING_TOLERANCE_PX = 8;
                        const isMovingDownOrSettling = player.velocityY >= -2; // 약간의 상승도 허용
                        if (isMovingDownOrSettling && prevBottomG <= obs.y + LANDING_TOLERANCE_PX) {
                            // 착지 처리
                            player.landOn(obs.y);
                            player.velocityX = 0;
                            player.velocityY = 0;
                            // 클리어 플래그 및 시간 계산
                            this.gameState.isRunning = false;
                            this.gameState.isGameOver = true;
                            const paused = this.gameState.pausedAccum || 0;
                            this.gameState.clearTime = Date.now() - (this.gameState.startTime || Date.now()) - paused;
                            // 정리: BGM 정지 및 UI 콜백
                            try { this.audio.stopBGM(); } catch (e) {}
                                            if (this.ui && typeof this.ui.showStageCleared === 'function') {
                                                this.ui.showStageCleared(this.gameState.clearTime, this.gameState.currentStage);
                                            }
                            console.log(`Stage cleared in ${this.gameState.clearTime} ms (prevBottom=${prevBottomG}, goalY=${obs.y}, velY=${player.velocityY})`);
                        }
                        break;
                    case 'bullet':
                    case 'homingMissile':
                        // 탄막: 튕겨냄
                        player.hit(obs.velocityX * 2, obs.velocityY * 2 - 5);
                        this.audio.playSFX('hit');
                        obs.isDead = true; // 미사일/탄막 제거
                        break;
                }
            }
        });
    }

    /**
     * @description 카메라가 플레이어를 따라가도록 위치 조절 (수직 스크롤)
     */
    updateCamera() {
        const player = this.gameState.player;
        if (!player) return;

        // 수직 스크롤: X축은 고정 (0), Y축만 플레이어 추적
        // X축: 좌우 스크롤 없음 (화면 전체를 보여줌)
        this.gameState.camera.x = 0;
        
    // Y축: 플레이어 히트박스 기준으로 화면 중앙~하단에 위치하도록 (약간 아래를 더 보이게)
    const hb = player.getHitboxRect();
    const targetY = hb.y - GAME_CONSTANTS.CANVAS_HEIGHT * 0.6; // 플레이어가 화면의 60% 지점에
        
        // 부드러운 카메라 이동 (선택사항)
        const smoothFactor = 0.1;
        this.gameState.camera.y += (targetY - this.gameState.camera.y) * smoothFactor;

        // 카메라 Y축 경계 제한
        const minY = this.gameState.mapBounds?.minY || -Infinity;
        const maxY = this.gameState.mapBounds?.height || Infinity;
        
        if (this.gameState.camera.y < minY) {
            this.gameState.camera.y = minY;
        } else if (this.gameState.camera.y + GAME_CONSTANTS.CANVAS_HEIGHT > maxY) {
            this.gameState.camera.y = Math.max(minY, maxY - GAME_CONSTANTS.CANVAS_HEIGHT);
        }
    }

    // --- 3. UI 콜백 함수들 ---

    startGame() {
        if (this.gameState.isRunning) return;
        
        console.log("Game Start!");
        this.gameState.isRunning = true;
        this.gameState.isGameOver = false;
        // 게임 시작 시 시간 초기화 (일시정지 누적 초기화)
        this.gameState.startTime = Date.now();
        this.gameState.pausedAccum = 0;
        this.gameState.pauseStart = null;
        // Ensure audio is unlocked (call inside user gesture) so BGM can play
        try {
            // unlockNow returns a promise; if it resolves we proceed to play
            this.audio.unlockNow().then(() => {
                try { this.audio.playBGM('stage1BGM'); } catch (e) { console.warn('playBGM failed', e); }
            });
        } catch (e) {
            try { this.audio.playBGM('stage1BGM'); } catch (ee) { console.warn('playBGM failed', ee); }
        }
        
        // 시작 버튼 비활성화
        const startButton = document.getElementById('start-button');
        if (startButton) {
            startButton.disabled = true;
            startButton.style.opacity = '0.5';
            startButton.style.cursor = 'not-allowed';
        }
    }

    togglePause() {
        if (!this.gameState.isRunning) return; // 시작도 안 했으면 무시
        // Toggle
        if (!this.gameState.isPaused) {
            // Pausing now
            this.gameState.isPaused = true;
            this.gameState.pauseStart = Date.now();
            console.log("Game Paused");
            this.audio.pauseAll(); // (audioManager 6단계)
        } else {
            // Resuming
            this.gameState.isPaused = false;
            // accumulate paused time
            if (this.gameState.pauseStart) {
                this.gameState.pausedAccum = (this.gameState.pausedAccum || 0) + (Date.now() - this.gameState.pauseStart);
                this.gameState.pauseStart = null;
            }
            console.log("Game Resumed");
            this.lastTime = performance.now(); // 멈춘 시간만큼 튀는 것 방지
            this.audio.resumeAll(); // (audioManager 6단계)
        }
    }

    /**
     * 강제 리셋: 로컬 저장 초기화 후 페이지 리로드로 완전 초기화
     */
    forceReset() {
        console.log('Force reset: clearing progress and reloading');
        this.clearProgress();
        // 튜토리얼 상태도 초기화
        localStorage.removeItem('tutorialDone');
        // 추가로 로컬 leaderboard를 지우고 싶다면 아래 주석 해제
        // localStorage.removeItem('local_leaderboard');
        window.location.reload();
    }

    resetGame() {
        console.log("Game Reset!");
        this.gameState.isRunning = false;
        this.gameState.isPaused = false;
        
        // 맵(플랫폼/장애물)은 유지(Combined map 로드 후 텔레포트 방식 사용)
        // 카메라만 초기 위치로 리셋
        this.gameState.camera = { x: 0, y: 0 };
        
        // 플레이어 상태 초기화
        if (this.gameState.player) {
            // 기존 프로퍼티명에 맞춰 안전하게 초기화
            this.gameState.player.velocityX = 0;
            this.gameState.player.velocityY = 0;
            this.gameState.player.isChargingJump = false;
            this.gameState.player.jumpCharge = 0;
            this.gameState.player.isHit = false;
            this.gameState.player.hitTimer = 0;
        }
        
        // 키 입력 초기화
        this.gameState.keys = {
            left: false,
            right: false,
            space: false
        };
        
        // 시작 버튼 재활성화
        const startButton = document.getElementById('start-button');
        if (startButton) {
            startButton.disabled = false;
            startButton.style.opacity = '1';
            startButton.style.cursor = 'pointer';
        }
        
    this.audio.stopBGM();
    // 초기화 시 자동 저장을 방지하기 위해 플래그 설정
    this.clearProgress();
        this._skipNextAutoSave = true;
        // 텔레포트로 1스테이지 시작 위치로 이동 (단일 맵 재로드는 사용 안함)
        this.teleportToStage(1);
        // 자동으로 게임 시작하여 사용자가 '시작' 버튼을 또 누르지 않게 함
        try {
            this.startGame();
        } catch (e) {
            console.error('Failed to auto-start after reset', e);
        }
    }

    /**
     * @description 리더보드 데이터 로드 및 UI 표시
     */
    async loadLeaderboard() {
        this.ui.displayLeaderboard(null, true); // 로딩 중 표시
        const data = await this.data.loadLeaderboardFromFirebase();
        this.ui.displayLeaderboard(data, false); // 결과 표시
    }

    // --- 4. 입력 핸들러 ---

    handleKeyDown(e) {
        // 입력 폼(입력창/텍스트영역/ContentEditable)에 포커스가 있을 땐 게임 키 처리를 방지
        const active = document.activeElement;
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) {
            return;
        }

        // 문자 키는 소문자로 정규화하여 대소문자 구분 문제를 제거
        let key = e.key;
        if (typeof key === 'string' && key.length === 1) key = key.toLowerCase();

        switch (key) {
            case 'ArrowLeft': case 'a':
                this.gameState.keys.left = true;
                break;
            case 'ArrowRight': case 'd':
                this.gameState.keys.right = true;
                break;
            case ' ': // Spacebar
                this.gameState.keys.space = true;
                break;
            case 'Escape': case 'p':
                // (일시정지 시스템)
                this.togglePause();
                break;
        }
    }

    handleKeyUp(e) {
        // 입력 폼에 포커스가 있으면 키 해제를 처리하지 않음
        const active = document.activeElement;
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) {
            return;
        }

        let key = e.key;
        if (typeof key === 'string' && key.length === 1) key = key.toLowerCase();

        switch (key) {
            case 'ArrowLeft': case 'a':
                this.gameState.keys.left = false;
                break;
            case 'ArrowRight': case 'd':
                this.gameState.keys.right = false;
                break;
            case ' ': // Spacebar
                this.gameState.keys.space = false;
                break;
        }
    }
    
    // --- 5. 임시 맵 데이터 (JSON 로드 실패 시 Fallback) ---
    getMockMapData(stageNumber) {
        return {
            stageNumber: 1,
            stageName: "Fallback Test Map",
            playerStart: { x: 640, y: 550 },
            mapBounds: {
                width: 1280,
                height: 2000,
                minY: -1500
            },
            platforms: [
                // 시작 바닥 발판 (전체 너비)
                { x: 50, y: 650, w: 1180, h: 40 },
                { x: 500, y: 550, w: 280, h: 30 },
                { x: 350, y: 450, w: 200, h: 25 },
                { x: 700, y: 350, w: 200, h: 25 },
                { x: 400, y: 250, w: 180, h: 25 },
            ],
            obstacles: [
                { type: 'iceFloor', x: 700, y: 440, w: 200, h: 10 },
                { type: 'spring', x: 420, y: 330, w: 60, h: 20, force: 12, direction: 'right' },
                { type: 'cannon', x: 200, y: 100, w: 50, h: 50, rate: 2500, dir: 'right'}
            ]
        };
    }
}


// --- [!!!] 게임 실행 ---
window.game = new GameController();
window.game.init();