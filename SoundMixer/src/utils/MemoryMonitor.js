/**
 * MemoryMonitor - 메모리 사용량 추적 및 시각화
 * 
 * [기능]
 * - Worker와 메인 스레드 메모리 사용량 추적
 * - 실시간 메모리 그래프 표시 (옵션)
 * - 메모리 누수 감지
 * - 캐시 크기 추적
 */

export class MemoryMonitor {
    constructor(options = {}) {
        this.enabled = options.enabled !== false; // 기본 활성화
        this.showUI = options.showUI || false; // UI 표시 여부
        this.updateInterval = options.updateInterval || 1000; // 업데이트 주기 (ms)
        
        // 메모리 히스토리 (최근 60개)
        this.history = {
            main: [],
            worker: [],
            timestamps: []
        };
        
        // 통계
        this.stats = {
            main: { current: 0, peak: 0, average: 0 },
            worker: { current: 0, peak: 0, average: 0 },
            total: { current: 0, peak: 0, average: 0 }
        };
        
        // UI 엘리먼트
        this.container = null;
        
        if (this.enabled) {
            this.start();
        }
    }
    
    /**
     * 모니터링 시작
     */
    start() {
        if (this.intervalId) return;
        
        // UI 생성
        if (this.showUI) {
            this.createUI();
        }
        
        // 주기적 업데이트
        this.intervalId = setInterval(() => {
            this.update();
        }, this.updateInterval);
        
        console.log('[MemoryMonitor] Started');
    }
    
    /**
     * 모니터링 중지
     */
    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        
        if (this.container) {
            this.container.remove();
            this.container = null;
        }
        
