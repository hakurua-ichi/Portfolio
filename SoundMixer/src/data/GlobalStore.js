export const GlobalStore = {
    // 0. 게임 상수 (변경 불가, 매직 넘버 방지)
    constants: {
        // 타이밍 관련
        TIMING: {
            GC_DELAY_MS: 100,                // GC 유도 지연 (씬 전환 완료 대기)
            MODAL_CLOSE_DELAY_MS: 100,       // 모달 닫힌 후 입력 차단 시간
            JUDGE_WINDOW_PERFECT: 0.040,     // PERFECT 판정 윈도우 (초)
            JUDGE_WINDOW_GREAT: 0.080,       // GREAT 판정 윈도우 (초)
            JUDGE_WINDOW_GOOD: 0.120,        // GOOD 판정 윈도우 (초)
            JUDGE_WINDOW_BAD: 0.160,         // BAD 판정 윈도우 (초)
            LONG_NOTE_RELEASE_WINDOW: 0.044, // 롱노트 릴리즈 판정 윈도우 (초)
            SYNC_CHECK_INTERVAL: 25.0,       // 자동 동기화 체크 주기 (초)
            SYNC_DRIFT_THRESHOLD: 0.1,       // 동기화 보정 임계값 (초)
            VIDEO_SYNC_THRESHOLD: 0.2,       // 즉각 비디오 싱크 보정 임계값 (초)
        },
        
        // 게임플레이 관련
        GAMEPLAY: {
            HP_RECOVERY_PER_FRAME: 0.005,    // 프레임당 HP 자동 회복량
            HP_MAX_DEFAULT: 100,              // 기본 최대 HP
            GAME_END_DELAY: 3.0,              // 마지막 노트 후 게임 종료 대기 시간 (초)
            SPEED_MULTIPLIER: 300,            // 속도 계수 (px/s per speed unit) - 400에서 300으로 감소
            COUNTDOWN_DELAY: 2.0,             // 게임 시작 전 카운트다운 (초)
        },
        
        // 렌더링 관련
        RENDERING: {
            EFFECT_DURATION_MS: 300,          // 판정 텍스트 표시 시간 (밀리초)
            HIT_EFFECT_DURATION_MS: 300,      // 히트 이펙트 지속 시간 (밀리초)
            COMBO_BURST_INTERVAL: 50,         // 콤보 버스트 간격
        },
        
        // 성능 관련
        PERFORMANCE: {
            VIDEO_CACHE_LIMIT: 7,             // 비디오 캐시 최대 개수 (5->7 증가, 더 많은 프리로딩)
            DEBUG_LOGGING: false,             // 디버그 로그 활성화 (false=성능 모드)
            AGGRESSIVE_PRELOAD: true,         // 적극적 프리로딩 (즉시 인접 곡 로드)
        },
        
        // [신규] 개발자 모드 디버그 설정 (성능 최적화)
        DEBUG: {
            ENABLED: false,                   // 개발자 모드 마스터 스위치
            LOG_JUDGMENT: false,              // 판정 로그 (매 노트마다 출력 - 성능 저하)
            LOG_COMBO_BURST: false,           // 콤보 버스트 로그
            LOG_CACHING: false,               // 캐싱 프로세스 로그 (LoadingScene, UIManager)
            LOG_CHARACTER: false,             // 캐릭터 모션 로그 (CharacterRenderer)
            LOG_SOUND: false,                 // 사운드 로드/재생 로그 (SoundManager)
            LOG_TIMING: false,                // 타이밍 동기화 로그 (GameEngine)
            LOG_PERFORMANCE: false            // 성능 측정 로그 (console.time/timeEnd)
        },
        
        // 메모리 최적화 관련
        MEMORY: {
            THUMBNAIL_CACHE_MAX: 50,          // 썸네일 캐시 최대 개수
            MAX_CONCURRENT_EXTRACTIONS: 2,    // 동시 비디오 추출 최대 개수
        },
    },
    
    // [신규] 안전한 DEBUG 플래그 접근 헬퍼 (파이어폭스 호환)
    isDebug(flag) {
        return this.constants && this.constants.DEBUG && this.constants.DEBUG[flag] === true;
    },
    
    // 1. 기본 설정값 (초기값)
    defaults: {
        speed: 2.0,
        offset: 0.0,
        bgaDim: 50,
        skinId: "default",
        volMusic: 1.0,
        volSfx: 0.7,
        volVoice: 1.0,
        keyMap: ['d', 'f', 'j', 'k'],
        longNoteGap: 0.1 // [신규] 롱노트 릴리즈 후 다음 노트까지 최소 간격 (초)
    },

    // 2. 현재 활성 설정 (메모리에 로드된 값)
    settings: {},

    // 3. 현재 세션 정보 (저장 안 됨, 실행 중에만 유효)
    session: {
        playerName: "GUEST",
        currentSongIndex: 0,
        currentDifficulty: "NORMAL"
    },

    // --- 메서드 ---

    // 설정 불러오기 (앱 시작 시 호출)
    load() {
        // [버그 수정] JSON.parse 예외 처리 (손상된 데이터 방어)
        let loaded = {};
        try {
            const json = localStorage.getItem('rhythm_settings');
            if (json) {
                loaded = JSON.parse(json);
            }
        } catch (error) {
            console.warn('Failed to load settings from localStorage:', error);
            // 손상된 데이터 제거
            localStorage.removeItem('rhythm_settings');
        }
        
        // 기본값과 병합 (새로운 옵션이 생겨도 깨지지 않게)
        this.settings = { ...this.defaults, ...loaded };

        // 플레이어 이름 로드
        this.session.playerName = localStorage.getItem('rhythm_player_name') || "GUEST";
        
        // [신규] 개발자 모드 로드 (로컬스토리지 기반)
        const debugMode = localStorage.getItem('debug_mode');
        if (debugMode === 'true') {
            this.constants.DEBUG.ENABLED = true;
            // 개별 플래그도 로컬스토리지에서 로드 가능
            const debugFlags = ['LOG_JUDGMENT', 'LOG_COMBO_BURST', 'LOG_CACHING', 'LOG_CHARACTER', 'LOG_SOUND', 'LOG_TIMING', 'LOG_PERFORMANCE'];
            debugFlags.forEach(flag => {
                const stored = localStorage.getItem(`debug_${flag.toLowerCase()}`);
                if (stored === 'true') {
                    this.constants.DEBUG[flag] = true;
                }
            });
            console.log('[GlobalStore] 🔧 개발자 모드 활성화:', this.constants.DEBUG);
        }
    },

    // 설정 저장하기 (값 변경 시 호출)
    save() {
        localStorage.setItem('rhythm_settings', JSON.stringify(this.settings));
    },

    // 플레이어 이름 저장
    savePlayerName(name) {
        this.session.playerName = name;
        localStorage.setItem('rhythm_player_name', name);
    }
};