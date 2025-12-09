/**
 * 📄 js/audioManager.js
 * * BGM, SFX 등 모든 오디오를 관리합니다.
 * * (참고: 브라우저 정책 상, 사용자의 첫 상호작용(클릭 등)이
 * * 있기 전에는 오디오 자동 재생이 막힐 수 있습니다.)
 */

class AudioManager {
    constructor() {
        this.sounds = {}; // 로드된 오디오 객체(HTMLAudioElement)를 저장
        this.isMuted = false;
        this.currentBGM = null; // 현재 재생 중인 BGM

        // 볼륨 및 개별 활성화 상태
        this.bgmVolume = 1.0; // 0.0 ~ 1.0
        this.sfxVolume = 1.0; // 0.0 ~ 1.0
        this.bgmEnabled = true;
        this.sfxEnabled = true;
        // 기본 재생할 BGM 키 (간단하게 모든 스테이지에 동일 BGM을 쓸 때 사용)
        this.defaultBGM = 'stage1BGM';

        // Autoplay/unlock state
        this._unlocked = false; // set true after a real user gesture unlocks audio
        this._preloaded = new Set();

        // Saved desired BGM volume when user mutes via toggle (so we can restore)
        this._bgmSavedVolume = this.bgmVolume;
        // --- 기획서 6번: 리소스 파일 경로 미리 명시 ---
        // (Assets/Sound/readme.md 에 명시할 이름과 동일해야 함)
        this.soundPaths = {
            // BGM (배경 음악)
            'mainBGM': 'Assets/Sound/bgm_main.mp3',
            'stage1BGM': 'Assets/sound/bgm/stage1.mp3',
            'stage2BGM': 'Assets/Sound/bgm_stage2.mp3',
            'stage3BGM': 'Assets/Sound/bgm_stage3.mp3',
            'stage4BGM': 'Assets/Sound/bgm_stage4.mp3',
            'stage5BGM': 'Assets/Sound/bgm_stage5.mp3',

            // SFX (효과음)
            'jump': 'Assets/sound/sfx/jump.mp3',
            'hit': 'Assets/sound/sfx/hit.mp3',
            'spring': 'Assets/sound/sfx/spring.mp3',
        };

        // (실제로는 게임 시작 시 필요한 사운드만 미리 로드하는 
        //  preload() 같은 함수를 만들어 gameController가 호출해줘야 합니다)
    }

    /**
     * @description 특정 사운드를 로드합니다. (실제 사용 시점에 호출)
     * @param {string} name - soundPaths에 정의된 키 이름 (예: 'mainBGM')
     */
    load(name) {
        if (!this.soundPaths[name]) {
            console.warn(`[Audio] '${name}' 사운드 경로가 정의되지 않았습니다.`);
            return;
        }
        if (this.sounds[name]) {
            return this.sounds[name]; // 이미 로드됨
        }

        const audio = new Audio(this.soundPaths[name]);
        
        // (기획서 요구사항) 파일이 없을 경우를 대비한 에러 핸들링
        audio.addEventListener('error', () => {
            console.warn(`[Audio] '${name}' 파일(${this.soundPaths[name]})을 로드할 수 없습니다.`);
        });
        
        this.sounds[name] = audio;
        return audio;
    }

    /**
     * @description 효과음(SFX)을 재생합니다. (짧게 한 번 재생)
     * @param {string} name - 사운드 이름
     */
    playSFX(name) {
        if (this.isMuted || !this.sfxEnabled) return;

        let sound = this.sounds[name];
        if (!sound) {
            sound = this.load(name); // 로드되지 않았다면 즉시 로드
            if (!sound) {
                console.warn(`[Audio] SFX '${name}' load failed`);
                return;
            }
        }

        // 재생 중인 효과음을 다시 재생하기 위해 (예: 총알 소리 연사)
        sound.currentTime = 0;
        try {
            sound.volume = this.sfxVolume;
        } catch (e) {}
        sound.play().then(() => {
            console.log(`[Audio] SFX '${name}' played`);
        }).catch(e => {
            console.warn(`[Audio] SFX '${name}' 재생 실패: ${e.message}`);
        });
    }

