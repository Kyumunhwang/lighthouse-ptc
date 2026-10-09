# Lighthouse PTC - Parent-Teacher Conference Reservation Portal

Lighthouse PTC는 학부모와 교사 간의 원활한 상담 예약을 지원하는 웹 기반 실시간 예약 포털 시스템입니다. Google Identity Services 및 Google Spreadsheet 데이터와 실시간 연동되어 학기별 명부 갱신 및 상담 관리를 효율적으로 수행합니다.

![Lighthouse PTC Emblem](/emblum.png)

## 📌 주요 기능 (Key Features)

1. **역할 기반 접근 제어 (RBAC)**
   - **학부모 (Parent):** Google 로그인 후 자녀 확인, 원하는 교사의 상담교과 및 시간 선택 (학생당 최대 4과목 예약 제한, 비관적 락을 통한 동시 예약 충돌 방지).
   - **교사 (Teacher):** 담당 교사 전용 실시간 예약 타임테이블 조회 및 브라우저 인쇄 지원.
   - **운영자 (Admin):** 상담 일정/공지사항 즉시 변경, 학년도(2026-2027) 설정, 교사 상담 불가 시간 지정/해제, 교사 추가/삭제, 당일 현장 학부모 검색 및 QR코드 모바일 확인증 즉시 발급.

2. **모바일 최적화 예약 확인증 (Mobile Pass)**
   - 예약 완료 후 스마트폰 화면 최적화 확인증 자동 발행.
   - 고화질 PNG 이미지 저장 기능 (`html2canvas`).
   - 현장 QR 코드 스캔을 통한 즉시 모바일 열람 지원 (`qrcode`).

3. **Google Sheets 실시간 연동**
   - 시트 ID: `1A_fUTXGHHGSNH8tE8Vh49sS5MKDRcz05W0wiiVfdFeA`
   - 대상 시트: `teacher_email`, `teacher`, `time`, `roster`, `reservations`.
   - 학기 전환 시 시트 ID 한 줄 변경으로 무중단 학기 갱신 지원.

---

## 🛠 기술 스택 (Tech Stack)

- **Framework:** Next.js 16 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **Libraries:** QRCode, HTML2Canvas
- **Deployment Target:** Vercel

---

## 🚀 로컬 실행 방법 (Local Development)

```bash
# 의존성 패키지 설치
npm install

# 전용 포트(3042)로 개발 서버 실행
npm run dev:ptc-portal
```

브라우저에서 `http://localhost:3042` 접속.

---

## 🌐 Vercel 웹 호스팅 배포 안내 (Deployment)

1. [Vercel](https://vercel.com)에 로그인 후 **"Add New Project"** 클릭.
2. 연결된 GitHub 계정에서 `lighthouse-ptc` 저장소를 선택하여 **Import**.
3. **Framework Preset**이 `Next.js`로 자동 감지됩니다.
4. **Deploy** 버튼을 클릭하면 수초 내에 글로벌 웹사이트 URL(예: `https://lighthouse-ptc.vercel.app`)로 배포 완료됩니다.
