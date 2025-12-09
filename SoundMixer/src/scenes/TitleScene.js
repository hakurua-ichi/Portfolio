import { Scene } from './Scene.js';

export class TitleScene extends Scene {
    constructor(app) {
        super(app);
    }

    async enter() {
        // 타이틀 화면 CSS 클래스는 SceneManager가 처리함
        
        // 캐릭터 숨김
        const characterCanvas = document.getElementById('characterCanvas');
        if (characterCanvas) {
            characterCanvas.style.display = 'none';
        }
    }
    
    exit() {
        // 정리 작업 (필요 시 추가)
    }

    onKeyDown(e) {
        if (e.key === 'Enter') {
            // 오디오 컨텍스트 깨우기 (브라우저 정책)
            const gameEngine = this.app.gameEngine;
            if (gameEngine && gameEngine.audio && gameEngine.audio.audioCtx) {
                gameEngine.audio.audioCtx.resume();
            }
            
            // 로딩 화면으로 즉시 전환
            this.app.sceneManager.changeScene('loading');
        }
    }
}