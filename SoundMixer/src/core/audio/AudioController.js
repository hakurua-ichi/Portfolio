/**
 * AudioController - 오디오 재생 제어
 * 
 * [단일 책임]
 * - 오디오 재생/정지/일시정지만 담당
 * - AudioConductor를 래핑하여 게임 로직과 분리
 * - 성능 최적화: 직접 호출로 오버헤드 최소화
 */
export class AudioController {
    /**
     * @param {AudioConductor} audioConductor - 오디오 컨덕터
     */
    constructor(audioConductor) {
        this.audio = audioConductor;
        this.isPlaying = false;
    }

    /**
     * 오디오 로드
     * @param {string} audioPath - 오디오 파일 경로
     * @returns {Promise<void>}
     */
    async load(audioPath) {
        await this.audio.load(audioPath);
    }

    /**
     * 오디오 재생 시작
     * @param {number} delay - 지연 시간 (초)
     */
    play(delay = 0) {
        this.audio.play(delay);
        this.isPlaying = true;
    }

    /**
     * 오디오 일시정지
     */
    pause() {
        this.audio.pause();
        this.isPlaying = false;
    }

    /**
     * 오디오 재개
     */
    resume() {
        this.audio.resume();
        this.isPlaying = true;
    }

    /**
     * 오디오 정지
     */
    stop() {
        this.audio.stop();
        this.isPlaying = false;
    }

    /**
     * 현재 재생 시간 가져오기
     * @returns {number} 재생 시간 (초)
     */
    getTime() {
        return this.audio.getTime();
    }

    /**
     * 볼륨 설정
     * @param {number} volume - 볼륨 (0~1)
     */
    setVolume(volume) {
        this.audio.setVolume(volume);
    }

    /**
     * 재생 속도 설정
     * @param {number} rate - 재생 속도 (0.5~2.0)
     */
    setPlaybackRate(rate) {
        this.audio.setPlaybackRate(rate);
    }
}
