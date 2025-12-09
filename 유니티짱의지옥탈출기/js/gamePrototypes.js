/**
 * 📄 js/gamePrototypes.js
 * * 모든 게임 객체(플레이어, 발판, 장애물 등)의
 * 기본이 되는 '설계도'(클래스)를 정의합니다.
 */

/**
 * @class GameObject
 * 모든 게임 객체의 기본 클래스입니다.
 * 위치(x, y)와 크기(width, height)를 공통으로 가집니다.
 */
export class GameObject {
    /**
     * @param {number} x - 객체의 x 좌표 (절대 좌표)
     * @param {number} y - 객체의 y 좌표 (절대 좌표)
     * @param {number} width - 객체의 너비
     * @param {number} height - 객체의 높이
     */
    constructor(x, y, width, height) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
    }

    /**
     * 🖼️ 객체를 캔버스에 그리는 메서드입니다.
     * 이 메서드는 하위 클래스(Player, Platform 등)에서 
     * 각자 자신의 모습에 맞게 재정의(override)해야 합니다.
     * * @param {CanvasRenderingContext2D} ctx - 캔버스 2D 컨텍스트
     * @param {object} camera - 현재 카메라의 {x, y} 좌표
     */
    draw(ctx, camera) {
        // 예시: 기본 사각형 그리기 (디버깅용)
        // 실제로는 하위 클래스에서 이미지를 그리게 됩니다.
        ctx.fillStyle = 'magenta'; // 눈에 띄는 색
        
        // (객체 절대 좌표 - 카메라 절대 좌표) = 캔버스에 그릴 상대 좌표
        const drawX = this.x - camera.x;
        const drawY = this.y - camera.y;

        ctx.fillRect(drawX, drawY, this.width, this.height);
    }

    /**
     * ⚙️ 객체의 상태를 매 프레임 업데이트하는 메서드입니다.
     * 이 메서드 역시 하위 클래스에서 
     * 각자 자신의 로직에 맞게 재정의(override)해야 합니다.
     * * @param {number} deltaTime - 델타타임 (프레임 간 시간 간격)
     */
    update(deltaTime) {
        // 플레이어나 움직이는 장애물이 아닌 이상
        // 대부분의 객체(예: 발판)는 이 메서드가 비어있습니다.
        // 로직이 필요한 객체(Player 등)가 재정의하여 사용합니다.
    }
}

// 참고: 이 파일 자체는 '정의'만 하므로, 
//       다른 파일에서 import(혹은 script 로드 순서로) 사용하게 됩니다.
//       우리는 script 태그로 로드하므로, 이 클래스는 전역에서 접근 가능합니다.