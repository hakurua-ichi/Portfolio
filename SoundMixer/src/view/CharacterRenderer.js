/**
 * CharacterRenderer - Live2D 유니티짱 렌더링 (PixiJS 방식)
 * * 플라티나 랩 스타일 다이나믹 전환 & 위치 보정 적용
 * * 립싱크: VoiceManager의 음성 파형 분석으로 입 움직임 제어
 */
import { GlobalStore } from '../data/GlobalStore.js';

export class CharacterRenderer {
    constructor() {
        // === 상태 관리 ===
        this.currentState = 'IDLE';
        this.targetState = 'IDLE';
        this.stateStartTime = 0;
        this.motionEndTime = 0; // [신규] 현재 모션 종료 예정 시간

        // === 플라티나 랩 스타일 전환 시스템 ===
        this.pendingTransition = null;

        // === 가시성 및 일시정지 제어 ===
        this.isFrozen = false; // [신규] 모션 일시정지 상태

        // === [신규] 립싱크 제어 ===
        this.mouthOpenValue = 0; // 0~1 (0: 닫힘, 1: 완전 열림)
        this.mouthSmoothingFactor = 0.3; // 부드러운 전환

        // === PixiJS + Live2D ===
        this.pixiApp = null;
        this.live2dModel = null;
        this.isLive2DReady = false;
        this.modelPath = 'assets/Live2D/Unity_chan/unitychan.model3.json';

        // === 모션 매핑 (그룹 기반 - SDK 요구사항) ===
        // Live2D SDK는 그룹 이름과 그룹 내 인덱스를 사용
        this.motionMap = {
            'IDLE': [
                { group: 'Idle', index: 0 },      // idle_02 (유일한 IDLE 모션)
            ],
            'PERFECT': [
                { group: 'FlickUp', index: 1 }   // m_06
            ],
            'GREAT': [
                { group: 'FlickUp', index: 0 },   // m_04
            ],
            'GOOD': [
                { group: 'Tap', index: 1 },       // m_12
                { group: 'FlickDown', index: 0 } // m_01
            ],
            'MISS': [
                { group: 'FlickLeft', index: 0 }, // m_02
                { group: 'Tap', index: 0 },       // m_10
                { group: 'FlickDown', index: 1 }, // m_08
            ],
            'COMBO_BURST': [
                { group: 'FlickUp', index: 2 },    // m_13
                { group: 'Flick3', index: 0 },    // m_07
                { group: 'Flick3', index: 1 },     // m_11
                { group: 'Tap', index: 2 }        // m_14
            ],

            // [신규] Result Scene 등급별 모션 (판정 매핑 기준으로 재배치)
            'RESULT_S_PLUS': [
                { group: 'FlickUp', index: 1 },    // m_06 (PERFECT 모션 - 최고 환호)
                { group: 'FlickUp', index: 2 },    // m_13 (점프 - 완벽한 기쁨)
                { group: 'Flick3', index: 0 }      // m_07 (화려한 콤보 연출)
            ],
            'RESULT_S': [
                { group: 'FlickUp', index: 0 },    // m_04 (GREAT 모션 - 승리 포즈)
                { group: 'FlickUp', index: 1 },    // m_06 (환호)
                { group: 'Tap', index: 2 }         // m_14 (박수/칭찬)
            ],
            'RESULT_A': [
                { group: 'FlickUp', index: 0 },    // m_04 (승리 포즈)
                { group: 'Flick3', index: 1 },     // m_11 (화려한 동작)
                { group: 'Tap', index: 2 }         // m_14 (박수)
            ],
            'RESULT_B': [
                { group: 'Tap', index: 1 },        // m_12 (GOOD 모션 - 리듬 타기)
                { group: 'Tap', index: 2 }         // m_14 (박수)
            ],
            'RESULT_C': [
                { group: 'Tap', index: 1 },        // m_12 (리듬 타기)
                { group: 'FlickDown', index: 0 }   // m_01 (GOOD 모션 - 애매함)
            ],
            'RESULT_F': [
                { group: 'FlickLeft', index: 0 },  // m_02 (MISS 모션 - 망설임)
                { group: 'Tap', index: 0 }         // m_10 (MISS 모션 - 끄덕임)
            ],
            'RESULT_FAILED': [
                { group: 'FlickDown', index: 1 },  // m_08 (MISS 모션 - 고개 숙임)
                { group: 'FlickLeft', index: 0 }   // m_02 (망설임/실망)
            ]
        };

        // === 모션 우선순위 (높을수록 우선) ===
        this.statePriority = {
            'IDLE': 0,
            'GOOD': 1,
            'GREAT': 1,
            'PERFECT': 1,
            'COMBO_BURST': 2,
            'MISS': 3,
            // Result 모션들은 강제 재생
            'RESULT_S_PLUS': 999,
            'RESULT_S': 999,
            'RESULT_A': 999,
            'RESULT_B': 999,
            'RESULT_C': 999,
            'RESULT_F': 999,
            'RESULT_FAILED': 999
        };

        // === 모션 지속 시간 (ms, 실제 모션 파일 길이 기반 추정) ===
        this.motionDurations = {
            'IDLE': 3000,           // 대기 모션 (반복)
            'PERFECT': 1800,        // 승리 포즈
            'GREAT': 1500,          // 긍정 반응
            'GOOD': 1200,           // 망설임
            'MISS': 2000,           // 좌절
            'COMBO_BURST': 2200,    // 콤보 폭발
            // Result 모션은 길게
            'RESULT_S_PLUS': 3000,
            'RESULT_S': 2800,
            'RESULT_A': 2500,
            'RESULT_B': 2000,
            'RESULT_C': 2000,
            'RESULT_F': 2500,
            'RESULT_FAILED': 3000
        };

        // === 기타 ===
        this.bpm = 120;
        this.assets = null;
        this.comboBurstValue = 0;

        // 초기화 시작
        this._initLive2D();
    }

