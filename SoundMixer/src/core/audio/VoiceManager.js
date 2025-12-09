/**
 * VoiceManager - 유니티짱 음성 재생 관리
 * voice_mapping.json 기반으로 상황별 음성 재생
 * 립싱크: Web Audio API AnalyserNode로 실시간 음량 분석
 * 캐싱: VoiceCache를 통한 IndexedDB + 메모리 캐싱
 */
import { PlayState } from '../../data/PlayState.js';
import { VoiceCache } from '../managers/VoiceCache.js';

export class VoiceManager {
    constructor() {
        this.voiceMapping = null;
        this.voiceBasePath = 'assets/gameSound/unitychan_voicepack_append_01/';
        this.mappingPath = this.voiceBasePath + 'voice_mapping.json';
        
        // [수정] 립싱크 전용 단일 Audio 요소 (풀 방식 제거)
        this.voiceAudio = new Audio();
        
        // 볼륨 설정
        this.volume = 0.7;
        
        // 로드 상태
        this.isLoaded = false;
        
        // [신규] 음성 파일 캐시 (메모리 50MB + IndexedDB)
        this.voiceCache = new VoiceCache(50, 'SoundMixerCache');
        
        // [신규] 립싱크 시스템
        this.audioContext = null;
        this.analyser = null;
        this.dataArray = null;
        this.audioSource = null; // MediaElementSource (한 번만 생성)
        this.lipSyncCallback = null; // CharacterRenderer가 등록
        this.lipSyncActive = false;
        this.lipSyncAnimationFrame = null;
    }

    /**
     * 초기화 (매핑 파일 로드 + 립싱크 준비 + 캐시 초기화 + 음성 파일 캐싱)
     */
    async init() {
        try {
            console.log('[VoiceManager] 음성 매핑 로드 시도:', this.mappingPath);
            const response = await fetch(this.mappingPath);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            this.voiceMapping = await response.json();
            this.isLoaded = true;
            console.log('[VoiceManager] ✅ 음성 매핑 로드 성공');
            
            // [신규] VoiceCache 초기화
            await this.voiceCache.init();
            console.log('[VoiceManager] ✅ 음성 캐시 초기화 완료');
            
            // [신규] 모든 음성 파일 IndexedDB에 캐싱 (로딩 중 처리)
            await this._cacheAllVoices();
            
            // [신규] Web Audio API 초기화 (립싱크용)
            this._initLipSync();
            
            // [신규] 콤보 마일스톤 동기화 (PlayState에 전달)
            this._syncComboMilestones();
        } catch (error) {
            console.error('[VoiceManager] ❌ 매핑 로드 실패:', error);
            this.isLoaded = false;
        }
    }

    /**
     * [신규] 콤보 마일스톤을 PlayState에 동기화
     */
    _syncComboMilestones() {
        if (!this.voiceMapping || !this.voiceMapping.game_mapping.combo) {
            console.warn('[VoiceManager] ⚠️ 콤보 매핑이 없습니다');
            return;
        }
        
        const milestones = Object.keys(this.voiceMapping.game_mapping.combo)
            .map(key => parseInt(key))
            .sort((a, b) => a - b);
        
        // 증가 방식 설정 (JSON에서 읽거나 기본값)
        const increment = this.voiceMapping.combo_burst_increment || 0;
        const multiplier = this.voiceMapping.combo_burst_multiplier || 1.5;
        
        // PlayState에 동기화
        PlayState.comboBurstMilestones = milestones;
        PlayState.comboBurstIncrement = increment;
        PlayState.comboBurstMultiplier = multiplier;
        console.log('[VoiceManager] ✅ 콤보 마일스톤 동기화:', milestones);
    }

    /**
     * [신규] 립싱크 시스템 초기화
     */
    _initLipSync() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 256;
            this.analyser.smoothingTimeConstant = 0.6; // 부드러운 입 움직임
            
