# 🎨 SoundMixer: 스킨 및 맵 제작 가이드

이 문서는 리듬게임 **SoundMixer**의 커스텀 스킨을 만드는 방법과 새로운 곡(맵)을 추가하는 방법을 설명합니다.
LLM으로 작성되었습니다.

---

## 🖌️ 1. 스킨 제작 (Custom Skin)

게임의 비주얼을 바꾸려면 `assets/skins/` 폴더 안에 새로운 폴더를 만들고 이미지를 채워 넣어야 합니다.

### 📂 1-1. 폴더 구조

```text
/assets
 └── /skins
      └── /my_neon_skin       <-- [스킨 이름] 폴더 생성
           ├── skin.json      <-- [필수] 설정 파일
           ├── note_1.png     <-- 이미지 파일들...
           ├── gear_bg.png
           └── ...

### 🖼️ 1-2. 필요한 이미지 파일 목록 (권장)
파일명 (예시),  설명,   비고
note_1.png,"    1, 4번 라인 (사이드) 노트", 흰색 계열 권장
note_2.png,"    2, 3번 라인 (센터) 노트",파란색 계열 권장
note_long_body.png, 롱노트 몸통,길게 늘어남 (패턴)
note_long_head.png, 롱노트 머리,(선택사항)
gear_bg.png,    플레이 기어 배경,512x1024 권장
judge_line.png, 판정선,가로로 긴 이미지
judge_perfect, 퍼팩트 이미지 ,판정 이미지
judge_great, 그레이트 이미지 , 판정 이미지
judge_good, 굿 이미지 , 판정 이미지
judge_miss , 미스 이미지 , 판정 이미지
key_beam.png,   키를 눌렀을 때 빛기둥,세로로 긴 그라데이션
hit_effect.png, 판정 성공 시 이펙트,스프라이트 시트 또는 시퀀스

### ⚙️ 1-3. skin.json 작성법 (핵심)
이 파일이 있어야 게임이 이미지를 인식합니다. 3가지 방식으로 이미지를 등록할 수 있습니다.
{
  "name": "My Neon Skin",
  "author": "Creator Name",
  "resources": {
    
    "// 1. 단일 이미지 (파일명만 적음)": "",
    "note_1": "note_white.png",
    "note_2": "note_blue.png",
    "judge_line": "line_laser.png",
    "gear_bg": "background.jpg",
    "judge_perfect": "judge_p.png",
    "judge_great": "judge_g.png",
    "judge_good": "judge_gd.png",
    "judge_miss": "judge_m.png"

    "// 2. 이미지 시퀀스 (연속된 파일: hit1.png, hit2.png ...)": "", 비고 : 작동 안됨.
    "hit_effect": { 
      "type": "sequence", 
      "prefix": "hit_effect", 
      "count": 10,          // 파일 개수 (1번 ~ 10번)
      "ext": ".png" 
    },

    "// 3. 스프라이트 시트 (한 장에 프레임이 다 있는 경우)": "", 비고 : 작동 안됨.
    "key_beam": {
      "type": "sheet",
      "src": "beam_sheet.png",
      "frames": 16,         // 총 프레임 수
      "cols": 4,            // 가로 칸 수
      "rows": 4             // 세로 줄 수
    }
  }
}

### 1-4. 등록하기
assets/skins/skinList.json
[
  { "id": "default", "name": "Neon Default" },
  { "id": "classic", "name": "Classic Style" }
]

## 🎵 2. 맵(곡) 추가 (Map Creation)
### 📂 2-1. 폴더 구조
/assets
 └── /songs
      ├── songList.json       <-- [필수] 전체 곡 목록 파일
      │
      └── /new_song_id        <-- [폴더] 곡 ID (영어 소문자 추천)
           ├── meta.json      <-- [필수] 곡 정보 파일
           ├── music.mp3      <-- 음원
           ├── cover.png      <-- 앨범 자켓 (정사각형 권장)
           ├── chart_ez.json  <-- 에디터로 만든 채보 파일
           └── chart_hd.json

### 📝 2-2. meta.json 작성법
{
  "title": "Super Nova",       // 곡 제목
  "artist": "Night Sky",       // 아티스트
  "bpm": 180,                  // BPM (표시용)
  
  "musicFile": "music.mp3",    // 같은 폴더 내 파일명
  "imageFile": "cover.png",
  
  "// 난이도 설정 (EASY, NORMAL, HARD, EXTREME)": "",
  "charts": {
    "NORMAL": { 
      "file": "chart_ez.json", // 연결할 채보 파일명
      "level": 5               // 표시 레벨
    },
    "HARD": { 
      "file": "chart_hd.json", 
      "level": 11 
    }
  }
}

### 📋 2-3. 등록하기 (songList.json)
마지막으로 assets/songs/songList.json을 열어서 방금 만든 폴더 이름을 추가합니다.
[
  "existing_song",
  "new_song_id"    // <-- 여기에 폴더명 추가!
]

## 🎹 3. 채보 만들기 (Workflow)
1. 에디터 실행: http://localhost:xxxx/editor/ 접속.
2. 오디오 로드: music.mp3 파일을 불러옵니다.
3. 제작:
- Space: 재생/정지
- N: 노트 찍기
- WASD: 노트 위치/시간 미세 조정
L: 롱노트 변환 (Shift + W/S 로 길이 조절)
4. 저장: SAVE JSON 버튼을 눌러 chart.json을 다운로드합니다.
5. 적용: 다운받은 파일을 곡 폴더(assets/songs/new_song_id/)에 넣고 이름을 변경합니다 (예: chart_hd.json).