    // ============================================
    // Live2D 초기화 (PixiJS 방식)
    // ============================================
    async _initLive2D() {
        try {
            // PixiJS Live2D 전역 설정
            window.PIXI = PIXI;

            // Canvas 찾기 (없으면 생성)
            this.canvas2d = document.getElementById('characterCanvas');
            if (!this.canvas2d) {
                this.canvas2d = document.createElement('canvas');
                this.canvas2d.id = 'characterCanvas';

                // [핵심] z-index 설정 - 메인 게임 canvas 위에 표시
                this.canvas2d.style.position = 'absolute';
                this.canvas2d.style.top = '0';
                this.canvas2d.style.left = '0';
                this.canvas2d.style.zIndex = '100'; // 게임 canvas보다 위
                this.canvas2d.style.pointerEvents = 'none'; // 클릭 이벤트 통과

                document.body.appendChild(this.canvas2d);
            }

            // 초기에는 숨김 (게임 시작 전)
            this.canvas2d.style.display = 'none';

            // 게임 화면 크기 가져오기
            const gameCanvas = document.getElementById('game-canvas');
            const width = window.innerWidth;
            const height = window.innerHeight;

            // PixiJS 앱 생성
            this.pixiApp = new PIXI.Application({
                view: this.canvas2d,
                width: width,
                height: height,
                backgroundAlpha: 0, // 투명 배경
                antialias: true,
                resolution: window.devicePixelRatio || 1,
                autoDensity: true,
                autoStart: true // 자동 렌더링 시작
            });

            // Live2D 모델 로드
            this.live2dModel = await PIXI.live2d.Live2DModel.from(this.modelPath);

            // [핵심] 자동 상호작용 및 기본 아이들 모션 재생 방지
            // m_09 등 의도치 않은 모션이 자동 재생되는 것을 막기 위함
            this.live2dModel.autoInteract = false;

            // [검증] 모션 개수 확인
            const motionManager = this.live2dModel.internalModel?.motionManager;
            if (motionManager && motionManager.motionGroups) {
                const groups = Object.keys(motionManager.motionGroups);
                // console.log('[CharacterRenderer] 사용 가능한 모션 그룹:', groups);

                groups.forEach(group => {
                    const motions = motionManager.motionGroups[group];
                    const count = Array.isArray(motions) ? motions.length : 0;
                    // console.log(`[CharacterRenderer]   - ${group}: ${count}개 모션`);
                });
            } else {
                console.warn('[CharacterRenderer] ⚠️ MotionManager를 찾을 수 없습니다!');
            }

            // 초기 위치 설정 (나중에 _syncPositionWithFrame에서 덮어씌워짐)
            this.live2dModel.anchor.set(0.5, 0.5); // 중심점 설정
            this.live2dModel.scale.set(0.2);
            this.live2dModel.x = width / 2;
            this.live2dModel.y = height / 2;

            // 무대에 추가
            this.pixiApp.stage.addChild(this.live2dModel);

            this.isLive2DReady = true;

            // IDLE 모션 시작
            this._playRandomMotion('IDLE');

        } catch (error) {
            console.error('[CharacterRenderer] Live2D 초기화 실패:', error);
            this.isLive2DReady = false;
        }
    }

