// src/scenes/Scene.js

export class Scene {
    constructor(app) {
        this.app = app; // app 객체 저장 (ui, firebase, gameEngine, sceneManager 등)
    }

    // 씬이 시작될 때 호출 (params: 이전 씬에서 넘겨준 데이터)
    enter(params) {}

    // 씬이 끝날 때 호출 (청소 작업)
    exit() {}

    // 매 프레임 호출 (게임 루프)
    update() {}
    draw() {}

    // 키보드 입력 처리
    onKeyDown(key) {}
}