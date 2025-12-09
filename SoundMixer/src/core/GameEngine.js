/**
 * GameEngine - 리듬게임 핵심 엔진
 * 
 * 게임 루프, 노트 판정, 오디오-비디오 동기화 담당
 */

import { AudioConductor } from './audio/AudioConductor.js';
import { AudioController } from './audio/AudioController.js';
import { VoiceManager } from './audio/VoiceManager.js';
import { NoteManager } from '../logic/NoteManager.js';
import { Renderer } from '../view/Renderer.js';
import { InputSystem } from './input/InputSystem.js';
import { JudgeSystem } from '../logic/JudgeSystem.js';
import { CharacterRenderer } from '../view/CharacterRenderer.js';
import { ResourceManager } from './managers/ResourceManager.js';
import { ChartLoader } from './managers/ChartLoader.js';
import { GlobalStore } from '../data/GlobalStore.js';
import { LayoutManager } from './managers/LayoutManager.js';
import { SoundManager } from './audio/SoundManager.js';
import { BGAManager } from './managers/BGAManager.js';
import { VideoCache } from './managers/VideoCache.js';
import { GameDB } from './storage/GameDB.js';
import { GameStateManager } from './managers/GameStateManager.js';
import { PlayState } from '../data/PlayState.js';
import { EventEmitter } from '../infrastructure/EventEmitter.js';
import { DOM } from '../data/DOMRegistry.js';

export class GameEngine {
    /**
     * 게임 엔진 생성자
     * @param {HTMLCanvasElement} canvas - 렌더링에 사용할 캔버스 엘리먼트
     * @param {UIManager} uiManager - UI 관리자 (입력 차단 확인용)
     */
    constructor(canvas, uiManager) {
        // === Canvas 및 Context ===
        this.canvas = canvas;
        this.ctx = this.canvas.getContext('2d');

        // === UI Manager ===
        this.uiManager = uiManager;

        // === 이벤트 시스템 ===
        this.events = new EventEmitter();

        // === 상태 관리자 ===
        this.stateManager = new GameStateManager(this.events);

        // === 매니저 초기화 (의존성 순서 유의) ===
        this.layoutManager = new LayoutManager();
        this.resourceManager = new ResourceManager();

        // 오디오 시스템
        const audioConductor = new AudioConductor();
        this.audioController = new AudioController(audioConductor);
        this.sound = new SoundManager(audioConductor.audioCtx);
        
        // [신규] 음성 시스템
        this.voice = new VoiceManager();

        // [성능 최적화] 기존 코드 호환성을 위한 직접 참조 (오버헤드 제로)
        // 새 기능은 audioController 사용, 기존 코드는 this.audio 유지
        this.audio = audioConductor;

        // [신규] GameDB 초기화 (IndexedDB) - 생성만, init은 initAsync에서
        this.gameDB = new GameDB();
        this.gameDB.debug = GlobalStore.debug; // 디버그 모드 연동

        // [신규] VideoCache 초기화 (비디오 중복 로딩 방지 + IndexedDB 통합)
        // DB 이름을 명확하게 구분: 'VideoCache_DB' - 생성만, init은 initAsync에서
        this.videoCache = new VideoCache(100, 'VideoCache_DB', false); // 100MB 메모리 + IndexedDB (auto-init 비활성)
        this.videoCache.debug = GlobalStore.debug; // 디버그 모드 연동

        // BGA 관리 (overlay, container, videoCache 포함)
        this.bga = new BGAManager(DOM.video, DOM.overlay, DOM.get('bga-container'), this.videoCache);

        // 게임 로직
        this.notes = new NoteManager();
        this.chartLoader = new ChartLoader(this.notes);
        this.judge = new JudgeSystem();

        // 렌더링
        this.renderer = new Renderer(this.canvas, this.resourceManager);
        this.character = new CharacterRenderer();
        this.character.setAssets(this.resourceManager);

        // 입력 시스템 (콜백 바인딩)
        this.input = new InputSystem(
            this.handleInput.bind(this),
            this.handleInputUp.bind(this)
        );

        // === 게임 상태 변수 ===
        this.isRunning = false;                          // 게임 실행 중 여부
        this.wasRunningBeforePause = false;              // [신규] 일시정지 전 상태 저장
        this.isWaitingStart = false;                     // [신규] 3초 대기 상태
        this.startCountdown = 0;                         // [신규] 3초 카운트다운
        this.keyState = [false, false, false, false];    // 각 트랙의 키 입력 상태
        this.lastNoteTime = 0;                            // 마지막 노트 시간 (게임 종료 판단용)

        // === 레이아웃 데이터 ===
        this.layout = {
            gearX: 0,
            gearWidth: 380,
            charFrame: { x: 0, y: 0, w: 0, h: 0 }
        };

        // === 외부 연동 ===
        this.songData = null;        // 현재 플레이 중인 곡 정보
        this.optionManager = null;   // 옵션 관리자 (SceneManager가 설정)

        // === 이벤트 리스너 등록 ===
        // 콤보 버스트 이벤트 (ScoreManager → GameEngine → Renderer)
        this._comboBurstListener = this._onComboBurst.bind(this);
        window.addEventListener('comboBurst', this._comboBurstListener);

        // 게임 실패 이벤트 (GameStateManager → GameEngine → finish)
        this.events.on('gameFailed', () => this.finish());

        // === 비디오-오디오 동기화 보정 변수 ===
        this.lastSyncCheckTime = 0;      // 마지막 동기화 체크 시간
        this.syncCheckInterval = GlobalStore.constants.TIMING.SYNC_CHECK_INTERVAL;   // 동기화 체크 주기 (초)
        this.syncDriftAccumulator = 0;   // 누적된 drift
        this.syncCheckCount = 0;         // 동기화 체크 횟수
        this.syncDriftCorrection = 0;    // 노트 위치 보정값 (초 단위)
    }
    /**
     * 옵션 관리자 설정
     * 
     * @param {OptionManager} optionManager - 옵션 관리자
     * 
     * [목적]
     * - 입력 차단 상태를 확인하기 위해 OptionManager 참조 저장
     */
    setOptionManager(optionManager) {
        this.optionManager = optionManager;

        // 입력 차단 상태를 주기적으로 확인하여 플래그 업데이트
        this._inputBlockCheckInterval = setInterval(() => {
            // 모달 열림 또는 옵션 패널 열림 시 게임 입력 차단
            this.input.isInputBlocked = this.uiManager.isModalActive() ||
                (this.optionManager && this.optionManager.isOpen);
        }, 100); // 100ms마다 체크
    }

