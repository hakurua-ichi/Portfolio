/**
 * 📄 js/uiManager.js
 * * DOM 요소를 제어하고, 언어 변경을 처리하며,
 * * 사용자 입력을 받아 gameController의 콜백을 호출합니다.
 */
import { languagePack } from './languageLoader.js';
import { DataManager } from './dataManager.js';
import { audioManager } from './audioManager.js';

class UIManager {
    constructor() {
        // 1. (gameState.js에서 정의됐지만) UI 매니저가 제어할 DOM 요소들
        this.dom = {
            title: document.getElementById('game-title'),
            langSelector: document.getElementById('language-selector'),
            stageLabel: document.getElementById('stage-progress-label'),
            stageValue: document.getElementById('stage-progress-value'),
            startButton: document.getElementById('start-button'),
            pauseButton: document.getElementById('pause-button'),
            resetButton: document.getElementById('reset-button'),
            controlsTitle: document.querySelector('.game-sidebar-left h2'),
            controlsList: document.getElementById('controls-list'),
            leaderboardTitle: document.querySelector('.game-sidebar-right h2'),
            leaderboardContent: document.getElementById('leaderboard-content')
        };

        // 2. languageLoader.js에서 생성한 언어 팩 참조
        this.languageData = languagePack;
        this.currentLang = 'ko'; // 기본 언어
        this._lastLeaderboard = null;
    }

    /**
     * @description UI 매니저 초기화. 버튼에 이벤트 리스너를 바인딩.
     * @param {object} callbacks - { onStart, onPause, onReset }
     */
    init(callbacks) {
        // gameController로부터 받은 콜백 함수들을 버튼 클릭 이벤트에 연결
        this.dom.startButton.addEventListener('click', callbacks.onStart);
        this.dom.pauseButton.addEventListener('click', callbacks.onPause);
        this.dom.resetButton.addEventListener('click', callbacks.onReset);

        // 언어 선택기 변경 이벤트
        this.dom.langSelector.addEventListener('change', (e) => {
            this.changeLanguage(e.target.value);
        });

        // 초기 언어 설정 (한국어)
    this.changeLanguage(this.currentLang);
        // 리더보드 초기 로딩 텍스트 설정
        this.displayLeaderboard(null, true); 

        // (참고) 수동 새로고침 버튼은 제거 - 자동으로 최대 3회 로드됩니다.

        // 디버그 패널 초기화 (옵션)
        this.createDebugPanel(callbacks);
        // 사운드 설정 패널 생성 (왼쪽 사이드바에 별도 섹션으로 추가)
        this.loadAudioSettingsFromStorage();
        this.createSoundPanel();
        // 저장한 콜백 참조 (uiManager에서 호출하도록 하기 위해)
        this.onTeleportStage = callbacks.onTeleportStage;
        this.onTeleportGoal = callbacks.onTeleportGoal;
        this.onToggleFrame = callbacks.onToggleFrame;
        this.onLeaderboardSaved = callbacks.onLeaderboardSaved;
    }

