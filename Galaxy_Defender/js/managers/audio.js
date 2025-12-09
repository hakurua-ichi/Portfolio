/**
 * managers/audio.js
 * * 개발 순서 6단계: 오디오 매니저 생성
 * * 게임의 모든 사운드(BGM, 효과음)를 로드하고 재생, 정지합니다.
 * * 기획서: "브라우저 정책 우회" 로직을 포함합니다.
 */

class AudioManager {
    constructor() {
        // AudioContext는 사용자 상호작용(클릭 등) 없이는 자동 재생이 금지됨.
        this.audioContext = null;
        this.audioContextUnlocked = false; // 정책 우회(잠금 해제) 여부
        
        // 기획서에 명시된 모든 사운드 파일 (경로는 gameState.js에서 참조)
        this.sounds = {};
        this.loadSounds();

        // 현재 재생 중인 BGM 추적 (중복 재생 방지 및 교체)
        this.currentBGM = null;
        
        // 볼륨 설정 (0.0 ~ 1.0)
        this.bgmVolume = 0.5;
        this.sfxVolume = 0.5;
    }

    /**
     * gameState.js의 ASSET_PATHS를 기반으로 모든 사운드를 로드
     */
    loadSounds() {
        // 볼륨 값 유효성 검사 (NaN 방지)
        if (isNaN(this.bgmVolume) || !isFinite(this.bgmVolume)) {
            console.warn('[AudioManager] bgmVolume이 유효하지 않음, 기본값 0.5로 설정');
            this.bgmVolume = 0.5;
        }
        if (isNaN(this.sfxVolume) || !isFinite(this.sfxVolume)) {
            console.warn('[AudioManager] sfxVolume이 유효하지 않음, 기본값 0.5로 설정');
            this.sfxVolume = 0.5;
        }
        
        // ASSET_PATHS에서 'Sound' 키를 가진 경로만 필터링
        const soundPaths = ASSET_PATHS; // (gameState.js에 정의됨)

        // 기획서의 사운드 목록
        const soundKeys = [
            'stage1BGM', 'stage2BGM', 'stage3BGM', 'stage4BGM', 'stage5BGM',
            'stage1BossBGM', 'stage2BossBGM', 'stage3BossBGM', 'stage4BossBGM', 'stage5BossBGM',
            'playerShoot', 'gameClear', 'stageClear'
        ];

        soundKeys.forEach(key => {
            // (참고) 기획서에 'stage2BGM' 등이 ASSET_PATHS에 아직 없지만, 
            // 일단 키는 생성하고 경로는 임시로 stage1을 쓰거나 비워둡니다.
            const path = soundPaths[key] || `Assets/Sound/${key}.mp3`;
            this.sounds[key] = new Audio(path);
            
            // BGM 계열은 loop 설정 및 볼륨 적용
            if (key.includes('BGM')) {
                this.sounds[key].loop = true;
                this.sounds[key].volume = this.bgmVolume;
            } else {
                this.sounds[key].volume = this.sfxVolume;
            }

            // 기획서: "파일이 없어도 경로 설정을 하라는 뜻임."
            // 로드 오류 시 콘솔에 알림 (Readme.md 명시 대신)
            this.sounds[key].onerror = () => {
                console.warn(`[AudioManager] 사운드 파일을 로드할 수 없습니다: ${path}. (기획서에 따라 경로는 설정됨)`);
            };
        });
        
        // 기획서: 플레이어 탄환 효과음은 여러 번 동시에 재생되어야 함 (겹치기)
        // -> play 메서드에서 처리
        
        // DOM 요소와 연결
        this.bindVolumeControls();
    }
    
    /**
     * 볼륨 컨트롤 DOM 요소와 연결
     */
    bindVolumeControls() {
        // DOM이 준비되지 않았을 수 있으므로 try-catch로 보호
        try {
            const bgmSlider = document.getElementById('bgm-volume');
            const sfxSlider = document.getElementById('sfx-volume');
            const bgmValue = document.getElementById('bgm-value');
            const sfxValue = document.getElementById('sfx-value');
            
            if (bgmSlider && bgmValue) {
                // 초기값 설정
                bgmSlider.value = Math.round(this.bgmVolume * 100);
                bgmValue.textContent = Math.round(this.bgmVolume * 100);
                
                bgmSlider.addEventListener('input', (e) => {
                    const value = parseInt(e.target.value) || 50; // 기본값 50
                    bgmValue.textContent = value;
                    this.setBGMVolume(value);
                });
            }
            
            if (sfxSlider && sfxValue) {
                // 초기값 설정
                sfxSlider.value = Math.round(this.sfxVolume * 100);
                sfxValue.textContent = Math.round(this.sfxVolume * 100);
                
                sfxSlider.addEventListener('input', (e) => {
                    const value = parseInt(e.target.value) || 50; // 기본값 50
                    sfxValue.textContent = value;
                    this.setSFXVolume(value);
                });
            }
        } catch (e) {
            console.warn('[AudioManager] 볼륨 컨트롤 바인딩 실패:', e);
        }
    }

