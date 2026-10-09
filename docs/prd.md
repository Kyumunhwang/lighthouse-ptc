# Product Requirements Document: PTC Reservation App

## 1. Project Overview
* **Name:** PTC Reservation
* **Objective:** 학부모 상담(PTC) 기간 중 학부모가 원하는 교사와 시간을 직접 예약하고, 교사/운영자가 이를 관리할 수 있는 웹 기반 예약 시스템.
* **Target Users:** 학부모(예약자), 교사(스케줄 확인자), 교감/운영자(전체 관리 및 수정자).
* **Database:** Google Sheets (ID: `1A_fUTXGHHGSNH8tE8Vh49sS5MKDRcz05W0wiiVfdFeA`)

## 2. Data Structure (Google Sheets)
* **`teacher` 시트:** 영문/한글 교사명, 직책, 상담 옵션(최대 8개).
* **`time` 시트:** 10월 30일(목), 11월 1일(금)의 요일, 시간, 날짜 및 코멘트.
* **`roster` 시트:** 반, 학생명(한글/영문), 부/모 이름.
* **`reservations` 시트 (신규 생성 필요):** 학부모가 예약한 내역(학생명, 부모명, 예약된 교사, 시간, 상담옵션)을 저장할 DB 시트.

## 3. Core User Flows
### A. 학부모 (Parents)
1. **Login & Auth:** 구글 계정(OAuth)으로 로그인.
2. **Identification:** `roster` 시트의 데이터와 매칭. (자녀의 이름과 학부모 이름을 입력/선택하여 인증된 사용자와 자녀 정보를 연결).
3. **Instruction:** 메인 화면에 PTC 예약 관련 기본 안내 사항 노출.
4. **Reservation Process:**
   * `teacher` 시트를 기반으로 상담을 원하는 교사와 '상담 옵션' 선택 (최대 4개 제한).
   * `time` 시트를 기반으로 시간 선택. 
   * **[Critical] 중복 예약 방지:** `reservations` 시트를 실시간 조회하여 다른 학부모가 이미 예약한 교사+시간 슬롯은 **완전 비활성화(Disabled/Grayed out)** 처리.
5. **Confirmation:** 예약 완료 시, 한 페이지 분량의 '상담 예약 Slip(요약본)' 화면 제공 및 인쇄/PDF 저장 기능 지원.

### B. 교사 (Teachers)
* **Teacher Dashboard:** 드롭다운 메뉴로 본인의 이름을 선택하면, 자신에게 예약된 학부모 상담 스케줄표만 필터링되어 표시.

### C. 운영자 (Admin)
* **Master Dashboard:** 전체 교사의 예약 현황을 한눈에 볼 수 있는 타임테이블 뷰 제공.
* **Manual Override:** 필요한 경우 운영자가 시스템 상에서 직접 스케줄을 변경/취소/강제 할당할 수 있는 관리자 권한.