    /**
     * @description 왼쪽 사이드바에 '조작법'과 동일한 스타일의 별도 섹션으로 사운드 설정 UI를 생성합니다.
     */
    createSoundPanel() {
        try {
            const langPack = this.languageData[this.currentLang] || {};
            const leftSidebar = document.querySelector('.game-sidebar-left');
            if (!leftSidebar) return;

            const section = document.createElement('div');
            section.className = 'sidebar-section';
            section.style = 'margin-top:12px;padding:12px;background:#2a2a2a;border-radius:8px;';

            const h2 = document.createElement('h2');
            h2.textContent = langPack.sound_settings_title || 'Sound';
            h2.style = 'border-bottom:1px solid #444;padding-bottom:8px;margin-bottom:10px;color:#fff;';
            section.appendChild(h2);

            const content = document.createElement('div');
            content.style = 'display:flex;flex-direction:column;gap:8px;';

            // BGM control row
            const bgmRow = document.createElement('div');
            bgmRow.style = 'display:flex;align-items:center;gap:8px;';
            const bgmLabel = document.createElement('div');
            bgmLabel.textContent = langPack.sound_bgm || 'BGM';
            bgmLabel.style = 'min-width:48px;color:#e0e0e0;';
            const bgmToggle = document.createElement('input');
            bgmToggle.type = 'checkbox';
            const bgmSlider = document.createElement('input');
            bgmSlider.type = 'range'; bgmSlider.min = 0; bgmSlider.max = 100; bgmSlider.style = 'flex:1;';
            bgmRow.appendChild(bgmLabel);
            bgmRow.appendChild(bgmToggle);
            bgmRow.appendChild(bgmSlider);
            content.appendChild(bgmRow);

            // SFX control row
            const sfxRow = document.createElement('div');
            sfxRow.style = 'display:flex;align-items:center;gap:8px;';
            const sfxLabel = document.createElement('div');
            sfxLabel.textContent = langPack.sound_sfx || 'SFX';
            sfxLabel.style = 'min-width:48px;color:#e0e0e0;';
            const sfxToggle = document.createElement('input');
            sfxToggle.type = 'checkbox';
            const sfxSlider = document.createElement('input');
            sfxSlider.type = 'range'; sfxSlider.min = 0; sfxSlider.max = 100; sfxSlider.style = 'flex:1;';
            sfxRow.appendChild(sfxLabel);
            sfxRow.appendChild(sfxToggle);
            sfxRow.appendChild(sfxSlider);
            content.appendChild(sfxRow);

            const note = document.createElement('div');
            note.textContent = langPack.sound_note || 'Adjust background music and sound effects volume.';
            note.style = 'font-size:12px;color:#9aa5b1;margin-top:6px;';
            content.appendChild(note);

            section.appendChild(content);

            // insert section at top of left sidebar (after the main h2 area)
            const existingH2 = leftSidebar.querySelector('h2');
            if (existingH2 && existingH2.parentNode) {
                // append after the controls block
                leftSidebar.appendChild(section);
            } else {
                leftSidebar.appendChild(section);
            }

            // wire up values and events, load saved settings
            const saved = this.audioSettings || null;
            const bgmEnabled = saved && typeof saved.bgmEnabled === 'boolean' ? saved.bgmEnabled : audioManager.isBGMEnabled();
            const sfxEnabled = saved && typeof saved.sfxEnabled === 'boolean' ? saved.sfxEnabled : audioManager.isSFXEnabled();
            const bgmVol = saved && typeof saved.bgmVolume === 'number' ? saved.bgmVolume : audioManager.getBGMVolume();
            const sfxVol = saved && typeof saved.sfxVolume === 'number' ? saved.sfxVolume : audioManager.getSFXVolume();

            bgmToggle.checked = !!bgmEnabled;
            bgmSlider.value = Math.round(bgmVol * 100);
            sfxToggle.checked = !!sfxEnabled;
            sfxSlider.value = Math.round(sfxVol * 100);

            // event handlers: apply to audioManager and persist
            bgmToggle.onchange = () => {
                audioManager.toggleBGM(bgmToggle.checked);
                this.saveAudioSettingsToStorage();
            };
            bgmSlider.oninput = () => {
                const v = bgmSlider.value / 100;
                audioManager.setBGMVolume(v);
                this.saveAudioSettingsToStorage();
            };
            sfxToggle.onchange = () => {
                audioManager.toggleSFX(sfxToggle.checked);
                this.saveAudioSettingsToStorage();
            };
            sfxSlider.oninput = () => {
                const v = sfxSlider.value / 100;
                audioManager.setSFXVolume(v);
                this.saveAudioSettingsToStorage();
            };

            this.soundPanel = { section, h2, note, bgmLabel, sfxLabel, bgmToggle, bgmSlider, sfxToggle, sfxSlider };
        } catch (e) {
            console.error('createSoundPanel failed', e);
        }
    }

    /**
     * Load audio settings from localStorage into this.audioSettings
     */
    loadAudioSettingsFromStorage() {
        try {
            const raw = localStorage.getItem('audio_settings_v1');
            if (!raw) { this.audioSettings = null; return; }
            this.audioSettings = JSON.parse(raw);
            // apply to audioManager immediately
            if (this.audioSettings) {
                if (typeof this.audioSettings.bgmVolume === 'number') audioManager.setBGMVolume(this.audioSettings.bgmVolume);
                if (typeof this.audioSettings.sfxVolume === 'number') audioManager.setSFXVolume(this.audioSettings.sfxVolume);
                if (typeof this.audioSettings.bgmEnabled === 'boolean') audioManager.toggleBGM(this.audioSettings.bgmEnabled);
                if (typeof this.audioSettings.sfxEnabled === 'boolean') audioManager.toggleSFX(this.audioSettings.sfxEnabled);
            }
        } catch (e) {
            console.error('loadAudioSettingsFromStorage failed', e);
            this.audioSettings = null;
        }
    }

