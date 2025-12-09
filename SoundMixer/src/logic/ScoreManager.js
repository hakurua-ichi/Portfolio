export class ScoreManager {
    constructor() {
        this.score = 0;
        this.combo = 0;
        this.maxCombo = 0;
        this.songTitle = "";
        
        // 체력 시스템 (0 ~ 100)
        this.life = 100; 
        this.MAX_LIFE = 100;
        
        // 판정 통계
        this.stats = {
            PERFECT: 0,
            GREAT: 0,
            GOOD: 0,
            MISS: 0
        };
    }

    // 판정 결과 반영
    addResult(result) {
        // 1. 통계 카운트 증가
        if (this.stats[result] !== undefined) {
            this.stats[result]++;
        }

        // 2. MISS 처리
        if (result === 'MISS') {
            this.resetCombo();
            this.life -= 10; // 체력 감소 (난이도에 따라 조절 가능)
        } 
        // 3. HIT 처리 (Perfect, Great, Good)
        else {
            this.combo++;
            if (this.combo > this.maxCombo) {
                this.maxCombo = this.combo;
            }
            
            // 체력 회복량 차등 적용
            let heal = 0;
            if (result === 'PERFECT') heal = 1.0;
            else if (result === 'GREAT') heal = 0.5;
            // GOOD은 회복 없음 (현상 유지)
            
            this.life += heal;
        }

        // 체력은 0~100 사이 유지
        this.life = Math.min(this.MAX_LIFE, Math.max(0, this.life));

        // 4. 점수 계산
        let baseScore = 0;
        if (result === 'PERFECT') baseScore = 100;
        else if (result === 'GREAT') baseScore = 80;
        else if (result === 'GOOD') baseScore = 50;

        // 콤보 보너스 (최대 10점까지)
        const bonus = Math.min(this.combo, 10);
        this.score += baseScore + bonus;
    }

    resetCombo() {
        this.combo = 0;
    }
    
    // 게임 오버 체크
    isDead() {
        return this.life <= 0;
    }

    // UI에 표시할 데이터 반환
    getDisplayData() {
        return {
            score: this.score,
            combo: this.combo,
            stats: this.stats,
            life: this.life,
            songTitle: this.songTitle
        };
    }
}