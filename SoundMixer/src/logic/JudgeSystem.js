/*
    JudgeSystem은 노트 타이밍 판정을 담당합니다.
    PERFECT ±44ms, GREAT ±88ms, GOOD ±132ms, MISS ±176ms로 판정합니다.
*/
import { GlobalStore } from '../data/GlobalStore.js';

export class JudgeSystem {
    constructor() {
        // 판정 타이밍 윈도우 (초 단위) - GlobalStore.constants에서 가져오기
        this.TIMING_WINDOW = {
            PERFECT: GlobalStore.constants.TIMING.JUDGE_WINDOW_PERFECT,
            GREAT: GlobalStore.constants.TIMING.JUDGE_WINDOW_GREAT,
            GOOD: GlobalStore.constants.TIMING.JUDGE_WINDOW_GOOD,
            MISS: GlobalStore.constants.TIMING.JUDGE_WINDOW_BAD
        };
    }

    // 노트 판정 수행
    evaluate(targetTime, inputTime) {
        const diff = targetTime - inputTime;
        const absDiff = Math.abs(diff);
        
        // 타이밍 방향 판정 (5ms 임계값)
        let timing = 'EXACT';
        if (diff > 0.005) timing = 'EARLY';       // 5ms 이상 빠름
        else if (diff < -0.005) timing = 'LATE';  // 5ms 이상 늦음

        // 판정 등급 결정
        if (absDiff <= this.TIMING_WINDOW.PERFECT) {
            return { result: 'PERFECT', timing, diff: absDiff };
        } 
        else if (absDiff <= this.TIMING_WINDOW.GREAT) {
            return { result: 'GREAT', timing, diff: absDiff };
        } 
        else if (absDiff <= this.TIMING_WINDOW.GOOD) {
            return { result: 'GOOD', timing, diff: absDiff };
        } 
        else if (absDiff <= this.TIMING_WINDOW.MISS) {
            return { result: 'MISS', timing, diff: absDiff };
        } 
        else {
            // 판정 범위 밖 (무시)
            return { result: 'IGNORE', timing: null };
        }
    }
}