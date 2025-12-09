/**
 * gameState.js
 * * 개발 순서 3단계: 상태 및 전역변수 생성
 * * 이 파일은 게임 전체에서 공유되는 전역 변수, 상수, 
 * 그리고 현재 게임의 상태를 관리합니다.
 * 다른 모든 스크립트보다 먼저 로드되어야 합니다.
 */

// --- 1. DOM 요소 참조 ---
// HTML에서 정의한 주요 요소들을 JS 변수로 가져옵니다.
const DOM = {
    // 캔버스
    canvas: document.getElementById('game-canvas'),
    
    // 헤더
    languageSelector: document.getElementById('language-selector'),
    currentStageDisplay: document.getElementById('current-stage-display'),
    stageProgress: document.getElementById('stage-progress'),
    difficultySelector: document.getElementById('difficulty-selector'),
    startButton: document.getElementById('start-button'),
    pauseButton: document.getElementById('pause-button'),
    resetButton: document.getElementById('reset-button'),
    
    // 좌측 패널 - 게임 정보
    scoreDisplay: document.getElementById('score-display'),
    livesDisplay: document.getElementById('lives-display'),
    spellsDisplay: document.getElementById('spells-display'),
    powerDisplay: document.getElementById('power-display'),
    controlsList: document.getElementById('controls-list'),
    
    // 우측 패널
    leaderboardContent: document.getElementById('leaderboard-content')
};

// --- 2. 캔버스 및 렌더링 컨텍스트 ---
// 캔버스 컨텍스트(그림을 그릴 도구)를 'ctx'라는 전역 변수로 만듭니다.
const ctx = DOM.canvas.getContext('2d');
const CANVAS_WIDTH = DOM.canvas.width;
const CANVAS_HEIGHT = DOM.canvas.height;

// --- 3. 게임 핵심 상태 (Global State) ---
// 게임의 현재 상태를 저장하는 변수들
const gameState = {
    isRunning: false,     // 게임이 현재 실행 중인지
    isPaused: false,      // 게임이 일시정지되었는지
    isGameOver: false,    // 게임 오버 상태인지
    isBossActive: false,  // 보스가 현재 활성화되었는지
    isStageTransition: false, // [추가] 스테이지 전환 중인지 (3초 클리어 연출)
    
    score: 0,             // 현재 점수
    
    score: 0,             // 현재 점수
    lives: 3,             // 플레이어 목숨
    spells: 3,            // 플레이어 스펠(폭탄) 수
    power: 0,             // 플레이어 파워
    
    currentStage: 1,      // 현재 스테이지
    currentDifficulty: 'normal', // 현재 난이도 (easy, normal, hard)
    
    playerType: null,     // 선택된 캐릭터 타입 (bomb, laser, timeStop) - 초기값 null
    
    // 기획서: 랭킹은 이름, 점수, 난이도, 스테이지 수로 구성
    rankingData: {
        playerName: 'Player1', // 임시 이름
        score: 0,
        difficulty: 'normal',
        stageCleared: 0
    }
};

// --- 4. DeltaTime 및 시간 관리 ---
// 기획서: 모든 시스템은 DeltaTime 방식을 이용
const timeState = {
    lastTime: 0,          // 이전 프레임의 타임스탬프
    deltaTime: 0          // 프레임 간의 시간 차이 (초 단위)
};

// --- 5. 입력 상태 (Input State) ---
// 사용자의 키 입력을 실시간으로 추적합니다.
const inputState = {
    'ArrowUp': false,
    'ArrowDown': false,
    'ArrowLeft': false,
    'ArrowRight': false,
    'w': false,
    'a': false,
    's': false,
    'd': false,
    'Shift': false,       // 저속 이동 (Focus)
    'z': false,           // 공격 (Shoot)
    'x': false,           // 스펠 (Spell)
    'p': false            // 일시정지 (Pause)
};

// --- 6. 에셋 경로 ---
// 기획서: 이미지 및 사운드 경로 정의
const ASSET_PATHS = {
    // 이미지 (Assets/Image)
    background: 'Assets/Image/background.png',
    boss1: 'Assets/Image/boss1.png',
    boss2: 'Assets/Image/boss2.png',
    boss3: 'Assets/Image/boss3.png',
    boss4: 'Assets/Image/boss4.png',
    boss5: 'Assets/Image/boss5.png',
    player: 'Assets/Image/player.png',
    enemy1: 'Assets/Image/enemy1.png',
    enemy2_homing: 'Assets/Image/enemy2_homing.png',
    
    // 사운드 (Assets/Sound)
    stage1BGM: 'Assets/Sound/stage1BGM.mp3',
    stage1BossBGM: 'Assets/Sound/stage1BossBGM.mp3',
    playerShoot: 'Assets/Sound/playerShoot.mp3',
    gameClear: 'Assets/Sound/gameClear.mp3',
    stageClear: 'Assets/Sound/stageClear.mp3'
    // ... (기획서의 나머지 사운드)
};

// --- 7. 게임 밸런스 및 상수 ---
// 게임의 기본 수치를 정의합니다.
const GAME_CONFIG = {
    playerSpeed: 300,       // 플레이어 기본 속도 (초당 픽셀)
    playerFocusSpeed: 150,  // 플레이어 저속 속도 (기획: 50% 감소)
    playerInvincibleTime: 1.0, // 피격 후 무적 시간 (기획: 1초)
    
};