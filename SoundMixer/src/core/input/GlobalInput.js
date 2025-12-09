/*
    GlobalInput - 전역 입력 관리 시스템
    
    [책임]
    - 씬 레벨 입력 처리 (ESC, Enter, 화살표 등)
    - 모달/옵션 패널 입력 처리
    - UI 버튼 이벤트 바인딩
    - 특수 모드 입력 (키 설정, 캘리브레이션)
    
    [InputSystem과의 관계]
    - GlobalInput: 게임 외부 입력 (UI, 씬 전환)
    - InputSystem: 게임 내부 입력 (노트 판정용 키)
    - 두 시스템 모두 document.keydown을 사용하지만 shouldBlockInput으로 충돌 방지
    
    [이벤트 우선순위]
    1. 이름 편집 중 → 모든 입력 차단
    2. 옵션 패널 열림 → OptionManager.handleInput()
    3. 모달 활성화 → 특수 키(handleSpecialKey) 또는 모달 네비게이션
    4. 씬 입력 → scene.onKeyDown()
*/
import { DOM } from '../../data/DOMRegistry.js';
import { GlobalStore } from '../../data/GlobalStore.js';

export class GlobalInput {
    constructor(app) {
        this.app = app;
        this.isBinding = false;
        this.lastModalCloseTime = 0; // [신규] 모달이 닫힌 시간 추적
        this.lastEscapeTime = 0; // [신규] ESC 키가 눌린 시간 추적
    }

    init() {
        if (this.isBinding) return;
        this.isBinding = true;
        document.addEventListener('keydown', (e) => this._handleKeyDown(e));
        this._bindButtonEvents();
    }

    _handleKeyDown(e) {
        const ui = this.app.ui;
        const sm = this.app.sceneManager;
        const options = sm.options;

        if (sm.isEditingName) return;

        // 1. 옵션 사이드바 조작
        if (options.isOpen) {
            // [신규] O 또는 Space: 옵션 토글 (닫기)
            if (e.key.toLowerCase() === 'o' || e.key === ' ') {
                e.preventDefault();
                options.close();
                // SelectScene이면 UI 업데이트
                if (sm.currentSceneName === 'select' && sm.currentScene) {
                    sm.currentScene._updateOptionUI();
                }
                return;
            }
            
            // [신규] Q/E는 속도 조절로 바로 처리
            if (e.key.toLowerCase() === 'q') {
                e.preventDefault();
                options.changeValue('speed', -0.1);
                return;
            }
            if (e.key.toLowerCase() === 'e') {
                e.preventDefault();
                options.changeValue('speed', 0.1);
                return;
            }
            
            e.preventDefault(); // 기본 동작 방지
            options.handleInput(e.key);
            return;
        }

        // 2. 모달 조작 (모든 모달 공통)
        if (ui.isModalActive()) {
            e.preventDefault(); // 기본 동작 방지
            
            // 2-0. 카운트다운 중에는 모든 입력 차단
            if (ui.activeModalType === 'countdown') {
                return;
            }
            
            // 2-1. 특수 키 처리 우선 (키 설정 대기, 캘리브레이션)
            if (options.handleSpecialKey && options.handleSpecialKey(e.key.toLowerCase())) {
                return;
            }
            
            // 2-2. 일반 모달 네비게이션
            if (e.key === 'Enter' || e.key === ' ') {
                // [버그 수정] 일시정지 모달에서 카운트다운 중이면 Enter/Space 무시
                if (ui.activeModalType === 'pause') {
                    const gameScene = sm.scenes.game;
                    if (gameScene && gameScene.isCountingDown) {
                        return; // 카운트다운 중에는 Enter 키 무시
                    }
                }
                ui.triggerModalAction();
            } 
            else if (e.key.startsWith('Arrow')) {
                ui.navigateModal(e.key);
            }
            else if (e.key === 'Escape') {
                sm.handleModalEscape();
                this.lastModalCloseTime = Date.now();
                this.lastEscapeTime = Date.now(); // ESC 시간 기록
            }
            return;
        }

        // 2-3. [신규] 모달이 방금 닫혔다면 짧은 딩레이 추가
        const timeSinceClose = Date.now() - this.lastModalCloseTime;
        const modalCloseDelay = GlobalStore.constants.TIMING.MODAL_CLOSE_DELAY_MS;
        if (timeSinceClose < modalCloseDelay) {
            return;
        }
        
        // 2-4. [신규] ESC 키가 연속으로 눌렸다면 무시 (모달 닫기 후 SelectScene의 ESC 처리 방지)
        if (e.key === 'Escape') {
            const timeSinceEsc = Date.now() - this.lastEscapeTime;
            if (timeSinceEsc < 300) { // 300ms 내 ESC는 무시
                return;
            }
            this.lastEscapeTime = Date.now();
        }

        // 3. 씬별 입력 처리
        if (sm.currentSceneName === 'select') {
            this._handleSelectSceneInput(e);
        }
        else if (sm.currentScene && sm.currentScene.onKeyDown) {
            // 다른 씬은 기존 방식 유지 (TitleScene, GameScene 등)
            sm.currentScene.onKeyDown(e);
        }
    }
    
