/**
 * prototypes/bullet.js
 * * 개발 순서 4단계: 게임 객체 생성 (1/5)
 * * 게임 내 모든 총알(플레이어, 적)의 기본 클래스입니다.
 */

class Bullet {
    /**
     * 총알 생성자
     * @param {number} x - 시작 x 좌표
     * @param {number} y - 시작 y 좌표
     * @param {number} speed - 속도 (초당 픽셀)
     * @param {number} angle - 발사 각도 (라디안. 0 = 오른쪽, -PI/2 = 위쪽)
     * @param {number} damage - 데미지
     * @param {string} owner - 소유자 ('player' 또는 'enemy')
     * @param {number} width - 총알 너비 (히트박스)
     * @param {number} height - 총알 높이 (히트박스)
     * @param {string} color - 총알 색상
     */
    constructor(x, y, speed, angle, damage, owner, width = 5, height = 10, color = 'white') {
        this.x = x;
        this.y = y;
        this.speed = speed;
        
        // 각도를 기반으로 x, y 속도를 미리 계산합니다.
        // Math.cos/sin은 라디안 값을 사용합니다. (위쪽: -Math.PI / 2)
        this.vx = speed * Math.cos(angle);
        this.vy = speed * Math.sin(angle);
        
        this.damage = damage;
        this.owner = owner; // 'player' or 'enemy'
        
        // 히트박스 크기
        this.width = width;
        this.height = height;
        this.color = color;
        
        // 화면 밖으로 나갔는지 여부
        this.isOffScreen = false;
    }

    /**
     * 매 프레임 총알 상태 업데이트
     * @param {number} deltaTime - 프레임 간 시간 차이 (timeState.deltaTime)
     */
    update(deltaTime) {
        // DeltaTime을 사용하여 프레임 속도와 관계없이 일정한 속도로 이동
        this.x += this.vx * deltaTime;
        this.y += this.vy * deltaTime;

        // 화면 밖으로 나갔는지 확인
        if (this.x < -this.width || this.x > CANVAS_WIDTH + this.width ||
            this.y < -this.height || this.y > CANVAS_HEIGHT + this.height) {
            this.isOffScreen = true;
        }
    }

    /**
     * 캔버스에 총알 그리기
     * @param {CanvasRenderingContext2D} ctx - 캔버스 2D 컨텍스트
     */
    draw(ctx) {
        // 임시로 사각형으로 그립니다.
        // 추후 이미지 로드로 변경할 수 있습니다.
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x - this.width / 2, this.y - this.height / 2, this.width, this.height);
    }
}