    /**
     * Persist current UI values to localStorage
     */
    saveAudioSettingsToStorage() {
        try {
            if (!this.soundPanel) return;
            const s = {
                bgmEnabled: !!this.soundPanel.bgmToggle.checked,
                sfxEnabled: !!this.soundPanel.sfxToggle.checked,
                bgmVolume: (this.soundPanel.bgmSlider.value / 100) || 0,
                sfxVolume: (this.soundPanel.sfxSlider.value / 100) || 0
            };
            localStorage.setItem('audio_settings_v1', JSON.stringify(s));
        } catch (e) {
            console.error('saveAudioSettingsToStorage failed', e);
        }
    }

    /**
     * @description 런타임에 호출되어 디버그 패널의 스테이지 버튼을 채웁니다.
     * @param {Array} stages - loadCombinedStages에서 읽은 모든 스테이지 JSON 배열
     */
    populateDebugStages(stages = []) {
        if (!this.debug || !this.debug.stageContainer) return;
        const container = this.debug.stageContainer;
        container.innerHTML = '';
        const langPack = this.languageData[this.currentLang] || {};
        stages.forEach((stg, idx) => {
            const stageNum = idx + 1;
            const btn = document.createElement('button');
            btn.textContent = `${langPack.stage || 'Stage'} ${stageNum}`;
            btn.style = 'font-size:12px;padding:6px;margin:4px;';
            btn.onclick = () => {
                if (this.onTeleportStage) this.onTeleportStage(stageNum);
            };

            // Goal으로 이동하는 작은 버튼 추가
            const goalBtn = document.createElement('button');
            goalBtn.textContent = langPack.goal_move || 'Go to Goal';
            goalBtn.style = 'font-size:11px;padding:4px;margin-left:6px;';
            goalBtn.onclick = () => {
                if (this.onTeleportGoal) this.onTeleportGoal(stageNum);
            };

            const wrap = document.createElement('div');
            wrap.style = 'display:flex;align-items:center;';
            wrap.appendChild(btn);
            wrap.appendChild(goalBtn);
            container.appendChild(wrap);
        });
    }

    /**
     * 디버그 UI 패널 생성합니다. (런타임에 스테이지 이동, 프레임 디버그 토글 등)
     * @param {object} callbacks - {onTeleportStage, onToggleFrame}
     */
    createDebugPanel(callbacks = {}) {
        // 헤더 우측에 디버그 패널 추가
        const debug = document.createElement('div');
        debug.id = 'debug-panel';
        debug.style = 'display:none;flex-direction:column;gap:6px;margin-left:12px;'; // 기본 숨김

        // 1) Frame 토글 버튼
        const frameToggle = document.createElement('button');
        frameToggle.textContent = 'Toggle Frame Debug';
        frameToggle.style = 'font-size:12px;padding:4px;';
        frameToggle.onclick = () => {
            if (callbacks.onToggleFrame) callbacks.onToggleFrame();
            if (frameToggle.textContent === 'Toggle Frame Debug') {
                frameToggle.textContent = 'Frame Debug: ON';
            } else {
                frameToggle.textContent = 'Toggle Frame Debug';
            }
        };
        debug.appendChild(frameToggle);

        // 2) Stage teleport container - 버튼은 runtime에서 populateDebugStages로 채움
        const stageContainer = document.createElement('div');
        stageContainer.id = 'debug-stage-container';
        stageContainer.style = 'display:flex;gap:6px;flex-wrap:wrap;max-width:400px;';
        debug.appendChild(stageContainer);

        // 3) Append to header-right so it's visible
        const headerRight = document.querySelector('.header-right');
        if (headerRight) headerRight.appendChild(debug);

        // 4) Debug 패널 토글 함수를 전역에 노출 (콘솔에서 사용 가능)
        window.toggleDebugPanel = () => {
            const visible = debug.style.display !== 'none';
            debug.style.display = visible ? 'none' : 'flex';
            console.log(`Debug panel ${visible ? 'hidden' : 'shown'}`);
        };

        // store references for later use
        this.debug = { panel: debug, stageContainer, frameToggle };
    }