    // ============================================
    // 그리기 (GameEngine 루프에서 호출)
    // ============================================
    draw(ctx, frame, deltaTime, offset = 0) {
        // frame: 캐릭터가 그려질 영역 {x, y, w, h}

        if (!this.isLive2DReady || !this.live2dModel || !frame) {
            return;
        }

        // 캔버스가 숨겨진 상태면 그리지 않음 (Scene에서 show()/hide()로 제어)
        if (this.canvas2d && this.canvas2d.style.display === 'none') {
            return;
        }

        // [신규] 립싱크 파라미터 업데이트 (매 프레임)
        this._updateLipSync();

        // 1. PixiJS 렌더링 (이미 autoStart: true면 생략 가능하지만, 싱크를 위해 명시적 호출도 좋음)
        // this.pixiApp.render(); 

        // 2. 클리핑 (하단 패널 침범 방지)
        ctx.save();
        ctx.beginPath();
        // 높이에서 100px 정도 뺌 (하단 패널 영역 제외)
        // frame.h 전체가 아니라, 패널 위쪽까지만 클리핑 영역으로 설정
        ctx.rect(frame.x, frame.y, frame.w, frame.h - 100);
        ctx.clip();

        // 3. 모델 위치 및 크기 동기화
        this._syncPositionWithFrame(frame, offset);

        // 4. Pixi 캔버스를 메인 캔버스에 합성
        // Pixi 뷰 전체를 (0,0)에 그리면 투명 배경 덕분에 캐릭터만 합성됨
        ctx.drawImage(this.pixiApp.view, 0, 0);

        // [DEBUG] 프레임 및 중심점 시각화
        if (false) { // 디버깅용 강제 활성화 (사용자 요청으로 비활성화)
            ctx.strokeStyle = 'red';
            ctx.lineWidth = 2;
            ctx.strokeRect(frame.x, frame.y, frame.w, frame.h);

            ctx.beginPath();
            ctx.moveTo(frame.x + frame.w / 2, frame.y);
            ctx.lineTo(frame.x + frame.w / 2, frame.y + frame.h);
            ctx.strokeStyle = 'cyan';
            ctx.stroke();

            if (this.live2dModel) {
                ctx.fillStyle = 'yellow';
                ctx.fillRect(this.live2dModel.x - 5, this.live2dModel.y - 5, 10, 10);
            }
        }

        ctx.restore();
    }

    // [핵심] 프레임에 맞춰 모델 위치/크기 조정
    _syncPositionWithFrame(frame, offset = 0) {
        if (!this.live2dModel) return;

        // 프레임의 가로 중앙 (동적 계산)
        const centerX = frame.x + (frame.w / 2);

        // [위치 보정]
        // offset 매개변수를 통해 외부에서 보정값 전달 가능
        // 기본값은 0 (순수 중앙 정렬)

        // 바닥 좌표 = 프레임 바닥 - 하단 패널 높이(약 180px)
        const bottomOffset = 180;
        const targetY = frame.y + frame.h - bottomOffset;

        // 위치 적용 (동적 중앙 + 오프셋)
        this.live2dModel.x = centerX + offset;
        this.live2dModel.y = targetY;

        // [크기 보정]
        // 가용 높이 = 전체 높이 - 상단 여백 - 하단 패널
        const availableHeight = frame.h - bottomOffset - 50;

        // 모델의 기본 높이(대략 2000~2500px 가정)에 대한 비율 계산
        // [수정] 크기를 키우기 위해 나누는 값을 줄임 (2200 → 1500)
        const baseScale = availableHeight / 1500;

        // 너무 작아지지 않게 최소값 보장 (0.15 → 0.2로 상향)
        const finalScale = Math.max(0.2, baseScale);

        this.live2dModel.scale.set(finalScale);
    }

    // [신규] 리사이즈 처리
    resize(w, h) {
        // PixiJS 렌더러 크기 업데이트
        if (this.pixiApp && this.pixiApp.renderer) {
            this.pixiApp.renderer.resize(w, h);
        }

        // Live2D 모델 위치는 Scene에서 _syncPositionWithFrame을 호출하여 업데이트함
        // 여기서는 렌더러 크기만 맞춤
    }

    // ============================================
    // 립싱크 (Lip Sync)
    // ============================================
    
    /**
     * [신규] VoiceManager가 호출할 립싱크 콜백
     * @param {number} mouthOpen - 입 열림 정도 (0~1)
     */
    setMouthOpen(mouthOpen) {
        this.mouthOpenValue = mouthOpen;
    }

