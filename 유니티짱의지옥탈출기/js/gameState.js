// --- 1. DOM 요소 참조 ---
// HTML에서 정의한 주요 요소들을 JS로 제어하기 위해 미리 변수에 담아둡니다.
const canvas = document.getElementById('game-canvas');
export const ctx = canvas.getContext('2d');
const gameWrapper = document.getElementById('game-window-wrapper');

// (이후 단계에서 UI 매니저가 사용할 요소들)
const startButton = document.getElementById('start-button');
const pauseButton = document.getElementById('pause-button');
const resetButton = document.getElementById('reset-button');
const stageProgressValue = document.getElementById('stage-progress-value');
const leaderboardContent = document.getElementById('leaderboard-content');
const languageSelector = document.getElementById('language-selector');

// --- 2. 게임 핵심 상수 (Constants) ---
// 이 값들은 게임 도중 변하지 않으며, 게임의 '규칙'을 정의합니다.
export const GAME_CONSTANTS = {
    // 캔버스의 내부 해상도 (16:9 비율)
    CANVAS_WIDTH: 1280,
    CANVAS_HEIGHT: 720,
    
    // 중력 값 (매 프레임 Y축 속도에 더해짐)
    // 델타타임 기준으로 조절되어야 함 (예: 초당 980픽셀)
    // 여기서는 1프레임(1/60초) 기준으로 대략적인 값을 설정
    GRAVITY: 0.5, // (이 값은 델타타임 적용 시 재조정 필요)

    // 플레이어 관련 상수
    PLAYER: {
        MAX_SPEED: 5,           // 최대 이동 속도 (지상)
        MAX_SPEED_AIR: 5,       // 최대 이동 속도 (공중) - 시원시원하게 상향!
        ACCELERATION: 0.5,      // 가속도 (지상)
        ACCELERATION_AIR: 0.3,  // 가속도 (공중) - 공중 제어력 증가
    // 마찰 계수: 1에 가까울수록 더 천천히 속도가 줄어들어 "미끄러짐"이 강해집니다.
    // (값이 작을수록 감속이 빠르므로 '덜 미끄러지게' 됩니다.)
    // 따라서 미끄러짐을 더 크게 하려면 값을 0.9~0.99로 키우세요.
    // 여기서는 더 미끄럽게 느껴지도록 0.95로 설정합니다.
    FRICTION: 0.95,
    // (주의: 너무 낮게 설정하면 컨트롤이 불안정하므로 0.5 이하로 내리지 않는 것을 권장)
        AIR_RESISTANCE: 0.92,   // 공중 저항 (FRICTION보다 낮게 설정)
        CHARGING_MOVE_MULT: 0.3, // 점프 차징 중 이동 속도 배율
        JUMP_CHARGE_MIN: 5,     // 최소 점프 힘
        JUMP_CHARGE_MAX: 20,    // 최대 점프 힘 (15→20으로 상향!)
        JUMP_CHARGE_RATE: 0.2,  // 스페이스바 누를 시 초당 차징 속도
    },

    // 장애물 관련 상수 (예시)
    OBSTACLE: {
        SPRING_BOUNCE: 15, // 스프링 반동 힘
    }
};

// 캔버스 초기 해상도 설정 (한번만 설정, 절대 변경하지 않음)
canvas.width = GAME_CONSTANTS.CANVAS_WIDTH;   // 1280
canvas.height = GAME_CONSTANTS.CANVAS_HEIGHT; // 720

// CSS에서 크기가 고정되어 있으므로 별도의 resize 처리 불필요
// 게임 로직은 항상 1280x720 좌표계에서 동작