    /**
     * @description 선택된 언어로 UI 텍스트를 변경합니다.
     * @param {string} lang - 'ko' 또는 'en'
     */
    changeLanguage(lang) {
        if (!this.languageData[lang]) return;
        this.currentLang = lang;
        const langPack = this.languageData[lang];

        // 1. 헤더 업데이트
        this.dom.title.textContent = langPack.title;
        // stageLabel을 로컬라이즈합니다.
        this.dom.stageLabel.textContent = (langPack.stage ? (langPack.stage + ':') : 'Stage:');
        this.dom.startButton.textContent = langPack.start;
        this.dom.pauseButton.textContent = langPack.pause;
        this.dom.resetButton.textContent = langPack.reset;

        // 2. 사이드바 업데이트
        this.dom.controlsTitle.textContent = langPack.controls;
        this.dom.leaderboardTitle.textContent = langPack.leaderboard;

        // 3. 조작법 목록 업데이트
        this.dom.controlsList.children[0].innerHTML = `<kbd>←</kbd> / <kbd>→</kbd> : ${langPack.controls_move}`;
        this.dom.controlsList.children[1].innerHTML = `<kbd>Space</kbd> (꾹 누르기) : ${langPack.controls_jump}`;
        this.dom.controlsList.children[2].innerHTML = `<kbd>P</kbd> / <kbd>ESC</kbd> : ${langPack.controls_pause}`;
        
        // 4. (만약 있다면) 리더보드 로딩 텍스트도 업데이트
        if(this.dom.leaderboardContent.dataset.loading === 'true') {
            this.dom.leaderboardContent.innerHTML = `<p>${langPack.leaderboard_loading}</p>`;
        }

        // Update sound panel texts if it exists
        try {
            if (this.soundPanel) {
                this.soundPanel.h2.textContent = langPack.sound_settings_title || 'Sound Settings';
                if (this.soundPanel.bgmLabel) this.soundPanel.bgmLabel.textContent = langPack.sound_bgm || 'BGM';
                if (this.soundPanel.sfxLabel) this.soundPanel.sfxLabel.textContent = langPack.sound_sfx || 'SFX';
                if (this.soundPanel.note) this.soundPanel.note.textContent = langPack.sound_note || 'Adjust background music and sound effects volume.';
            }
        } catch (e) { console.error('changeLanguage:update soundPanel failed', e); }

        // Re-render leaderboard in the new language if we have cached data
        try {
            if (this._lastLeaderboard !== null) {
                // if it was loading, show loading text; otherwise re-render with data
                const wasLoading = (this.dom.leaderboardContent && this.dom.leaderboardContent.dataset && this.dom.leaderboardContent.dataset.loading === 'true');
                this.displayLeaderboard(this._lastLeaderboard, wasLoading);
            }
        } catch (e) { console.error('changeLanguage:re-render leaderboard failed', e); }
    }

    /**
     * 스테이지 클리어 처리를 간단한 prompt/alert로 처리합니다.
     * @param {number} clearTime - ms
     * @param {number} stage - stage number
     */
    showStageCleared(clearTime, stage) {
        const seconds = (clearTime / 1000).toFixed(2);
        const langPack = this.languageData[this.currentLang] || {};
        const defaultName = langPack.prompt_default_name || 'Player';
        const promptTemplate = langPack.stage_cleared_prompt || `Stage {stage} Cleared! Time: {time}s\nEnter your name to save to leaderboard:`;
        const promptText = promptTemplate.replace('{stage}', stage).replace('{time}', seconds);
        const name = prompt(promptText, defaultName);
        if (name === null) {
            // user cancelled: show the clear time and still request a leaderboard refresh
            const clearTemplate = langPack.alert_clear_time || 'Clear time: {time}s';
            alert(clearTemplate.replace('{time}', seconds));
            if (this.onLeaderboardSaved) {
                try { this.onLeaderboardSaved('cancel'); } catch (e) { console.error(e); }
            }
            return;
        }

        DataManager.saveScoreToFirebase(name || defaultName, clearTime, stage)
            .then((res) => {
                if (res && res.success) {
                    alert(langPack.alert_saved || 'Saved to Firebase');
                    // 저장 완료를 상위(게임 컨트롤러)에 알려 자동 갱신을 요청할 수 있게 함
                    if (this.onLeaderboardSaved) {
                        try { this.onLeaderboardSaved(); } catch (e) { console.error(e); }
                    }
                } else {
                    alert(langPack.alert_save_failed || 'Save to Firebase failed');
                }
            })
            .catch((e) => {
                console.error(e);
                alert(langPack.alert_save_failed || 'Save to Firebase failed');
            });
    }