        console.log('[MemoryMonitor] Stopped');
    }
    
    /**
     * 메모리 업데이트
     */
    update() {
        // 메인 스레드 메모리
        let mainMemory = 0;
        if (performance.memory) {
            mainMemory = performance.memory.usedJSHeapSize;
        }
        
        // 히스토리 추가
        this.history.main.push(mainMemory);
        this.history.timestamps.push(Date.now());
        
        // 최근 60개만 유지
        if (this.history.main.length > 60) {
            this.history.main.shift();
            this.history.timestamps.shift();
        }
        
        // 통계 계산
        this.stats.main.current = mainMemory;
        this.stats.main.peak = Math.max(this.stats.main.peak, mainMemory);
        this.stats.main.average = this.history.main.reduce((a, b) => a + b, 0) / this.history.main.length;
        
        // Worker 메모리는 postMessage로 받음 (updateWorkerMemory 호출)
        this.stats.total.current = this.stats.main.current + this.stats.worker.current;
        this.stats.total.peak = this.stats.main.peak + this.stats.worker.peak;
        
        // UI 업데이트
        if (this.showUI && this.container) {
            this.updateUI();
        }
        
        // 메모리 누수 감지 (1GB 초과)
        if (this.stats.total.current > 1024 * 1024 * 1024) {
            console.warn('[MemoryMonitor] High memory usage:', this.formatBytes(this.stats.total.current));
        }
    }
    
    /**
     * Worker 메모리 업데이트 (Worker에서 postMessage로 호출)
     */
    updateWorkerMemory(heapUsed) {
        this.history.worker.push(heapUsed);
        
        if (this.history.worker.length > 60) {
            this.history.worker.shift();
        }
        
        this.stats.worker.current = heapUsed;
        this.stats.worker.peak = Math.max(this.stats.worker.peak, heapUsed);
        this.stats.worker.average = this.history.worker.reduce((a, b) => a + b, 0) / this.history.worker.length;
    }
    
    /**
     * UI 생성
     */
    createUI() {
        this.container = document.createElement('div');
        this.container.id = 'memory-monitor';
        this.container.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            background: rgba(0, 0, 0, 0.85);
            color: #00ff00;
            padding: 15px;
            border-radius: 8px;
            font-family: 'Consolas', monospace;
            font-size: 12px;
            z-index: 10000;
            min-width: 280px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
            border: 1px solid rgba(0, 255, 0, 0.3);
        `;
        
        document.body.appendChild(this.container);
    }
    
    /**
     * UI 업데이트
     */
    updateUI() {
        if (!this.container) return;
        
        const mainMB = this.formatBytes(this.stats.main.current);
        const mainPeakMB = this.formatBytes(this.stats.main.peak);
        const workerMB = this.formatBytes(this.stats.worker.current);
        const workerPeakMB = this.formatBytes(this.stats.worker.peak);
        const totalMB = this.formatBytes(this.stats.total.current);
        const totalPeakMB = this.formatBytes(this.stats.total.peak);
        
        // 메모리 사용률 (가정: 총 2GB)
        const totalLimit = 2 * 1024 * 1024 * 1024;
        const usagePercent = ((this.stats.total.current / totalLimit) * 100).toFixed(1);
        
        // 색상 결정
        let color = '#00ff00'; // 녹색
        if (usagePercent > 70) color = '#ffaa00'; // 주황
        if (usagePercent > 90) color = '#ff0000'; // 빨강
        
        this.container.innerHTML = `
            <div style="font-size: 14px; font-weight: bold; margin-bottom: 10px; color: ${color};">
                🧠 Memory Monitor
            </div>
            <div style="margin-bottom: 8px;">
                <div style="color: #aaa;">Main Thread:</div>
                <div style="padding-left: 10px;">
                    Current: <span style="color: #0ff;">${mainMB}</span> | 
                    Peak: <span style="color: #f0f;">${mainPeakMB}</span>
                </div>
            </div>
            <div style="margin-bottom: 8px;">
                <div style="color: #aaa;">Worker:</div>
                <div style="padding-left: 10px;">
                    Current: <span style="color: #0ff;">${workerMB}</span> | 
                    Peak: <span style="color: #f0f;">${workerPeakMB}</span>
                </div>
            </div>
            <div style="margin-bottom: 10px; padding-top: 8px; border-top: 1px solid rgba(0, 255, 0, 0.3);">
                <div style="color: #fff; font-weight: bold;">Total:</div>
                <div style="padding-left: 10px;">
                    Current: <span style="color: ${color}; font-weight: bold;">${totalMB}</span> | 
                    Peak: <span style="color: #f0f;">${totalPeakMB}</span>
                </div>
            </div>
            <div style="margin-top: 10px;">
                <div style="background: rgba(255, 255, 255, 0.1); height: 20px; border-radius: 10px; overflow: hidden;">
                    <div style="background: ${color}; height: 100%; width: ${usagePercent}%; transition: width 0.3s;"></div>
                </div>
                <div style="text-align: center; margin-top: 5px; color: ${color}; font-weight: bold;">
                    ${usagePercent}% Usage
                </div>
            </div>
        `;
    }
    
    /**
     * 바이트를 읽기 쉬운 형식으로 변환
     */
    formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    /**
     * 통계 출력
     */
    printStats() {
        console.log('[MemoryMonitor] Statistics:');
        console.log('  Main Thread:', {
            current: this.formatBytes(this.stats.main.current),
            peak: this.formatBytes(this.stats.main.peak),
            average: this.formatBytes(this.stats.main.average)
        });
        console.log('  Worker:', {
            current: this.formatBytes(this.stats.worker.current),
            peak: this.formatBytes(this.stats.worker.peak),
            average: this.formatBytes(this.stats.worker.average)
        });
        console.log('  Total:', {
            current: this.formatBytes(this.stats.total.current),
            peak: this.formatBytes(this.stats.total.peak)
        });
    }
    
    /**
     * 통계 리셋
     */
    reset() {
        this.history = {
            main: [],
            worker: [],
            timestamps: []
        };
        
        this.stats = {
            main: { current: 0, peak: 0, average: 0 },
            worker: { current: 0, peak: 0, average: 0 },
            total: { current: 0, peak: 0, average: 0 }
        };
        
        console.log('[MemoryMonitor] Reset');
    }
}
