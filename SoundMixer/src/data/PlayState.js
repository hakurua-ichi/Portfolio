/*
    PlayState는 게임 플레이 중 실시간 상태를 관리하는 객체입니다.
    점수, 콤보, 판정 통계, 체력, 일시정지 횟수를 관리합니다.
    100, 300, 500, 1000 콤보 달성 시 'comboBurst' 이벤트를 발생시킵니다.
*/

export const PlayState = {
    // 점수 및 콤보
    score: 0,
    combo: 0,
    maxCombo: 0,
    
    // 판정 통계
    stats: {
        PERFECT: 0,
        GREAT: 0,
        GOOD: 0,
        MISS: 0
    },
    
    // 체력 시스템
    life: 100,
    hpSettings: {
        max: 100,        // 최대 체력 (차트 설정 가능)
        drain: 10,       // MISS 시 감소량
        regen: 1.0       // PERFECT 회복량 (GREAT는 50%)
    },
    
    // 게임 상태
    isFailed: false,
    pauseCount: 0,
    songTitle: "",
    
    // 콤보 버스트 시스템 (voice_mapping.json에서 자동 로드)
    comboBurstMilestones: [50, 100, 200, 300], // 기본값 (VoiceManager가 덮어씀)
    lastComboBurst: 0,
    comboBurstMultiplier: 1.5, // 마지막 마일스톤 이후 배수 (곱셈 방식, JSON에서 설정)
    comboBurstIncrement: 200,  // 마지막 마일스톤 이후 증가량 (덧셈 방식, JSON에서 설정)

    // 게임 상태 초기화
    reset(title, hpConfig = null) {
        this.score = 0;
        this.combo = 0;
        this.maxCombo = 0;
        this.isFailed = false;
        this.songTitle = title || "";
        this.pauseCount = 0;
        this.lastComboBurst = 0;
        
        // [수정] HP 설정 적용 (차트에서 제공하면 사용, 없으면 기본값)
        if (hpConfig && (hpConfig.hpMax !== undefined || hpConfig.hpDrain !== undefined || hpConfig.hpRegen !== undefined)) {
            this.hpSettings.max = hpConfig.hpMax ?? 100;
            this.hpSettings.drain = hpConfig.hpDrain ?? 10;
            this.hpSettings.regen = hpConfig.hpRegen ?? 1.0;
        } else {
            // 기본값으로 리셋
            this.hpSettings.max = 100;
            this.hpSettings.drain = 10;
            this.hpSettings.regen = 1.0;
        }
        this.life = this.hpSettings.max; // 최대 체력으로 시작
        
        this.stats = {
            PERFECT: 0,
            GREAT: 0,
            GOOD: 0,
            MISS: 0
        };
    },

    // 판정 결과 반영 (로직)
    addResult(result) {
        // 1. 통계 카운트
        if (this.stats[result] !== undefined) this.stats[result]++;

        // 2. 미스 처리
        if (result === 'MISS') {
            console.log(`[PlayState] MISS - 콤보 초기화 (${this.combo} -> 0)`);
            this.combo = 0;
            this.lastComboBurst = 0; // [수정] 콤보 버스트 기록도 초기화
            this.life -= this.hpSettings.drain; // [수정] 차트별 데미지
        } 
        // 3. 히트 처리
        else {
            this.combo++;
            if (this.combo > this.maxCombo) this.maxCombo = this.combo;
            
            // [신규] 콤보 버스터 체크
            this._checkComboBurst();

            // 회복 (차트별 설정 사용)
            let heal = 0;
            if (result === 'PERFECT') heal = this.hpSettings.regen;
            else if (result === 'GREAT') heal = this.hpSettings.regen * 0.5;
            this.life += heal;
        }

        // 체력 한계 보정 (차트별 최대값 사용)
        this.life = Math.min(this.hpSettings.max, Math.max(0, this.life));
        if (this.life <= 0) this.isFailed = true;

        // 4. 점수 계산 (콤보 보너스 포함)
        let baseScore = 0;
        if (result === 'PERFECT') baseScore = 100;
        else if (result === 'GREAT') baseScore = 80;
        else if (result === 'GOOD') baseScore = 50;

        const bonus = Math.min(this.combo, 10);
        this.score += baseScore + bonus;
    },
    
    // 콤보 버스트 체크 및 이벤트 발생
    _checkComboBurst() {
        // 1. 명시적 마일스톤 체크 (현재 콤보와 정확히 일치하고, 아직 달성하지 않은 것만)
        for (const milestone of this.comboBurstMilestones) {
            // 현재 콤보가 마일스톤과 일치하고, 이번 구간에서 아직 달성하지 않은 경우
            if (this.combo === milestone && this.lastComboBurst < milestone) {
                console.log(`[PlayState] 🎉 콤보 버스트 ${milestone}콤보!`);
                this.lastComboBurst = milestone;
                this._triggerComboBurst(milestone);
                return;
            }
        }
        
        // 2. 마지막 마일스톤 초과 시 증가량 체크 (순환 방식)
        if (this.comboBurstMilestones.length > 0 && this.comboBurstIncrement > 0) {
            const lastMilestone = this.comboBurstMilestones[this.comboBurstMilestones.length - 1];
            
            // 마지막 마일스톤을 넘었는지 확인
            if (this.combo > lastMilestone) {
                // 다음 목표 계산 (이전 달성 + 증가량)
                const nextTarget = this.lastComboBurst + this.comboBurstIncrement;
                
                if (this.combo >= nextTarget) {
                    // 순환 방식: 처음부터 순환 (600->50, 800->100, 1000->200, 1200->400, 1400->50...)
                    const burstCount = Math.floor((nextTarget - lastMilestone) / this.comboBurstIncrement) - 1;
                    const cycleIndex = burstCount % this.comboBurstMilestones.length;
                    const cycleMilestone = this.comboBurstMilestones[cycleIndex];
                    
                    console.log(`[PlayState] 🎉 확장 콤보 버스트 달성: ${this.combo}콤보! (목표: ${nextTarget}, 순환: ${cycleMilestone})`);
                    this.lastComboBurst = nextTarget;
                    this._triggerComboBurst(cycleMilestone); // 순환 마일스톤 음성 재생
                    return;
                }
            }
        }
        // 3. 배수 방식 (comboBurstIncrement가 0이면 곱셈 사용)
        else if (this.comboBurstMilestones.length > 0 && this.comboBurstMultiplier > 1) {
            const lastMilestone = this.comboBurstMilestones[this.comboBurstMilestones.length - 1];
            
            if (this.combo > lastMilestone) {
                const nextTarget = Math.floor(this.lastComboBurst * this.comboBurstMultiplier);
                
                if (this.combo >= nextTarget) {
                    console.log(`[PlayState] 🎉 확장 콤보 버스트 달성: ${this.combo}콤보! (목표: ${nextTarget}, ×${this.comboBurstMultiplier})`);
                    this.lastComboBurst = this.combo;
                    this._triggerComboBurst(lastMilestone);
                }
            }
        }
    },
    
    // 콤보 버스트 이벤트 트리거 (외부에서 구독 가능)
    _triggerComboBurst(milestone) {
        // 커스텀 이벤트 발생 (GameEngine에서 수신)
        const event = new CustomEvent('comboBurst', { detail: { combo: milestone } });
        window.dispatchEvent(event);
    }
};