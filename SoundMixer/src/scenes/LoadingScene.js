import { Scene } from './Scene.js';
import { DOM } from '../data/DOMRegistry.js';
import { GlobalStore } from '../data/GlobalStore.js';

/**
 * LoadingScene - 타이틀 → 선곡 사이 로딩 화면
 * 
 * [목적]
 * - meta.json 전체 로드
 * - 비디오 파일 VideoCache 캐싱 (완전 오프라인 플레이)
 * - 썸네일 추출 (IndexedDB 캐싱)
 * - 진행률 표시
 * 
 * [흐름]
 * TitleScene → LoadingScene → SelectScene
 * 
 * [Phase 3] VideoCache 통합
 * - VideoCache에서 비디오 캐시 확인 (메모리 + IndexedDB)
 * - 캐시 미스 시 fetch → VideoCache 저장
 * - ThumbnailWorker로 썸네일 추출
 * - 두 번째 실행부터 완전 오프라인 플레이 가능
 */
export class LoadingScene extends Scene {
    constructor(app) {
        super(app);

        this.songs = [];
        this.thumbnailWorker = null;
        this.gameDB = null;
        this.videoCache = null; // [신규] VideoCache 참조
        this.musicCache = null; // [신규] MusicCache 참조
        this.voiceCache = null; // [신규] VoiceCache 참조
        this.voiceMapping = null; // [신규] voice_mapping.json

        // 진행률
        this.totalSteps = 0;
        this.currentStep = 0;
    }

    async enter() {
        // [1순위] 캔버스 즉시 숨김 (다른 작업보다 먼저)
        if (this.app.gameEngine && this.app.gameEngine.character) {
            this.app.gameEngine.character.hide();
        }

        // [신규] 캐릭터 캔버스 숨김 (로딩 중 깜박임 방지)
        const characterCanvas = document.getElementById('characterCanvas');
        if (characterCanvas) {
            characterCanvas.style.display = 'none';
        }

        // GameDB, ThumbnailWorker, VideoCache, MusicCache, VoiceCache 참조
        if (this.app.gameEngine) {
            this.gameDB = this.app.gameEngine.gameDB;
            this.thumbnailWorker = this.app.ui.thumbnailWorker; // UIManager의 Worker 재사용
            this.videoCache = this.app.gameEngine.videoCache; // [신규] VideoCache 참조
            this.musicCache = this.app.gameEngine.audio ? this.app.gameEngine.audio.musicCache : null; // [신규] MusicCache 참조 (audio = AudioConductor)
            this.voiceCache = this.app.gameEngine.voice ? this.app.gameEngine.voice.voiceCache : null; // [신규] VoiceCache 참조
            this.voiceMapping = this.app.gameEngine.voice ? this.app.gameEngine.voice.voiceMapping : null; // [신규] voice_mapping
        }

        // 진행률 초기화
        this.currentStep = 0;
        this._updateProgress('Loading songs...', 0);

        try {
            // 1. 곡 리스트 로드
            await this._loadSongs();

            // 2. 비디오 파일 캐싱 (IndexedDB)
            await this._cacheVideos();

            // 3. 음악 파일 캐싱 (IndexedDB) [신규]
            await this._cacheMusic();

            // 4. 음성 파일 검증 (VoiceManager에서 이미 캐싱됨) [신규]
            await this._verifyVoices();

            // 5. 썸네일 추출 (IndexedDB 캐싱)
            await this._extractThumbnails();

            // 6. 캐시 무결성 검증 [신규]
            await this._verifyCacheIntegrity();

            // 7. 완료 후 SelectScene으로 전환 (0.5초 대기)
            this._updateProgress('Complete!', 100);
            setTimeout(() => {
                // SelectScene에 곡 리스트 전달
                const selectScene = this.app.sceneManager.scenes.select;
                if (selectScene) {
                    selectScene.songs = this.songs;
                }
                this.app.sceneManager.changeScene('select');
            }, 500);

        } catch (error) {
            console.error('[LoadingScene] 로딩 실패:', error);
            this._updateProgress('Error: Failed to load', 0);

            // 3초 후 타이틀로 복귀
            setTimeout(() => {
                this.app.sceneManager.changeScene('title');
            }, 3000);
        }
    }

