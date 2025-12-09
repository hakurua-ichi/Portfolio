import { GameEngine } from './core/GameEngine.js';
import { SceneManager } from './core/SceneManager.js';
import { UIManager } from './view/UIManager.js';
import { FirebaseManager } from './core/services/FirebaseManager.js';
import { GlobalStore } from './data/GlobalStore.js';
import { DOM } from './data/DOMRegistry.js';

window.onload = async () => {
    // 1. 전역 설정 로드
    GlobalStore.load();

    // 2. UI 매니저 먼저 생성 (DOM 접근)
    const ui = new UIManager();

    // 3. 게임 엔진 생성 (Canvas, UIManager 주입)
    console.log('[main.js] ===== GameEngine 생성 시작 =====');
    const gameEngine = new GameEngine(DOM.canvas, ui);
    console.log('[main.js] ===== GameEngine 생성 완료 =====', gameEngine);

    // 4. 파이어베이스 생성
    const firebase = new FirebaseManager();

    // 5. [핵심] 모든 매니저를 하나의 'app' 객체로 묶음
    const app = {
        ui: ui,
        gameEngine: gameEngine,
        firebase: firebase,
        sceneManager: null // 나중에 할당
    };
    
    // 6. 씨 매니저 생성 (app 객체를 넘겨줌 -> 각 씨들이 app.ui 등에 접근 가능해짐)
    const sceneManager = new SceneManager(app);
    app.sceneManager = sceneManager; // 순환 참조 연결
    
    // GameEngine에 OptionManager 전달
    gameEngine.setOptionManager(sceneManager.options);

    // 7. 초기화 시작
    console.log("[System] Initializing...");
    await sceneManager.init(); // 스킨, 소리, 곡 목록 로딩
    await gameEngine.init();   // 엔진 리소스 로딩

    // 8. 리사이즈 핸들러
    function handleResize() {
        const w = window.innerWidth;
        const h = window.innerHeight;
        gameEngine.resize(w, h);
    }
    window.addEventListener('resize', handleResize);
    handleResize(); // 최초 1회 실행

    // 9. 타이틀 화면으로 이동
    sceneManager.changeScene('title');
    
    // 10. 글로벌 게임 루프 실행
    function globalLoop() {
        sceneManager.update();
        sceneManager.draw();
        requestAnimationFrame(globalLoop);
    }
    globalLoop();
    
    console.log("[System] SoundMixer Ready!");
};