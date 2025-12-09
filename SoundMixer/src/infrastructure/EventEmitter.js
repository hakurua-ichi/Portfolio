/**
 * EventEmitter
 * 
 * 콜백 기반 통신을 이벤트 기반으로 전환하여 결합도를 낮춥니다.
 * 
 * [사용 예시]
 * ```javascript
 * const emitter = new EventEmitter();
 * 
 * // 이벤트 구독
 * emitter.on('gameFinished', (result) => {
 *     console.log('Game finished:', result);
 * });
 * 
 * // 이벤트 발행
 * emitter.emit('gameFinished', { score: 100 });
 * 
 * // 구독 해제
 * emitter.off('gameFinished', listener);
 * ```
 */
export class EventEmitter {
    constructor() {
        this.events = {}; // { eventName: [listener1, listener2, ...] }
    }

    /**
     * 이벤트 구독
     * @param {string} eventName - 이벤트 이름
     * @param {Function} listener - 이벤트 리스너 함수
     */
    on(eventName, listener) {
        if (!this.events[eventName]) {
            this.events[eventName] = [];
        }
        this.events[eventName].push(listener);
    }

    /**
     * 일회성 이벤트 구독
     * @param {string} eventName - 이벤트 이름
     * @param {Function} listener - 이벤트 리스너 함수
     */
    once(eventName, listener) {
        const onceWrapper = (...args) => {
            listener(...args);
            this.off(eventName, onceWrapper);
        };
        this.on(eventName, onceWrapper);
    }

    /**
     * 이벤트 발행
     * @param {string} eventName - 이벤트 이름
     * @param {...any} args - 리스너에 전달할 인자들
     */
    emit(eventName, ...args) {
        if (!this.events[eventName]) return;

        this.events[eventName].forEach(listener => {
            try {
                listener(...args);
            } catch (error) {
                console.error(`[EventEmitter] Error in listener for "${eventName}":`, error);
            }
        });
    }

    /**
     * 이벤트 구독 해제
     * @param {string} eventName - 이벤트 이름
     * @param {Function} listener - 제거할 리스너 함수
     */
    off(eventName, listener) {
        if (!this.events[eventName]) return;

        this.events[eventName] = this.events[eventName].filter(l => l !== listener);

        // 리스너가 없으면 이벤트 삭제
        if (this.events[eventName].length === 0) {
            delete this.events[eventName];
        }
    }

    /**
     * 특정 이벤트의 모든 리스너 제거
     * @param {string} eventName - 이벤트 이름
     */
    removeAllListeners(eventName) {
        if (eventName) {
            delete this.events[eventName];
        } else {
            this.events = {};
        }
    }

    /**
     * 특정 이벤트의 리스너 개수 반환
     * @param {string} eventName - 이벤트 이름
     * @returns {number}
     */
    listenerCount(eventName) {
        return this.events[eventName] ? this.events[eventName].length : 0;
    }
}
