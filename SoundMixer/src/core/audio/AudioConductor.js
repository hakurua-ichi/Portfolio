/*
    AudioConductor는 Web Audio API를 사용한 오디오 재생 관리 클래스입니다.
    오디오 파일 로드, 재생/일시정지/정지, 타이밍 계산, 볼륨 조절을 담당합니다.
    같은 곡을 재로드할 때 버퍼를 캐싱하여 메모리를 절약합니다 (30-50MB 절감).
    MusicCache를 통해 IndexedDB에 음악 파일을 캐싱하여 오프라인 플레이를 지원합니다.
*/
import { MusicCache } from '../managers/MusicCache.js';

export class AudioConductor {
    constructor() {
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        this.source = null; 
        this.buffer = null; 
        this.startTime = 0;
        this.pausedAt = 0; // 일시정지 시점
        this.isPlaying = false;
        this.wasPlayingBeforePause = false; // [신규] 일시정지 전 상태 저장
        this.globalOffset = 0; 
        
        // 볼륨 조절용 게인 노드
        this.gainNode = this.audioCtx.createGain();
        this.gainNode.connect(this.audioCtx.destination);
        this.volume = 1.0;
        
        // 입력 시간 보정을 위한 기준점
        // performance.now()와 audioCtx.currentTime의 차이를 계산
        this.timeOrigin = 0;
        
        // 버퍼 캐싱 (같은 곡 재로드 시 메모리 절약)
        this.cachedURL = null;
        
        // [신규] MusicCache 통합 (IndexedDB 캐싱)
        this.musicCache = new MusicCache(100); // 100MB 메모리 캐시
    }
    
    /**
     * [신규] MusicCache 초기화
     */
    async init() {
        await this.musicCache.init();
        console.log('[AudioConductor] ✅ MusicCache 초기화 완료');
    }

    // 오디오 파일 로드 (비동기)
    // 같은 URL이면 기존 버퍼 재사용 (30-50MB 메모리 절감)
    // MusicCache를 통해 IndexedDB에서 로드 (오프라인 플레이)
    async load(url) {
        // 이미 로드된 파일이면 재로드 안 함
        if (this.cachedURL === url && this.buffer) {
            console.log(`[Audio] Using cached buffer for ${url}`);
            return true;
        }
        
        try {
            let arrayBuffer;
            
            // [신규] MusicCache에서 먼저 조회
            const cached = await this.musicCache.get(url);
            if (cached) {
                console.log(`[Audio] 💾 캐시에서 로드: ${url}`);
                arrayBuffer = await cached.blob.arrayBuffer();
            } else {
                // 캐시 미스 → fetch → 캐시 저장
                console.log(`[Audio] 🌐 네트워크 fetch: ${url}`);
                const response = await fetch(url);
                const blob = await response.blob();
                this.musicCache.set(url, blob);
                arrayBuffer = await blob.arrayBuffer();
            }
            
            this.buffer = await this.audioCtx.decodeAudioData(arrayBuffer);
            this.cachedURL = url;
            console.log(`[Audio] Loaded buffer for ${url}`);
            return true;
        } catch (error) {
            console.error("Audio Load Failed:", error);
            this.cachedURL = null;
            return false;
        }
    }

    // 오디오 재생 시작
    // delay: 지연 시간 (초, 기본값 0)
    play(delay = 0) {
        if (!this.buffer) return;
        
        // AudioContext가 정지 상태면 재개
        if (this.audioCtx.state === 'suspended') {
            this.audioCtx.resume();
        }

        // 기존 소스 정리
        this.stop();

        // 새 소스 생성 및 연결
        this.source = this.audioCtx.createBufferSource();
        this.source.buffer = this.buffer;
        this.source.connect(this.gainNode); // 볼륨 노드 경유
        
        // 재생 스케줄링
        const scheduledTime = this.audioCtx.currentTime + delay;
        this.source.start(scheduledTime);
        
        // 재생 상태 업데이트
        this.startTime = scheduledTime;
        this.pausedAt = 0;
        this.isPlaying = true;
        
        // 타이밍 기준점 계산 (입력 이벤트 타임스탬프 변환용)
        this.timeOrigin = this.audioCtx.currentTime - (performance.now() / 1000);
    }