    /**
     * @description 스테이지 진행도 숫자를 업데이트합니다.
     * @param {number} stage 
     */
    updateStage(stage, stageName) {
        // Keep the label (e.g. 'Stage:') in `stageLabel`, and show numeric/value in `stageValue`.
        if (stageName) {
            this.dom.stageValue.textContent = `${stage} : ${stageName}`;
        } else {
            this.dom.stageValue.textContent = `${stage}`;
        }
    }

    /**
     * @description 밀리초(ms)를 보기 좋은 문자열로 변환합니다. (초 소수 둘째자리)
     * @param {number} ms
     */
    formatTime(ms) {
        if (typeof ms !== 'number' || !isFinite(ms)) return '-';
        return (ms / 1000).toFixed(2) + 's';
    }

    /**
     * @description 리더보드 내용을 HTML로 렌더링합니다.
     * @param {Array<object> | null} data - Firebase에서 받은 랭킹 데이터
     * @param {boolean} isLoading - 로딩 중 상태인지 여부
     */
    displayLeaderboard(data, isLoading = false) {
        // cache last leaderboard data so it can be re-rendered when language changes
        this._lastLeaderboard = data;
        const langPack = this.languageData[this.currentLang];
        if (isLoading) {
            this.dom.leaderboardContent.dataset.loading = 'true';
            this.dom.leaderboardContent.innerHTML = `<p>${langPack.leaderboard_loading}</p>`;
            return;
        }

        this.dom.leaderboardContent.dataset.loading = 'false';

        if (!data || data.length === 0) {
            this.dom.leaderboardContent.innerHTML = `<p>${langPack.leaderboard_empty}</p>`;
            return;
        }

        // data가 객체로 올 경우(RTDB) 배열로 변환
        const dataArray = Array.isArray(data) ? data : Object.values(data);
        
        // (기획서 7번) 클리어 타임(time) 기준으로 오름차순 정렬, 상위 10명만 표시
        dataArray.sort((a, b) => a.time - b.time);
        const TOP_N = 10;
        const topList = dataArray.slice(0, TOP_N);

        let html = '<ol class="leaderboard-list">';
        topList.forEach((entry, idx) => {
            const rank = idx + 1;
            const timeStr = this.formatTime(entry.time);
            // 상위 3명에게 간단한 이모지로 강조
            let medal = '';
            if (rank === 1) medal = ' 🥇';
            else if (rank === 2) medal = ' 🥈';
            else if (rank === 3) medal = ' 🥉';

            // ol이 자체적으로 숫자를 붙이므로 li 내부에는 번호를 중복 표기하지 않음
            const lpStageLabel = (langPack && langPack.stage) ? langPack.stage : 'Stage';
            html += `<li class="leaderboard-item"><span class="lb-name">${entry.name}${medal}</span><span class="lb-time">${timeStr}</span><span class="lb-stage">${lpStageLabel} ${entry.stage}</span></li>`;
        });
        html += '</ol>';
        this.dom.leaderboardContent.innerHTML = html;
    }

