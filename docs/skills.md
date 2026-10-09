# Required Agent Skills & Functions

* `AuthSkill`: Google Identity Services를 활용한 로그인 및 권한 부여.
* `DataFetcherSkill`: `SpreadsheetApp` 클래스를 사용하여 `teacher`, `time`, `roster` 시트의 데이터를 JSON 형태로 파싱하여 프론트엔드로 전달하는 기능.
* `ReservationValidationSkill`: 요청된 교사와 시간이 `reservations` 시트에 존재하는지 검사하고, 최대 예약 가능 횟수(4개)를 초과하지 않았는지 검증하는 서버 사이드 로직.
* `TransactionSkill`: 검증이 완료된 예약 데이터를 `reservations` 시트에 Append하는 안전한 DB 쓰기 기능 (Lock Service 포함).
* `SlipGeneratorSkill`: 프론트엔드에서 예약 완료된 데이터를 기반으로 CSS `@media print` 속성을 활용해 깔끔한 1페이지 예약증(Slip)을 렌더링하는 기능.
* `AdminPanelSkill`: 관리자 접속 시 `reservations` 데이터를 교사별, 시간대별로 그룹화(Grouping)하여 2차원 매트릭스 테이블로 보여주고 수정 권한을 부여하는 뷰 제어 기능.