// --- 3. 게임 상태 (Global State) ---
// 게임이 진행되면서 '변하는' 모든 데이터를 관리합니다.
export let gameState = {
    isRunning: false,     // 게임이 현재 실행 중인가? (시작 버튼 누름)
    isPaused: false,      // 게임이 일시정지 되었는가?
    isGameOver: false,    // (필요 시 추가)
    
    currentStage: 1,      // 현재 플레이 중인 스테이지
    startTime: 0,         // 게임 시작 시간 (Date.now())
    clearTime: 0,         // 최종 클리어 타임
    
    player: null,         // 플레이어 객체 (4단계에서 생성)
    platforms: [],        // 발판 배열 (맵 로더가 채움)
    obstacles: [],        // 장애물 배열 (맵 로더가 채움)
    
    // 카메라의 절대 좌표 (플레이어를 따라다님)
    camera: {
        x: 0,
        y: 0
    },
    
    // 맵 경계 (카메라 제한용) - 수직 스크롤
    mapBounds: {
        width: 1280,   // 화면 너비와 동일 (좌우 고정)
        height: 3000,  // 맵의 전체 높이 (아래에서 위로)
        minY: -2500    // 맵의 최상단 (음수가 위쪽)
    },

    // 사용자 입력 상태
    keys: {
        left: false,
        right: false,
        space: false
    },

    // 튜토리얼 완료 여부 (로컬스토리지에서 읽어옴)
    isTutorialDone: false,

    // 포커스 복귀 시 복원할 속도 저장
    savedVelocity: { x: 0, y: 0 }
    ,
    // 게임 플레이 시간 추적용 (일시정지 시간 제외)
    pausedAccum: 0,    // 누적 일시정지 시간(ms)
    pauseStart: null   // 현재 일시정지 시작 시각(ms)
};

// 포커스 잃으면 자동 일시정지 + 속도 저장 및 즉시 멈춤
window.addEventListener('blur', () => {
    if (gameState && gameState.isRunning && !gameState.isPaused && gameState.player) {
        // 현재 속도 저장
        gameState.savedVelocity.x = gameState.player.velocityX;
        gameState.savedVelocity.y = gameState.player.velocityY;
        
        // 플레이어 속도 즉시 0으로 설정 (물리 진행 방지)
        gameState.player.velocityX = 0;
        gameState.player.velocityY = 0;
        
        // 일시정지 플래그 설정
        gameState.isPaused = true;
        // pause 시작 시각 기록
        gameState.pauseStart = Date.now();
        
        console.log('Game auto-paused (focus lost) - velocity saved and zeroed');
        // Also pause all audio if audio manager is available
        try {
            if (window.game && window.game.audio && typeof window.game.audio.pauseAll === 'function') {
                window.game.audio.pauseAll();
            }
        } catch (e) { console.warn('Auto-pause: audio pause failed', e); }
    }
});

// Also handle visibilitychange (tab switch) to trigger the same auto-pause behavior
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
        // mimic blur behavior
        if (gameState && gameState.isRunning && !gameState.isPaused && gameState.player) {
            gameState.savedVelocity.x = gameState.player.velocityX;
            gameState.savedVelocity.y = gameState.player.velocityY;
            gameState.player.velocityX = 0;
            gameState.player.velocityY = 0;
            gameState.isPaused = true;
            gameState.pauseStart = Date.now();
            console.log('Game auto-paused (visibility hidden)');
            try {
                if (window.game && window.game.audio && typeof window.game.audio.pauseAll === 'function') {
                    window.game.audio.pauseAll();
                }
            } catch (e) { console.warn('Auto-pause (visibility): audio pause failed', e); }
        }
    }
});

// 포커스 복귀 시 플레이어 재배치 및 속도 복원
window.addEventListener('focus', () => {
    if (gameState && gameState.player) {
        // gameController의 repositionPlayerOnPlatform을 호출하기 위해
        // 전역 이벤트 발생 (플랫폼에 다시 올려놓기)
        window.dispatchEvent(new CustomEvent('repositionPlayer'));
        
        // 저장된 속도 복원 (떨어지던 중이었다면 계속 떨어지게)
        // 단, repositionPlayer가 velocityY를 0으로 만들기 때문에
        // 여기서는 velocityX만 복원 (수평 이동만)
        gameState.player.velocityX = gameState.savedVelocity.x;
        // velocityY는 0으로 유지 (플랫폼 위에 안착)
        
        console.log('Player repositioned on focus - horizontal velocity restored');
    }
});

// (게임 루프는 gameController.js에서 정의할 예정)