    /**
     * @description 기획서 3번 (튜토리얼 시스템)
     */
    showTutorial() {
        console.log('[Tutorial] 튜토리얼을 시작합니다...');
        const langPack = this.languageData[this.currentLang] || {};

        // 단계별 콘텐츠 배열
        const steps = [
            {
                title: langPack.tutorial_welcome || 'Welcome',
                body: langPack.tutorial_start || ''
            },
            {
                title: langPack.tutorial_step_controls_title || 'Controls',
                body: langPack.tutorial_step_controls_desc || ''
            },
            {
                title: langPack.tutorial_step_leaderboard_title || 'Leaderboard',
                body: langPack.tutorial_step_leaderboard_desc || ''
            },
            {
                title: langPack.tutorial_step_settings_title || 'Settings',
                body: langPack.tutorial_step_settings_desc || ''
            },
            {
                title: langPack.tutorial_step_startpos_title || 'Start Position',
                body: langPack.tutorial_step_startpos_desc || ''
            }
        ];

        // 오버레이 및 박스 생성
        const overlay = document.createElement('div');
        overlay.id = 'tutorial-overlay';
        overlay.style = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.75); z-index: 1000;
            display: flex; justify-content: center; align-items: center;
        `;

        const contentBox = document.createElement('div');
        contentBox.id = 'tutorial-box';
        contentBox.style = `
            background: #2a2a2a; color: white; padding: 24px;
            border-radius: 10px; text-align: left; width: min(760px, 92%);
            box-shadow: 0 6px 18px rgba(0,0,0,0.6); position: relative; overflow: hidden;
        `;

        // 내부 구조: 제목 / 본문 / 네비게이션
        const titleEl = document.createElement('h2');
        titleEl.style = 'margin-top:0;margin-bottom:10px;position:relative;z-index:3;';
        const bodyEl = document.createElement('div');
        bodyEl.style = 'font-size:16px;color:#e6eef6;line-height:1.4;margin-bottom:16px;position:relative;z-index:3;';

        // ensure pulse animation CSS exists (only once)
        if (!document.getElementById('tutorial-effect-styles')) {
            const style = document.createElement('style');
            style.id = 'tutorial-effect-styles';
            style.textContent = `
                @keyframes tutorialEffectPulse {
                    0% { transform: scale(1); opacity: 0.6; }
                    50% { transform: scale(1.06); opacity: 0.95; }
                    100% { transform: scale(1); opacity: 0.6; }
                }
                `;
            document.head.appendChild(style);
        }

        // effect element (background effector) - appended to overlay so it can be positioned anywhere on screen
        const effectEl = document.createElement('div');
        effectEl.id = 'tutorial-step-effect';
        effectEl.style = `
            position: absolute; z-index: 1001; pointer-events: none;
            transition: transform 360ms ease, opacity 360ms ease, background 360ms ease, top 360ms ease, left 360ms ease, width 360ms ease, height 360ms ease;
            opacity: 0.9; transform: scale(1); animation: tutorialEffectPulse 1.8s ease-in-out infinite;
            border-radius: 14px; background-repeat: no-repeat; background-size: 140% 140%;
            filter: blur(10px);
            mix-blend-mode: screen; box-shadow: 0 0 48px rgba(0,0,0,0.35), 0 0 120px rgba(255,255,255,0.03) inset;
        `;

        const progressEl = document.createElement('div');
        progressEl.style = 'font-size:12px;color:#9aa5b1;margin-bottom:12px;';

        const nav = document.createElement('div');
        nav.style = 'display:flex;justify-content:flex-end;gap:8px;align-items:center;';

        const prevBtn = document.createElement('button');
        prevBtn.textContent = langPack.tutorial_prev || 'Prev';
        prevBtn.style = 'padding:8px 12px;font-size:14px;';

        const nextBtn = document.createElement('button');
        nextBtn.textContent = langPack.tutorial_next || 'Next';
        nextBtn.style = 'padding:8px 12px;font-size:14px;';

        const finishBtn = document.createElement('button');
        finishBtn.textContent = langPack.tutorial_finish || 'Start';
        finishBtn.style = 'padding:8px 12px;font-size:14px;background:#00aaff;color:#fff;border:none;border-radius:6px;';

        // Note: 'Skip' / '알겠습니다' button removed per request
        nav.appendChild(prevBtn);
        nav.appendChild(nextBtn);
        nav.appendChild(finishBtn);

        contentBox.appendChild(progressEl);
        contentBox.appendChild(titleEl);
        contentBox.appendChild(bodyEl);
        contentBox.appendChild(nav);
        overlay.appendChild(effectEl);
        overlay.appendChild(contentBox);
        document.body.appendChild(overlay);

        // Start button original styles saved for restore when tutorial ends or when step changes
        const originalStyles = { zIndex: this.dom.startButton.style.zIndex, boxShadow: this.dom.startButton.style.boxShadow, position: this.dom.startButton.style.position };

        let idx = 0;
        // backgrounds for each step (subtle gradients / shapes)
        const effectBackgrounds = [
            // welcome - strong teal glow
            'radial-gradient(circle at 25% 30%, rgba(0,170,255,0.48), rgba(0,170,255,0.22) 30%, transparent 45%), radial-gradient(circle at 80% 70%, rgba(0,200,150,0.28), transparent 30%)',
            // controls - vivid purple/pink
            'radial-gradient(circle at 20% 20%, rgba(200,100,230,0.44), rgba(180,80,220,0.2) 30%, transparent 45%), radial-gradient(circle at 75% 75%, rgba(140,80,210,0.18), transparent 35%)',
            // leaderboard - bright gold
            'radial-gradient(circle at 30% 60%, rgba(255,210,90,0.42), rgba(255,180,50,0.18) 30%, transparent 45%), radial-gradient(circle at 70% 30%, rgba(255,160,30,0.12), transparent 35%)',
            // settings - deep blue
            'radial-gradient(circle at 40% 40%, rgba(60,140,255,0.44), rgba(20,220,240,0.18) 30%, transparent 45%), radial-gradient(circle at 65% 65%, rgba(30,200,230,0.12), transparent 35%)',
            // start position - vivid green
            'radial-gradient(circle at 30% 40%, rgba(80,220,120,0.44), rgba(100,230,140,0.18) 30%, transparent 45%), radial-gradient(circle at 70% 70%, rgba(120,240,160,0.12), transparent 35%)'
        ];

        const renderStep = (i) => {
            const s = steps[i];
            progressEl.textContent = `${i + 1} / ${steps.length}`;
            titleEl.textContent = s.title;
            bodyEl.textContent = s.body;

            prevBtn.disabled = i === 0;
            nextBtn.style.display = i === steps.length - 1 ? 'none' : '';
            finishBtn.style.display = i === steps.length - 1 ? '' : 'none';

            // compute target rect for this step (highlight area on the page)
            let targetElem = null;
            if (i === 0) {
                // welcome - center behind the tutorial box
                targetElem = contentBox;
            } else if (i === 1) {
                targetElem = document.getElementById('controls-list') || this.dom.controlsList;
            } else if (i === 2) {
                targetElem = document.getElementById('leaderboard-content') || this.dom.leaderboardContent;
            } else if (i === 3) {
                targetElem = (this.soundPanel && this.soundPanel.section) || document.querySelector('.sidebar-section');
            } else if (i === 4) {
                targetElem = this.dom.startButton;
            }

            // fallback to contentBox if target not found
            if (!targetElem) targetElem = contentBox;

            const rect = targetElem.getBoundingClientRect();
            const pageX = window.scrollX || window.pageXOffset || 0;
            const pageY = window.scrollY || window.pageYOffset || 0;

            // apply background and position/size
            const bg = effectBackgrounds[i] || 'transparent';
            effectEl.style.background = bg;
            // increase intensity so tutorial gradient light is more visible
            effectEl.style.opacity = '0.85';
            effectEl.style.transform = 'scale(1.02)';
            // set absolute position relative to viewport (overlay is fixed)
            effectEl.style.top = (rect.top + pageY) + 'px';
            effectEl.style.left = (rect.left + pageX) + 'px';
            effectEl.style.width = Math.max(60, rect.width) + 'px';
            effectEl.style.height = Math.max(40, rect.height) + 'px';
            effectEl.style.borderRadius = '10px';
            // subtle pulse back to normal
            setTimeout(() => { try { effectEl.style.transform = 'scale(1)'; } catch (e) {} }, 220);

            // Only highlight the Start button on the final tutorial step
            try {
                if (i === steps.length - 1) {
                    this.dom.startButton.style.position = 'relative';
                    this.dom.startButton.style.zIndex = '1100';
                    this.dom.startButton.style.boxShadow = '0 0 18px 6px rgba(0,170,255,0.45)';
                } else {
                    // restore original style for other steps
                    this.dom.startButton.style.zIndex = originalStyles.zIndex || '';
                    this.dom.startButton.style.boxShadow = originalStyles.boxShadow || '';
                    if (originalStyles.position) this.dom.startButton.style.position = originalStyles.position;
                }
            } catch (e) { /* ignore */ }
        };

        prevBtn.onclick = () => { if (idx > 0) { idx--; renderStep(idx); } };
        nextBtn.onclick = () => { if (idx < steps.length - 1) { idx++; renderStep(idx); } };

        const cleanup = () => {
            try {
                if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
            } catch (e) {}
            try {
                this.dom.startButton.style.zIndex = originalStyles.zIndex || '';
                this.dom.startButton.style.boxShadow = originalStyles.boxShadow || '';
            } catch (e) {}
        };

        finishBtn.onclick = () => {
            cleanup();
            try { DataManager.saveTutorialStatus(true); } catch (e) { console.error(e); }
        };

        // no skip button handler (button removed)

        // 초기 렌더
        renderStep(idx);
    }
}

// gameController에서 사용할 수 있도록 인스턴스 생성
export const uiManager = new UIManager();