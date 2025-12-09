/**
 * prototypes/explosion.js
 * * 폭발 애니메이션 클래스
 * * 적이나 보스가 죽을 때 재생되는 애니메이션
 */

class Explosion {
    /**
     * 폭발 애니메이션 생성자
     * @param {number} x - 폭발 위치 x
     * @param {number} y - 폭발 위치 y
     * @param {string} type - 'enemy' 또는 'boss'
     */
    constructor(x, y, type = 'enemy') {
        this.x = x;
        this.y = y;
        this.type = type; // 'enemy' 또는 'boss'
        
        // 애니메이션 프레임 순서
        this.frameNames = ['flare', 'bigflare', 'explosion', 'burst', 'dustspray1', 'dustspray2'];
        this.currentFrameIndex = 0;
        
        // 애니메이션 타이밍 (1초 내로 완료)
        this.frameDuration = 1.0 / this.frameNames.length; // 각 프레임당 약 0.167초
        this.frameTimer = 0;
        
        // 크기 설정 (보스는 더 크게)
        if (type === 'boss') {
            this.baseSize = 150; // 보스 폭발 크기
        } else {
            this.baseSize = 60; // 일반 적 폭발 크기
        }
        
        // 애니메이션 완료 플래그
        this.isFinished = false;
        
        // 이미지 로드
        this.images = {};
        this.loadImages();
    }
    
    /**
     * 폭발 이미지 로드
     */
    loadImages() {
        this.frameNames.forEach(frameName => {
            const img = new Image();
            // 이미지 경로: Assets/Image/explosion_[frameName].png
            img.src = `Assets/Image/explosion_${frameName}.png`;
            img.onerror = () => {
                console.warn(`폭발 이미지 로드 실패: ${frameName}`);
            };
            this.images[frameName] = img;
        });
    }
    
    /**
     * 애니메이션 업데이트
     * @param {number} deltaTime - 델타 타임
     */
    update(deltaTime) {
        if (this.isFinished) return;
        
        this.frameTimer += deltaTime;
        
        // 다음 프레임으로 전환
        if (this.frameTimer >= this.frameDuration) {
            this.frameTimer = 0;
            this.currentFrameIndex++;
            
            // 모든 프레임 재생 완료
            if (this.currentFrameIndex >= this.frameNames.length) {
                this.isFinished = true;
            }
        }
    }
    
    /**
     * 폭발 그리기
     * @param {CanvasRenderingContext2D} ctx - 캔버스 컨텍스트
     */
    draw(ctx) {
        if (this.isFinished) return;
        
        const frameName = this.frameNames[this.currentFrameIndex];
        const img = this.images[frameName];
        
        if (img && img.complete && img.naturalWidth > 0) {
            // 프레임에 따라 크기 변화 (점점 커지고 작아지는 효과)
            const progress = this.currentFrameIndex / this.frameNames.length;
            let sizeMultiplier = 1.0;
            
            if (progress < 0.5) {
                // 전반부: 크기 증가
                sizeMultiplier = 0.5 + progress;
            } else {
                // 후반부: 크기 감소
                sizeMultiplier = 1.5 - progress;
            }
            
            const size = this.baseSize * sizeMultiplier;
            
            // 이미지 중앙 정렬하여 그리기
            ctx.save();
            ctx.globalAlpha = 1.0 - (progress * 0.3); // 후반부에 약간 페이드아웃
            ctx.drawImage(
                img,
                this.x - size / 2,
                this.y - size / 2,
                size,
                size
            );
            ctx.restore();
        } else {
            // 이미지 로드 실패 시 간단한 원형 폭발 효과
            this.drawFallbackExplosion(ctx);
        }
    }
    
    /**
     * 대체 폭발 효과 (이미지 없을 때)
     * @param {CanvasRenderingContext2D} ctx - 캔버스 컨텍스트
     */
    drawFallbackExplosion(ctx) {
        const progress = this.currentFrameIndex / this.frameNames.length;
        const radius = this.baseSize * (0.5 + progress * 0.5);
        
        // 외곽 원
        ctx.fillStyle = `rgba(255, 150, 0, ${1.0 - progress})`;
        ctx.beginPath();
        ctx.arc(this.x, this.y, radius, 0, Math.PI * 2);
        ctx.fill();
        
        // 내부 원
        ctx.fillStyle = `rgba(255, 255, 100, ${1.0 - progress})`;
        ctx.beginPath();
        ctx.arc(this.x, this.y, radius * 0.5, 0, Math.PI * 2);
        ctx.fill();
    }
}