    // [신규] SelectScene 전용 입력 처리 (중앙집중화)
    _handleSelectSceneInput(e) {
        const sm = this.app.sceneManager;
        const scene = sm.currentScene;
        if (!scene) return;
        
        // Arrow Up/Down: 곡 선택
        if (e.key === 'ArrowUp') {
            scene._moveSelection(-1);
        }
        else if (e.key === 'ArrowDown') {
            scene._moveSelection(1);
        }
        // Arrow Left/Right: 난이도 변경
        else if (e.key === 'ArrowLeft') {
            scene._changeDifficulty(-1);
        }
        else if (e.key === 'ArrowRight') {
            scene._changeDifficulty(1);
        }
        // O 또는 Space: 옵션 열기
        else if (e.key.toLowerCase() === 'o' || e.key === ' ') {
            sm.options.open();
            scene._updateOptionUI();
        }
        // Q/E: 속도 조절 (옵션 닫혀있을 때)
        else if (e.key.toLowerCase() === 'q') {
            sm.options.changeValue('speed', -0.1);
            sm.options.save(); // [수정] 즉시 저장
            scene._updateOptionUI();
        }
        else if (e.key.toLowerCase() === 'e') {
            sm.options.changeValue('speed', 0.1);
            sm.options.save(); // [수정] 즉시 저장
            scene._updateOptionUI();
        }
        // Enter: 게임 시작
        else if (e.key === 'Enter') {
            scene._startGame();
        }
        // Escape: 종료 확인
        else if (e.key === 'Escape') {
            this.app.ui.openModal('exit');
        }
    }

