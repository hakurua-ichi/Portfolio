export class ResourceManager {
    constructor() {
        this.images = {};
        this.sprites = {};
        this.currentSkin = "default";
        this.skinList = []; 
        // [신규] 렌더링 모드 (skin.json에서 읽기)
        this.renderMode = "bar"; // "bar" (default) 또는 "cycle"
    }

    async loadSkinList() {
        try {
            const res = await fetch('assets/skins/skinList.json');
            if (!res.ok) throw new Error('Skin list not found');
            this.skinList = await res.json();
            console.log('[Skin] Skin list loaded:', this.skinList);
        } catch (e) {
            console.warn('[Skin] No skin list found, using default skin');
            this.skinList = [{ id: "default", name: "Default" }];
        }
    }

    async loadSkin(skinName) {
        // [신규] 기존 리소스 정리 (메모리 누수 방지)
        this._clearResources();
        
        this.currentSkin = skinName;
        const basePath = `assets/skins/${skinName}/`;
        
        // [수정] 스킨 존재 여부 먼저 체크 (404 에러 방지)
        let skinExists = false;
        try {
            const testRes = await fetch(`${basePath}skin.json`, { method: 'HEAD' });
            skinExists = testRes.ok;
        } catch (e) {
            skinExists = false;
        }

        const defaultSkinData = {
            renderMode: "bar", // [신규] 기본값: 바 형태
            resources: {
                "note_1": "note_1.png",
                "note_2": "note_2.png",
                "note_long_body": "note_long.png",
                "judge_line": "judge_line.png",
                "gear_bg": "gear_bg.png",
                "key_beam": "key_beam.png",
                "hit_effect": "hit_effect.png", // [수정] 단일 PNG로 변경
                
                // [신규] 판정 이미지 키 추가
                "judge_perfect": "judge_perfect.png",
                "judge_great": "judge_great.png",
                "judge_good": "judge_good.png",
                "judge_miss": "judge_miss.png"
            }
        };

        let skinData = defaultSkinData;

        if (skinExists) {
            try {
                const res = await fetch(`${basePath}skin.json`);
                if (res.ok) {
                    skinData = await res.json();
                    // [신규] renderMode 추출
                    this.renderMode = skinData.renderMode || "bar";
                    // [신규] gear_bg 투명도 추출 (0.0~1.0, 기본값 0.7)
                    this.gearBgOpacity = skinData.gearBgOpacity !== undefined ? skinData.gearBgOpacity : 0.7;
                    console.log(`[Skin] Loaded skin config for '${skinName}', renderMode: ${this.renderMode}, gearBgOpacity: ${this.gearBgOpacity}`);
                }
            } catch (e) {
                console.warn(`[Skin] Error loading skin '${skinName}':`, e.message);
                this.renderMode = "bar"; // 폴백
                this.gearBgOpacity = 0.7; // [신규] 폴백
            }
        } else {
            console.warn(`[Skin] Skin '${skinName}' not found, using generated assets`);
            this.renderMode = "bar"; // 폴백
            this.gearBgOpacity = 0.7; // [신규] 폴백
        }

        const promises = Object.keys(skinData.resources).map(async (key) => {
            const resDef = skinData.resources[key];
            
            try {
                // 1. 시퀀스
                if (typeof resDef === 'object' && resDef.type === 'sequence') {
                    const frames = [];
                    for(let i=1; i<=resDef.count; i++) {
                        const path = `${basePath}${resDef.prefix}${i}${resDef.ext}`;
                        // [수정] 스킨이 없으면 로드 시도하지 않고 바로 생성
                        if (!skinExists) {
                            const generated = this._generateAsset(`${key}_${i}`);
                            this.images[`${key}_${i}`] = generated;
                            frames.push(generated);
                        } else {
                            const img = await this.loadImageWithFallback(`${key}_${i}`, path); 
                            frames.push(img);
                        }
                    }
                    this.sprites[key] = { type: 'sequence', frames: frames };
                }
                // 2. 스프라이트 시트
                else if (typeof resDef === 'object' && resDef.type === 'sheet') {
                    if (!skinExists) {
                        const generated = this._generateAsset(key);
                        this.images[key] = generated;
                        this.sprites[key] = { type: 'sheet', image: generated, ...resDef };
                    } else {
                        const path = basePath + resDef.src;
                        const img = await this.loadImageWithFallback(key, path);
                        this.sprites[key] = { type: 'sheet', image: img, ...resDef };
                    }
                }
                // 3. 단일 이미지
                else {
                    if (!skinExists) {
                        const generated = this._generateAsset(key);
                        this.images[key] = generated;
                    } else {
                        const src = (typeof resDef === 'string') ? resDef : resDef.src;
                        const path = basePath + src;
                        const img = await this.loadImageWithFallback(key, path);
                        this.images[key] = img;
                    }
                }
            } catch (err) {
                console.warn(`[Skin] Failed to load resource '${key}':`, err.message);
                // 에러 발생 시 자동 생성
                const generated = this._generateAsset(key);
                this.images[key] = generated;
            }
        });

        await Promise.all(promises);
        console.log(`[Skin] '${skinName}' loaded (${Object.keys(this.images).length} images, ${Object.keys(this.sprites).length} sprites)`);
    }

    loadImageWithFallback(key, src) {
        return new Promise((resolve) => {
            const img = new Image();
            
            // [수정] 에러 핸들러를 먼저 설정 (404 콘솔 경고 완전 차단)
            img.onerror = () => {
                // 파일이 없으면 자동 생성 (콘솔 로그 없음)
                const generated = this._generateAsset(key);
                this.images[key] = generated;
                resolve(generated);
            };
            
            img.onload = () => { 
                this.images[key] = img; 
                resolve(img); 
            };
            
            // src 설정을 마지막에 (핸들러 설정 후)
            img.src = src;
        });
    }

    get(key) { return this.images[key]; }
    getSprite(key) { return this.sprites[key]; }
    
    // [신규] gear_bg 투명도 반환
    getGearBgOpacity() {
        return this.gearBgOpacity !== undefined ? this.gearBgOpacity : 0.7;
    }
    
    // [신규] 리소스 정리 (메모리 해제)
    _clearResources() {
        // 이미지 객체들의 src를 비워 메모리에서 해제
        Object.keys(this.images).forEach(key => {
            const img = this.images[key];
            if (img instanceof HTMLImageElement) {
                img.src = ''; // 메모리 해제
                img.onload = null;
                img.onerror = null;
            }
            // Canvas는 GC가 알아서 처리
        });
        
        // 스프라이트 시트 정리
        Object.keys(this.sprites).forEach(key => {
            const sprite = this.sprites[key];
            if (sprite.type === 'sequence' && sprite.frames) {
                sprite.frames.forEach(frame => {
                    if (frame instanceof HTMLImageElement) {
                        frame.src = '';
                        frame.onload = null;
                        frame.onerror = null;
                    }
                });
            } else if (sprite.type === 'sheet' && sprite.image instanceof HTMLImageElement) {
                sprite.image.src = '';
                sprite.image.onload = null;
                sprite.image.onerror = null;
            }
        });
        
        this.images = {};
        this.sprites = {};
    }

    // ========================================================
    // 🎨 [화가 모드] 에셋 자동 생성
    // ========================================================
    _generateAsset(key) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        if (key.includes('note_1')) {
            // [수정] 비율 유지하는 사각형 노트 (3:2 비율)
            canvas.width = 120; canvas.height = 80;
            const grad = ctx.createLinearGradient(0, 0, 0, 80);
            grad.addColorStop(0, '#fff'); grad.addColorStop(1, '#aaa');
            this._drawRoundedRect(ctx, 2, 2, 116, 76, 4, grad, '#fff', 2);
            ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(10, 10, 100, 30);
        } 
        else if (key.includes('note_2')) {
            // [수정] 비율 유지하는 사각형 노트 (3:2 비율)
            canvas.width = 120; canvas.height = 80;
            const grad = ctx.createLinearGradient(0, 0, 0, 80);
            grad.addColorStop(0, '#00ffff'); grad.addColorStop(1, '#0044aa');
            this._drawRoundedRect(ctx, 2, 2, 116, 76, 4, grad, '#88ccff', 2);
            ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillRect(10, 10, 100, 30);
        }
        else if (key.includes('note_long_body')) {
            canvas.width = 128; canvas.height = 10;
            ctx.fillStyle = 'rgba(200, 220, 255, 0.3)'; ctx.fillRect(10, 0, 108, 10);
            ctx.fillStyle = 'rgba(100, 150, 255, 0.8)'; ctx.fillRect(10, 0, 5, 10); ctx.fillRect(113, 0, 5, 10);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'; ctx.fillRect(62, 0, 4, 10);
        }
        else if (key.includes('judge_line')) {
            canvas.width = 512; canvas.height = 30;
            const grad = ctx.createLinearGradient(0, 0, 512, 0);
            grad.addColorStop(0, 'rgba(255,0,80,0)'); grad.addColorStop(0.5, 'rgba(255,200,200,1)'); grad.addColorStop(1, 'rgba(255,0,80,0)');
            ctx.fillStyle = grad; ctx.fillRect(0, 10, 512, 6);
            ctx.shadowBlur = 15; ctx.shadowColor = '#ff0055'; ctx.fillRect(0, 12, 512, 2);
        }
        else if (key.includes('key_beam')) {
            canvas.width = 128; canvas.height = 512;
            const grad = ctx.createLinearGradient(0, 512, 0, 0);
            grad.addColorStop(0, 'rgba(200,255,255,0.4)'); grad.addColorStop(1, 'rgba(200,255,255,0)');
            ctx.fillStyle = grad; ctx.fillRect(0, 0, 128, 512);
            ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fillRect(0, 0, 2, 512); ctx.fillRect(126, 0, 2, 512);
        }
        else if (key.includes('gear_bg')) {
            canvas.width = 512; canvas.height = 1024;
            ctx.fillStyle = 'rgba(0,0,0,0.85)'; ctx.fillRect(0, 0, 512, 1024);
            ctx.strokeStyle = 'rgba(0,210,255,0.05)'; ctx.lineWidth = 2;
            for(let x=0; x<=512; x+=128) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 1024); ctx.stroke(); }
            for(let y=0; y<=1024; y+=64) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(512, y); ctx.stroke(); }
            ctx.strokeStyle = '#00d2ff'; ctx.lineWidth = 6;
            ctx.strokeRect(2, 0, 508, 1024);
        }
        else if (key.includes('hit_effect')) {
            canvas.width = 256; canvas.height = 256;
            // 원형 흰색 이펙트
            const centerX = 128, centerY = 128, radius = 80;
            const grad = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
            grad.addColorStop(0, 'rgba(255,255,255,1)');
            grad.addColorStop(0.5, 'rgba(255,255,255,0.8)');
            grad.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, 256, 256);
        }
        else {
            // [핵심] 판정 이미지 등 기타 이미지가 없으면 투명 1x1 반환
            canvas.width = 1; canvas.height = 1;
        }

        return canvas;
    }

    _drawRoundedRect(ctx, x, y, w, h, r, fill, stroke, lw) {
        ctx.beginPath();
        ctx.moveTo(x+r, y); ctx.lineTo(x+w-r, y);
        ctx.quadraticCurveTo(x+w, y, x+w, y+r); ctx.lineTo(x+w, y+h-r);
        ctx.quadraticCurveTo(x+w, y+h, x+w-r, y+h); ctx.lineTo(x+r, y+h);
        ctx.quadraticCurveTo(x, y+h, x, y+h-r); ctx.lineTo(x, y+r);
        ctx.quadraticCurveTo(x, y, x+r, y); ctx.closePath();
        if (fill) { ctx.fillStyle = fill; ctx.fill(); }
        if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
    }
}