    /**
     * [신규] 립싱크 파라미터 업데이트 (매 프레임 호출)
     */
    _updateLipSync() {
        if (!this.isLive2DReady || !this.live2dModel) return;

        try {
            const coreModel = this.live2dModel.internalModel.coreModel;
            
            // Live2D 파라미터 인덱스 찾기
            const paramIndex = coreModel._model.parameters.ids.indexOf('ParamMouthOpenY');
            
            if (paramIndex !== -1) {
                // 현재 값 가져오기
                const currentValue = coreModel._model.parameters.values[paramIndex];
                
                // 부드러운 전환 (Lerp)
                const targetValue = this.mouthOpenValue;
                const smoothValue = currentValue + (targetValue - currentValue) * this.mouthSmoothingFactor;
                
                // 값 설정 (Live2D는 보통 0~1 범위)
                coreModel._model.parameters.values[paramIndex] = smoothValue;
            }
        } catch (error) {
            // 파라미터가 없거나 에러 발생 시 무시 (일부 모델은 ParamMouthOpenY 없을 수 있음)
            // console.warn('[CharacterRenderer] 립싱크 업데이트 실패:', error);
        }
    }

    // ============================================
    // 모션 재생
    // ============================================
    _playRandomMotion(state) {
        if (!this.isLive2DReady || !this.live2dModel) {
            // console.error(`[CharacterRenderer] ❌ 모션 재생 불가: isReady=${this.isLive2DReady}, hasModel=${!!this.live2dModel}`);
            return;
        }

        const motionOptions = this.motionMap[state] || this.motionMap['IDLE'];
        if (!motionOptions || motionOptions.length === 0) {
            // console.error(`[CharacterRenderer] ❌ 상태 "${state}"에 대한 모션이 없습니다!`);
            return;
        }

        // 랜덤 모션 선택
        const randomMotion = motionOptions[Math.floor(Math.random() * motionOptions.length)];
        const { group, index } = randomMotion;

        // console.log(`[Character] 🎬 ${state} -> ${group}[${index}]`);

        try {
            // [검증] 모션 매니저 존재 확인
            const motionManager = this.live2dModel.internalModel?.motionManager;
            if (!motionManager) {
                // console.error('[CharacterRenderer] ❌ MotionManager가 없습니다!');
                return;
            }

            // [핵심] 그룹 기반 모션 재생
            const result = this.live2dModel.motion(group, index);

            // [신규] 모션 종료 시간 설정
            const duration = this.motionDurations[state] || 2000;
            this.motionEndTime = performance.now() + duration;
        } catch (error) {
            console.error(`[CharacterRenderer] ❌ 모션 재생 실패 (${state}, ${group}[${index}]):`, error);
        }
    }

    // ============================================
    // 상태 변경 로직 (우선순위 기반)
    // ============================================
    setState(newState) {
        const now = performance.now();
        const currentPriority = this.statePriority[this.currentState] || 0;
        const newPriority = this.statePriority[newState] || 0;

        // [우선순위 1] MISS는 항상 즉시 전환 (최고 우선순위)
        if (newState === 'MISS') {
            // console.log('[CharacterRenderer] 💀 MISS 즉시 전환 (최고 우선순위)');
            this._playRandomMotion('MISS');
            this.currentState = 'MISS';
            this.pendingTransition = null; // 대기 중인 전환 취소
            return;
        }

        // [우선순위 2] COMBO_BURST는 MISS 다음으로 우선
        if (newState === 'COMBO_BURST') {
            // console.log('[CharacterRenderer] COMBO_BURST 즉시 전환');
            this._playRandomMotion('COMBO_BURST');
            this.currentState = 'COMBO_BURST';
            this.pendingTransition = null;
            return;
        }

        // [우선순위 3] Result 모션은 강제 재생 (게임 종료)
        if (newState.startsWith('RESULT_')) {
            // console.log('[CharacterRenderer] Result 모션 강제 재생');
            this._playRandomMotion(newState);
            this.currentState = newState;
            this.pendingTransition = null;

            // [핵심] motionEndTime을 무한대로 설정하지 않음 (자연스럽게 IDLE 복귀)
            // this.motionEndTime = Infinity; 
            return;
        }

        // [우선순위 4] IDLE 상태에서는 모든 전환 즉시 허용
        if (this.currentState === 'IDLE') {
            // console.log('[CharacterRenderer] IDLE에서 즉시 전환');
            this._playRandomMotion(newState);
            this.currentState = newState;
            return;
        }

        // [우선순위 5] 현재 모션이 끝났으면 즉시 전환
        if (now >= this.motionEndTime) {
            // console.log('[CharacterRenderer] 현재 모션 종료됨, 즉시 전환');
            this._playRandomMotion(newState);
            this.currentState = newState;
            return;
        }

        // [우선순위 6] 현재 모션 진행 중 + 우선순위 낮음 → 대기
        if (newPriority <= currentPriority) {
            // console.log(`[CharacterRenderer] 우선순위 낮음 (${newPriority} <= ${currentPriority}), 현재 모션 유지`);
            return;
        }

        // [우선순위 7] 우선순위 높지만 모션 진행 중 → 예약
        // console.log(`[CharacterRenderer] 우선순위 높음, 모션 종료 후 전환 예약 (${Math.max(0, this.motionEndTime - now)}ms 후)`);
        this.pendingTransition = {
            targetState: newState,
            executeTime: this.motionEndTime
        };
    }