    exit() {
        // LoadingScene 종료 (메인화면 → 므직 셀렉트 전환용)
        // 게임 시작 음성은 GameScene.enter()에서 재생
    }

    /**
     * 곡 리스트 로드
     */
    async _loadSongs() {
        const response = await fetch('assets/songs/songList.json');
        const songList = await response.json();

        this.songs = [];
        const metaPromises = [];

        for (const songFolder of songList) {
            // songList는 문자열 배열 (폴더명)
            const metaPath = `assets/songs/${songFolder}/meta.json`;
            metaPromises.push(
                fetch(metaPath)
                    .then(r => r.json())
                    .then(meta => {
                        this.songs.push({
                            id: songFolder, // Firebase용 고유 ID
                            path: `assets/songs/${songFolder}/`,
                            title: meta.title,
                            artist: meta.artist,
                            bpm: meta.bpm,
                            charts: meta.charts,
                            musicFile: meta.musicFile,  // [수정] audioFile → musicFile
                            videoFile: meta.videoFile || null,
                            coverImage: meta.coverImage || null
                        });
                    })
                    .catch(err => {
                        console.error(`Failed to load meta: ${metaPath}`, err);
                    })
            );
        }

        await Promise.all(metaPromises);

        // BPM 순 정렬
        this.songs.sort((a, b) => a.bpm - b.bpm);

        this._updateProgress('Songs loaded', 10);
    }

    /**
     * 비디오 파일 캐싱 (VideoCache)
     */
    async _cacheVideos() {
        const videosToCache = this.songs.filter(s => s.videoFile);

        if (videosToCache.length === 0) {
            this._updateProgress('Videos ready', 30);
            return;
        }

        if (!this.videoCache) {
            console.error('[LoadingScene] VideoCache not initialized');
            this._updateProgress('Videos ready', 30);
            return;
        }

        this.totalSteps = videosToCache.length;
        this.currentStep = 0;

        if (GlobalStore.constants.DEBUG.LOG_CACHING) {
            console.log(`[LoadingScene] 비디오 캠싱 시작: ${this.totalSteps}개`);
        }

        for (const song of videosToCache) {
            const videoPath = song.path + song.videoFile;

            try {
                // [1] VideoCache 확인 (메모리 + IndexedDB)
                const cached = await this.videoCache.get(videoPath);
                if (cached) {
                    console.log(`[LoadingScene] ✅ 캐시 적중 (스킵): ${videoPath}`);
                    this.currentStep++;
                    const progress = 10 + Math.round((this.currentStep / this.totalSteps) * 20);
                    this._updateProgress(`Videos: ${this.currentStep}/${this.totalSteps}`, progress);
                    continue; // 캐시 적중, 다음으로
                }

                // [2] 캐시 미스 → fetch + VideoCache 저장
                console.log(`[LoadingScene] 🌐 네트워크 fetch: ${videoPath}`);
                const response = await fetch(videoPath);
                if (!response.ok) throw new Error(`Failed to fetch: ${response.status}`);
                const videoBlob = await response.blob();

                // [3] VideoCache에 저장 (메모리 + IndexedDB)
                this.videoCache.set(videoPath, videoBlob);
                console.log(`[LoadingScene] ✅ 캐싱 완료: ${videoPath}`);

            } catch (error) {
                console.error(`[LoadingScene] 비디오 캐싱 실패: ${videoPath}`, error);
            }

            this.currentStep++;
            const progress = 10 + Math.round((this.currentStep / this.totalSteps) * 20);
            this._updateProgress(`Videos: ${this.currentStep}/${this.totalSteps}`, progress);
        }

        if (GlobalStore.constants.DEBUG.LOG_CACHING) {
            console.log('[LoadingScene] 비디오 캠싱 완료');
        }
        this._updateProgress('Videos cached', 30);
    }

