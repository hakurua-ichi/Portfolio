/**
 * prototypes/background.js
 * * 배경 스크롤링 클래스
 * * 배경 이미지를 위에서 아래로 스크롤링하여 무한 반복 효과를 만듭니다.
 */

class Background {
    constructor() {
        // 배경 이미지 로드
        this.image = new Image();
        this.imageLoaded = false;
        this.image.src = ASSET_PATHS.background;
        this.image.onload = () => {
            this.imageLoaded = true;
            console.log('배경 이미지 로드 완료:', this.image.width, 'x', this.image.height);
        };
        this.image.onerror = () => {
            console.warn('배경 이미지 로드 실패. 검은 배경을 사용합니다.');
        };

        // 배경 스크롤 속도 (초당 픽셀)
        this.scrollSpeed = 50;

        // 캔버스 크기에 맞게 배경 크기 계산
        this.bgWidth = CANVAS_WIDTH;
        this.bgHeight = CANVAS_HEIGHT;

        // 두 개의 배경 이미지 y 위치 (무한 스크롤링)
        this.bg1Y = 0;
        this.bg2Y = -this.bgHeight; // 첫 번째 배경 바로 위에 배치
    }

    /**
     * 배경 업데이트 (스크롤링)
     * @param {number} deltaTime - 델타 타임
     */
    update(deltaTime) {
        // 배경을 아래로 이동
        this.bg1Y += this.scrollSpeed * deltaTime;
        this.bg2Y += this.scrollSpeed * deltaTime;

        // 첫 번째 배경이 화면 아래로 완전히 벗어나면 위로 재배치
        if (this.bg1Y >= this.bgHeight) {
            this.bg1Y = this.bg2Y - this.bgHeight;
        }

        // 두 번째 배경이 화면 아래로 완전히 벗어나면 위로 재배치
        if (this.bg2Y >= this.bgHeight) {
            this.bg2Y = this.bg1Y - this.bgHeight;
        }
    }

    /**
     * 배경 그리기
     * @param {CanvasRenderingContext2D} ctx - 캔버스 2D 컨텍스트
     */
    draw(ctx) {
        if (this.imageLoaded) {
            // 첫 번째 배경 이미지 그리기 (스트레치)
            ctx.drawImage(
                this.image,
                0, 
                this.bg1Y, 
                this.bgWidth, 
                this.bgHeight
            );

            // 두 번째 배경 이미지 그리기 (스트레치)
            ctx.drawImage(
                this.image,
                0, 
                this.bg2Y, 
                this.bgWidth, 
                this.bgHeight
            );
        } else {
            // 이미지 로드 전 또는 실패 시 검은 배경
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        }
    }
}