    update(deltaTime) {
        if (!this.isLive2DReady || this.isFrozen) return; // [수정] freeze 상태에서는 업데이트 중단
        const now = performance.now();

        // [1] 예약된 전환 실행
        if (this.pendingTransition && now >= this.pendingTransition.executeTime) {
            this._playRandomMotion(this.pendingTransition.targetState);
            this.currentState = this.pendingTransition.targetState;
            this.pendingTransition = null;
            return;
        }

        // [2] 현재 모션 종료 시 처리
        if (now >= this.motionEndTime && !this.pendingTransition) {
            // 모든 모션은 IDLE로 복귀 (자연스러운 대기 자세)
            if (this.currentState !== 'IDLE') {
                this._playRandomMotion('IDLE');
                this.currentState = 'IDLE';
            }
        }
    }

    updateCombo(combo) {
        // 100콤보부터 50콤보마다 COMBO_BURST 발동
        if (combo >= 100 && combo % 50 === 0) {
            if (GlobalStore.constants && GlobalStore.constants.DEBUG && GlobalStore.constants.DEBUG.LOG_COMBO_BURST) {
                console.log(`[CharacterRenderer] 콤보 버스트 발동! (${combo}콤보)`);
            }
            this.setState('COMBO_BURST');
        }
    }

    // [신규] Result Scene에서 호출 (등급에 따른 모션)
    setResultMotion(rank) {
        const stateMap = {
            'S+': 'RESULT_S_PLUS',
            'S': 'RESULT_S',
            'A': 'RESULT_A',
            'B': 'RESULT_B',
            'C': 'RESULT_C',
            'F': 'RESULT_F',
            'FAILED': 'RESULT_FAILED'
        };

        const resultState = stateMap[rank] || 'RESULT_F';
        if (GlobalStore.constants && GlobalStore.constants.DEBUG && GlobalStore.constants.DEBUG.LOG_CHARACTER) {
            console.log(`[Character] Result: ${rank} -> ${resultState}`);
        }
        this.setState(resultState);
    }

    setAssets(assets) { this.assets = assets; }
    setBPM(bpm) { this.bpm = bpm; }

    // ============================================
    // 가시성 제어 API
    // ============================================

    /**
     * 캠버스 표시
     */
    show() {
        if (this.canvas2d) {
            this.canvas2d.style.display = 'block';
            console.log('[CharacterRenderer] ✅ 캔버스 표시 (display:', this.canvas2d.style.display, ')');
        } else {
            console.warn('[CharacterRenderer] ⚠️ canvas2d가 없습니다!');
        }
    }

    /**
     * 캠버스 숨김
     */
    hide() {
        if (this.canvas2d) {
            this.canvas2d.style.display = 'none';
            if (GlobalStore.constants && GlobalStore.constants.DEBUG && GlobalStore.constants.DEBUG.LOG_CHARACTER) {
                console.log('[CharacterRenderer] 캠버스 숨김');
            }
        }
    }

    freeze() {
        this.isFrozen = true;
        console.log('[CharacterRenderer] 모션 freeze');

        if (this.live2dModel?.internalModel?.motionManager) {
            try {
                this.live2dModel.internalModel.motionManager.stopAllMotions();
            } catch (error) {
                console.warn('[CharacterRenderer] freeze 오류:', error);
            }
        }

        if (this.pixiApp?.ticker) {
            this.pixiApp.ticker.stop();
        }
    }

    unfreeze() {
        this.isFrozen = false;
        console.log('[CharacterRenderer] unfreeze');

        if (this.pixiApp?.ticker) {
            this.pixiApp.ticker.start();
        }

        this._playRandomMotion('IDLE');
        this.currentState = 'IDLE';
    }

    destroy() {
        if (this.pixiApp) {
            this.pixiApp.destroy(true, { children: true, texture: true, baseTexture: true });
        }
    }
}
