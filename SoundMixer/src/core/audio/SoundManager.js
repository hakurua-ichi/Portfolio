import { GlobalStore } from '../../data/GlobalStore.js';

export class SoundManager {
    constructor(audioCtx) {
        this.audioCtx = audioCtx;
        this.buffers = {}; 
        
        // [신규] 볼륨 상태
        this.sfxVolume = 0.7;   // 효과음 기본값
        this.voiceVolume = 1.0; // 목소리 기본값
    }

    async loadSounds(skinName) {
        // [신규] 기존 버퍼 정리 (메모리 누수 방지)
        this._clearBuffers();
        
        const sounds = [
            { key: 'hit', src: `assets/skins/${skinName}/hit.mp3`, fallback: `assets/skins/classic/hit.mp3` },
            { key: 'tick', src: `assets/gameSound/tickSound.mp3`, fallback: null },
            // [신규] 콤보 버스트 음성 (100, 300, 500, 1000)
            { key: 'combo_100', src: `assets/gameSound/combo_100.mp3`, fallback: null },
            { key: 'combo_300', src: `assets/gameSound/combo_300.mp3`, fallback: null },
            { key: 'combo_500', src: `assets/gameSound/combo_500.mp3`, fallback: null },
            { key: 'combo_1000', src: `assets/gameSound/combo_1000.mp3`, fallback: null },
            // [제거] 등급별 음성 (rank_*) - VoiceManager로 대체됨
        ];

        const promises = sounds.map(async (s) => {
            try {
                const res = await fetch(s.src);
                if (res.ok) {
                    const buf = await res.arrayBuffer();
                    this.buffers[s.key] = await this.audioCtx.decodeAudioData(buf);
                    if (GlobalStore.constants.DEBUG.LOG_SOUND) {
                        console.log(`[Sound] Loaded ${s.key} from ${s.src}`);
                    }
                } else if (s.fallback) {
                    // 폴백 시도
                    if (GlobalStore.constants.DEBUG.LOG_SOUND) {
                        console.warn(`[Sound] ${s.src} not found, trying fallback`);
                    }
                    const fallbackRes = await fetch(s.fallback);
                    if (fallbackRes.ok) {
                        const buf = await fallbackRes.arrayBuffer();
                        this.buffers[s.key] = await this.audioCtx.decodeAudioData(buf);
                        if (GlobalStore.constants.DEBUG.LOG_SOUND) {
                            console.log(`[Sound] Loaded ${s.key} from fallback`);
                        }
                    } else {
                        throw new Error('Fallback also failed');
                    }
                } else {
                    // fallback도 없으면 beep 생성
                    if (GlobalStore.constants.DEBUG.LOG_SOUND) {
                        console.warn(`[Sound] No file for ${s.key}, generating beep`);
                    }
                    this.buffers[s.key] = this._generateBeep(s.key === 'tick');
                }
            } catch (e) {
                // 에러 시 beep 생성
                if (GlobalStore.constants.DEBUG.LOG_SOUND) {
                    console.warn(`[Sound] Error loading ${s.key}:`, e.message, '- using generated beep');
                }
                this.buffers[s.key] = this._generateBeep(s.key === 'tick');
            }
        });
        await Promise.all(promises);
        if (GlobalStore.constants.DEBUG.LOG_SOUND) {
            console.log(`[Sound] All sounds loaded (${Object.keys(this.buffers).length} buffers)`);
        }
    }
    
    // [신규] 비프음 생성 (에디터와 동일)
    _generateBeep(isTick = false) {
        const sampleRate = this.audioCtx.sampleRate;
        const duration = isTick ? 0.03 : 0.05; // tick은 30ms, hit는 50ms
        const buffer = this.audioCtx.createBuffer(1, sampleRate * duration, sampleRate);
        const data = buffer.getChannelData(0);
        
        for (let i = 0; i < buffer.length; i++) {
            const t = i / sampleRate;
            // tick은 더 높은 주파수 (1500Hz→1000Hz), hit는 1000Hz→100Hz
            const startFreq = isTick ? 1500 : 1000;
            const endFreq = isTick ? 1000 : 100;
            const freq = startFreq - ((startFreq - endFreq) * t / duration);
            const envelope = Math.max(0, 1 - t / duration);
            data[i] = Math.sin(2 * Math.PI * freq * t) * envelope * (isTick ? 0.2 : 0.3);
        }
        
        return buffer;
    }

    // [수정] 볼륨 설정 메서드
    setSfxVolume(val) { this.sfxVolume = Math.max(0, Math.min(1, val)); }
    setVoiceVolume(val) { this.voiceVolume = Math.max(0, Math.min(1, val)); }

    play(key, volumeOverride = null) {
        if (!this.buffers[key]) return;
        if (this.audioCtx.state === 'suspended') this.audioCtx.resume();

        const source = this.audioCtx.createBufferSource();
        source.buffer = this.buffers[key];
        const gainNode = this.audioCtx.createGain();
        
        // [수정] SFX 볼륨 적용 (오버라이드 가능)
        const volume = volumeOverride !== null ? volumeOverride : this.sfxVolume;
        gainNode.gain.value = volume;
        
        source.connect(gainNode);
        gainNode.connect(this.audioCtx.destination);
        source.start(0);
    }

    // [신규] 히트 사운드 전용 (호출 빈도 높으므로 최적화)
    playHit() {
        this.play('hit');
    }
    
    // [신규] tick 사운드 전용
    playTick() {
        this.play('tick');
    }
    
    // [신규] 버퍼 정리 (메모리 해제)
    _clearBuffers() {
        // AudioBuffer는 브라우저가 관리하지만 참조를 끊어줘야 GC 가능
        Object.keys(this.buffers).forEach(key => {
            delete this.buffers[key];
        });
        this.buffers = {};
    }
    
    // [신규] 콤보 버스트 음성 재생
    playComboBurstVoice(combo) {
        const key = `combo_${combo}`;
        if (this.buffers[key]) {
            // voiceVolume 사용
            if (this.audioCtx.state === 'suspended') this.audioCtx.resume();

            const source = this.audioCtx.createBufferSource();
            source.buffer = this.buffers[key];
            const gainNode = this.audioCtx.createGain();
            
            gainNode.gain.value = this.voiceVolume;
            
            source.connect(gainNode);
            gainNode.connect(this.audioCtx.destination);
            source.start(0);
            
            if (GlobalStore.constants.DEBUG.LOG_SOUND) {
                console.log(`[음성] 콤보 버스트 ${combo} 재생`);
            }
        } else {
            if (GlobalStore.constants.DEBUG.LOG_SOUND) {
                console.log(`[음성] 콤보 버스트 ${combo} 음성 없음 (무음 처리)`);
            }
        }
    }
    
    // [제거] playResultVoice() - VoiceManager.playResult()로 대체됨
}