    // 오디오 재생 정지
    // buffer는 캐싱을 위해 유지 (cachedURL이 있으면 다음 로드 시 재사용)
    stop() {
        if (this.source) {
            try { 
                this.source.stop(); 
            } catch(e) {
                // 이미 정지된 경우 무시
            }
            this.source = null;
        }
        this.isPlaying = false;
        
        // [중요] AudioContext가 suspended 상태면 resume (2번째 플레이 시 음악 재생 보장)
        if (this.audioCtx && this.audioCtx.state === 'suspended') {
            this.audioCtx.resume().catch(err => {
                console.warn('[AudioConductor] AudioContext resume 실패 (stop):', err);
            });
        }
        
        // [신규] 일시정지 관련 상태 초기화 (다음 플레이를 위해)
        this.wasPlayingBeforePause = false;
        this.pausedAt = 0;
    }

    // 오디오 일시정지
    async pause() {
        try {
            if (this.isPlaying && this.audioCtx && this.audioCtx.state === 'running') {
                this.pausedAt = this.getTime(); // 현재 재생 위치 저장
                this.wasPlayingBeforePause = this.isPlaying; // [중요] 일시정지 전 상태 저장
                this.isPlaying = false; // [핵심] 일시정지 중에는 isPlaying = false
                await this.audioCtx.suspend();
            }
        } catch (error) {
            console.error('[AudioConductor] pause 실패:', error);
            throw error;
        }
    }

    // 오디오 재개 (일시정지 복구)
    async resume() {
        try {
            if (this.wasPlayingBeforePause && this.audioCtx && this.audioCtx.state === 'suspended') {
                await this.audioCtx.resume();
                
                // 일시정지 동안 경과된 시간 계산
                const pauseDuration = this.audioCtx.currentTime - this.startTime - this.pausedAt - this.globalOffset;
                this.startTime += pauseDuration; // 재생 시작 시간 보정
                
                this.isPlaying = true; // [핵심] 재개 후 isPlaying 복원
                this.wasPlayingBeforePause = false; // 플래그 초기화
            }
        } catch (error) {
            console.error('[AudioConductor] resume 실패:', error);
            throw error;
        }
    }

    // 현재 오디오 재생 위치 (초)
    getTime() {
        if (!this.isPlaying) return 0;
        return this.audioCtx.currentTime - this.startTime - this.globalOffset;
    }
    
    // 입력 이벤트 타임스탬프를 오디오 시간으로 변환
    // 판정 시스템에서 입력과 노트 타이밍 비교에 사용
    getAudioTimeFromTimestamp(timestamp) {
        if (!this.isPlaying) return 0;
        
        // 밀리초 → 초 변환 후 timeOrigin 적용
        const audioCtxTime = (timestamp / 1000) + this.timeOrigin;
        const audioTime = audioCtxTime - this.startTime - this.globalOffset;
        
        // [수정] 현재 시간과의 차이가 1초 이상이면 비정상 (탭 전환 등)
        const currentAudioTime = this.getTime();
        const timeDiff = Math.abs(audioTime - currentAudioTime);
        
        if (timeDiff > 1.0) {
            // 비정상적인 타임스탬프는 현재 시간 사용 (안전장치)
            return currentAudioTime;
        }
        
        return audioTime;
    }
    
    // 오디오 오프셋 설정 (레이턴시 보정)
    setOffset(seconds) { 
        this.globalOffset = seconds; 
    }

    // 볼륨 설정 (0.0 ~ 1.0)
    setVolume(val) {
        this.volume = Math.max(0, Math.min(1, val));
        if (this.gainNode) {
            this.gainNode.gain.value = this.volume;
        }
    }
}