    /**
     * 엔진 초기화 (스킨 및 사운드 로드)
     * @async
     * @returns {Promise<void>}
     */
    async init() {
        const skinId = GlobalStore.settings.skinId;

        // [1] IndexedDB 초기화 (병렬 처리)
        await Promise.all([
            this.gameDB.init(),
            this.videoCache.init(),
            this.audio.init(), // [신규] MusicCache 초기화 (this.audio = AudioConductor)
            this.voice.init() // [신규] 음성 매핑 로드 + VoiceCache 초기화
        ]);

        // [신규] 립싱크 연결 (VoiceManager → CharacterRenderer)
        this.voice.setLipSyncCallback((mouthOpen) => {
            this.character.setMouthOpen(mouthOpen);
        });
        
        // [신규] PlayState 마일스톤 강제 동기화 (voice.init() 후)
        if (this.voice.isLoaded && this.voice.voiceMapping) {
            const combo = this.voice.voiceMapping.game_mapping.combo;
            if (combo) {
                const milestones = Object.keys(combo).map(k => parseInt(k)).sort((a, b) => a - b);
                PlayState.comboBurstMilestones = milestones;
                PlayState.comboBurstIncrement = this.voice.voiceMapping.combo_burst_increment || 0;
                PlayState.comboBurstMultiplier = this.voice.voiceMapping.combo_burst_multiplier || 1.5;
            }
        }

        // [2] 병렬 로딩 (스킨 + 사운드) - 재시도 로직 포함
        const maxRetries = 3;
        let retries = 0;
        let success = false;

        while (!success && retries < maxRetries) {
            try {
                await Promise.all([
                    this.resourceManager.loadSkin(skinId),
                    this.sound.loadSounds(skinId)
                ]);
                success = true;
            } catch (error) {
                retries++;
                console.warn(`[GameEngine] Init failed (attempt ${retries}/${maxRetries}):`, error);

                if (retries >= maxRetries) {
                    console.error('[GameEngine] Init failed after max retries, using fallback resources');
                    // 기본 리소스로 계속 (빈 이미지 대신 생성된 자산 사용)
                } else {
                    // 1초 대기 후 재시도
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
        }

        // 볼륨 적용
        this.audio.setVolume(GlobalStore.settings.volMusic);
        this.sound.setSfxVolume(GlobalStore.settings.volSfx);
        this.sound.setVoiceVolume(GlobalStore.settings.volVoice);
        this.voice.setVolume(GlobalStore.settings.volVoice); // [수정] VoiceManager 볼륨 설정 추가
        
        // [신규] CharacterRenderer 초기화 대기 (Live2D 로드 완료까지)
        if (this.character && !this.character.isLive2DReady) {
            const maxWait = 5000; // 최대 5초 대기
            const startTime = Date.now();
            
            while (!this.character.isLive2DReady && (Date.now() - startTime) < maxWait) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            if (!this.character.isLive2DReady) {
                console.warn('[GameEngine] ⚠️ Live2D 초기화 타임아웃 (5초 초과)');
            }
        }
    }

    /**
     * 화면 크기 변경 처리
     * @param {number} w - 화면 너비
     * @param {number} h - 화면 높이
     */
    resize(w, h) {
        const { hitPosition, layoutData } = this.layoutManager.calculate(w, h);
        this.layout = layoutData;
        this.renderer.resize(w, h, this.layout);

        // CharacterRenderer 리사이즈
        if (this.character && this.character.resize) {
            this.character.resize(w, h);
        }

        // 정지 상태일 때도 화면 갱신
        if (!this.isRunning) {
            const hudData = { ...PlayState, hpMax: PlayState.hpSettings.max };
            this.renderer.draw([], hudData, this.layout, this.keyState, false);
            this.character.draw(this.ctx, this.layout.charFrame, 0);
        }
    }

    /**
     * 게임 시작
     * @async
     * @param {Object} songData - 곡 정보 (meta.json + 채보 경로)
     * @returns {Promise<void>}
     */
    async start(songData) {
        const musicPath = songData.path + songData.musicFile;
        const chartPath = songData.path + songData.chartFile;

        // [핵심 수정] 이전 게임 상태 완전 초기화
        this.isRunning = false;

        // [신규] Live2D 캔버스 숨김 (로딩 중 캐릭터 표시 방지)
        if (this.character && this.character.canvas2d) {
            this.character.canvas2d.style.display = 'none';
        }

        // AudioConductor 상태 리셋 (버퍼는 캐싱 유지)
        if (this.audio.isPlaying) {
            this.audio.stop();
        }

        // BGA 정리
        this.bga.cleanup();

        // [수정] InputSystem 활성화 보장 (첫 시작 + 재시작)
        if (this.input) {
            // [핵심 수정] 입력 차단 플래그 초기화
            this.input.isInputBlocked = false;

            // [핵심 수정] activate() 메서드 호출 (직접 할당 대신)
            this.input.activate();

            // [핵심 수정] 이벤트 리스너 재등록 (재시작 시 필요)
            this.input._initEvents();
        }

        // [수정] BGA 동기화 타이밍 초기화
        this._lastSyncTime = null;

        // songData 저장 (BPM 사용을 위해)
        this.songData = songData;

        // [신규] BPM 자동 측정 시스템
        if (!songData.bpm || songData.bpm === 0) {
            // BPM이 0이거나 없으면 측정 모드 활성화
            this.shouldDetectBPM = true;
            this.bpmDetectionData = { peaks: [], startTime: 0 };
        } else {
            this.shouldDetectBPM = false;
        }

        // [데이터 초기화] PlayState 사용 (HP는 songData에서 설정)
        const hpConfig = {
            hpMax: songData.hpMax,
            hpDrain: songData.hpDrain,
            hpRegen: songData.hpRegen
        };
        this.events.emit('gameStarted', {
            reset: true,
            songTitle: songData.title,
            hpConfig
        });

        // 오디오 오프셋 설정
        this.audio.setOffset(GlobalStore.settings.offset);

        // 비디오-오디오 동기화 보정 초기화
        this.lastSyncCheckTime = 0;
        this.syncDriftAccumulator = 0;
        this.syncCheckCount = 0;
        this.syncDriftCorrection = 0;

        this.keyState = [false, false, false, false];

        // [핵심] 순차적 로딩 + 실제 프로그레스 추적
        let totalProgress = 0;
        const updateProgress = (delta) => {
            totalProgress += delta;
            if (this.renderer) {
                this.renderer.loadingProgress = Math.min(totalProgress, 0.99); // 99%까지만
                this.renderer.drawLoading();
            }
        };

        try {
            // [1단계] 음악 파일 로딩 (40%)
            updateProgress(0.05); // 시작
            const isMusicLoaded = await this.audio.load(musicPath);
            if (!isMusicLoaded) {
                throw new Error('음악 파일을 불러올 수 없습니다.\n경로: ' + musicPath);
            }
            updateProgress(0.35); // 음악 완료

            // [2단계] 차트 + BGA 병렬 로딩 (40%)
            updateProgress(0.05);
            
            // [최적화] 차트와 BGA를 병렬로 로드
            const videoPath = songData.videoFile ? songData.path + songData.videoFile : null;
            const coverPath = songData.coverImage ? songData.path + songData.coverImage : null;
            
            const [chartResult, hasBGA] = await Promise.all([
                this.chartLoader.load(chartPath),
                this.bga.load(videoPath, coverPath).catch(err => {
                    console.warn('[GameEngine] BGA loading failed:', err.message);
                    return false;
                })
            ]);
            
            if (!chartResult.success) {
                throw new Error(chartResult.error || '차트 로딩 실패');
            }
            
            // BGA Dim 설정
            if (hasBGA) {
                this.bga.setDimOpacity(GlobalStore.settings.bgaDim / 100);
            }
            this.hasBGA = hasBGA;
            
            updateProgress(0.35); // 차트 + BGA 완료

            // [4단계] 스킨 로딩 검증 (20%)
            updateProgress(0.10);
            // ResourceManager는 이미 init()에서 로드됨, 여기서는 검증만
            if (!this.resourceManager.images || Object.keys(this.resourceManager.images).length === 0) {
                console.warn('[GameEngine] 스킨 리소스가 없습니다. 기본 생성 리소스를 사용합니다.');
            }
            updateProgress(0.10); // 스킨 완료

        } catch (error) {
            console.error('[GameEngine] Loading failed:', error);

            // 로딩 실패 시 에러 모달 표시 후 선곡 화면으로
            if (this.app && this.app.ui && this.app.sceneManager) {
                this.app.ui.showMessage(
                    `게임 로딩 실패\n\n${error.message}\n\n선곡 화면으로 돌아갑니다.`,
                    '로딩 오류',
                    () => {
                        // 선곡 화면으로 복귀
                        this.app.sceneManager.changeScene('select');
                    }
                );
            }
            return;
        }

        // 마지막 노트 시간 계산
        this.lastNoteTime = 0;
        if (this.notes.chartData.length > 0) {
            const last = this.notes.chartData[this.notes.chartData.length - 1];
            this.lastNoteTime = last.tailTime || last.time;
        }

        // [최종] 로딩 100% 완료 표시
        updateProgress(0.01); // 100%
        
        // [중요] 로딩바를 0.3초간 표시 (사용자에게 완료 상태 보여주기)
        await new Promise(resolve => setTimeout(resolve, 300));

        // [최적화] 필수 리소스만 간단히 검증
        if (!this.audio.buffer || this.notes.chartData.length === 0) {
            throw new Error('필수 리소스 로딩 실패 (오디오 또는 차트)');
        }
        
        if (GlobalStore.constants.DEBUG.ENABLED) {
            console.log('[GameEngine] 리소스 검증 완료:', {
                audioBuffer: !!this.audio.buffer,
                chartNotes: this.notes.chartData.length,
                hasBGA: this.hasBGA
            });
        }

        // [수정] 게임 시작 = 준비 상태 (3초 후 재생)
        // 로딩 완료 후 3초 대기 시간을 준
        
        // 페이드 패널 초기화 (비디오 가림)
        const fadePanel = document.getElementById('game-fade-panel');
        if (fadePanel) {
            fadePanel.style.display = 'block';
            fadePanel.style.opacity = '1';
        }

        // [중요] 재생은 하지 않고 준비 상태로 대기
        // this.audio.play(0); // 제거!
        
        // [수정] BGA는 초기화만 하고 재생은 3초 후
        if (this.hasBGA) {
            this.bga.reset();
            // 재생은 update()의 startCountdown에서 처리
        }

        // [수정] InputSystem은 이미 위에서 activate 완료
        
        // [중요] 로딩 완료 - 로딩 화면 데이터 정리
        if (this.renderer) {
            this.renderer.loadingSongData = null;
            this.renderer.loadingProgress = 0;
        }
        
        // [중요] 준비 상태 플래그를 isRunning 전에 설정
        this.startCountdown = 3.0; // 대기 시간 (update에서 처리)
        this.isWaitingStart = true; // 준비 상태 플래그

        this.isRunning = true;
        
        // [중요] Live2D 즉시 표시 (3초 대기 중에도 보여야 함)
        if (this.character && this.character.canvas2d) {
            this.character.canvas2d.style.display = 'block';
        }
        
        // [제거] 게임 시작 음성 재생 - GameScene.enter()에서 재생
        // this.voice.playGameStart();

    }

    // 외부(GameScene)에서 호출하는 업데이트 루프
    update() {
        if (!this.isRunning) return;
        
        // [신규] 3초 대기 카운트다운 (준비 상태)
        if (this.isWaitingStart) {
            // [중요] 실제 경과 시간 계산 (프레임률 독립적)
            if (!this._countdownStartTime) {
                this._countdownStartTime = performance.now();
            }
            
            const elapsed = (performance.now() - this._countdownStartTime) / 1000; // 밀리초 → 초
            this.startCountdown = Math.max(0, 3.0 - elapsed);
            
            // [중요] 가상 음수 시간 계산 (노트 위치 정확한 렌더링)
            // startCountdown = 3.0 → currentTime = -3.0
            // startCountdown = 1.5 → currentTime = -1.5
            // startCountdown = 0.0 → currentTime = 0.0
            const virtualTime = -this.startCountdown;
            
            // [중요] 노트 렌더링 (음수 시간 기반)
            const speedMultiplier = GlobalStore.constants.GAMEPLAY.SPEED_MULTIPLIER;
            const settings = {
                speed: GlobalStore.settings.speed * speedMultiplier,
                hitPosition: this.layout.judgeLineY
            };
            const notesToDraw = this.notes.update(virtualTime, settings);
            const hudData = {
                ...PlayState,
                bpm: this.songData?.bpm || 120,
                currentTime: virtualTime,
                speed: GlobalStore.settings.speed * speedMultiplier,
                hpMax: PlayState.hpSettings.max
            };
            this.renderer.draw(notesToDraw, hudData, this.layout, this.keyState, this.hasBGA, this.syncDriftCorrection);
            
            // [중요] Live2D는 대기 중에도 표시 (IDLE 모션)
            if (this.character && this.character.isLive2DReady) {
                this.character.draw(this.ctx, this.layout.charFrame, virtualTime);
            }
            
            // [선택] 페이드 패널 처리 (사용자 요청 시 활성화)
            const fadePanel = document.getElementById('game-fade-panel');
            if (fadePanel && fadePanel.style.display !== 'none') {
                // 3초에서 시작하여 0초에 도달 (역방향)
                const progress = Math.max(0, this.startCountdown / 3.0);
                fadePanel.style.opacity = progress.toString();
                
                // 완전히 투명해지면 숨김
                if (this.startCountdown <= 0) {
                    fadePanel.style.display = 'none';
                }
            }
            
            // 3초 경과 시 재생 시작
            if (this.startCountdown <= 0) {
                this.isWaitingStart = false;
                this._countdownStartTime = null; // 초기화
                
                // 음악 재생
                this.audio.play(0);
                
                // BGA 재생
                if (this.hasBGA && this.bga) {
                    this.bga.play().catch(err => {
                        console.error('[GameEngine] BGA 재생 실패:', err);
                    });
                }
                
                // [중요] Live2D 표시
                if (this.character) {
                    if (!this.character.canvas2d) {
                        console.error('[GameEngine] ❌ character.canvas2d가 없습니다! Live2D 초기화 실패');
                    } else if (!this.character.isLive2DReady) {
                        console.warn('[GameEngine] ⚠️ Live2D 모델이 준비되지 않았습니다');
                    } else {
                        this.character.show();
                    }
                }
            }
            
            // [중요] 준비 상태에서는 나머지 게임 로직 실행 안 함
            return;
        }

        const currentTime = this.audio.getTime();
        if (this.hasBGA) {
            // [롤백] 매 프레임 동기화 (끼김 방지)
            // sync()가 필요시 자동 재생 처리
            this.bga.sync(currentTime);
        }

        // 종료 체크
        const gameEndDelay = GlobalStore.constants.GAMEPLAY.GAME_END_DELAY;
        if (this.lastNoteTime > 0 && currentTime > this.lastNoteTime + gameEndDelay) {
            this.finish();
            return;
        }

        // 롱노트 홀딩 상태 업데이트 (NoteManager 위임)
        const completedHolds = this.notes.updateHoldNotes(currentTime);
        completedHolds.forEach(({ column, result }) => {
            this.events.emit('noteJudged', { result, column });
            this.renderer.triggerEffect(column, result);
            // [수정] 롱노트 완료는 PERFECT 처리
            this.character.setState(result || 'PERFECT');
        });

        // [수정] 오토 미스 및 체력 체크 (currentTime >= 0일 때만)
        // 음악이 0초부터 시작하므로 0초부터 미스 체크
        if (currentTime >= 0) {
            const missedNotes = this.notes.checkMisses(currentTime);
            if (missedNotes.length > 0) {
                missedNotes.forEach(note => {
                    this.events.emit('noteJudged', { result: 'MISS', column: note.column });
                    this.renderer.triggerEffect(note.column, 'MISS');
                    this.character.setState('MISS');
                });

                // [체력 0 체크]
                this.events.emit('healthCheck');
            }
        }

        // 렌더링 업데이트
        // NoteManager에 Speed 전달 (GlobalStore 사용)
        // 속도 계수 증가
        const speedMultiplier = GlobalStore.constants.GAMEPLAY.SPEED_MULTIPLIER;
        const settings = {
            speed: GlobalStore.settings.speed * speedMultiplier,
            hitPosition: this.layout.judgeLineY // [수정] 판정선 위치 사용
        };
        const notesToDraw = this.notes.update(currentTime, settings);

        // [수정] HUD 데이터에 BPM, currentTime, speed, HP 설정 추가
        const hudData = {
            ...PlayState,
            bpm: this.songData?.bpm || 120,
            currentTime: currentTime,
            speed: GlobalStore.settings.speed,
            hpMax: PlayState.hpSettings.max
        };

        // 그리기 (PlayState 전달, 노트 위치 보정값 포함)
        this.renderer.draw(notesToDraw, hudData, this.layout, this.keyState, this.hasBGA, this.syncDriftCorrection);
        this.character.draw(this.ctx, this.layout.charFrame, currentTime);
    }

    async pause() {
        try {
            this.wasRunningBeforePause = this.isRunning; // [중요] 일시정지 전 상태 저장
            this.isRunning = false; // [핵심] 일시정지 중에는 isRunning = false

            await this.audio.pause();
            if (this.hasBGA && this.bga) {
                this.bga.pause();
            }
            this.events.emit('gamePaused');
        } catch (error) {
            console.error('[GameEngine] pause 실패:', error);
            throw error;
        }
    }

    // [버그 수정] GameScene에서 카운트다운을 하므로 여기서는 단순히 재개만
    async resume() {
        try {
            await this.audio.resume();

            // [중요] BGA 재생 전 상태 확인
            if (this.hasBGA && this.bga && this.bga.isVideo && this.bga.video) {
                // 비디오가 일시정지 상태인지 확인
                if (this.bga.video.paused) {
                    await this.bga.play().catch(err => {
                        console.error('[GameEngine] BGA resume 실패:', err);
                    });
                }
            }

            this.isRunning = this.wasRunningBeforePause; // [핵심] isRunning 복원
            this.wasRunningBeforePause = false; // 플래그 초기화
        } catch (error) {
            console.error('[GameEngine] resume 실패:', error);
            throw error;
        }
    }

    finish() {
        this.isRunning = false;
        this.audio.stop();
        if (this.hasBGA) {
            this.bga.cleanup();
        }

        // [메모리 최적화] 차트 데이터 정리
        this.chartLoader.cleanup();

        // [제거] InputSystem 비활성화는 stop()에서 처리
        // this.input.deactivate(); // 중복 호출 방지

        // [신규] BPM 자동 측정 완료 후 저장
        if (this.shouldDetectBPM && this.bpmDetectionData.peaks.length >= 8) {
            const detectedBPM = this._calculateBPM(this.bpmDetectionData.peaks);
            if (detectedBPM >= 60 && detectedBPM <= 200) {
                if (GlobalStore.constants.DEBUG.LOG_TIMING) {
                    console.log(`[BPM Auto-Detect] ${detectedBPM} BPM detected`);
                    console.log(`[Info] Please update meta.json: "bpm": ${detectedBPM}`);
                }
                this.songData.bpm = detectedBPM;
            }
        }

        // 게임 종료 이벤트 발행
        this.events.emit('gameFinished');
    }
    stop() {
        this.isRunning = false;
        this.audio.stop();
        
        // [중요] 준비 상태 플래그 초기화 (재사용 시 문제 방지)
        this.isWaitingStart = false;
        this.startCountdown = 0;
        this._countdownStartTime = null; // [중요] 타임스탬프 초기화

        // BGA도 멈춤
        if (this.hasBGA) {
            this.bga.cleanup();
        }

        // [메모리 최적화] NoteManager chartData 정리
        this.notes.cleanup();

        // [메모리 최적화] InputSystem 비활성화
        this.input.deactivate();

        // 콜백(onGameFinished)은 호출하지 않음!
    }

    /**
     * 키 입력 처리 (Press)
     * @param {number} key - 트랙 인덱스 (0~3)
     * @param {number} timestamp - 입력 타임스탬프 (performance.now())
     */
    handleInput(key, timestamp) {
        // 키 매핑은 InputSystem에서 처리해서 index(0~3)로 넘어옴
        const trackIndex = key;
        this.keyState[trackIndex] = true;

        if (!this.isRunning) {
            return;
        }

        // [핵심 수정] 3초 대기 중에는 판정 무시
        if (this.isWaitingStart) {
            return;
        }

        // [핵심 수정] 타임스탬프 최우선 판정
        // 실제 키를 누른 시점(timestamp)을 최우선으로 사용하여 정확한 판정 수행
        let currentTime;
        let timingSource = 'unknown';

        if (timestamp && timestamp > 0) {
            // 1순위: 타임스탬프 기반 오디오 시간 (가장 정확)
            currentTime = this.audio.getAudioTimeFromTimestamp(timestamp);
            timingSource = 'timestamp';

            // [주의] 극단적인 경우만 폴백 (3초 이상 차이 - 탭 전환/일시정지 등)
            const rawTime = this.audio.getTime();
            const timeDiff = Math.abs(currentTime - rawTime);

            if (timeDiff > 3.0) {
                console.warn('[GameEngine] ⚠️ 타임스탬프 이상 감지:', {
                    timestampTime: currentTime.toFixed(3),
                    audioTime: rawTime.toFixed(3),
                    diff: timeDiff.toFixed(3)
                });
                currentTime = rawTime;
                timingSource = 'fallback (timestamp anomaly)';
            }
        } else {
            // 2순위: 타임스탬프 없으면 현재 오디오 시간 사용
            currentTime = this.audio.getTime();
            timingSource = 'audio.getTime()';
        }

        // [신규] 판정 없이도 히트 사운드 재생
        this.sound.playHit();

        // [신규] BPM 자동 측정 - 입력 시간 기록
        if (this.shouldDetectBPM) {
            if (this.bpmDetectionData.startTime === 0) {
                this.bpmDetectionData.startTime = currentTime;
            }
            this.bpmDetectionData.peaks.push(currentTime);
        }

        // 롱노트 홀딩 중이면 중복 입력 무시
        if (this.notes.holdingNotes[trackIndex]) return;

        const targetNote = this.notes.getNearestNote(trackIndex);
        if (!targetNote) return;

        const judgeData = this.judge.evaluate(targetNote.time, currentTime);
        if (judgeData.result !== 'IGNORE') {
            // [디버그] 판정 타이밍 차이 측정
            if (GlobalStore.constants.DEBUG.LOG_JUDGMENT) {
                const timingDiff = (currentTime - targetNote.time) * 1000; // ms 단위
                console.log(`[Judgment] 🎯 ${judgeData.result} | Track ${trackIndex} | ${timingDiff >= 0 ? '+' : ''}${timingDiff.toFixed(1)}ms | Note: ${targetNote.time.toFixed(3)}s | Input: ${currentTime.toFixed(3)}s`);
            }

            if (judgeData.result === 'MISS') {
                targetNote.isMissed = true;
                this.events.emit('noteJudged', { result: 'MISS', column: trackIndex });
                this.renderer.triggerEffect(trackIndex, 'MISS');
                this.character.setState('MISS');
                // [제거] 판정 음성 (게임 중 너무 시끄러움)
                this.events.emit('healthCheck');
            } else {
                // [제거] 히트 사운드는 위에서 이미 재생
                // [수정] timing 정보 전달
                this.renderer.triggerEffect(trackIndex, judgeData.result, judgeData.timing);
                // [수정] 실제 판정 결과 전달 (PERFECT/GREAT/GOOD)
                this.character.setState(judgeData.result);
                // [제거] 판정 음성 (게임 중 너무 시끄러움)

                if (targetNote.type === 'hold') {
                    this.notes.startHold(trackIndex, targetNote);
                    this.events.emit('noteJudged', { result: judgeData.result, column: trackIndex });
                } else {
                    // [신규] 일반 노트는 즉시 삭제
                    targetNote.isHit = true;
                    targetNote.isMissed = true; // 렌더링에서 숨기기 위해
                    this.events.emit('noteJudged', { result: judgeData.result, column: trackIndex });
                }
            }
        }
    }

    handleInputUp(key) {
        const trackIndex = key;
        this.keyState[trackIndex] = false;

        if (!this.isRunning) return;
        
        // [핵심 수정] 3초 대기 중에는 판정 무시
        if (this.isWaitingStart) return;
        
        const currentTime = this.audio.getTime();
        const isMiss = this.notes.handleRelease(trackIndex, currentTime);
        if (isMiss) {
            this.events.emit('noteJudged', { result: 'MISS', column: trackIndex });
            this.renderer.triggerEffect(trackIndex, 'MISS');
            this.character.setState('MISS');
            this.events.emit('healthCheck');
        }
    }

    // [신규] BPM 계산 함수 (에디터와 동일한 알고리즘)
    _calculateBPM(peaks) {
        if (peaks.length < 8) return 0;

        // 피크 간격 계산
        let intervals = [];
        for (let i = 1; i < peaks.length; i++) {
            const interval = peaks[i] - peaks[i - 1];
            // 0.1초 미만 간격은 노이즈로 제외
            if (interval > 0.1) {
                intervals.push(interval);
            }
        }

        // 유효한 간격이 부족하면 0 반환
        if (intervals.length < 3) return 0;

        // 중앙값 사용 (평균보다 안정적)
        intervals.sort((a, b) => a - b);
        const medianInterval = intervals[Math.floor(intervals.length / 2)];

        // 비정상적인 값 체크
        if (medianInterval <= 0 || medianInterval > 10) return 0;

        // BPM = 60 / interval
        const bpm = Math.round(60 / medianInterval);

        return bpm;
    }

    // [수정] 게임 시작 3초 카운트다운 + 페이드인 효과
    // 게임 화면(노트 레일, UI)이 보이는 상태에서 오버레이만 페이드아웃
    async _startCountdown() {
        // 1. 검은색 오버레이 생성 (비디오 위에 가림)
        const overlay = document.createElement('div');
        overlay.id = 'game-start-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.8);
            z-index: 8999;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: opacity 1.0s ease-out;
            opacity: 1;
            pointer-events: none;
        `;
        
        const countdownText = document.createElement('div');
        countdownText.style.cssText = `
            font-size: 120px;
            font-weight: bold;
            color: #00ffff;
            text-shadow: 0 0 20px #00ffff, 0 0 40px #00ffff;
            font-family: 'Arial Black', sans-serif;
        `;
        overlay.appendChild(countdownText);
        document.body.appendChild(overlay);
        
        // 2. 카운트다운 (3, 2, 1) - 게임 루프는 실행 중, 노트 3초 후 내려옴
        for (let i = 3; i > 0; i--) {
            countdownText.textContent = i;
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        // 3. GO! 표시 없이 바로 페이드 아웃
        overlay.style.opacity = '0';
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // 4. 오버레이 제거
        document.body.removeChild(overlay);
    }

    // [신규] 콤보 버스터 이벤트 핸들러
    _onComboBurst(event) {
        const { combo } = event.detail;

        // 캠릭터 반응
        this.character.setState('COMBO_BURST');

        // 음성 재생
        this.voice.playCombo(combo);

        // 화면 효과 (렌더러에 전달)
        if (this.renderer) {
            this.renderer.triggerComboBurst(combo);
        }
    }

    /**
     * 메모리 정리 (GameScene.exit()에서 호출)
     * 
     * [정리 대상]
     * 1. 콤보 버스트 이벤트 리스너
     * 2. 입력 차단 체크 인터벌
     * 3. InputSystem 이벤트 리스너 (제거하지 않음 - 재사용)
     * 
     * [주의]
     * - InputSystem은 한 번만 생성되고 계속 재사용
     * - cleanup()을 호출하면 이벤트 리스너가 제거되어 재등록 필요
     * - 대신 deactivate()로 비활성화만 수행
     */
    cleanup() {
        // [수정] comboBurst 리스너는 제거하지 않음 (한 번만 등록, 계속 사용)
        // constructor에서 등록한 리스너는 GameEngine 생명주기 동안 유지
        
        // 입력 차단 체크 인터벌 제거
        if (this._inputBlockCheckInterval) {
            clearInterval(this._inputBlockCheckInterval);
            this._inputBlockCheckInterval = null;
        }

        // GameStateManager 이벤트 구독 정리
        if (this.stateManager) {
            this.stateManager.cleanup();
        }

        // [중요 수정] InputSystem은 cleanup 하지 않음
        // constructor에서 한 번만 이벤트를 등록하고 계속 재사용
        // deactivate()는 GameEngine.stop()에서 이미 호출됨

        console.log('[GameEngine] Cleanup complete (InputSystem retained)');
    }
}