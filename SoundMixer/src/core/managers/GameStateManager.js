/**
 * GameStateManager - 게임 상태 관리자
 * 
 * PlayState 캡슐화 및 이벤트 기반 상태 업데이트
 * (유니티 컴포넌트 방식 - 독립적이고 완전한 기능 단위)
 */

import { PlayState } from '../../data/PlayState.js';

export class GameStateManager {
    /**
     * 게임 상태 관리자 생성자
     * @param {EventEmitter} events - 게임 이벤트 버스
     */
    constructor(events) {
        this.events = events;
        this._subscribeEvents();
    }

    /**
     * 이벤트 구독 설정
     * @private
     */
    _subscribeEvents() {
        // 노트 판정 결과
        this.events.on('noteJudged', this._onNoteJudged.bind(this));
        
        // 게임 라이프사이클
        this.events.on('gameStarted', this._onGameStarted.bind(this));
        this.events.on('gamePaused', this._onGamePaused.bind(this));
        this.events.on('gameResumed', this._onGameResumed.bind(this));
        this.events.on('gameFinished', this._onGameFinished.bind(this));
        
        // 체력 체크 (GameEngine의 finish 호출 여부 결정)
        this.events.on('healthCheck', this._onHealthCheck.bind(this));
    }

    /**
     * 노트 판정 처리
     * @param {Object} data - { result: 'PERFECT'|'GREAT'|'GOOD'|'MISS', column: 0-3 }
     * @private
     */
    _onNoteJudged(data) {
        PlayState.addResult(data.result);
        
        // 체력 체크 후 게임 오버 이벤트 발행
        if (PlayState.isFailed) {
            this.events.emit('gameFailed');
        }
    }

    /**
     * 게임 시작 처리
     * @param {Object} data - { songTitle, hpConfig }
     * @private
     */
    _onGameStarted(data) {
        if (data.reset) {
            PlayState.reset(data.songTitle, data.hpConfig);
        } else {
            PlayState.initialize();
        }
    }

    /**
     * 게임 일시정지 처리
     * @private
     */
    _onGamePaused() {
        PlayState.pauseCount++;
    }

    /**
     * 게임 재개 처리
     * @private
     */
    _onGameResumed() {
        // 필요 시 재개 로직 추가
    }

    /**
     * 게임 종료 처리
     * @private
     */
    _onGameFinished() {
        // 필요 시 종료 로직 추가
    }

    /**
     * 체력 체크 요청 처리
     * @private
     */
    _onHealthCheck() {
        if (PlayState.isFailed) {
            this.events.emit('gameFailed');
        }
    }

    /**
     * 정리
     */
    cleanup() {
        this.events.off('noteJudged', this._onNoteJudged.bind(this));
        this.events.off('gameStarted', this._onGameStarted.bind(this));
        this.events.off('gamePaused', this._onGamePaused.bind(this));
        this.events.off('gameResumed', this._onGameResumed.bind(this));
        this.events.off('gameFinished', this._onGameFinished.bind(this));
        this.events.off('healthCheck', this._onHealthCheck.bind(this));
    }
}
