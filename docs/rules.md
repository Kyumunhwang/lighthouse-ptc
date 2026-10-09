# System Rules & Development Guidelines

## 1. Tech Stack & Environment
* **Platform:** Google Apps Script (GAS) 기반의 Web App 형태를 강력히 권장. (데이터베이스가 Google Sheets이며 인증이 필요하므로 가장 빠르고 안정적인 연동 가능).
* **Frontend:** HTML, CSS(Tailwind CSS 권장), Vanilla JavaScript.
* **Backend (GAS):** `Code.gs`에서 모든 로직 처리.

## 2. Concurrency & State Management (동시성 제어)
* **Lock Mechanism:** 선착순 예약 시스템의 특성상 동시 접속으로 인한 중복 예약(Double Booking)은 치명적 오류임. 
* **Rule:** GAS의 `LockService.getScriptLock()`을 반드시 사용하여 DB(`reservations` 시트)에 데이터를 기록하기 전 다른 사용자의 쓰기 접근을 차단하고, 기록 직전에 해당 슬롯이 여전히 비어있는지 2차 검증(Double-check)할 것.

## 3. UI/UX Rules
* **Mobile First:** 학부모들은 모바일 환경에서 접속할 확률이 높으므로 반응형(Responsive) 디자인 필수 적용.
* **Intuitive Flow:** [자녀 선택] -> [교사 및 상담옵션 선택 (최대 4개 체크박스)] -> [시간표 선택]의 직관적인 Step-by-step UI를 구성할 것.

## 4. Error Handling
* `roster`에 없는 이름 입력 시 명확한 안내 메시지 출력.
* 세션 만료 또는 중복 예약 시도 발생 시 에러 알림 후 예약 페이지 리로드.