    /**
     * @description 배경음악(BGM)을 재생합니다. (루프)
     * @param {string} name - 사운드 이름
     */
    playBGM(name) {
        if (this.isMuted || !this.bgmEnabled) return;

        // If no name provided, use defaultBGM
        if (!name) name = this.defaultBGM;

        // 1. 현재 재생 중인 BGM이 있다면 정지
        if (this.currentBGM && this.currentBGM.name === name) {
            // 이미 로드된 동일 BGM이 있지만 일시정지 상태라면 재생을 시도
            try {
                if (this.currentBGM.audio && this.currentBGM.audio.paused) {
                    this.currentBGM.audio.play().catch(e => console.warn('[Audio] resume failed', e));
                }
            } catch (e) {}
            return; // 이미 재생 중이거나 재개 시도 완료
        }
        this.stopBGM();

        // 2. 새 BGM 로드 및 재생
        let sound = this.sounds[name];
        if (!sound) {
            sound = this.load(name);
            if (!sound) return;
        }

        sound.loop = true; // BGM은 무한 반복
        try {
            sound.volume = this.bgmVolume;
        } catch (e) {}
        sound.play().then(() => {
            this.currentBGM = { name: name, audio: sound };
            this._unlocked = true;
        }).catch(e => {
            // (브라우저 정책) 사용자가 클릭하기 전엔 재생이 실패할 수 있음
            console.warn(`[Audio] BGM 자동 재생 실패: ${e.message}`);
            // Attach a one-time gesture listener so the first real user gesture will unlock audio
            this.tryUnlockOnFirstGesture();
        });
    }

    /**
     * @description Preload a list of sounds (recommended to call during loading screen)
     * @param {Array<string>} names - keys from soundPaths
     */
    preload(names = []) {
        names.forEach(name => {
            if (!this.soundPaths[name]) return;
            if (this.sounds[name]) return;
            try {
                const a = new Audio(this.soundPaths[name]);
                a.preload = 'auto';
                // set muted initially to avoid accidental autoplay sound during preload
                a.muted = true;
                // start loading
                a.load();
                // once loaded, unmute so later play uses proper volume
                a.addEventListener('canplaythrough', () => { try { a.muted = false; } catch (e) {} });
                this.sounds[name] = a;
                this._preloaded.add(name);
            } catch (e) { console.warn('[Audio] preload failed', e); }
        });
    }

    /**
     * @description Try to mark audio as unlocked on the first real user gesture.
     * Adds a one-time listener for common gesture events and attempts to play a tiny silent buffer
     * or resume the AudioContext so subsequent .play() calls succeed.
     */
    tryUnlockOnFirstGesture() {
        if (this._unlocked) return;
        const unlock = async () => {
            try {
                // Try Web Audio API resume if available
                if (window && (window.AudioContext || window.webkitAudioContext)) {
                    try {
                        const Ctx = window.AudioContext || window.webkitAudioContext;
                        const ctx = new Ctx();
                        if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
                            await ctx.resume();
                        }
                        try { ctx.close(); } catch (e) {}
                    } catch (e) { /* ignore */ }
                }

                // If we have any preloaded or known small audio, play/pause it briefly on gesture
                const candidate = this.sounds['jump'] || this.sounds['land'] || Object.values(this.sounds)[0];
                if (candidate) {
                    try {
                        candidate.muted = true;
                        await candidate.play();
                        candidate.pause();
                        candidate.muted = false;
                        this._unlocked = true;
                    } catch (e) {
                        // still may fail if not a user gesture, ignore
                    }
                } else {
                    // no audio objects available, still mark unlocked because user gestured
                    this._unlocked = true;
                }
            } catch (e) {
                console.warn('[Audio] unlock attempt failed', e);
            } finally {
                // remove listeners
                document.removeEventListener('pointerdown', unlock);
                document.removeEventListener('keydown', unlock);
                document.removeEventListener('touchstart', unlock);
            }
        };