    /**
     * 썸네일 추출 (VideoCache 기반)
     */
    async _extractThumbnails() {
        const videosToExtract = this.songs.filter(s => s.videoFile && !s.coverImage);

        if (videosToExtract.length === 0) {
            this._updateProgress('Thumbnails ready', 80);
            return;
        }

        if (!this.thumbnailWorker || !this.videoCache) {
            console.error('[LoadingScene] ThumbnailWorker or VideoCache not initialized');
            this._updateProgress('Thumbnails ready', 80);
            return;
        }

        this.totalSteps = videosToExtract.length;
        this.currentStep = 0;

        if (GlobalStore.constants.DEBUG.LOG_CACHING) {
            console.log(`[LoadingScene] 썸네일 추출 시작: ${this.totalSteps}개`);
        }

        for (const song of videosToExtract) {
            const videoPath = song.path + song.videoFile;

            try {
                // [1] IndexedDB 썸네일 캐시 확인
                if (this.gameDB) {
                    const cachedThumbnail = await this.gameDB.getThumbnail(videoPath);
                    if (cachedThumbnail) {
                        if (GlobalStore.constants.DEBUG.LOG_CACHING) {
                            console.log(`[LoadingScene] ✅ 썸네일 캐시 적중: ${videoPath}`);
                        }
                        this.currentStep++;
                        const progress = 60 + Math.round((this.currentStep / this.totalSteps) * 20);
                        this._updateProgress(`Thumbnails: ${this.currentStep}/${this.totalSteps}`, progress);
                        continue; // 캐시 적중, 다음으로
                    }
                }

                // [2] VideoCache에서 비디오 가져오기 (이미 캐싱됨, 중복 다운로드 방지)
                const cached = await this.videoCache.get(videoPath);

                if (!cached) {
                    if (GlobalStore.constants.DEBUG.LOG_CACHING) {
                        console.warn(`[LoadingScene] VideoCache 미스 (스킵): ${videoPath}`);
                    }
                    this.currentStep++;
                    continue;
                }

                if (GlobalStore.constants.DEBUG.LOG_CACHING) {
                    console.log(`[LoadingScene] 🎨 썸네일 추출 중: ${videoPath}`);
                }

                // [3] 썸네일 추출 (VideoCache의 Blob 사용)
                const dataURL = await this.thumbnailWorker.extractThumbnail(cached.blob, 0.1);

                // [4] IndexedDB에 저장
                if (this.gameDB && dataURL) {
                    await this.gameDB.saveThumbnail(videoPath, dataURL);
                    if (GlobalStore.constants.DEBUG.LOG_CACHING) {
                        console.log(`[LoadingScene] ✅ 썸네일 저장 완료: ${videoPath}`);
                    }
                }

            } catch (error) {
                console.error(`[LoadingScene] 썸네일 추출 실패: ${videoPath}`, error);
            }

            this.currentStep++;
            const progress = 60 + Math.round((this.currentStep / this.totalSteps) * 20);
            this._updateProgress(`Thumbnails: ${this.currentStep}/${this.totalSteps}`, progress);
        }

        if (GlobalStore.constants.DEBUG.LOG_CACHING) {
            console.log('[LoadingScene] 썸네일 추출 완료');
        }
        this._updateProgress('Thumbnails complete', 80);
    }

