/**
 * managers/langLoader.js
 * * 개발 순서 5단계: UI 매니저 생성 (3/4)
 * * ko.js와 en.js의 언어 팩을 불러와 HTML DOM 요소에 적용합니다.
 * * 언어 선택(language-selector)의 변경 이벤트를 처리합니다.
 */

class LanguageManager {
    constructor() {
        // 정의된 언어 팩들을 저장
        this.langPacks = {
            'ko': LANG_KO,
            'en': LANG_EN
        };
        
        // 현재 적용된 언어 팩 (기본값은 'ko')
        this.currentLang = this.langPacks['ko'];

        // ID가 없는 DOM 요소들에 대한 참조
        // (index.html 구조에 의존적이므로, HTML 변경 시 여기도 수정 필요)
        this.elements = {
            title: document.querySelector('.header-left h1'),
            stageProgressLabel: document.getElementById('stage-progress-label'), // 스테이지 진행도 레이블
            gameInfoTitle: document.getElementById('game-info-title'), // 게임 정보 제목
            controlsTitle: document.getElementById('controls-title'), // 조작법 제목
            controlsList: document.getElementById('controls-list'), // <ul>
            gameGuideTitle: document.getElementById('game-guide-title'), // 게임 가이드 제목
            guideStages: document.getElementById('guide-stages'),
            guidePower: document.getElementById('guide-power'),
            guideBoss: document.getElementById('guide-boss'),
            volumeTitle: document.getElementById('volume-title'), // 볼륨 설정 제목
            bgmLabel: document.getElementById('bgm-label'), // BGM 레이블
            sfxLabel: document.getElementById('sfx-label'), // SFX 레이블
            characterSelectTitle: document.getElementById('character-select-title'), // 캐릭터 선택 제목
            charBombName: document.getElementById('char-bomb-name'),
            charBombDesc: document.getElementById('char-bomb-desc'),
            charLaserName: document.getElementById('char-laser-name'),
            charLaserDesc: document.getElementById('char-laser-desc'),
            charTimeName: document.getElementById('char-time-name'),
            charTimeDesc: document.getElementById('char-time-desc'),
            leaderboardTitle: document.querySelector('.panel-right h3'),
            leaderboardLoading: document.querySelector('#leaderboard-content p')
        };
    }

    /**
     * 언어 관리자 초기화
     * - 이벤트 리스너 바인딩
     * - 기본 언어 적용
     */
    init() {
        // gameState.js의 DOM 참조가 완료된 후 실행되어야 함.
        if (!DOM || !DOM.languageSelector) {
            console.error("DOM 요소가 준비되지 않았습니다. (gameState.js 로드 확인)");
            return;
        }

        // 언어 선택기 이벤트 리스너
        DOM.languageSelector.addEventListener('change', (e) => {
            this.setLanguage(e.target.value);
        });

        // 기본 언어(한국어)로 설정 및 적용
        this.setLanguage(DOM.languageSelector.value || 'ko');
    }

    /**
     * 특정 언어로 UI 텍스트 변경
     * @param {string} langCode - 'ko' 또는 'en'
     */
    setLanguage(langCode) {
        // 유효한 언어 팩인지 확인, 없으면 'en'으로 대체
        this.currentLang = this.langPacks[langCode] || this.langPacks['en'];
        
        // html 태그의 lang 속성 변경 (웹 접근성)
        document.documentElement.lang = langCode;

        // 실제 DOM 텍스트 적용
        this.applyLanguage();
    }

