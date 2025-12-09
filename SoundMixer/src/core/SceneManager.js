/**
 * SceneManager
 * 
 * 씬 전환 및 게임 흐름 관리 클래스
 * 
 * [주요 역할]
 * 1. 씬 생명주기 관리 (Title → Select → Game → Result)
 * 2. 곡 목록 로드 및 선택 상태 관리
 * 3. Firebase 랭킹 시스템 연동
 * 4. 옵션 설정 (OptionManager 통합)
 * 5. 전역 입력 처리 (GlobalInput 통합)
 * 
 * [씬 구조]
 * - TitleScene: 시작 화면
 * - SelectScene: 곡 선택 화면 (미리듣기, 난이도 선택)
 * - GameScene: 게임 플레이 화면
 * - ResultScene: 결과 화면 (점수, 랭킹)
 * 
 * [데이터 흐름]
 * - 곡 선택 → currentSongIndex, currentDiffKey
 * - 게임 시작 → GameScene.enter(songData)
 * - 게임 종료 → ResultScene.enter(result)
 * - Firebase 업로드 → 랭킹 갱신
 */

import { FirebaseManager } from './services/FirebaseManager.js';
import { SettingsManager } from './managers/SettingsManager.js';
import { UIManager } from '../view/UIManager.js';
import { OptionManager } from './managers/OptionManager.js';
import { GlobalInput } from './input/GlobalInput.js';

import { TitleScene } from '../scenes/TitleScene.js';
import { LoadingScene } from '../scenes/LoadingScene.js';
import { SelectScene } from '../scenes/SelectScene.js';
import { GameScene } from '../scenes/GameScene.js';
import { ResultScene } from '../scenes/ResultScene.js';

import { DOM } from '../data/DOMRegistry.js';
import { GlobalStore } from '../data/GlobalStore.js';

export class SceneManager {
    constructor(app) {
        // === 전역 참조 ===
        this.app = app;
        
        // === 플레이어 정보 ===
        this.playerName = localStorage.getItem('rhythm_player_name') || "GUEST";
        this.isEditingName = false;       // 이름 편집 중 여부
        
        // === 게임 상태 ===
        this.isPauseBlocked = false;      // 일시정지 차단 여부 (게임 시작 직후 등)

        // === 매니저 초기화 ===
        this.settings = new SettingsManager();
        this.ui = app.ui;                 // UIManager (app에서 생성된 인스턴스 재사용)
        this.options = new OptionManager(app, this.ui);
        this.firebase = app.firebase;     // [수정] app에서 전달받은 firebase 사용 (중복 생성 방지)
        this.input = new GlobalInput(app);

        // === 씬 등록 ===
        this.scenes = {
            title: new TitleScene(app),
            loading: new LoadingScene(app), // [Phase 2] 로딩 화면
            select: new SelectScene(app),
            game: new GameScene(app),
            result: new ResultScene(app)
        };
        this.currentScene = null;         // 현재 활성화된 씬 객체
        this.currentSceneName = "";       // 현재 씬 이름 ('title', 'select' 등)
    }

    /**
     * SceneManager 초기화 (비동기)
     * 
     * [초기화 순서]
     * 1. OptionManager 초기화 (GlobalStore 설정 로드)
     * 2. GlobalInput 초기화 (키보드 이벤트 등록)
     * 3. 플레이어 이름 UI 설정
     * 
     * [호출 시점]
     * - main.js에서 앱 초기화 시
     * 
     * [변경 사항]
     * - 곡 목록 로드는 SelectScene.enter()에서 수행 (책임 분리)
     */
    async init() {
        await this.options.init();
        this.input.init(); // GlobalInput 시작 (글로벌 키보드 이벤트)
        
        this.ui.toggleNameEdit(false, this.playerName);
        
        // [Phase 2] UIManager에 GameDB 연결
        if (this.app.gameEngine && this.app.gameEngine.gameDB) {
            this.ui.gameDB = this.app.gameEngine.gameDB;
            console.log('[SceneManager] UIManager에 GameDB 연결됨');
        }

        console.log("SceneManager initialized");
    }

    // [GlobalInput에서 호출하는 액션들]
    
    handleModalEscape() {
        const modalType = this.ui.activeModalType;
        
        // 키 설정 모달 - OptionManager로 위임
        if (modalType === 'keyConfig') {
            this.options.closeKeyConfig();
        }
        // 캘리브레이션 모달 - OptionManager로 위임
        else if (modalType === 'calibration') {
            this.options.stopCalibration();
        }
        // 선곡 화면 나가기 모달 - 확실히 닫기
        else if (modalType === 'exit') {
            this.ui.closeModal();
        }
        // 게임 일시정지 모달 - 재개
        else if (modalType === 'pause' && !this.isPauseBlocked) {
            this.handleResume();
        }
        // 그 외 모든 모달 - 기본 닫기
        else {
            this.ui.closeModal();
        }
    }

    handleResume() {
        // 카운트다운 중이면 무시 (중복 호출 방지)
        if (this.scenes.game && this.scenes.game.isCountingDown) {
            return;
        }
        
        if (this.scenes.game && this.scenes.game.resumeGame) {
            this.scenes.game.resumeGame();
        }
    }

    handleQuitGame() {
        this.ui.closeModal();
        if(this.app.gameEngine) this.app.gameEngine.stop();
        this.changeScene('select');
    }

    toggleNameEdit() {
        this.isEditingName = !this.isEditingName;
        if (!this.isEditingName) {
            const newName = DOM.inputName.value.trim();
            if (newName) {
                this.playerName = newName;
                GlobalStore.savePlayerName(newName);
            }
        }
        this.ui.toggleNameEdit(this.isEditingName, this.playerName);
        
        // [수정] SelectScene이 직접 처리하도록 위임
        if (!this.isEditingName && this.currentSceneName === 'select') {
            if (this.currentScene && this.currentScene._updateRankingBoard) {
                this.currentScene._updateRankingBoard();
            }
        }
    }

    /**
     * 씬 전환
     * 
     * @param {string} name - 전환할 씬 이름 ('title', 'select', 'game', 'result')
     * @param {Object} params - 씬에 전달할 매개변수 (선택)
     * 
     * [동작 순서]
     * 1. 현재 씬의 exit() 호출 (정리 작업)
     * 2. 현재 씬 DOM 비활성화 (active 클래스 제거)
     * 3. 새 씬 DOM 활성화 (active 클래스 추가)
     * 4. 새 씬의 enter(params) 호출
     * 5. 모달 닫기 (씬 전환 시 모달 초기화)
     * 6. select 씬이면 랜킹 보드 업데이트
     */
    changeScene(name, params) {
        if (this.currentScene && this.currentScene.exit) this.currentScene.exit();
        if (this.currentSceneName) {
            const prev = DOM.get(`scene-${this.currentSceneName}`);
            if(prev) prev.classList.remove('active');
        }

        this.currentSceneName = name;
        this.currentScene = this.scenes[name];

        if (this.currentScene) {
            const next = DOM.get(`scene-${name}`);
            if(next) next.classList.add('active');
            if (this.currentScene.enter) this.currentScene.enter(params);
        }
        
        this.ui.closeModal(); // 씬 바뀔 때 모달 닫기
    }

    update() { if(this.currentScene?.update) this.currentScene.update(); }
    draw() { if(this.currentScene?.draw) this.currentScene.draw(); }
}