    /**
     * [신규] 음악 파일 캐싱 (MusicCache)
     */
    async _cacheMusic() {
        if (!this.musicCache) {
            console.warn('[LoadingScene] MusicCache not initialized');
            this._updateProgress('Music ready', 50);
            return;
        }

        const musicToCache = this.songs.filter(s => s.musicFile);
        
        if (musicToCache.length === 0) {
            this._updateProgress('Music ready', 50);
            return;
        }

        this.totalSteps = musicToCache.length;
        this.currentStep = 0;

        if (GlobalStore.constants.DEBUG.LOG_CACHING) {
            console.log(`[LoadingScene] 음악 파일 캠싱 시작: ${this.totalSteps}개`);
        }

        for (const song of musicToCache) {
            const musicPath = song.path + song.musicFile;

            try {
                // [1] MusicCache 확인 (메모리 + IndexedDB)
                const cached = await this.musicCache.has(musicPath);
                if (cached) {
                    console.log(`[LoadingScene] ✅ 캐시 적중 (스킵): ${musicPath}`);
                    this.currentStep++;
                    const progress = 30 + Math.round((this.currentStep / this.totalSteps) * 20);
                    this._updateProgress(`Music: ${this.currentStep}/${this.totalSteps}`, progress);
                    continue;
                }

                // [2] 캐시 미스 → fetch + MusicCache 저장
                console.log(`[LoadingScene] 🌐 네트워크 fetch: ${musicPath}`);
                const response = await fetch(musicPath);
                if (!response.ok) throw new Error(`Failed to fetch: ${response.status}`);
                const musicBlob = await response.blob();

                // [3] MusicCache에 저장 (메모리 + IndexedDB)
                this.musicCache.set(musicPath, musicBlob);
                console.log(`[LoadingScene] ✅ 캐싱 완료: ${musicPath}`);

            } catch (error) {
                console.error(`[LoadingScene] 음악 캐싱 실패: ${musicPath}`, error);
            }

            this.currentStep++;
            const progress = 30 + Math.round((this.currentStep / this.totalSteps) * 20);
            this._updateProgress(`Music: ${this.currentStep}/${this.totalSteps}`, progress);
        }

        if (GlobalStore.constants.DEBUG.LOG_CACHING) {
            console.log('[LoadingScene] 음악 파일 캠싱 완료');
        }
        this._updateProgress('Music cached', 50);
    }

    /**
     * [신규] 음성 파일 검증 (VoiceManager에서 이미 캐싱됨)
     */
    async _verifyVoices() {
        if (!this.voiceCache || !this.voiceMapping) {
            console.warn('[LoadingScene] VoiceCache or VoiceMapping not initialized');
            this._updateProgress('Voices ready', 60);
            return;
        }

        // 모든 음성 ID 추출
        const allVoiceIds = new Set();
        const mapping = this.voiceMapping.game_mapping;
        
        Object.values(mapping.judgment).forEach(ids => ids.forEach(id => allVoiceIds.add(id)));
        Object.values(mapping.combo).forEach(ids => ids.forEach(id => allVoiceIds.add(id)));
        Object.values(mapping.result).forEach(ids => ids.forEach(id => allVoiceIds.add(id)));
        mapping.game_start.forEach(id => allVoiceIds.add(id));
        mapping.game_end.forEach(id => allVoiceIds.add(id));

        this.totalSteps = allVoiceIds.size;
        this.currentStep = 0;
        const voiceBasePath = 'assets/gameSound/unitychan_voicepack_append_01/';

        if (GlobalStore.constants.DEBUG.LOG_CACHING) {
            console.log(`[LoadingScene] 음성 파일 검증 시작: ${this.totalSteps}개`);
        }

        const missingVoices = [];
        const voiceArray = Array.from(allVoiceIds);

        // 검증 (5개씩 배치)
        const batchSize = 5;
        for (let i = 0; i < voiceArray.length; i += batchSize) {
            const batch = voiceArray.slice(i, i + batchSize);
            const promises = batch.map(async (voiceId) => {
                const filename = `uni${voiceId}.wav`;
                const fullPath = voiceBasePath + filename;
                
                const cached = await this.voiceCache.has(fullPath);
                if (!cached) {
                    missingVoices.push({ voiceId, fullPath });
                }
                
                this.currentStep++;
                const progress = 50 + Math.round((this.currentStep / this.totalSteps) * 10);
                this._updateProgress(`Voices: ${this.currentStep}/${this.totalSteps}`, progress);
            });
            
            await Promise.all(promises);
        }

        // 누락된 파일 재다운로드
        if (missingVoices.length > 0) {
            if (GlobalStore.constants.DEBUG.LOG_CACHING) {
                console.warn(`[LoadingScene] ⚠️ 누락된 음성 파일: ${missingVoices.length}개, 재다운로드 시작`);
            }
            
            for (const { voiceId, fullPath } of missingVoices) {
                try {
                    const response = await fetch(fullPath);
                    if (!response.ok) throw new Error(`HTTP ${response.status}`);
                    const blob = await response.blob();
                    this.voiceCache.set(fullPath, blob);
                    if (GlobalStore.constants.DEBUG.LOG_CACHING) {
                        console.log(`[LoadingScene] ✅ 재다운로드 완료: uni${voiceId}.wav`);
                    }
                } catch (error) {
                    console.error(`[LoadingScene] ❌ 재다운로드 실패: uni${voiceId}.wav`, error);
                }
            }
        }

        if (GlobalStore.constants.DEBUG.LOG_CACHING) {
            console.log('[LoadingScene] 음성 파일 검증 완료');
        }
        this._updateProgress('Voices verified', 60);
    }

