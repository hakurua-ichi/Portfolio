/**
 * ChartLoader - 차트 데이터 로딩
 * 
 * [단일 책임]
 * - 차트 파일 로드 및 파싱만 담당
 * - NoteManager에 차트 데이터 전달
 * - 성능 최적화: 동기 fetch로 빠른 로딩
 */
export class ChartLoader {
    /**
     * @param {NoteManager} noteManager - 노트 매니저
     */
    constructor(noteManager) {
        this.noteManager = noteManager;
    }

    /**
     * 차트 로드
     * @param {string} chartPath - 차트 파일 경로
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async load(chartPath) {
        try {
            const result = await this.noteManager.loadChart(chartPath);
            
            if (!result.success) {
                return {
                    success: false,
                    error: '차트 파일을 불러올 수 없습니다.\n경로: ' + chartPath
                };
            }
            
            return { success: true };
            
        } catch (error) {
            console.error('[ChartLoader] Failed to load chart:', error);
            return {
                success: false,
                error: error.message || '차트 로딩 실패'
            };
        }
    }

    /**
     * 차트 데이터 정리
     */
    cleanup() {
        this.noteManager.cleanup();
        
        // [Phase 1] 메모리 최적화 - 차트 메타데이터 정리
        if (this.noteManager.chartData) {
            this.noteManager.chartData = [];
        }
        
        // 캐시 정리 (있다면)
        if (this.cachedCharts) {
            this.cachedCharts = {};
        }
        
        console.log('[ChartLoader] Cleanup complete');
    }
}