    /**
     * [중요] 브라우저 오디오 정책 우회 (최초 클릭 시 호출)
     */
    initAudioContext() {
        if (this.audioContextUnlocked) return; // 이미 잠금 해제됨

        try {
            // AudioContext 생성 시도
            if (!this.audioContext) {
                window.AudioContext = window.AudioContext || window.webkitAudioContext;
                this.audioContext = new AudioContext();
            }

            // AudioContext가 'suspended' 상태일 수 있음 (자동 재생 방지됨)
            if (this.audioContext.state === 'suspended') {
                this.audioContext.resume();
            }
            
            this.audioContextUnlocked = true;
            console.log("오디오 컨텍스트가 활성화되었습니다.");
            
            // (필요 시) 여기서 무음의 오디오를 재생하여 잠금을 확실히 해제할 수 있음
            // const buffer = this.audioContext.createBuffer(1, 1, 22050);
            // const source = this.audioContext.createBufferSource();
            // source.buffer = buffer;
            // source.connect(this.audioContext.destination);
            // source.start(0);

        } catch (e) {
            console.error("오디오 컨텍스트를 활성화할 수 없습니다:", e);
        }
    }

    /**
     * 사운드 재생
     * @param {string} key - 재생할 사운드 키 (예: 'playerShoot')
     * @param {boolean} [isBGM=false] - BGM인지 여부 (BGM은 교체 로직)
     */
    play(key, isBGM = false) {
        // 정책 우회(init)가 안 됐으면 재생 시도 안 함
        if (!this.audioContextUnlocked) {
            console.warn(`[AudioManager] ${key} 재생 실패: 오디오 컨텍스트가 활성화되지 않았습니다. (사용자 클릭 필요)`);
            return;
        }

        const sound = this.sounds[key];
        if (!sound) {
            console.warn(`[AudioManager] '${key}' 라는 사운드를 찾을 수 없습니다.`);
            return;
        }

        if (isBGM) {
            // BGM 교체 로직
            if (this.currentBGM && this.currentBGM !== sound) {
                this.currentBGM.pause();
                this.currentBGM.currentTime = 0;
            }
            this.currentBGM = sound;
            sound.play().catch(e => console.error(`[AudioManager] BGM 재생 오류: ${e}`));
        } else {
            // 효과음 (SFX) 로직
            // 기획: 플레이어 탄환은 겹쳐서 재생
            if (key === 'playerShoot') {
                // 기존 소리를 복제(clone)하여 동시에 여러 개 재생
                const sfxClone = sound.cloneNode();
                sfxClone.play().catch(e => {}); // (오류는 무시)
            } else {
                // 일반 효과음 (끊고 다시 재생)
                sound.currentTime = 0;
                sound.play().catch(e => console.error(`[AudioManager] SFX 재생 오류: ${e}`));
            }
        }
    }

    /**
     * 사운드 정지
     * @param {string} key - 정지할 사운드 키
     */
    stop(key) {
        const sound = this.sounds[key];
        if (sound) {
            sound.pause();
            sound.currentTime = 0;
            if (this.currentBGM === sound) {
                this.currentBGM = null;
            }
        }
    }

    /**
     * 모든 사운드 정지 (예: 리셋 시)
     */
    stopAll() {
        for (const key in this.sounds) {
            this.stop(key);
        }
        this.currentBGM = null;
    }
    
    /**
     * BGM 볼륨 설정
     * @param {number} volume - 볼륨 (0 ~ 100)
     */
    setBGMVolume(volume) {
        // 유효성 검사
        if (typeof volume !== 'number' || isNaN(volume)) {
            console.warn('[AudioManager] 잘못된 볼륨 값:', volume);
            volume = 50; // 기본값
        }
        
        this.bgmVolume = Math.max(0, Math.min(100, volume)) / 100; // 0.0 ~ 1.0
        
        // 모든 BGM 사운드의 볼륨 업데이트
        for (const key in this.sounds) {
            if (key.includes('BGM')) {
                this.sounds[key].volume = this.bgmVolume;
            }
        }
    }
    
    /**
     * SFX 볼륨 설정
     * @param {number} volume - 볼륨 (0 ~ 100)
     */
    setSFXVolume(volume) {
        // 유효성 검사
        if (typeof volume !== 'number' || isNaN(volume)) {
            console.warn('[AudioManager] 잘못된 볼륨 값:', volume);
            volume = 50; // 기본값
        }
        
        this.sfxVolume = Math.max(0, Math.min(100, volume)) / 100; // 0.0 ~ 1.0
        
        // 모든 효과음의 볼륨 업데이트
        for (const key in this.sounds) {
            if (!key.includes('BGM')) {
                this.sounds[key].volume = this.sfxVolume;
            }
        }
    }
}