    /**
     * [신규] 캠시 무결성 검증 (모든 필수 파일이 캠시에 있는지 최종 확인)
     */
    async _verifyCacheIntegrity() {
        if (GlobalStore.constants.DEBUG.LOG_CACHING) {
            console.log('[LoadingScene] 🔍 캠시 무결성 검증 시작');
        }
        this._updateProgress('Verifying cache...', 85);

        const issues = [];

        // 1. 비디오 파일 검증
        if (this.videoCache) {
            for (const song of this.songs.filter(s => s.videoFile)) {
                const videoPath = song.path + song.videoFile;
                const cached = await this.videoCache.has(videoPath);
                if (!cached) {
                    issues.push({ type: 'video', path: videoPath, song: song.title });
                }
            }
        }

        // 2. 음악 파일 검증
        if (this.musicCache) {
            for (const song of this.songs.filter(s => s.musicFile)) {
                const musicPath = song.path + song.musicFile;
                const cached = await this.musicCache.has(musicPath);
                if (!cached) {
                    issues.push({ type: 'music', path: musicPath, song: song.title });
                }
            }
        }

        // 3. 음성 파일 검증 (샘플링)
        if (this.voiceCache && this.voiceMapping) {
            const voiceBasePath = 'assets/gameSound/unitychan_voicepack_append_01/';
            const sampleVoices = ['1464', '1500', '1521']; // 시작, 중간, 끝
            
            for (const voiceId of sampleVoices) {
                const fullPath = voiceBasePath + `uni${voiceId}.wav`;
                const cached = await this.voiceCache.has(fullPath);
                if (!cached) {
                    issues.push({ type: 'voice', path: fullPath, voiceId });
                }
            }
        }

        this._updateProgress('Verifying cache...', 90);

        // 이슈 처리
        if (issues.length > 0) {
            console.warn(`[LoadingScene] ⚠️ 캐시 무결성 문제 발견: ${issues.length}개`);
            console.warn(issues);

            // 재다운로드 시도
            for (const issue of issues) {
                try {
                    console.log(`[LoadingScene] 🔄 재다운로드 시도: ${issue.path}`);
                    const response = await fetch(issue.path);
                    if (!response.ok) throw new Error(`HTTP ${response.status}`);
                    const blob = await response.blob();

                    // 타입별 캐시에 저장
                    if (issue.type === 'video' && this.videoCache) {
                        this.videoCache.set(issue.path, blob);
                    } else if (issue.type === 'music' && this.musicCache) {
                        this.musicCache.set(issue.path, blob);
                    } else if (issue.type === 'voice' && this.voiceCache) {
                        this.voiceCache.set(issue.path, blob);
                    }

                    console.log(`[LoadingScene] ✅ 재다운로드 완료: ${issue.path}`);
                } catch (error) {
                    console.error(`[LoadingScene] ❌ 재다운로드 실패: ${issue.path}`, error);
                }
            }

            this._updateProgress('Cache repaired', 95);
        } else {
            console.log('[LoadingScene] ✅ 캐시 무결성 검증 완료 (이상 없음)');
            this._updateProgress('Cache verified', 95);
        }
    }

    /**
     * 진행률 업데이트
     */
    _updateProgress(message, percent) {
        const loadingText = DOM.loadingText;
        const loadingBar = DOM.loadingBar;

        if (loadingText) {
            loadingText.textContent = message;
        }

        if (loadingBar) {
            loadingBar.style.width = `${percent}%`;
        }
    }

    onKeyDown(e) {
        // ESC: 타이틀로 복귀
        if (e.key === 'Escape') {
            this.app.sceneManager.changeScene('title');
        }
    }
}
