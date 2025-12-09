/**
 * ResourcePreloader Worker
 * 
 * [목적]
 * - 모든 리소스 프리로딩을 백그라운드에서 처리
 * - 메인 스레드 블로킹 방지
 * 
 * [지원 리소스]
 * - 비디오 (video)
 * - 이미지 (image)
 * - JSON (json)
 * - 오디오 (audio)
 * 
 * [메시지 프로토콜]
 * Request:
 *   { action: 'preload', resources: [{ type, url, id }] }
 * 
 * Response:
 *   { action: 'preloaded', results: [{ id, type, data, success, error }] }
 *   { action: 'progress', loaded, total, percent }
 *   { action: 'memory', heapUsed, heapTotal, external }
 */

// 메모리 사용량 추적
let memoryStats = {
    heapUsed: 0,
    heapTotal: 0,
    external: 0
};

// 메모리 업데이트 (성능 API 사용)
function updateMemoryStats() {
    if (performance.memory) {
        memoryStats = {
            heapUsed: performance.memory.usedJSHeapSize,
            heapTotal: performance.memory.totalJSHeapSize,
            external: performance.memory.jsHeapSizeLimit - performance.memory.totalJSHeapSize
        };
    }
}

// 리소스 로드 함수
async function loadResource(resource) {
    const { type, url, id } = resource;
    
    try {
        switch (type) {
            case 'video':
                return await loadVideo(url, id);
            
            case 'image':
                return await loadImage(url, id);
            
            case 'json':
                return await loadJSON(url, id);
            
            case 'audio':
                return await loadAudio(url, id);
            
            default:
                throw new Error(`Unknown resource type: ${type}`);
        }
    } catch (error) {
        return {
            id,
            type,
            data: null,
            success: false,
            error: error.message
        };
    }
}

// 비디오 로드 (Blob으로 전달)
async function loadVideo(url, id) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const blob = await response.blob();
    
    return {
        id,
        type: 'video',
        data: blob,
        success: true,
        size: blob.size
    };
}

// 이미지 로드 (Blob으로 전달)
async function loadImage(url, id) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const blob = await response.blob();
    
    return {
        id,
        type: 'image',
        data: blob,
        success: true,
        size: blob.size
    };
}

// JSON 로드 (파싱된 객체로 전달)
async function loadJSON(url, id) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const json = await response.json();
    
    return {
        id,
        type: 'json',
        data: json,
        success: true,
        size: new Blob([JSON.stringify(json)]).size
    };
}

// 오디오 로드 (ArrayBuffer로 전달)
async function loadAudio(url, id) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const arrayBuffer = await response.arrayBuffer();
    
    return {
        id,
        type: 'audio',
        data: arrayBuffer,
        success: true,
        size: arrayBuffer.byteLength
    };
}

// 메시지 핸들러
self.onmessage = async (e) => {
    const { action, resources } = e.data;
    
    if (action === 'preload') {
        const total = resources.length;
        let loaded = 0;
        
        // 메모리 초기 상태
        updateMemoryStats();
        self.postMessage({
            action: 'memory',
            ...memoryStats
        });
        
        // 병렬 로딩 (Promise.all)
        const results = [];
        
        for (const resource of resources) {
            try {
                const result = await loadResource(resource);
                results.push(result);
                
                loaded++;
                
                // 진행률 업데이트
                self.postMessage({
                    action: 'progress',
                    loaded,
                    total,
                    percent: Math.round((loaded / total) * 100),
                    currentResource: resource.id
                });
                
                // 메모리 업데이트 (5개마다)
                if (loaded % 5 === 0) {
                    updateMemoryStats();
                    self.postMessage({
                        action: 'memory',
                        ...memoryStats
                    });
                }
                
            } catch (error) {
                results.push({
                    id: resource.id,
                    type: resource.type,
                    data: null,
                    success: false,
                    error: error.message
                });
                
                loaded++;
                
                self.postMessage({
                    action: 'progress',
                    loaded,
                    total,
                    percent: Math.round((loaded / total) * 100),
                    currentResource: resource.id,
                    error: error.message
                });
            }
        }
        
        // 최종 메모리 상태
        updateMemoryStats();
        self.postMessage({
            action: 'memory',
            ...memoryStats
        });
        
        // 완료 메시지
        self.postMessage({
            action: 'preloaded',
            results,
            totalSize: results.reduce((sum, r) => sum + (r.size || 0), 0)
        });
    }
    
    // 메모리 쿼리
    else if (action === 'getMemory') {
        updateMemoryStats();
        self.postMessage({
            action: 'memory',
            ...memoryStats
        });
    }
};

// 초기화 완료 메시지
self.postMessage({ action: 'ready' });