    /**
     * 현재 선택된 언어 팩(this.currentLang)을 DOM에 적용
     */
    applyLanguage() {
        const pack = this.currentLang;

        // --- 헤더 ---
        if (this.elements.title) this.elements.title.textContent = pack.title;
        if (this.elements.stageProgressLabel) this.elements.stageProgressLabel.textContent = pack.stageProgress;
        
        // 난이도 선택 (옵션 텍스트 변경)
        if (DOM.difficultySelector) {
            DOM.difficultySelector.options[0].textContent = pack.difficultyEasy;
            DOM.difficultySelector.options[1].textContent = pack.difficultyNormal;
            DOM.difficultySelector.options[2].textContent = pack.difficultyHard;
        }

        // 버튼
        if (DOM.startButton) DOM.startButton.textContent = pack.startButton;
        // 일시정지 버튼은 현재 상태에 따라 텍스트 변경
        if (DOM.pauseButton) {
            DOM.pauseButton.textContent = gameState.isPaused ? pack.resumeButton : pack.pauseButton;
        }
        if (DOM.resetButton) DOM.resetButton.textContent = pack.resetButton;
        
        // --- 좌측 패널 (게임 정보) ---
        if (this.elements.gameInfoTitle) this.elements.gameInfoTitle.textContent = pack.gameInfoTitle;
        
        // --- 좌측 패널 (조작법) ---
        if (this.elements.controlsTitle) this.elements.controlsTitle.textContent = pack.controlsTitle;
        // 조작법 목록 (innerHTML로 재생성)
        if (this.elements.controlsList) {
            this.elements.controlsList.innerHTML = `
                <li><span class="key">${pack.controlsMove}</span> WASD / ↑↓←→</li>
                <li><span class="key">${pack.controlsShoot}</span> Z</li>
                <li><span class="key">${pack.controlsSpell}</span> X</li>
                <li><span class="key">${pack.controlsFocus}</span> Shift</li>
                <li><span class="key">${pack.controlsPause}</span> P</li>
            `;
        }

        // --- 좌측 패널 (게임 가이드) ---
        if (this.elements.gameGuideTitle) this.elements.gameGuideTitle.textContent = pack.gameGuideTitle;
        if (this.elements.guideStages) this.elements.guideStages.textContent = pack.guideStages;
        if (this.elements.guidePower) this.elements.guidePower.textContent = pack.guidePower;
        if (this.elements.guideBoss) this.elements.guideBoss.textContent = pack.guideBoss;

        // --- 좌측 패널 (볼륨 설정) ---
        if (this.elements.volumeTitle) this.elements.volumeTitle.textContent = pack.volumeTitle;
        const bgmValue = document.getElementById('bgm-value');
        const sfxValue = document.getElementById('sfx-value');
        if (this.elements.bgmLabel && bgmValue) {
            this.elements.bgmLabel.innerHTML = `${pack.volumeBGM} <span id="bgm-value">${bgmValue.textContent}</span>%`;
        }
        if (this.elements.sfxLabel && sfxValue) {
            this.elements.sfxLabel.innerHTML = `${pack.volumeSFX} <span id="sfx-value">${sfxValue.textContent}</span>%`;
        }

        // --- 캐릭터 선택 모달 ---
        if (this.elements.characterSelectTitle) this.elements.characterSelectTitle.textContent = pack.characterSelectTitle;
        if (this.elements.charBombName) this.elements.charBombName.textContent = pack.charBombName;
        if (this.elements.charBombDesc) this.elements.charBombDesc.textContent = pack.charBombDesc;
        if (this.elements.charLaserName) this.elements.charLaserName.textContent = pack.charLaserName;
        if (this.elements.charLaserDesc) this.elements.charLaserDesc.textContent = pack.charLaserDesc;
        if (this.elements.charTimeName) this.elements.charTimeName.textContent = pack.charTimeName;
        if (this.elements.charTimeDesc) this.elements.charTimeDesc.textContent = pack.charTimeDesc;

        // --- 우측 패널 (리더보드) ---
        if (this.elements.leaderboardTitle) this.elements.leaderboardTitle.textContent = pack.leaderboardTitle;
        if (this.elements.leaderboardLoading) this.elements.leaderboardLoading.textContent = pack.leaderboardLoading;
    }

    /**
     * 현재 언어 팩에서 특정 키의 텍스트를 가져옴
     * (UIManager가 '일시정지/계속' 등 동적 텍스트를 가져올 때 사용)
     * @param {string} key - 언어 팩의 키 (예: 'pauseButton')
     * @returns {string}
     */
    getText(key) {
        return this.currentLang[key] || `[${key}]`; // 키가 없으면 [key] 반환
    }
}

// (주의) 이 스크립트는 gameState.js, ko.js, en.js가 로드된 *이후*에 실행되어야 합니다.
// index.html의 <script defer> 순서가 이를 보장합니다.
// 실제 초기화는 gameController.js에서 수행합니다.