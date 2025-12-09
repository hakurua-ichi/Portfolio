/*
    [에디터 전용] AudioConductor
    
    이 파일은 차트 에디터(editor/)에서만 사용됩니다.
    게임 플레이용 AudioConductor는 src/core/AudioConductor.js를 사용합니다.
    
    [주요 차이점]
    - 볼륨 노드 없음 (에디터에서는 불필요)
    - 버퍼 캐싱 없음 (에디터는 단일 곡만 로드)
    - offsetSeconds 재생 지원 (구간 재생 기능)
*/
export class AudioConductor {
    constructor() {
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        this.source = null; 
        this.buffer = null; 
        this.startTime = 0;
        
        // 상태 관리
        this.isPlaying = false;
        this.pausedAt = 0; // 일시정지 시점 저장용
        
        // [설정] 오프셋 (초 단위)
        this.globalOffset = 0; 
    }

    async load(url) {
        try {
            console.log(`Audio Loading: ${url}`);
            const response = await fetch(url);
            const arrayBuffer = await response.arrayBuffer();
            this.buffer = await this.audioCtx.decodeAudioData(arrayBuffer);
            return true;
        } catch (error) {
            console.error("Audio Load Failed:", error);
            return false;
        }
    }

play(offsetSeconds = 0) {
        if (!this.buffer) return;
        if (this.audioCtx.state === 'suspended') this.audioCtx.resume();

        // 기존 소스 있으면 정지
        this.stop();

        this.source = this.audioCtx.createBufferSource();
        this.source.buffer = this.buffer;
        this.source.connect(this.audioCtx.destination);
        
        // offsetSeconds 부터 재생 시작
        this.source.start(0, offsetSeconds);
        
        // 기준 시간 = 현재시간 - 이미 재생된 시간
        this.startTime = this.audioCtx.currentTime - offsetSeconds;
        this.isPlaying = true;
    }

    stop() {
        if (this.source) {
            try { this.source.stop(); } catch(e) {}
            this.source = null;
        }
        this.isPlaying = false;
        this.pausedAt = 0;
    }

    // [신규] 일시정지
    pause() {
        if (this.isPlaying && this.audioCtx.state === 'running') {
            this.audioCtx.suspend(); // 오디오 컨텍스트 자체를 얼림
        }
    }

    // [신규] 재개
    resume() {
        if (this.isPlaying && this.audioCtx.state === 'suspended') {
            this.audioCtx.resume(); // 오디오 컨텍스트 녹임
        }
    }

    // [핵심] 현재 시간 반환 (오프셋 적용)
    getTime() {
        if (!this.isPlaying) return 0;
        
        // AudioContext가 일시정지(suspend)되면 currentTime도 멈춤
        // 따라서 별도의 pause 계산 없이 그냥 현재시간 쓰면 됨
        const rawTime = this.audioCtx.currentTime - this.startTime;
        
        return rawTime - this.globalOffset; // 오프셋 적용
    }
    
    setOffset(seconds) {
        this.globalOffset = seconds;
    }
}