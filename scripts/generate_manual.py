import docx
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_ALIGN_VERTICAL
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
import datetime

def set_cell_background(cell, color_hex):
    tcPr = cell._element.get_or_add_tcPr()
    shd = OxmlElement('w:shd')
    shd.set(qn('w:val'), 'clear')
    shd.set(qn('w:color'), 'auto')
    shd.set(qn('w:fill'), color_hex)
    tcPr.append(shd)

def set_cell_margins(cell, top=140, bottom=140, left=180, right=180):
    tcPr = cell._element.get_or_add_tcPr()
    tcMar = OxmlElement('w:tcMar')
    for m, val in [('top', top), ('bottom', bottom), ('left', left), ('right', right)]:
        node = OxmlElement(f'w:{m}')
        node.set(qn('w:w'), str(val))
        node.set(qn('w:type'), 'dxa')
        tcMar.append(node)
    tcPr.append(tcMar)

def create_manual():
    doc = docx.Document()

    # Page Margins: 1 inch all around
    sections = doc.sections
    for section in sections:
        section.top_margin = Inches(0.9)
        section.bottom_margin = Inches(0.9)
        section.left_margin = Inches(0.9)
        section.right_margin = Inches(0.9)

    # Document Title
    p_title = doc.add_paragraph()
    p_title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_title.paragraph_format.space_before = Pt(10)
    p_title.paragraph_format.space_after = Pt(4)
    run_sub = p_title.add_run("Lighthouse International School\n")
    run_sub.font.name = "Malgun Gothic"
    run_sub.font.size = Pt(12)
    run_sub.font.color.rgb = RGBColor(0x73, 0x5C, 0x00)
    run_sub.bold = True

    run_title = p_title.add_run("학부모-교사 상담 예약 시스템 (PTC)\n운영자 완벽 실무 및 시스템 관리 매뉴얼")
    run_title.font.name = "Malgun Gothic"
    run_title.font.size = Pt(22)
    run_title.font.bold = True
    run_title.font.color.rgb = RGBColor(0x00, 0x19, 0x3C)

    p_meta = doc.add_paragraph()
    p_meta.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_meta.paragraph_format.space_after = Pt(20)
    r_meta = p_meta.add_run("문서 버전: v2.4 (최신 통합 업데이트) | 최종 개정일: 2026년 10월 14일 | 대상: 시스템 최고 관리자 및 교무행정처")
    r_meta.font.name = "Malgun Gothic"
    r_meta.font.size = Pt(9.5)
    r_meta.font.color.rgb = RGBColor(0x64, 0x74, 0x8B)

    # Divider line
    p_div = doc.add_paragraph()
    p_div.paragraph_format.space_after = Pt(16)
    r_div = p_div.add_run("―" * 58)
    r_div.font.color.rgb = RGBColor(0xCB, 0xD5, 0xE1)

    def add_h1(text):
        h = doc.add_paragraph()
        h.paragraph_format.space_before = Pt(18)
        h.paragraph_format.space_after = Pt(6)
        r = h.add_run(text)
        r.font.name = "Malgun Gothic"
        r.font.size = Pt(14)
        r.font.bold = True
        r.font.color.rgb = RGBColor(0x00, 0x2D, 0x62)
        return h

    def add_h2(text):
        h = doc.add_paragraph()
        h.paragraph_format.space_before = Pt(12)
        h.paragraph_format.space_after = Pt(4)
        r = h.add_run(text)
        r.font.name = "Malgun Gothic"
        r.font.size = Pt(11.5)
        r.font.bold = True
        r.font.color.rgb = RGBColor(0x0F, 0x17, 0x2A)
        return h

    def add_body(text, bold_prefix=None):
        p = doc.add_paragraph()
        p.paragraph_format.space_after = Pt(4)
        p.paragraph_format.line_spacing = 1.25
        if bold_prefix:
            rb = p.add_run(bold_prefix)
            rb.font.name = "Malgun Gothic"
            rb.font.size = Pt(10)
            rb.font.bold = True
            rb.font.color.rgb = RGBColor(0x0F, 0x17, 0x2A)
        r = p.add_run(text)
        r.font.name = "Malgun Gothic"
        r.font.size = Pt(10)
        r.font.color.rgb = RGBColor(0x33, 0x41, 0x55)
        return p

    def add_bullet(text, bold_prefix=None):
        p = doc.add_paragraph(style='List Bullet')
        p.paragraph_format.space_after = Pt(3)
        p.paragraph_format.line_spacing = 1.2
        if bold_prefix:
            rb = p.add_run(bold_prefix)
            rb.font.name = "Malgun Gothic"
            rb.font.size = Pt(9.5)
            rb.font.bold = True
            rb.font.color.rgb = RGBColor(0x0F, 0x17, 0x2A)
        r = p.add_run(text)
        r.font.name = "Malgun Gothic"
        r.font.size = Pt(9.5)
        r.font.color.rgb = RGBColor(0x33, 0x41, 0x55)
        return p

    # --- SECTION 1 ---
    add_h1("1. 시스템 개요 및 운영 아키텍처")
    add_body("본 시스템은 라이트하우스 국제학교(Lighthouse International School)의 학기별 '학부모-교사 상담(PTC, Parent-Teacher Conference)'을 원활하고 체계적으로 진행하기 위해 구축된 통합 예약 플랫폼입니다. 학부모의 간편한 모바일/PC 예약, 교사의 개인 전용 일정표 실시간 조회, 그리고 운영자의 전방위적 종합 관제 기능을 단일 웹 앱 환경에서 유기적으로 제공합니다.")

    add_h2("1.1 접속 주소 및 주요 화면 체계")
    add_bullet("운영 서버 URL: https://lighthouse-ptc.vercel.app", "• ")
    add_bullet("로그인 화면 (/): Google 계정 또는 일반 이메일 주소 입력을 통한 3원 분기 접속 (Lighthouse PTC Login)", "• ")
    add_bullet("학부모 예약 포털 (/booking): 학생 학년/성명 검증 및 부모 성명 일치 후 1인당 최대 4개 교과 예약 진행", "• ")
    add_bullet("교사 전용 일정표 (/teacher): 본인 상담 타임테이블 조회, 실시간 예약 현황 확인 및 일정표 출력", "• ")
    add_bullet("운영자 통합 관제 콘솔 (/admin): 종합 매트릭스 상황판, 예약 검색/취소, 일자 관리, 교사/학생 명부 관리, 계정 및 영구 연동 관리", "• ")

    add_h2("1.2 역할(Role) 자동 판별 및 보안 라우팅")
    add_body("로그인 화면에서 이메일을 입력하고 [Lighthouse PTC Login]을 클릭하면, 서버에 등록된 계정 명부에 따라 권한이 100% 자동 판별되어 해당 페이지로 즉시 연결됩니다:")
    add_bullet("운영자(Admin): 등록된 관리자 이메일 로그인 시 /admin 관제 화면으로 직행. 비인가 사용자의 URL 직접 입력은 자동 차단되어 로그인 화면으로 리다이렉트됩니다.", "• ")
    add_bullet("교사(Teacher): 등록된 교원 이메일 로그인 시 /teacher 본인 전용 일정 화면으로 자동 연결되며, 본인의 상담 일정만 안전하게 분리되어 표시됩니다.", "• ")
    add_bullet("학부모(Parent): 학생의 학년, 학생 성명(한글/영문), 학부모 성함을 입력하고 본교 학생 및 부모 명부와 100% 일치해야만 예약 화면(/booking)으로 진입할 수 있습니다.", "• ")

    # --- SECTION 2 ---
    add_h1("2. 핵심 운영 정책 및 주요 비즈니스 규칙")
    add_h2("2.1 학부모 예약 및 취소 엄격 통제 정책 (운영자 전용 취소 권한)")
    add_body("학부모와 교사의 임의 변경으로 인한 혼선을 방지하고 학교 측의 상담 일정을 안정적으로 통제하기 위해 아래의 엄격한 보안 규칙이 적용되어 있습니다:")
    add_bullet("학부모 예약 취소/변경 불가: 학부모는 예약을 최종 확정한 이후 화면에서 직접 취소하거나 시간대를 변경할 수 없습니다. 취소나 변경이 필요한 경우 반드시 학교 교무행정처(운영자)로 문의해야 합니다.", "• ")
    add_bullet("교사 예약 취소 불가: 교사 역시 본인의 일정표에서 학부모의 예약을 임의 취소할 수 없습니다.", "• ")
    add_bullet("운영자 전용 취소 권한: 오직 /admin 운영자 콘솔에서만 개별 예약 취소(삭제) 또는 전체 예약 초기화가 가능합니다. 운영자가 취소하면 즉시 해당 슬롯이 공란으로 복구되어 다른 학부모가 예약할 수 있습니다.", "• ")

    add_h2("2.2 학생 1인당 최대 4개 교과 예약 제한")
    add_body("동일 학생 기준으로 중복 및 편중 예약을 방지하기 위해 학생 1인당 총 4개 상담교과까지만 선택 및 확약이 가능합니다. 이미 확약된 예약이 있다면 (4 - 확약건수)만큼만 추가 예약할 수 있도록 시스템이 엄격히 제어합니다.")

    add_h2("2.3 저녁 시간대 라벨링 정책 ('교무실과 협의')")
    add_body("오후 늦은 시간대의 교사 상담은 교무실의 일정 조정 및 확인이 필요하므로, 모든 교사의 다음 3개 시간대 슬롯은 '예약 가능' 대신 특별 라벨이 부여됩니다:")
    add_bullet("대상 시간대: 5:40-6:00pm, 6:00-6:20pm, 6:20-6:40pm", "• ")
    add_bullet("표시 형태: 시각적 구분이 쉬운 부드러운 옐로우 뱃지에 '교무실과 협의' 문구로 표시되며, 학부모가 클릭하여 담을 수 있습니다.", "• ")

    add_h2("2.4 시작 시간 정렬 및 확정 슬롯 (1:30-1:50pm 시작)")
    add_body("각 상담 일자의 첫 번째 슬롯은 1:30-1:50pm으로 표준화되어 있으며, 12시간제(am/pm) 변환 정렬 엔진을 통해 1:30pm ➔ 1:50pm ➔ ... ➔ 5:10pm ➔ 5:40pm ➔ 6:20pm 순서로 시간 순서대로 정렬됩니다.")

    # --- SECTION 3 ---
    add_h1("3. 운영자 종합 상황판 (예약 현황 매트릭스) 상세 안내")
    add_body("운영자 화면 상단의 '날짜별 교사·시간대별 상담 예약 현황 매트릭스'는 전 교사의 상담 예약 현황을 바둑판 그리드 형태로 한눈에 조망할 수 있는 핵심 관제 기능입니다.")

    add_h2("3.1 화면 구성 및 주요 지표")
    add_bullet("선택 일자 탭: 현재 등록된 상담 일자(예: Oct. 30, Nov. 1) 버튼을 클릭하여 해당 일자의 종합 상황판으로 즉시 전환합니다.", "• ")
    add_bullet("상태 요약 바: 선택 일자, 총 교사 수, 총 시간대(타임 수), 예약 완료 건수(예약률 %), 학교 지정 상담 불가 건수, 잔여 빈 시간 건수가 실시간 집계됩니다.", "• ")
    add_bullet("그리드 테이블: 가로는 시작시간(1:30pm ~ 6:20pm), 세로는 등록된 교사명으로 정렬되어 각 셀의 예약 상태를 색상별로 직관적으로 표시합니다.", "• ")

    add_h2("3.2 셀 상태별 색상 및 조작 방법")
    add_bullet("파란색 셀 (예약 완료): 학부모에 의해 예약이 확정된 셀입니다. 학생 성명이 표시되며, 해당 셀을 마우스로 클릭하면 '현장 QR 코드 및 예약 확인증/취소 팝업'이 즉시 열려 확인증 출력이나 예약 취소(삭제)를 바로 처리할 수 있습니다.", "• ")
    add_bullet("붉은색 셀 (상담 불가): 교사 출장, 회의, 휴무 등으로 인해 운영자가 사전에 잠금(차단) 처리한 시간대입니다. 학부모 화면에서는 '상담불가'로 비활성화됩니다.", "• ")
    add_bullet("회색 하이픈 셀 (-): 아직 예약되지 않은 빈 시간대(예약 가능)입니다.", "• ")

    # --- SECTION 4 ---
    add_h1("4. 신규 기능: 상담 일자(Date) 일괄 변경 및 새 학기 재사용 가이드")
    add_body("내년 또는 다음 학기에 상담 일자가 변경되더라도(예: Oct. 30 ➔ Oct. 29), 시스템 코드를 수정하거나 구글 시트를 일일이 뜯어고칠 필요 없이 운영자 화면에서 몇 초 만에 일괄 변경할 수 있습니다.")

    add_h2("4.1 상담 일자 변경 절차")
    add_bullet("1단계: 운영자 콘솔(/admin) 종합 상황판 우측 상단의 [상담 일자 변경] (캘린더 아이콘) 버튼을 클릭합니다.", "• ")
    add_bullet("2단계: '상담 일자 일괄 변경 및 동기화' 모달에서 현재 등록된 각 일차별 기존 일자(예: 1일차 Oct. 30, 2일차 Nov. 1) 옆의 입력창에 변경할 새 날짜(예: Oct. 29, Oct. 31 등)를 입력합니다.", "• ")
    add_bullet("3단계: [상담 일자 저장 및 전체 동기화] 버튼을 클릭합니다.", "• ")

    add_h2("4.2 전체 시스템 연쇄 동기화(Full Cascade Sync) 동작 원리")
    add_body("운영자가 일자를 변경하여 저장하면 시스템 내부에서 다음과 같은 작업이 한 번에 연쇄적으로 일어납니다:")
    add_bullet("① 운영자 종합 상황판: 상단 날짜 탭 및 매트릭스 헤더가 신규 날짜로 즉시 교체됩니다.", "• ")
    add_bullet("② 학부모 예약 화면: 날짜 선택 탭 및 시간표의 기준 일자가 신규 날짜로 자동 전환됩니다.", "• ")
    add_bullet("③ 교사 전용 일정표: 교사들이 조회하는 일정표의 상담 일자 열이 신규 날짜로 갱신됩니다.", "• ")
    add_bullet("④ 기존 예약 및 차단 일정 일괄 치환: 이미 등록되어 있던 예약 내역과 교사 상담 불가 일정의 날짜 필드까지 신규 날짜로 누락 없이 일괄 매핑됩니다.", "• ")
    add_bullet("⑤ Supabase 클라우드 영구 저장: 설정이 DB에 영구 보존되어 브라우저 새로고침이나 컴퓨터 재부팅 후에도 완벽히 유지됩니다.", "• ")

    # --- SECTION 5 ---
    add_h1("5. 학생 및 학부모 명부 관리 (학부모 로그인 검증 및 학년별 정렬)")
    add_body("학부모가 로그인할 때 본교 재학생의 실제 학부모인지를 시스템이 철저히 검증하기 위한 학생-부모 명부 데이터베이스 관리 공간입니다.")

    add_h2("5.1 학부모 로그인 검증 메커니즘")
    add_body("학부모가 예약 포털에 진입하기 위해서는 반드시 본 명부에 학생의 학년, 한글 성명, 영문 성명, 그리고 아버지 또는 어머니 성함이 정확하게 등록되어 있어야 합니다. 학부모는 로그인 시 본인의 성함을 입력하며, 명부에 등록된 부/모 성함과 정확히 일치해야만 로그인이 승인됩니다.")

    add_h2("5.2 학년별 정렬 및 탭 필터링")
    add_bullet("학년별 원클릭 탭: G6, G7, G8, G9, G10, G11, G12 버튼을 눌러 특정 학년 학생들만 빠르게 조회할 수 있습니다.", "• ")
    add_bullet("정렬 옵션: '학년순 정렬 (M6 → H12)', '학년 역순 정렬 (H12 → M6)', '학생 이름순 (가나다)', '학생 이름 역순 (하타파)' 중 원하는 정렬 방식을 드롭다운에서 선택할 수 있습니다.", "• ")
    add_bullet("실시간 검색창: 학생명(한글/영문) 또는 부모 성함을 타이핑하면 즉시 필터링됩니다.", "• ")

    add_h2("5.3 새 학기 원클릭 일괄 진급 기능 [전체 학년 일괄 진급 (M6→H12)]")
    add_body("새 학년도가 시작될 때 [전체 학년 일괄 진급] 버튼을 누르면 단 한 번의 클릭으로:")
    add_bullet("M6 ➔ M7, M7 ➔ M8, M8 ➔ H9, H9 ➔ H10, H10 ➔ H11, H11 ➔ H12로 모든 재학생이 1개 학년씩 일괄 자동 진급합니다.", "• ")
    add_bullet("최고 학년인 H12 학생들은 '졸업생'으로 분류되어 명부에서 자동으로 영구 삭제 처리됩니다.", "• ")

    add_h2("5.4 CSV 일괄 다운로드 및 업로드 (Excel 연동)")
    add_bullet("[명부 CSV 템플릿 다운로드]: UTF-8 인코딩이 적용된 정형 CSV 템플릿을 내려받아 엑셀에서 대량의 학생/학부모 정보를 편집할 수 있습니다.", "• ")
    add_bullet("[명부 CSV 파일 업로드]: 편집한 CSV를 업로드할 때 [기존 명부 유지 병합(Merge)]과 [새 파일로 전체 교체(Replace)] 중 선택하여 안전하게 일괄 등록할 수 있습니다.", "• ")

    # --- SECTION 6 ---
    add_h1("6. 상담 교사 및 상담교과 옵션 관리")
    add_body("상담에 참여하는 교원 명단과 각 교사가 진행할 수 있는 상담 세부 교과목(옵션)을 등록하고 관리합니다.")
    add_bullet("개별 등록 및 수정: 교사의 영문 성명(예: Ms. Monica Yu), 한글 성함(예: 유미연), 직책/담당(예: M6 담임교사), 그리고 상담 가능 교과목(쉼표로 구분, 예: M6 담임, MS English A, M7 Math)을 입력하여 개별 저장합니다.", "• ")
    add_bullet("CSV 일괄 템플릿 연동: [상담교사 CSV 템플릿 다운로드] 및 [상담교사 CSV 일괄 업로드]를 통해 수십 명의 교원 정보를 한 번에 업데이트할 수 있습니다.", "• ")

    # --- SECTION 7 ---
    add_h1("7. 운영자 및 교사 Google 로그인 계정 권한 관리")
    add_body("학교 관계자의 이메일 계정을 등록하여 로그인 시 자동으로 '운영자' 또는 '교사' 권한이 부여되도록 관리합니다.")
    add_bullet("운영자 권한: /admin 콘솔에 접근하여 모든 설정을 제어할 수 있는 최고 관리자 권한입니다.", "• ")
    add_bullet("교사 권한: /teacher 포털에 접속하여 본인의 상담 스케줄만 확인하고 인쇄할 수 있는 교원 권한입니다.", "• ")
    add_bullet("계정 추가/수정: Google 이메일 주소, 이름(호칭), 권한 유형(운영자/교사)을 지정하여 저장합니다.", "• ")

    # --- SECTION 8 ---
    add_h1("8. 교사별·시간대별 상담 불가(잠금) 설정 관리")
    add_body("교사의 출장, 긴급 회의, 개인 사정 등으로 특정 시간대에 상담을 진행할 수 없을 때 해당 슬롯을 사전에 잠금(차단)하는 기능입니다.")
    add_bullet("대상 교사 선택: 특정 교사 1명 또는 '모든 교사 일괄 적용' 선택 가능", "• ")
    add_bullet("대상 일자 및 시간 선택: 특정 일자/시간 또는 '전체 일자/전체 시간' 선택 가능", "• ")
    add_bullet("차단 사유 입력: 학부모에게 노출될 사유(예: 교사 출장/회의)를 입력하고 [상담 불가 슬롯 등록]을 클릭하면 학부모 예약 화면에서 즉시 붉은색 '상담불가'로 잠기게 됩니다.", "• ")

    # --- SECTION 9 ---
    add_h1("9. Supabase 클라우드 영구 저장소 및 동기화 기술 관리")
    add_body("본 시스템은 서버 재시작이나 여러 관리자의 동시 접속 시에도 데이터가 유실되지 않도록 엔터프라이즈급 Supabase 클라우드 DB와 실시간 연동되어 있습니다.")
    add_bullet("영구 저장소 연동 원리: 모든 예약, 수정된 교사/학생 정보, 변경된 날짜 매핑이 Supabase의 ptc_state 테이블에 JSONB 포맷으로 실시간 암호화 보존됩니다.", "• ")
    add_bullet("초기 SQL 테이블 생성: 관리자 콘솔 하단의 [초기 테이블 생성 SQL 보기] 버튼을 누르면 Supabase SQL Editor에 바로 실행할 수 있는 DDL 스크립트가 제공됩니다.", "• ")
    add_bullet("[구글 시트 즉시 동기화] 버튼: 원본 Google Spreadsheet의 변경 내용을 강제로 즉시 긁어와 로컬 캐시와 병합할 때 사용합니다.", "• ")

    # --- SECTION 10 ---
    add_h1("10. 정기 운영 타임라인 및 비상 대응 프로토콜")
    add_h2("10.1 학기별 운영 표준 타임라인")
    add_bullet("D-7 (오픈 1주일 전): 교사 계정 및 학생/학부모 명부 최종 CSV 업로드, [상담 일자 변경]으로 올해 행사 날짜 세팅", "• ")
    add_bullet("D-3 (교사 사전 리허설): 교사들에게 계정 안내 및 /teacher 접속 테스트, 교사 개인 사정 시간대 [상담 불가 슬롯] 사전 등록", "• ")
    add_bullet("D-1 (테스트 데이터 초기화): 테스트로 입력된 가상 예약을 [전체 예약 초기화] 버튼으로 깨끗하게 삭제(0건 복구)", "• ")
    add_bullet("D-Day (학부모 오픈): 학부모 안내 문자/이메일 발송, 운영자 콘솔 종합 상황판을 통해 실시간 예약률 모니터링", "• ")
    add_bullet("행사 당일: 종합 상황판에서 특정 예약 클릭 후 현장 확인증 발급 및 QR 코드 확인", "• ")

    add_h2("10.2 비상 상황별 조치 가이드")
    add_bullet("학부모가 로그인이 안 된다고 문의하는 경우: 학생의 학년, 성명(한글), 그리고 부/모 성함이 /admin의 '학생 및 학부모 명부 관리'에 정확히 등록되어 있는지 확인하고, 오타가 있다면 즉시 수정 저장합니다.", "• ")
    add_bullet("학부모가 예약을 잘못해서 취소해 달라는 경우: 학부모는 직접 취소할 수 없으므로, 운영자가 /admin 상단 매트릭스에서 해당 셀을 클릭하거나 '예약 내역 검색'에서 학생명을 검색한 후 [이 예약 취소(삭제)] 버튼을 누르면 즉시 취소되고 슬롯이 복구됩니다.", "• ")
    add_bullet("화면 데이터가 이전 내용으로 보이는 경우: 브라우저 캐시 문제일 가능성이 높으므로 키보드의 Ctrl + F5 (강력 새로고침)를 안내합니다.", "• ")

    # Save to public directory
    output_path = r"c:\Users\Beautiful\project\PTC Reservation App\ptc-app\public\Lighthouse_PTC_Admin_Manual.docx"
    doc.save(output_path)
    print(f"Successfully generated manual at: {output_path}")

if __name__ == "__main__":
    create_manual()
