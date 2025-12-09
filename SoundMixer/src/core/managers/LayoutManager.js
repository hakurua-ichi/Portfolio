// src/core/LayoutManager.js

export class LayoutManager {
    constructor() {
        // 레이아웃 상수 정의 (여기서만 관리하면 됨)
        this.CONSTANTS = {
            GEAR_WIDTH: 380,
            GEAR_MARGIN: 40,
            PANEL_W: 320,
            PANEL_H: 100,
            FRAME_W: 500,
            FRAME_H: 600,
            MIN_GAP: 20,
            GAP_GEAR_PANEL: 30,
            GAP_PANEL_FRAME: 30,
            HIT_Y_OFFSET: 120
        };
    }

    // 화면 크기를 받아 레이아웃 객체 반환
    calculate(w, h) {
        const C = this.CONSTANTS;

        // 1. 기어 위치
        const gearX = C.GEAR_MARGIN;
        const gearRightEdge = gearX + C.GEAR_WIDTH;

        // 2. 캐릭터 프레임 위치 (충돌 방지 로직 포함)
        let idealFrameX = w - C.FRAME_W - 60;
        const minFrameX = gearRightEdge + C.GAP_GEAR_PANEL + C.PANEL_W + C.GAP_PANEL_FRAME;
        const frameX = Math.max(idealFrameX, minFrameX);
        const frameY = 80;

        // 3. 하단 패널 위치
        const currentGapCenter = gearRightEdge + (frameX - gearRightEdge) / 2;
        let panelX = currentGapCenter - (C.PANEL_W / 2);
        panelX = Math.max(panelX, gearRightEdge + C.GAP_GEAR_PANEL);
        const panelY = h - C.PANEL_H - 60;

        // 4. 판정선
        const hitPosition = h - C.HIT_Y_OFFSET;
        const judgeLineY = hitPosition - 40; // [신규] 판정선 위치 (스코어 박스보다 40px 위)

        // 결과 객체 반환
        return {
            // Game.js의 settings에 들어갈 값
            hitPosition: hitPosition,
            
            // Renderer에 넘길 layout 객체
            layoutData: {
                gearX: gearX,
                gearWidth: C.GEAR_WIDTH,
                gearHeight: h,
                hitY: hitPosition, // 스코어 박스 기준
                judgeLineY: judgeLineY, // [신규] 실제 판정선 위치
                panelHeight: C.HIT_Y_OFFSET,

                infoPanel: {
                    x: panelX,
                    y: panelY,
                    w: C.PANEL_W,
                    h: C.PANEL_H
                },

                charFrame: {
                    x: frameX,
                    y: frameY,
                    w: C.FRAME_W,
                    h: C.FRAME_H
                },
                charX: 0, charY: 0
            }
        };
    }
}