        document.addEventListener('pointerdown', unlock, { once: true, passive: true });
        document.addEventListener('keydown', unlock, { once: true, passive: true });
        document.addEventListener('touchstart', unlock, { once: true, passive: true });
    }

    /**
     * @description Attempt to unlock audio immediately. Useful when called inside
     * a user gesture handler (e.g., start button click) so playback won't be blocked.
     * Returns a promise that resolves when unlock attempt completes.
     */
    async unlockNow() {
        if (this._unlocked) return true;
        try {
            // Try Web Audio API resume if available
            if (window && (window.AudioContext || window.webkitAudioContext)) {
                try {
                    const Ctx = window.AudioContext || window.webkitAudioContext;
                    const ctx = new Ctx();
                    if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
                        await ctx.resume();
                    }
                    try { ctx.close(); } catch (e) {}
                } catch (e) { /* ignore */ }
            }

            // Try to play/pause a small candidate audio to unlock native playback
            const candidate = this.sounds['jump'] || this.sounds['land'] || Object.values(this.sounds)[0];
            if (candidate) {
                try {
                    candidate.muted = true;
                    await candidate.play();
                    candidate.pause();
                    candidate.muted = false;
                    this._unlocked = true;
                    return true;
                } catch (e) {
                    // failed, but still mark unlocked because user gesture may be enough
                    console.warn('[Audio] unlockNow play/pause failed', e);
                }
            }

            // If no candidate or play failed, still mark unlocked to allow .play() attempts
            this._unlocked = true;
            return true;
        } catch (e) {
            console.warn('[Audio] unlockNow failed', e);
            return false;
        }
    }

    /**
     * @description 현재 재생 중인 BGM을 정지합니다.
     */
    stopBGM() {
        if (this.currentBGM && this.currentBGM.audio) {
            this.currentBGM.audio.pause();
            this.currentBGM.audio.currentTime = 0;
            this.currentBGM = null;
        }
    }

    /**
     * @description 모든 사운드를 일시정지합니다. (게임 일시정지 시)
     */
    pauseAll() {
        Object.values(this.sounds).forEach(sound => {
            if (!sound.paused) {
                sound.pause();
            }
        });
    }

    /**
     * @description 일시정지된 사운드를 다시 재생합니다. (BGM만)
     */
    resumeAll() {
        if (this.isMuted) return;
        
        // BGM만 이어서 재생
        if (this.currentBGM && this.currentBGM.audio.paused) {
            this.currentBGM.audio.play().catch(e => console.warn(e));
        }
    }

    // --- 볼륨 및 토글 컨트롤러 ---
    setBGMVolume(v) {
        this.bgmVolume = Math.max(0, Math.min(1, v));
        // Update saved desired volume. If BGM is enabled, apply immediately; if disabled (muted via toggle), keep actual audio volume at 0
        this._bgmSavedVolume = this.bgmVolume;
        if (this.bgmEnabled && this.currentBGM && this.currentBGM.audio) {
            try { this.currentBGM.audio.volume = this.bgmVolume; } catch (e) {}
        }
    }

    setSFXVolume(v) {
        this.sfxVolume = Math.max(0, Math.min(1, v));
    }

    toggleBGM(enabled) {
        this.bgmEnabled = !!enabled;
        if (!this.bgmEnabled) {
            // Don't stop playback; instead mute the audio by setting volume to 0 so it can resume instantly later
            if (this.currentBGM && this.currentBGM.audio) {
                try {
                    // save current (desired) volume
                    this._bgmSavedVolume = typeof this.bgmVolume === 'number' ? this.bgmVolume : (this._bgmSavedVolume || 1.0);
                    this.currentBGM.audio.volume = 0;
                } catch (e) { console.warn('[Audio] mute failed', e); }
            }
        } else {
            // enable -> restore saved volume and resume or start playback
            if (this.currentBGM && this.currentBGM.audio) {
                try {
                    const restoreVol = (typeof this._bgmSavedVolume === 'number') ? this._bgmSavedVolume : this.bgmVolume;
                    this.currentBGM.audio.volume = restoreVol;
                    if (this.currentBGM.audio.paused) {
                        this.currentBGM.audio.play().catch(e => console.warn('[Audio] resume failed', e));
                    }
                } catch (e) { console.warn('[Audio] restore failed', e); }
            } else {
                // No currentBGM -> start default
                const target = this.defaultBGM;
                try { this.playBGM(target); } catch (e) { console.warn('[Audio] toggleBGM enable failed', e); }
            }
        }
    }

    toggleSFX(enabled) {
        this.sfxEnabled = !!enabled;
    }

    // Getters for UI
    getBGMVolume() { return this.bgmVolume; }
    getSFXVolume() { return this.sfxVolume; }
    isBGMEnabled() { return this.bgmEnabled; }
    isSFXEnabled() { return this.sfxEnabled; }
}
export const audioManager = new AudioManager();