            const bufferLength = this.analyser.frequencyBinCount;
            this.dataArray = new Uint8Array(bufferLength);
            
            // [수정] Audio 요소를 한 번만 연결 (MediaElementSource는 재생성 불가)
            this.audioSource = this.audioContext.createMediaElementSource(this.voiceAudio);
            this.audioSource.connect(this.analyser);
            this.analyser.connect(this.audioContext.destination);
            
            console.log('[VoiceManager] 🎤 립싱크 시스템 초기화 완료');
        } catch (error) {
            console.warn('[VoiceManager] ⚠️ 립싱크 초기화 실패 (일부 브라우저 미지원):', error);
        }
    }

    /**
     * [신규] 립싱크 콜백 등록 (CharacterRenderer에서 호출)
     */
    setLipSyncCallback(callback) {
        this.lipSyncCallback = callback;
    }
    
    /**
     * [신규] 모든 음성 파일을 IndexedDB에 캐싱 (init에서 호출)
     * 이미 캐시에 있으면 스킵, 없으면 다운로드 후 저장
     */
    async _cacheAllVoices() {
        try {
            // 모든 음성 ID 추출
            const allVoiceIds = new Set();
            const mapping = this.voiceMapping.game_mapping;
            
            // 판정 음성
            Object.values(mapping.judgment).forEach(ids => ids.forEach(id => allVoiceIds.add(id)));
            // 콤보 음성
            Object.values(mapping.combo).forEach(ids => ids.forEach(id => allVoiceIds.add(id)));
            // 리절트 음성
            Object.values(mapping.result).forEach(ids => ids.forEach(id => allVoiceIds.add(id)));
            // 게임 시작/종료 음성
            mapping.game_start.forEach(id => allVoiceIds.add(id));
            mapping.game_end.forEach(id => allVoiceIds.add(id));
            
            const totalVoices = allVoiceIds.size;
            const voiceArray = Array.from(allVoiceIds);
            
            console.log(`[VoiceManager] 🎵 음성 파일 캐싱 시작: 총 ${totalVoices}개`);
            
            let cached = 0;
            let downloaded = 0;
            let failed = 0;
            
            // 병렬 로딩 (5개씩 배치)
            const batchSize = 5;
            for (let i = 0; i < voiceArray.length; i += batchSize) {
                const batch = voiceArray.slice(i, i + batchSize);
                const promises = batch.map(async (voiceId) => {
                    try {
                        const filename = `uni${voiceId}.wav`;
                        const fullPath = this.voiceBasePath + filename;
                        
                        // IndexedDB에 이미 있는지 확인
                        const hasCache = await this.voiceCache.has(fullPath);
                        if (hasCache) {
                            cached++;
                            return;
                        }
                        
                        // 없으면 다운로드 후 저장
                        const response = await fetch(fullPath);
                        if (!response.ok) {
                            failed++;
                            return;
                        }
                        const blob = await response.blob();
                        this.voiceCache.set(fullPath, blob);
                        downloaded++;
                    } catch (err) {
                        // 개별 파일 실패는 무시하고 계속 진행
                        failed++;
                    }
                });
                
                await Promise.all(promises);
            }
            
            console.log(`[VoiceManager] ✅ 음성 파일 캐싱 완료: 캐시 ${cached}개, 다운로드 ${downloaded}개, 실패 ${failed}개`);
        } catch (error) {
            console.error('[VoiceManager] ❌ 음성 캐싱 실패:', error);
        }
    }

    /**
     * 판정별 음성 재생
     */
    playJudgment(judgment) {
        if (!this.isLoaded) return;
        
        const voiceIds = this.voiceMapping.game_mapping.judgment[judgment];
        if (!voiceIds || voiceIds.length === 0) return;
        
        const randomId = voiceIds[Math.floor(Math.random() * voiceIds.length)];
        this._playVoice(randomId);
    }

    /**
     * 콤보 음성 재생
     */
    playCombo(combo) {
        if (!this.isLoaded) return;
        
        const comboMapping = this.voiceMapping.game_mapping.combo;
        const comboKey = Object.keys(comboMapping).find(key => parseInt(key) === combo);
        
        if (!comboKey) return;
        
        const voiceIds = comboMapping[comboKey];
        if (!voiceIds || voiceIds.length === 0) return;
        
        const randomId = voiceIds[Math.floor(Math.random() * voiceIds.length)];
        console.log(`[VoiceManager] 🎉 콤보 ${combo} -> 음성 ${randomId}`);
        this._playVoice(randomId);
    }

    /**
     * Result 등급별 음성 재생
     */
    playResult(rank) {
        if (!this.isLoaded) {
            console.warn('[VoiceManager] 음성 매핑이 로드되지 않음 (playResult)');
            return;
        }
        
        const voiceIds = this.voiceMapping.game_mapping.result[rank];
        if (!voiceIds || voiceIds.length === 0) {
            console.warn(`[VoiceManager] 등급 '${rank}'에 대한 음성이 없음`);
            return;
        }
        
        const randomId = voiceIds[Math.floor(Math.random() * voiceIds.length)];
        console.log(`[VoiceManager] Result 음성 선택: ${rank} -> ID ${randomId}`);
        this._playVoice(randomId);
    }

    /**
     * 게임 시작 음성 재생
     */
    playGameStart() {
        if (!this.isLoaded) return;
        
        const voiceIds = this.voiceMapping.game_mapping.game_start;
        if (!voiceIds || voiceIds.length === 0) return;
        
        const randomId = voiceIds[Math.floor(Math.random() * voiceIds.length)];
        this._playVoice(randomId);
    }

    /**
     * 게임 종료 음성 재생
     */
    playGameEnd() {
        if (!this.isLoaded) return;
        
        const voiceIds = this.voiceMapping.game_mapping.game_end;
        if (!voiceIds || voiceIds.length === 0) return;
        
        const randomId = voiceIds[Math.floor(Math.random() * voiceIds.length)];
        this._playVoice(randomId);
    }

    /**
     * 음성 ID로 재생 (립싱크 포함 + 캐싱)
     * [수정] async로 변경, VoiceCache 사용
     */
    async _playVoice(voiceId) {
        const filename = `uni${voiceId}.wav`;
        const fullPath = this.voiceBasePath + filename;
        
        console.log(`[VoiceManager] 🎤 음성 재생 시도: ${filename}`);
        
        // [핵심 수정] AudioContext가 suspended 상태면 resume (브라우저 정책 대응)
        if (this.audioContext && this.audioContext.state === 'suspended') {
            try {
                await this.audioContext.resume();
                console.log('[VoiceManager] 🔊 AudioContext resumed');
            } catch (e) {
                console.warn('[VoiceManager] ⚠️ AudioContext resume 실패:', e);
            }
        }
        
        // [수정] 이전 재생 중단 (중복 재생 방지)
        if (!this.voiceAudio.paused) {
            console.log(`[VoiceManager] ⚠️ 이전 음성 재생 중 - 중단 후 새 음성 재생`);
            this.voiceAudio.pause();
            this.voiceAudio.currentTime = 0;
            this._stopLipSyncAnimation();
        }
        
        try {
            // [신규] 캐시 조회 (메모리 → IndexedDB)
            let cached = await this.voiceCache.get(fullPath);
            
            if (cached && cached.blobURL) {
                // 캐시 히트
                console.log(`[VoiceManager] 💾 캐시 히트: ${filename}`);
                this.voiceAudio.src = cached.blobURL;
            } else {
                // 캐시 미스 → 직접 경로 사용 (fetch 없이 바로 재생 시도)
                // 브라우저가 알아서 네트워크에서 로드함
                console.log(`[VoiceManager] 🌐 캐시 미스, 직접 경로 사용: ${filename}`);
                this.voiceAudio.src = fullPath;
                
                // 백그라운드에서 캐싱 시도 (재생에 영향 안 줌)
                fetch(fullPath)
                    .then(response => {
                        if (response.ok) return response.blob();
                        throw new Error('fetch failed');
                    })
                    .then(blob => {
                        this.voiceCache.set(fullPath, blob);
                        console.log(`[VoiceManager] ✅ 백그라운드 캐싱 완료: ${filename}`);
                    })
                    .catch(() => {
                        // 캐싱 실패해도 무시 (재생은 이미 시작됨)
                    });
            }
            
            this.voiceAudio.volume = this.volume;
            
            // 립싱크 시작
            this._startLipSyncAnimation();
            
            // 재생 종료/일시정지 시 립싱크 정지
            this.voiceAudio.onended = () => this._stopLipSyncAnimation();
            this.voiceAudio.onpause = () => this._stopLipSyncAnimation();
            
            await this.voiceAudio.play();
            console.log(`[VoiceManager] ✅ 재생 성공: ${filename}`);
        } catch (err) {
            console.error(`[VoiceManager] ❌ 재생 실패: ${filename}`);
            console.error(`[VoiceManager] 오류: ${err.message}`);
            console.error(`[VoiceManager] 경로: ${fullPath}`);
            this._stopLipSyncAnimation();
        }
    }

    /**
     * [제거] Audio 요소를 Web Audio API에 연결 (더 이상 필요 없음)
     */

    /**
     * [신규] 립싱크 애니메이션 루프 시작
     */
    _startLipSyncAnimation() {
        if (this.lipSyncActive) return;
        
        this.lipSyncActive = true;
        
        const updateLipSync = () => {
            if (!this.lipSyncActive) return;
            
            // 주파수 데이터 가져오기
            this.analyser.getByteFrequencyData(this.dataArray);
            
            // 저주파수 영역(사람 목소리)의 평균 음량 계산
            let sum = 0;
            const voiceRange = Math.floor(this.dataArray.length * 0.3); // 하위 30% (20Hz~2kHz)
            for (let i = 0; i < voiceRange; i++) {
                sum += this.dataArray[i];
            }
            const average = sum / voiceRange;
            
            // 0~255 범위를 0~1로 정규화
            const mouthOpen = Math.min(1.0, average / 128);
            
            // CharacterRenderer에 전달
            if (this.lipSyncCallback) {
                this.lipSyncCallback(mouthOpen);
            }
            
            this.lipSyncAnimationFrame = requestAnimationFrame(updateLipSync);
        };
        
        updateLipSync();
    }

    /**
     * [신규] 립싱크 애니메이션 정지
     */
    _stopLipSyncAnimation() {
        this.lipSyncActive = false;
        
        if (this.lipSyncAnimationFrame) {
            cancelAnimationFrame(this.lipSyncAnimationFrame);
            this.lipSyncAnimationFrame = null;
        }
        
        // 입 닫기
        if (this.lipSyncCallback) {
            this.lipSyncCallback(0);
        }
    }

    /**
     * [제거] 오디오 풀 (더 이상 사용하지 않음)
     */

    /**
     * 볼륨 설정
     */
    setVolume(volume) {
        this.volume = Math.max(0, Math.min(1, volume));
        this.voiceAudio.volume = this.volume;
    }

    /**
     * 모든 음성 정지
     */
    stopAll() {
        this._stopLipSyncAnimation();
        this.voiceAudio.pause();
        this.voiceAudio.currentTime = 0;
    }

    /**
     * 정리
     */
    cleanup() {
        this.stopAll();
        this._stopLipSyncAnimation();
        
        if (this.audioSource) {
            try {
                this.audioSource.disconnect();
            } catch (e) {
                // 무시
            }
            this.audioSource = null;
        }
        
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }
        
        this.voiceAudio = null;
    }
}
