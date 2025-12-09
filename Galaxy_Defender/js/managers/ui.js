/**
 * managers/ui.js
 * * 개발 순서 5단계: UI 매니저 생성 (4/4)
 * * 게임의 UI(HTML 정보, 캔버스 오버레이)를 관리하고 업데이트합니다.
 * * langLoader.js의 LanguageManager와 협력합니다.
 */

class UIManager {
    /**
     * UI 매니저 생성자
     * @param {CanvasRenderingContext2D} ctx - 캔버스 2D 컨텍스트
     * @param {LanguageManager} langManager - 언어 관리자 인스턴스
     */
    constructor(ctx, langManager) {
        this.ctx = ctx;
        this.langManager = langManager;

        // DOM 참조 (gameState.js에서 가져옴)
        this.dom = DOM;

        // 동방 스타일 UI를 위한 아이콘 (임시 텍스트)
        this.lifeIcon = '❤️';
        this.spellIcon = '💣';
        
        // 스테이지 진행도 (보스전 타이머 등)
        this.stageTimer = 0;
        this.stageDuration = 60; // 예: 1스테이지 60초
    }

    /**
     * UI 초기화 (GameController에서 호출)
     */
    init() {
        // 초기 UI 상태 설정
        this.updateScore(0);
        this.updateLives(gameState.lives);
        this.updateSpells(gameState.spells);
        this.updatePower(gameState.power);
        this.updateStageDisplay(1);
        this.updateStageProgress(0);
    }

    /**
     * 매 프레임 UI 상태 업데이트
     * (GameController의 메인 루프에서 호출됨)
     * @param {number} deltaTime - 델타 타임
     */
    update(deltaTime) {
        // 1. HTML UI 업데이트 (매번 할 필요는 없고, 변경 시에만 하는 것이 효율적)
        // (GameController에서 점수/생명 변경 시 특정 함수를 호출하는 방식으로 변경 예정)
        
        // 2. 스테이지 진행도 업데이트 (시간정지 중에는 멈춤)
        if (gameState.isRunning && !gameState.isPaused && !gameState.isBossActive && !gameState.isTimeStopped) {
            this.stageTimer += deltaTime;
            const progress = Math.min(100, (this.stageTimer / this.stageDuration) * 100);
            this.updateStageProgress(progress);
        }
    }

    /**
     * 캔버스 위에 UI 그리기 (일시정지, 게임오버 등)
     * (GameController의 렌더링 루프에서 마지막에 호출됨)
     */
    draw() {
        if (gameState.isPaused) {
            this.drawOverlay(this.langManager.getText('pauseOverlay'));
        }
        
        if (gameState.isGameOver) {
            this.drawOverlay(this.langManager.getText('gameOverOverlay'));
        }
    }

    /**
     * 캔버스에 반투명 오버레이와 텍스트 그리기
     * @param {string} text - 표시할 텍스트
     */
    drawOverlay(text) {
        this.ctx.save(); // 현재 캔버스 상태 저장
        
        // 반투명 검은색 배경
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        this.ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        
        // 텍스트
        this.ctx.fillStyle = 'white';
        this.ctx.font = 'bold 50px sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(text, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
        
        this.ctx.restore(); // 저장했던 캔버스 상태 복구
    }
    
    // --- HTML UI 개별 업데이트 함수 ---

    updateScore(score) {
        // (DOM이 로드되지 않았을 수 있으므로 방어 코드)
        if (this.dom.scoreDisplay) {
            this.dom.scoreDisplay.textContent = score.toLocaleString(); // 천단위 콤마
        }
    }

    updateLives(lives) {
        if (this.dom.livesDisplay) {
            this.dom.livesDisplay.textContent = this.lifeIcon.repeat(Math.max(0, lives));
        }
    }

    updateSpells(spells) {
        if (this.dom.spellsDisplay) {
            this.dom.spellsDisplay.textContent = this.spellIcon.repeat(Math.max(0, spells));
        }
    }
    
    updatePower(power) {
        if (this.dom.powerDisplay) {
            this.dom.powerDisplay.textContent = power;
        }
    }

    updateStageProgress(value) {
        if (this.dom.stageProgress) {
            this.dom.stageProgress.value = value;
        }
    }
    
    /**
     * 현재 스테이지 표시 업데이트
     * @param {number} stage - 현재 스테이지 (1~5)
     */
    updateStageDisplay(stage) {
        if (this.dom.currentStageDisplay) {
            this.dom.currentStageDisplay.textContent = `Stage ${stage}`;
        }
    }
    
    /**
     * 난이도 변경 시 UI 업데이트
     * @param {string} difficulty - 'easy', 'normal', 'hard'
     */
    updateDifficulty(difficulty) {
        // (langLoader가 이미 옵션 텍스트는 변경했을 것임)
        // GameState와 DOM의 <select> 값을 동기화
        gameState.currentDifficulty = difficulty;
        if (this.dom.difficultySelector.value !== difficulty) {
            this.dom.difficultySelector.value = difficulty;
        }
    }

    /**
     * 게임 시작/정지/리셋 시 버튼 상태 업데이트
     */
    toggleGameControls(isRunning, isPaused) {
        if (!this.dom.startButton || !this.dom.pauseButton || !this.dom.difficultySelector) return;
        
        if (isRunning) {
            // 게임 중
            this.dom.startButton.disabled = true;
            this.dom.pauseButton.disabled = false;
            this.dom.difficultySelector.disabled = true; // 게임 중 난이도 변경 불가
            
            if (isPaused) {
                // 일시 정지됨
                this.dom.pauseButton.textContent = this.langManager.getText('resumeButton');
            } else {
                // 플레이 중
                this.dom.pauseButton.textContent = this.langManager.getText('pauseButton');
            }
        } else {
            // 게임 시작 전 (초기화 또는 게임 오버)
            this.dom.startButton.disabled = false;
            this.dom.pauseButton.disabled = true;
            this.dom.difficultySelector.disabled = false;
            this.dom.pauseButton.textContent = this.langManager.getText('pauseButton');
        }
    }
}