    _bindButtonEvents() {
        const sm = this.app.sceneManager;
        const ui = this.app.ui;
        const opt = sm.options;

        // --- 옵션 버튼 ---
        if(DOM.btnCloseSide) DOM.btnCloseSide.addEventListener('click', () => opt.close());
        if(DOM.btnSpeedDown) DOM.btnSpeedDown.addEventListener('click', () => opt.changeValue('speed', -0.1));
        if(DOM.btnSpeedUp) DOM.btnSpeedUp.addEventListener('click', () => opt.changeValue('speed', 0.1));
        if(DOM.btnDimDown) DOM.btnDimDown.addEventListener('click', () => opt.changeValue('dim', -10));
        if(DOM.btnDimUp) DOM.btnDimUp.addEventListener('click', () => opt.changeValue('dim', 10));
        
        // [개선] OFFSET 버튼 홀드 기능
        this._setupHoldButton(DOM.btnOffsetDown, () => opt.changeValue('offset', -0.01), 100);
        this._setupHoldButton(DOM.btnOffsetUp, () => opt.changeValue('offset', 0.01), 100);
        
        if(DOM.btnMusicDown) DOM.btnMusicDown.addEventListener('click', () => opt.changeValue('volMusic', -0.1));
        if(DOM.btnMusicUp) DOM.btnMusicUp.addEventListener('click', () => opt.changeValue('volMusic', 0.1));
        if(DOM.btnSfxDown) DOM.btnSfxDown.addEventListener('click', () => opt.changeValue('volSfx', -0.1));
        if(DOM.btnSfxUp) DOM.btnSfxUp.addEventListener('click', () => opt.changeValue('volSfx', 0.1));
        if(DOM.btnVoiceDown) DOM.btnVoiceDown.addEventListener('click', () => opt.changeValue('volVoice', -0.1));
        if(DOM.btnVoiceUp) DOM.btnVoiceUp.addEventListener('click', () => opt.changeValue('volVoice', 0.1));
        if(DOM.btnDiffPrev) DOM.btnDiffPrev.addEventListener('click', () => sm._cycleDifficulty(-1));
        if(DOM.btnDiffNext) DOM.btnDiffNext.addEventListener('click', () => sm._cycleDifficulty(1));
        if(DOM.btnSkinPrev) DOM.btnSkinPrev.addEventListener('click', () => opt.changeSkin(-1));
        if(DOM.btnSkinNext) DOM.btnSkinNext.addEventListener('click', () => opt.changeSkin(1));
        if(DOM.btnCalibStart) DOM.btnCalibStart.addEventListener('click', () => opt.startCalibration());
        if(DOM.btnKeyConfig) DOM.btnKeyConfig.addEventListener('click', () => opt.openKeyConfig());

        // --- 모달 버튼 ---
        if(DOM.btnExitYes) DOM.btnExitYes.addEventListener('click', () => { ui.closeModal(); sm.changeScene('title'); });
        if(DOM.btnExitNo) DOM.btnExitNo.addEventListener('click', () => { ui.closeModal(); });
        if(DOM.btnResume) DOM.btnResume.addEventListener('click', () => sm.handleResume());
        if(DOM.btnQuit) DOM.btnQuit.addEventListener('click', () => sm.handleQuitGame());
        if(DOM.btnCalibApply) DOM.btnCalibApply.addEventListener('click', () => opt.applyCalibration());
        if(DOM.btnCalibCancel) DOM.btnCalibCancel.addEventListener('click', () => opt.stopCalibration());
        if(DOM.btnKeySave) DOM.btnKeySave.addEventListener('click', () => opt.saveKeyConfig());
        if(DOM.btnKeyCancel) DOM.btnKeyCancel.addEventListener('click', () => opt.closeKeyConfig());
        if(DOM.keyButtons) {
            DOM.keyButtons.forEach((btn, idx) => {
                if(btn) btn.addEventListener('click', () => opt.startKeyListening(idx));
            });
        }

        // --- 기타 ---
        if(DOM.btnChange) DOM.btnChange.addEventListener('click', () => sm.toggleNameEdit());
    }
    
    // [신규] 버튼 홀드 기능 헬퍼
    _setupHoldButton(button, action, intervalMs) {
        if (!button) return;
        
        let holdInterval = null;
        let holdTimeout = null;
        
        // 첫 클릭
        button.addEventListener('click', action);
        
        // 홀드 시작
        button.addEventListener('mousedown', () => {
            holdTimeout = setTimeout(() => {
                holdInterval = setInterval(action, intervalMs);
            }, 500); // 0.5초 후 연속 실행 시작
        });
        
        // 홀드 종료
        const stopHold = () => {
            if (holdTimeout) clearTimeout(holdTimeout);
            if (holdInterval) clearInterval(holdInterval);
            holdTimeout = null;
            holdInterval = null;
        };
        
        button.addEventListener('mouseup', stopHold);
        button.addEventListener('mouseleave', stopHold);
    }
}