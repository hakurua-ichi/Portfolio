/**
 * prototypes/item.js
 * * 개발 순서 4단계: 게임 객체 생성 (2/5)
 * * 게임 내 아이템(파워, 생명, 스펠)의 기본 클래스입니다.
 */

class Item {
    /**
     * 아이템 생성자
     * @param {number} x - 생성 x 좌표
     * @param {number} y - 생성 y 좌표
     * @param {string} type - 아이템 종류 ('power', 'life', 'spell')
     */
    constructor(x, y, type) {
        this.x = x;
        this.y = y;
        this.type = type;

        // 히트박스 크기 및 임시 색상
        this.width = 12;
        this.height = 12;
        
        switch(type) {
            case 'power':
                this.color = '#FF5555'; // 파워 (빨강)
                break;
            case 'life':
                this.color = '#55FF55'; // 생명 (초록)
                break;
            case 'spell':
                this.color = '#5555FF'; // 스펠 (파랑)
                break;
            default:
                this.color = '#AAAAAA'; // 기타
        }

        // 이동 관련
        this.vy = 50; // 기본 낙하 속도 (초당 픽셀)
        this.vx = 0;

        this.isOffScreen = false;  // 화면 밖으로 나갔는지
        this.isCollected = false; // 플레이어에게 수집되었는지

        // 플레이어 자석 기능
        this.attractionSpeed = 300; // 끌려오는 속도
        this.attractionRadius = 70; // 끌어당기기 시작하는 반경
        this.isAttracted = false;
    }

    /**
     * 매 프레임 아이템 상태 업데이트
     * @param {number} deltaTime - 프레임 간 시간 차이 (timeState.deltaTime)
     * @param {Player} player - 플레이어 객체 (위치 확인용)
     */
    update(deltaTime, player) {
        // 플레이어와의 거리 계산
        const dx = player.x - this.x;
        const dy = player.y - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // 일정 반경 안에 들어오면 자석 활성화
        if (distance < this.attractionRadius) {
            this.isAttracted = true;
        }

        if (this.isAttracted) {
            // 플레이어를 향해 빠르게 이동
            const angle = Math.atan2(dy, dx);
            this.vx = Math.cos(angle) * this.attractionSpeed;
            this.vy = Math.sin(angle) * this.attractionSpeed;
        } else {
            // 기본 낙하
            this.vx = 0;
            this.vy = 50; // 기본 낙하 속도
        }

        // DeltaTime 적용하여 이동
        this.x += this.vx * deltaTime;
        this.y += this.vy * deltaTime;

        // 화면 밖으로 나갔는지 확인
        if (this.y > CANVAS_HEIGHT + this.height) {
            this.isOffScreen = true;
        }
    }

    /**
     * 캔버스에 아이템 그리기
     * @param {CanvasRenderingContext2D} ctx - 캔버스 2D 컨텍스트
     */
    draw(ctx) {
        // 임시로 마름모 + 글자로 그립니다.
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(Math.PI / 4); // 45도 회전
        ctx.fillStyle = this.color;
        ctx.fillRect(-this.width / 2, -this.height / 2, this.width, this.height);
        ctx.restore();

        // 아이템 타입 글자 표시 (P, L, S)
        ctx.fillStyle = 'white'; // 글자 색
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        let letter = '?';
        if (this.type === 'power') letter = 'P';
        if (this.type === 'life') letter = 'L';
        if (this.type === 'spell') letter = 'S';
        
        ctx.fillText(letter, this.x, this.y);
    }
}