import { Scene } from './Scene.js';
import { DOM } from '../data/DOMRegistry.js';

export class GameScene extends Scene {
    constructor(app) {
        super(app);
        this.engine = app.gameEngine;
        this.ui = app.ui;
        this.isPauseBlocked = false;  // 일시정지 차단 (게임 시작 직후)
        this.isCountingDown = false;   // 카운트다운 중 플래그
    }

    // ... enter, exit 등 기존 코드 ...
    async enter(params) {
        // [1] 로딩 시작 전 캔버스 숨김 (로딩 중 보이지 않게)
        if (this.engine.character) {
            this.engine.character.hide();
        }

        // // [신규] Live2D 캔버스 표시 (게임 플레이 중)
        // const characterCanvas = document.getElementById('characterCanvas');
        // if (characterCanvas) {
        //     characterCanvas.style.display = 'block';
        // }

        // [중요] 곡 정보 설정 및 로딩 화면 표시
        if (params && params.song) {
            this.engine.renderer.loadingSongData = {
                ...params.song,
                difficulty: params.difficulty || 'NORMAL',
                level: params.level || '?'
            };
        }
        this.engine.renderer.loadingProgress = 0;
        this.engine.renderer.drawLoading();

        // [제거] 가짜 프로그레스 바 제거 - GameEngine.start()가 실제 진행률을 업데이트함

        await this.engine.init();

        // [수정] 게임 종료 이벤트 중복 등록 방지
        this.engine.events.off('gameFinished', this._onGameFinished);
        this._onGameFinished = () => {
            this.app.sceneManager.changeScene('result');
        };
        this.engine.events.on('gameFinished', this._onGameFinished);

        if (params && params.song) {
            // [수정] HP 설정 포함
            await this.engine.start({
                ...params.song,
                chartFile: params.chartFile,
                hpMax: params.hpMax,
                hpDrain: params.hpDrain,
                hpRegen: params.hpRegen
            });
        }

        // [제거] 게임 시작 음성 - SelectScene에서 이미 재생
        // if (this.engine.voice) {
        //     this.engine.voice.playGameStart();
        // }

        // [제거] 게임 시작 후 캔버스 표시 - GameEngine.update()의 3초 후에 표시됨
        // if (this.engine.character) {
        //     this.engine.character.show();
        // }

        // [제거] 로딩 완료 데이터 정리 - GameEngine.start() 내부에서 처리
        // this.engine.renderer.loadingSongData = null;
        // this.engine.renderer.loadingProgress = 0;
    }

    exit() {
        this.engine.stop();

        // [핵심] 씬 이탈 시 캔버스 숨김
        if (this.engine && this.engine.character) {
            this.engine.character.hide();
        }

        // [신규] GameEngine cleanup 호출 (이벤트 리스너 정리)
        if (this.engine && this.engine.cleanup) {
            this.engine.cleanup();
        }
        this.ui.closeModal();
    }

    update() {
        // [수정] UI 매니저의 상태 + 카운트다운 상태 확인
        if (!this.ui.isModalActive() && !this.isCountingDown) {
            this.engine.update();
        }
    }

    // 키 입력 (GlobalInput에서 받지 않고 여기서 직접 처리하거나, GlobalInput이 호출해줌)
    // GlobalInput이 호출해주는 구조라면 아래 코드는 필요 없음.
    // 하지만 현재 구조상 GlobalInput이 씬에 'onKeyDown'을 호출해주는 방식이므로 유지.

    onKeyDown(e) {
        // InputSystem이 게임 키 입력을 직접 처리하므로 여기서는 게임 제어만 담당

        if (this.ui.isModalActive()) return; // 모달 켜져있으면 게임 입력 무시
        if (this.isCountingDown) return;     // 카운트다운 중에도 입력 차단

        // 일시정지 진입 (ESC)
        if (e.key === 'Escape') {
            if (this.isPauseBlocked) return;
            this._pauseGame();
            return;
        }
    }

    async _pauseGame() {
        try {
            await this.engine.pause();
            this.ui.openModal('pause');
        } catch (error) {
            console.error('[GameScene] 일시정지 실패:', error);
            // 일시정지 실패 시 모달을 열지 않음
        }
    }

    async resumeGame() {
        // 이미 카운트다운 중이면 무시 (중복 호출 방지)
        if (this.isCountingDown) return;

        this.isCountingDown = true;    // 카운트다운 시작
        this.isPauseBlocked = true;     // 일시정지 차단 시작

        this.ui.closeModal();          // 일시정지 모달 닫기
        this.ui.showCountdown(3);       // 3초 표시 (카운트다운 모드 진입)

        let count = 3;
        const timer = setInterval(async () => {
            count--;
            if (count > 0) {
                this.ui.showCountdown(count);
            } else {
                clearInterval(timer);
                this.ui.hideCountdown();   // 카운트다운 종료

                try {
                    await this.engine.resume();      // 게임 재개
                } catch (error) {
                    console.error('[GameScene] 재개 실패:', error);
                    // 재개 실패 시 강제로 일시정지 모달 다시 표시
                    this.ui.openModal('pause');
                    this.isCountingDown = false;
                    this.isPauseBlocked = false;
                    return;
                }

                this.isCountingDown = false; // 카운트다운 종료

                // 1초 후 일시정지 차단 해제 (3초 카운트다운 + 1초 대기 = 총 4초)
                setTimeout(() => {
                    this.isPauseBlocked = false;
                }, 1000);
            }
        }, 1000);
    }
}