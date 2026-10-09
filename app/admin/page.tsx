"use client";

import React, { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";

interface TeacherRecord {
  id: string;
  nameEn: string;
  nameKo: string;
  role: string;
  options: string[];
}

interface TimeSlotRecord {
  id: string;
  day: string;
  time: string;
  date: string;
  comment?: string;
}

interface ReservationRecord {
  id: string;
  timestamp: string;
  email: string;
  studentGrade: string;
  studentName: string;
  parentName: string;
  teacherName: string;
  option: string;
  timeSlot: string;
  date: string;
  status: "CONFIRMED" | "CANCELLED";
  uniqueToken: string;
}

export default function AdminConsolePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  // Core Data
  const [teachers, setTeachers] = useState<TeacherRecord[]>([]);
  const [timeSlots, setTimeSlots] = useState<TimeSlotRecord[]>([]);
  const [reservations, setReservations] = useState<ReservationRecord[]>([]);
  const [config, setConfig] = useState<any>({});

  // Dynamic Google Sheet ID management
  const [spreadsheetIdInput, setSpreadsheetIdInput] = useState("");
  const [updatingConfig, setUpdatingConfig] = useState(false);

  // Notice, Dates & Academic Year editing
  const [academicYearInput, setAcademicYearInput] = useState("2026–2027");
  const [noticeDatesInput, setNoticeDatesInput] = useState("");
  const [noticeTimesInput, setNoticeTimesInput] = useState("");
  const [noticeTitleInput, setNoticeTitleInput] = useState("");
  const [noticeContentInput, setNoticeContentInput] = useState("");
  const [updatingNotice, setUpdatingNotice] = useState(false);

  // Search & QR Code Modal
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedParentRes, setSelectedParentRes] = useState<ReservationRecord | null>(null);
  const [modalQrCodeUrl, setModalQrCodeUrl] = useState<string>("");

  // Teacher Management Modal (Add/Edit)
  const [teacherModalOpen, setTeacherModalOpen] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState<TeacherRecord | null>(null);
  const [teacherFormNameEn, setTeacherFormNameEn] = useState("");
  const [teacherFormNameKo, setTeacherFormNameKo] = useState("");
  const [teacherFormRole, setTeacherFormRole] = useState("");
  const [teacherFormOptions, setTeacherFormOptions] = useState("");

  // Blocked Slots Management (Admin Mode)
  const [blockedSlots, setBlockedSlots] = useState<any[]>([]);
  const [blockTeacherSelect, setBlockTeacherSelect] = useState("ALL");
  const [blockDateSelect, setBlockDateSelect] = useState("ALL");
  const [blockTimeSelect, setBlockTimeSelect] = useState("ALL");
  const [blockReasonInput, setBlockReasonInput] = useState("교사 출장/회의");
  const [addingBlock, setAddingBlock] = useState(false);

  // Schedule Matrix Overview State (날짜별 교사·시간대별 예약 매트릭스)
  const [matrixSelectedDate, setMatrixSelectedDate] = useState<string>("");

  const loadData = async (force: boolean = false) => {
    if (force) setSyncing(true);
    try {
      const res = await fetch(`/api/sheets/sync${force ? "?force=true" : ""}`);
      const json = await res.json();
      if (json.success) {
        setTeachers(json.teachers || []);
        setTimeSlots(json.timeSlots || []);
        setReservations(json.reservations || []);
        setBlockedSlots(json.blockedSlots || []);
        setConfig(json.config || {});
        setSpreadsheetIdInput(json.config?.spreadsheetId || "");
        setAcademicYearInput(json.config?.academicYear || "2026–2027");
        setNoticeDatesInput(json.config?.conferenceDates || "2026년 10월 30일(목) · 11월 1일(금)");
        setNoticeTimesInput(json.config?.conferenceTimes || "13:50 ~ 17:30 (세션당 20분 진행)");
        setNoticeTitleInput(json.config?.noticeTitle || "운영 안내 및 신청 공지");
        setNoticeContentInput(json.config?.noticeContent || "상담을 원하시는 선생님과 상담 항목을 최대 4개까지 선택하신 후 예약하시기 바랍니다.");
      }
    } catch (err) {
      console.error("Admin sync error:", err);
    } finally {
      setLoading(false);
      if (force) setSyncing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Add Blocked Slot
  const handleAddBlockedSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddingBlock(true);
    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "ADD_BLOCKED_SLOT",
          blockData: {
            teacherName: blockTeacherSelect,
            date: blockDateSelect,
            timeSlot: blockTimeSelect,
            reason: blockReasonInput.trim(),
          },
        }),
      });
      const data = await res.json();
      if (data.success) {
        alert("상담 제한(불가) 상담교과가 성공적으로 등록되었습니다. 학부모 예약 화면에서 즉시 비활성화됩니다.");
        loadData();
      }
    } catch (err: any) {
      alert("상담 제한 등록 오류: " + err.message);
    } finally {
      setAddingBlock(false);
    }
  };

  // Delete Blocked Slot
  const handleDeleteBlockedSlot = async (blockId: string) => {
    if (!confirm("해당 시간의 상담 제한을 해제(예약 가능으로 복원)하시겠습니까?")) return;
    try {
      await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "DELETE_BLOCKED_SLOT",
          blockId,
        }),
      });
      loadData();
    } catch (err: any) {
      alert("제한 해제 오류: " + err.message);
    }
  };

  // Update Notice & Dates for Welcome Page
  const handleUpdateNotice = async (e: React.FormEvent) => {
    e.preventDefault();
    setUpdatingNotice(true);
    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "UPDATE_CONFIG",
          configData: {
            academicYear: academicYearInput.trim(),
            conferenceDates: noticeDatesInput.trim(),
            conferenceTimes: noticeTimesInput.trim(),
            noticeTitle: noticeTitleInput.trim(),
            noticeContent: noticeContentInput.trim(),
          },
        }),
      });
      const data = await res.json();
      if (data.success) {
        alert("상담 일정, 학년도 및 공지사항이 성공적으로 저장되었습니다.");
        loadData();
      }
    } catch (err: any) {
      alert("공지사항 저장 오류: " + err.message);
    } finally {
      setUpdatingNotice(false);
    }
  };

  // Update Google Sheet ID for new semester transition
  const handleUpdateSheetId = async () => {
    if (!spreadsheetIdInput.trim()) return;
    setUpdatingConfig(true);
    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "UPDATE_CONFIG",
          configData: { spreadsheetId: spreadsheetIdInput.trim() },
        }),
      });
      const data = await res.json();
      if (data.success) {
        alert("Google Spreadsheet ID가 성공적으로 업데이트되고 시트가 재동기화되었습니다.");
        loadData(true);
      }
    } catch (err: any) {
      alert("업데이트 오류: " + err.message);
    } finally {
      setUpdatingConfig(false);
    }
  };

  // Open QR Code Modal for on-site parents
  const handleOpenQrModal = async (resItem: ReservationRecord) => {
    setSelectedParentRes(resItem);
    const host = typeof window !== "undefined" ? window.location.origin : "";
    const slipUrl = `${host}/slip/${resItem.uniqueToken}`;
    try {
      const qrData = await QRCode.toDataURL(slipUrl, {
        width: 260,
        margin: 1,
        color: { dark: "#00193c", light: "#ffffff" },
      });
      setModalQrCodeUrl(qrData);
    } catch (err) {
      console.error("QR Code Error:", err);
    }
  };

  // Open Teacher Add/Edit Modal
  const handleOpenTeacherModal = (teacher?: TeacherRecord) => {
    if (teacher) {
      setEditingTeacher(teacher);
      setTeacherFormNameEn(teacher.nameEn);
      setTeacherFormNameKo(teacher.nameKo);
      setTeacherFormRole(teacher.role);
      setTeacherFormOptions(teacher.options.join(", "));
    } else {
      setEditingTeacher(null);
      setTeacherFormNameEn("");
      setTeacherFormNameKo("");
      setTeacherFormRole("담임교사");
      setTeacherFormOptions("");
    }
    setTeacherModalOpen(true);
  };

  // Save Teacher
  const handleSaveTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    const optionsArray = teacherFormOptions
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    try {
      if (editingTeacher) {
        // Update
        const updated: TeacherRecord = {
          ...editingTeacher,
          nameEn: teacherFormNameEn,
          nameKo: teacherFormNameKo,
          role: teacherFormRole,
          options: optionsArray,
        };
        await fetch("/api/config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "UPDATE_TEACHER", teacherData: updated }),
        });
      } else {
        // Add
        await fetch("/api/config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "ADD_TEACHER",
            teacherData: {
              nameEn: teacherFormNameEn,
              nameKo: teacherFormNameKo,
              role: teacherFormRole,
              options: optionsArray,
            },
          }),
        });
      }
      setTeacherModalOpen(false);
      loadData();
    } catch (err: any) {
      alert("교사 정보 저장 오류: " + err.message);
    }
  };

  // Delete Teacher
  const handleDeleteTeacher = async (id: string) => {
    if (!confirm("정말 이 교사를 삭제하시겠습니까?")) return;
    try {
      await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "DELETE_TEACHER", teacherId: id }),
      });
      loadData();
    } catch (err: any) {
      alert("삭제 오류: " + err.message);
    }
  };

  // Filtered Reservations Search
  const filteredReservations = useMemo(() => {
    if (!searchQuery.trim()) return reservations;
    const q = searchQuery.toLowerCase().trim();
    return reservations.filter(
      (r) =>
        r.studentName.toLowerCase().includes(q) ||
        r.parentName.toLowerCase().includes(q) ||
        r.teacherName.toLowerCase().includes(q) ||
        r.uniqueToken.toLowerCase().includes(q)
    );
  }, [reservations, searchQuery]);

  // --- Schedule Matrix Calculations & Helpers (Loop-Free & Null-Safe) ---
  const [showMatrixView, setShowMatrixView] = useState(true);

  const matrixDates = useMemo(() => {
    return Array.from(new Set(timeSlots.map((t) => t?.date).filter(Boolean))) as string[];
  }, [timeSlots]);

  const activeDate = (matrixSelectedDate && matrixDates.includes(matrixSelectedDate))
    ? matrixSelectedDate
    : (matrixDates[0] || "");

  const matrixTimeSlots = useMemo(() => {
    if (!activeDate) return [];
    const slotsForDate = timeSlots.filter((t) => (t?.date || "").trim() === activeDate.trim());
    const seen = new Set<string>();
    const distinct: TimeSlotRecord[] = [];
    for (const s of slotsForDate) {
      if (s && s.time && !seen.has(s.time)) {
        seen.add(s.time);
        distinct.push(s);
      }
    }
    return distinct;
  }, [timeSlots, activeDate]);

  // 시작시간 추출 헬퍼 (예: "1:50-2:10pm" -> "1:50pm")
  const formatStartTime = (timeStr?: string) => {
    if (!timeStr) return "";
    const parts = timeStr.split(/[-~]/);
    const startPart = parts[0]?.trim() || timeStr;
    const matchMeridiem = timeStr.match(/(am|pm)/i);
    if (matchMeridiem && !startPart.toLowerCase().includes("am") && !startPart.toLowerCase().includes("pm")) {
      return `${startPart}${matchMeridiem[0].toLowerCase()}`;
    }
    return startPart;
  };

  // 학생 이름 간소화 헬퍼 (예: "김민준 (Minjun Kim)" -> "김민준")
  const formatStudentNameOnly = (fullName?: string) => {
    if (!fullName) return "";
    const namePart = fullName.split("(")[0]?.trim();
    return namePart || fullName;
  };

  // 셀별 확정 예약 매칭 (방어적 코드 적용)
  const getCellReservation = (teacher: TeacherRecord, slotTime: string, date: string): ReservationRecord | undefined => {
    if (!teacher || !slotTime || !date) return undefined;
    const targetDate = date.trim().toLowerCase();
    const targetTime = slotTime.trim().toLowerCase();
    const tEn = (teacher.nameEn || "").trim().toLowerCase();
    const tKo = (teacher.nameKo || "").trim().toLowerCase();

    return reservations.find((r) => {
      if (!r || r.status !== "CONFIRMED") return false;
      const rDate = (r.date || "").trim().toLowerCase();
      const rTime = (r.timeSlot || "").trim().toLowerCase();
      if (rDate !== targetDate || rTime !== targetTime) return false;

      const rTeacher = (r.teacherName || "").trim().toLowerCase();
      return (
        (tEn && rTeacher === tEn) ||
        (tKo && rTeacher === tKo) ||
        (tEn && rTeacher.includes(tEn)) ||
        (tKo && rTeacher.includes(tKo))
      );
    });
  };

  // 셀별 불가(차단) 매칭 (방어적 코드 적용)
  const getCellBlocked = (teacher: TeacherRecord, slotTime: string, date: string): { blocked: boolean; reason?: string } => {
    if (!teacher || !slotTime || !date) return { blocked: false };
    const targetDate = date.trim().toLowerCase();
    const targetTime = slotTime.trim().toLowerCase();
    const tEn = (teacher.nameEn || "").trim().toLowerCase();
    const tKo = (teacher.nameKo || "").trim().toLowerCase();

    const found = blockedSlots.find((b) => {
      if (!b) return false;
      const bTeacher = (b.teacherName || "").trim().toLowerCase();
      const bDate = (b.date || "").trim().toLowerCase();
      const bTime = (b.timeSlot || "").trim().toLowerCase();

      const teacherMatch =
        bTeacher === "all" ||
        (tEn && bTeacher === tEn) ||
        (tKo && bTeacher === tKo);
      const dateMatch = bDate === "all" || bDate === targetDate;
      const timeMatch = bTime === "all" || bTime === targetTime;

      return teacherMatch && dateMatch && timeMatch;
    });

    return found ? { blocked: true, reason: found.reason || "상담 불가" } : { blocked: false };
  };

  // 선택 날짜 통계 요약
  const matrixStats = useMemo(() => {
    if (!activeDate || teachers.length === 0 || matrixTimeSlots.length === 0) {
      return { totalSlots: 0, bookedCount: 0, blockedCount: 0, rate: 0 };
    }
    const totalSlots = teachers.length * matrixTimeSlots.length;
    let bookedCount = 0;
    let blockedCount = 0;

    teachers.forEach((t) => {
      matrixTimeSlots.forEach((s) => {
        const res = getCellReservation(t, s.time, activeDate);
        if (res) {
          bookedCount++;
        } else {
          const blk = getCellBlocked(t, s.time, activeDate);
          if (blk.blocked) blockedCount++;
        }
      });
    });

    const rate = totalSlots > 0 ? Math.round((bookedCount / totalSlots) * 100) : 0;
    return { totalSlots, bookedCount, blockedCount, rate };
  }, [teachers, matrixTimeSlots, reservations, blockedSlots, activeDate]);

  return (
    <div className="min-h-screen bg-[#f8f9ff]">
      {/* Top Header */}
      <header className="bg-[#00193c] text-white px-6 py-4 shadow-md flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white p-1 flex items-center justify-center shadow-xs">
            <img src="/emblum.png" alt="Lighthouse PTC Emblem" className="w-full h-full object-contain" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm tracking-tight">Lighthouse PTC</span>
              <span className="bg-[#aa3344] text-[10px] px-1.5 py-0.5 rounded font-bold uppercase">
                Admin Master
              </span>
            </div>
            <div className="text-[11px] text-blue-200">PTC 종합 운영자 마스터 콘솔</div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => {
              setShowMatrixView(true);
              const el = document.getElementById("schedule-matrix-section");
              if (el) el.scrollIntoView({ behavior: "smooth" });
            }}
            className="px-3 py-1.5 bg-[#cca730] hover:bg-[#e0b836] text-[#00193c] rounded-lg text-xs font-bold flex items-center gap-1.5 transition shadow-xs"
          >
            <span className="material-symbols-outlined text-sm">grid_view</span>
            <span>전체 상담 예약 현황 보기</span>
          </button>
          <button
            onClick={() => loadData(true)}
            disabled={syncing}
            className="px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition"
          >
            <span
              className={`material-symbols-outlined text-sm ${
                syncing ? "animate-spin" : ""
              }`}
            >
              sync
            </span>
            <span>{syncing ? "동기화 중..." : "Sheets 실시간 동기화"}</span>
          </button>
          <button
            onClick={() => router.push("/")}
            className="text-xs text-blue-200 hover:text-white"
          >
            로그아웃
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 space-y-6">
        {/* KPI Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <span className="text-[10px] font-bold text-slate-400 uppercase">등록 교사 수</span>
            <div className="text-2xl font-bold text-[#00193c] mt-1">{teachers.length}명</div>
            <span className="text-[11px] text-emerald-600">모든 교사 활성화</span>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <span className="text-[10px] font-bold text-slate-400 uppercase">총 개설 상담교과</span>
            <div className="text-2xl font-bold text-[#00193c] mt-1">
              {teachers.length * timeSlots.length}개
            </div>
            <span className="text-[11px] text-blue-600">세션당 20분 배정</span>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <span className="text-[10px] font-bold text-slate-400 uppercase">확약된 예약 건수</span>
            <div className="text-2xl font-bold text-[#aa3344] mt-1">
              {reservations.filter((r) => r.status === "CONFIRMED").length}건
            </div>
            <span className="text-[11px] text-slate-500">실시간 반영 중</span>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <span className="text-[10px] font-bold text-slate-400 uppercase">학기 전환 대응 (학년도)</span>
            <div className="text-sm font-bold text-[#00193c] mt-1 truncate">
              {config.academicYear || "2026–2027"}
            </div>
            <span className="text-[11px] text-emerald-600">Google Sheet Dynamic Adapter</span>
          </div>
        </div>

        {/* Schedule Matrix Overview Table (날짜별 교사·시간대별 예약 종합 현황표) */}
        <div id="schedule-matrix-section" className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div>
              <div className="flex items-center gap-1.5 text-xs font-bold text-[#00193c]">
                <span className="material-symbols-outlined text-base text-[#002d62]">
                  grid_view
                </span>
                날짜별 교사·시간대별 상담 예약 현황 매트릭스 (종합 상황판)
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                가로는 시작시간, 세로는 한글 교사명으로 정렬되어 각 셀에서 예약된 학생 이름을 한눈에 확인하실 수 있습니다. (가로/세로 스크롤 고정 지원)
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Date Selector Tabs */}
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
                {matrixDates.map((d) => (
                  <button
                    key={d}
                    onClick={() => {
                      setMatrixSelectedDate(d);
                      setShowMatrixView(true);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                      activeDate === d
                        ? "bg-[#00193c] text-white shadow-xs"
                        : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
                    }`}
                  >
                    <span className="material-symbols-outlined text-[13px]">event</span>
                    <span>{d}</span>
                  </button>
                ))}
              </div>

              {/* View/Hide Matrix Button */}
              <button
                onClick={() => setShowMatrixView(!showMatrixView)}
                className="px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 transition flex items-center gap-1 shadow-2xs shrink-0"
              >
                <span className="material-symbols-outlined text-sm">
                  {showMatrixView ? "expand_less" : "grid_view"}
                </span>
                <span>{showMatrixView ? "화면 접기" : "전체 예약 화면 열기"}</span>
              </button>
            </div>
          </div>

          {!showMatrixView ? (
            <div className="p-4 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200 text-xs text-slate-500 flex items-center justify-center gap-2">
              <span className="material-symbols-outlined text-base text-slate-400">visibility</span>
              <span>현재 현황표가 접혀 있습니다. 우측 상단의 <strong>[전체 예약 화면 열기]</strong> 버튼을 누르면 상담 예약 매트릭스가 표시됩니다.</span>
            </div>
          ) : (
            <>
              {/* Matrix Stats Summary Bar */}
              <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2 bg-slate-50 rounded-xl text-xs text-slate-600 border border-slate-200/70">
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-[#00193c]">
                    선택 일자: <strong className="text-[#002d62]">{activeDate || "선택 없음"}</strong>
                  </span>
                  <span className="text-slate-300">|</span>
                  <span>총 교사: <strong className="text-slate-800">{teachers.length}명</strong></span>
                  <span className="text-slate-300">|</span>
                  <span>시간대: <strong className="text-slate-800">{matrixTimeSlots.length}타임</strong></span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-md bg-blue-100 text-[#002d62] font-semibold text-[11px]">
                    예약 완료: {matrixStats.bookedCount}건 ({matrixStats.rate}%)
                  </span>
                  {matrixStats.blockedCount > 0 && (
                    <span className="px-2 py-0.5 rounded-md bg-red-100 text-red-700 font-semibold text-[11px]">
                      상담 불가: {matrixStats.blockedCount}건
                    </span>
                  )}
                  <span className="px-2 py-0.5 rounded-md bg-slate-200 text-slate-700 font-semibold text-[11px]">
                    빈 시간: {matrixStats.totalSlots - matrixStats.bookedCount - matrixStats.blockedCount}건
                  </span>
                </div>
              </div>

              {/* Matrix Table with Sticky Row/Column Headers & Smooth Scroll */}
              <div className="overflow-auto max-h-[500px] border border-slate-200 rounded-xl relative shadow-inner">
                <table className="w-full border-collapse text-xs select-none">
                  <thead>
                    <tr>
                      {/* Top-Left Corner Sticky Cell */}
                      <th className="sticky top-0 left-0 z-40 bg-slate-100 text-slate-700 font-bold border-b border-r border-slate-200 px-3 py-2 text-center text-[11px] min-w-[95px] max-w-[110px] whitespace-nowrap shadow-xs">
                        교사명 \ 시작시간
                      </th>
                      {/* Horizontal Time Slots Headers (시작시간) */}
                      {matrixTimeSlots.map((slot) => (
                        <th
                          key={slot.id || slot.time}
                          title={`전체 시간대: ${slot.time}`}
                          className="sticky top-0 z-30 bg-slate-100 text-slate-700 font-bold border-b border-r border-slate-200 px-2 py-2 text-center text-[11px] min-w-[76px] max-w-[88px] whitespace-nowrap"
                        >
                          {formatStartTime(slot.time)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {teachers.map((teacher) => (
                      <tr key={teacher.id || teacher.nameEn} className="hover:bg-blue-50/20 transition-colors">
                        {/* Vertical Teacher Name Sticky Header (한글교사명) */}
                        <th className="sticky left-0 z-20 bg-white font-semibold text-[#00193c] border-b border-r border-slate-200 px-2.5 py-1.5 text-left text-xs min-w-[95px] max-w-[110px] whitespace-nowrap shadow-[2px_0_4px_rgba(0,0,0,0.04)]">
                          <div className="truncate font-bold text-slate-800">
                            {teacher.nameKo || teacher.nameEn}
                          </div>
                          {teacher.role && (
                            <div className="text-[10px] text-slate-400 font-normal truncate">
                              {teacher.role}
                            </div>
                          )}
                        </th>

                        {/* Matrix Cells (해당셀: 학생이름) */}
                        {matrixTimeSlots.map((slot) => {
                          const res = getCellReservation(teacher, slot.time, activeDate);
                          const block = !res ? getCellBlocked(teacher, slot.time, activeDate) : { blocked: false };

                          if (res) {
                            return (
                              <td
                                key={slot.id || slot.time}
                                title={`학생: ${res.studentName} (${res.studentGrade})\n학부모: ${res.parentName}\n선택과목: ${res.option}`}
                                className="border-b border-r border-slate-200 p-1 text-center min-w-[76px] max-w-[88px] h-[36px] bg-blue-50/40"
                              >
                                <span className="block w-full py-1 px-1 bg-blue-100 text-[#002d62] font-bold text-[11px] rounded truncate border border-blue-200 shadow-2xs">
                                  {formatStudentNameOnly(res.studentName)}
                                </span>
                              </td>
                            );
                          }

                          if (block.blocked) {
                            return (
                              <td
                                key={slot.id || slot.time}
                                title={`운영자 상담 불가 지정 (${block.reason})`}
                                className="border-b border-r border-slate-200 p-1 text-center min-w-[76px] max-w-[88px] h-[36px] bg-red-50/30"
                              >
                                <span className="block w-full py-1 px-1 bg-red-100 text-red-700 font-semibold text-[10px] rounded truncate border border-red-200">
                                  불가
                                </span>
                              </td>
                            );
                          }

                          return (
                            <td
                              key={slot.id || slot.time}
                              className="border-b border-r border-slate-200 p-1 text-center min-w-[76px] max-w-[88px] h-[36px] text-slate-300 text-xs hover:bg-slate-50 transition"
                            >
                              -
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {/* Dynamic Google Sheet ID Configuration Card */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-bold text-[#00193c]">
              <span className="material-symbols-outlined text-base text-[#735c00]">
                table_view
              </span>
              학기별 Google Spreadsheet ID 연동 관리
            </div>
            <p className="text-[11px] text-slate-500">
              학기가 바뀔 때 새로운 스프레드시트의 ID 또는 URL을 입력하면 시스템 재배포 없이 즉시 새 학기 데이터로 자동 동기화됩니다.
            </p>
          </div>

          <div className="flex items-center gap-2 max-w-md w-full">
            <input
              type="text"
              value={spreadsheetIdInput}
              onChange={(e) => setSpreadsheetIdInput(e.target.value)}
              placeholder="Google Spreadsheet ID"
              className="flex-1 px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00193c]"
            />
            <button
              onClick={handleUpdateSheetId}
              disabled={updatingConfig}
              className="px-4 py-2 bg-[#00193c] text-white rounded-lg text-xs font-bold hover:bg-[#002d62] transition shrink-0"
            >
              {updatingConfig ? "동기화 중..." : "적용 및 재동기화"}
            </button>
          </div>
        </div>

        {/* Notice & Conference Dates Configuration Card */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <div>
              <div className="flex items-center gap-1.5 text-xs font-bold text-[#00193c]">
                <span className="material-symbols-outlined text-base text-[#aa3344]">
                  campaign
                </span>
                첫 화면 상담 일정 및 공지사항 실시간 관리
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                여기서 수정한 학년도, 날짜와 공지 내용은 학부모가 접속하는 첫 메인 화면(Welcome Card)에 실시간으로 즉시 반영됩니다.
              </p>
            </div>
          </div>

          <form onSubmit={handleUpdateNotice} className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="font-semibold text-slate-700 block mb-1">
                학사년도 (Academic Year)
              </label>
              <input
                type="text"
                value={academicYearInput}
                onChange={(e) => setAcademicYearInput(e.target.value)}
                placeholder="2026–2027"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00193c]"
                required
              />
            </div>

            <div>
              <label className="font-semibold text-slate-700 block mb-1">
                상담 일시 (Conference Dates)
              </label>
              <input
                type="text"
                value={noticeDatesInput}
                onChange={(e) => setNoticeDatesInput(e.target.value)}
                placeholder="2026년 10월 30일(목) · 11월 1일(금)"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00193c]"
                required
              />
            </div>

            <div>
              <label className="font-semibold text-slate-700 block mb-1">
                상담 시간 안내 (Time Session)
              </label>
              <input
                type="text"
                value={noticeTimesInput}
                onChange={(e) => setNoticeTimesInput(e.target.value)}
                placeholder="13:50 ~ 17:30 (세션당 20분 진행)"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00193c]"
                required
              />
            </div>

            <div>
              <label className="font-semibold text-slate-700 block mb-1">
                공지사항 제목 (Notice Title)
              </label>
              <input
                type="text"
                value={noticeTitleInput}
                onChange={(e) => setNoticeTitleInput(e.target.value)}
                placeholder="운영 안내 및 신청 공지"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00193c]"
                required
              />
            </div>

            <div>
              <label className="font-semibold text-slate-700 block mb-1">
                추가 세부 공지 내용 (Notice Details)
              </label>
              <input
                type="text"
                value={noticeContentInput}
                onChange={(e) => setNoticeContentInput(e.target.value)}
                placeholder="상담을 원하시는 선생님과 상담 항목을 최대 4개까지 선택하신 후 예약하시기 바랍니다."
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00193c]"
              />
            </div>

            <div className="md:col-span-2 flex justify-end">
              <button
                type="submit"
                disabled={updatingNotice}
                className="px-5 py-2.5 bg-[#00193c] text-white rounded-xl text-xs font-bold hover:bg-[#002d62] transition shadow-xs flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-sm">save</span>
                <span>{updatingNotice ? "저장 및 반영 중..." : "첫 화면 공지사항 적용하기"}</span>
              </button>
            </div>
          </form>
        </div>

        {/* Teacher Unavailable Slots (Blocked Dates/Times) Management Card */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <div>
              <div className="flex items-center gap-1.5 text-xs font-bold text-[#00193c]">
                <span className="material-symbols-outlined text-base text-[#ba1a1a]">
                  block
                </span>
                교사별 상담 불가(제한) 일자 및 시간 지정 관리
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                교사의 출장, 회의 또는 개인 사정으로 상담이 불가능한 날짜나 특정 시간대를 지정하면, 학부모 예약 화면에서 해당 상담교과가 즉시 붉은색 [상담불가]로 비활성화됩니다.
              </p>
            </div>
            <span className="px-2.5 py-1 bg-red-50 text-red-700 rounded-lg text-xs font-bold border border-red-200">
              현재 제한 상담교과: {blockedSlots.length}개
            </span>
          </div>

          {/* Form to Add Blocked Slot */}
          <form onSubmit={handleAddBlockedSlot} className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
            <div>
              <label className="font-semibold text-slate-700 block mb-1">
                대상 교사 (Teacher)
              </label>
              <select
                value={blockTeacherSelect}
                onChange={(e) => setBlockTeacherSelect(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#00193c]"
              >
                <option value="ALL">전체 교사 공통 (All Teachers)</option>
                {teachers.map((t) => (
                  <option key={t.id} value={t.nameEn}>
                    {t.nameEn} ({t.nameKo})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="font-semibold text-slate-700 block mb-1">
                제한 날짜 (Date)
              </label>
              <select
                value={blockDateSelect}
                onChange={(e) => setBlockDateSelect(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#00193c]"
              >
                <option value="ALL">해당 교사 모든 날짜 (All Dates)</option>
                {Array.from(new Set(timeSlots.map((t) => t.date))).filter(Boolean).map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="font-semibold text-slate-700 block mb-1">
                제한 시간대 (Time Slot)
              </label>
              <select
                value={blockTimeSelect}
                onChange={(e) => setBlockTimeSelect(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#00193c]"
              >
                <option value="ALL">해당 일자 전체 시간 (All Day)</option>
                {Array.from(new Set(timeSlots.map((t) => t.time))).filter(Boolean).map((tm) => (
                  <option key={tm} value={tm}>
                    {tm}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="font-semibold text-slate-700 block mb-1">
                사유 및 안내 문구
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={blockReasonInput}
                  onChange={(e) => setBlockReasonInput(e.target.value)}
                  placeholder="교사 출장/회의"
                  className="flex-1 px-3 py-2 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#00193c]"
                  required
                />
                <button
                  type="submit"
                  disabled={addingBlock}
                  className="px-3 py-2 bg-[#aa3344] text-white rounded-lg font-bold hover:bg-[#89192f] transition shrink-0 shadow-xs flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-sm">lock</span>
                  <span>{addingBlock ? "등록 중..." : "제한 등록"}</span>
                </button>
              </div>
            </div>
          </form>

          {/* List of currently blocked slots */}
          {blockedSlots.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                    <th className="p-2.5">대상 교사</th>
                    <th className="p-2.5">제한 날짜</th>
                    <th className="p-2.5">제한 시간대</th>
                    <th className="p-2.5">지정 사유</th>
                    <th className="p-2.5 text-right">제한 해제</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {blockedSlots.map((b) => (
                    <tr key={b.id} className="hover:bg-slate-50 transition">
                      <td className="p-2.5 font-bold text-[#00193c]">
                        {b.teacherName === "ALL" ? (
                          <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px]">
                            전체 교사 공통
                          </span>
                        ) : (
                          b.teacherName
                        )}
                      </td>
                      <td className="p-2.5 font-medium text-slate-700">
                        {b.date === "ALL" ? "모든 상담일" : b.date}
                      </td>
                      <td className="p-2.5">
                        <span className="font-bold text-red-700 bg-red-50 px-2 py-0.5 rounded border border-red-200">
                          {b.timeSlot === "ALL" ? "전체 시간 마감" : b.timeSlot}
                        </span>
                      </td>
                      <td className="p-2.5 text-slate-600">{b.reason}</td>
                      <td className="p-2.5 text-right">
                        <button
                          onClick={() => handleDeleteBlockedSlot(b.id)}
                          className="px-2.5 py-1 text-red-600 hover:text-white hover:bg-red-600 border border-red-200 rounded text-[11px] font-semibold transition"
                        >
                          제한 해제 (복원)
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-6 text-center text-slate-400 bg-slate-50/50 rounded-xl border border-dashed border-slate-200 text-xs">
              현재 운영자에 의해 상담이 제한(불가)된 시간대가 없습니다. 모든 정상 상담교과가 예약 가능 상태입니다.
            </div>
          )}
        </div>

        {/* On-Site Parent Search & QR Code Issuance Desk */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden p-5 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-[#00193c] flex items-center gap-1.5">
                <span className="material-symbols-outlined text-base text-[#aa3344]">
                  qr_code_scanner
                </span>
                당일 현장 학부모 검색 및 모바일 확인증 QR코드 발급
              </h2>
              <p className="text-[11px] text-slate-500">
                학부모님이 예약증을 지참하지 않은 경우, 여기서 학생/학부모명을 검색하여 QR코드를 보여주시면 학부모 스마트폰으로 즉시 다운로드 가능합니다.
              </p>
            </div>

            <div className="w-full md:w-72">
              <input
                type="text"
                placeholder="학생명, 학부모명, 또는 SLIP ID 검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00193c]"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                  <th className="p-2.5">Slip ID</th>
                  <th className="p-2.5">학생명 (학년)</th>
                  <th className="p-2.5">학부모 성명</th>
                  <th className="p-2.5">상담 교사</th>
                  <th className="p-2.5">상담 시간</th>
                  <th className="p-2.5">상태</th>
                  <th className="p-2.5 text-right">현장 QR 발급</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredReservations.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-slate-400">
                      검색된 예약 내역이 없습니다.
                    </td>
                  </tr>
                ) : (
                  filteredReservations.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50 transition">
                      <td className="p-2.5 font-mono text-[11px] text-slate-500">
                        {item.uniqueToken}
                      </td>
                      <td className="p-2.5 font-bold text-[#00193c]">
                        {item.studentName} ({item.studentGrade})
                      </td>
                      <td className="p-2.5 text-slate-700">{item.parentName}</td>
                      <td className="p-2.5 font-medium text-[#735c00]">
                        {item.teacherName}
                      </td>
                      <td className="p-2.5">
                        <span className="font-semibold text-blue-800 bg-blue-50 px-2 py-0.5 rounded">
                          {item.date} {item.timeSlot}
                        </span>
                      </td>
                      <td className="p-2.5">
                        <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-bold text-[10px]">
                          {item.status}
                        </span>
                      </td>
                      <td className="p-2.5 text-right">
                        <button
                          onClick={() => handleOpenQrModal(item)}
                          className="px-2.5 py-1 bg-[#00193c] text-white rounded text-[11px] font-semibold hover:bg-[#002d62] inline-flex items-center gap-1 shadow-xs"
                        >
                          <span className="material-symbols-outlined text-xs">qr_code</span>
                          QR코드 보기
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Teacher Management Table */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-[#00193c] flex items-center gap-1.5">
                <span className="material-symbols-outlined text-base text-[#002d62]">
                  manage_accounts
                </span>
                상담 교사 및 과목 옵션 관리 ({teachers.length}명)
              </h2>
              <p className="text-[11px] text-slate-500">
                운영자 모드에서 상담 교사를 실시간으로 추가, 수정, 삭제할 수 있습니다.
              </p>
            </div>
            <button
              onClick={() => handleOpenTeacherModal()}
              className="px-3 py-1.5 bg-[#aa3344] text-white rounded-lg text-xs font-bold hover:bg-[#89192f] transition flex items-center gap-1 shadow-xs"
            >
              <span className="material-symbols-outlined text-sm">person_add</span>
              새 교사 추가
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                  <th className="p-2.5">교사명 (영문 / 한글)</th>
                  <th className="p-2.5">직책</th>
                  <th className="p-2.5">개설 상담 옵션 (최대 8개)</th>
                  <th className="p-2.5 text-right">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {teachers.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50 transition">
                    <td className="p-2.5 font-bold text-[#00193c]">
                      {t.nameEn} <span className="font-normal text-slate-500">({t.nameKo})</span>
                    </td>
                    <td className="p-2.5 text-slate-700">{t.role}</td>
                    <td className="p-2.5">
                      <div className="flex flex-wrap gap-1">
                        {t.options.map((opt, i) => (
                          <span
                            key={i}
                            className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded"
                          >
                            {opt}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="p-2.5 text-right space-x-2">
                      <button
                        onClick={() => handleOpenTeacherModal(t)}
                        className="text-blue-600 hover:underline font-semibold"
                      >
                        수정
                      </button>
                      <button
                        onClick={() => handleDeleteTeacher(t.id)}
                        className="text-red-600 hover:underline font-semibold"
                      >
                        삭제
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* On-Site Parent QR Code Modal */}
      {selectedParentRes && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-[380px] shadow-2xl text-center space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <span className="text-sm font-bold text-[#00193c]">현장 모바일 확인증 QR</span>
              <button
                onClick={() => setSelectedParentRes(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <div className="space-y-1">
              <h3 className="text-base font-bold text-[#00193c]">
                {selectedParentRes.studentName} ({selectedParentRes.studentGrade})
              </h3>
              <p className="text-xs text-slate-500">
                학부모: {selectedParentRes.parentName} 님
              </p>
              <div className="text-xs font-semibold text-[#aa3344] bg-red-50 py-1 rounded-lg">
                {selectedParentRes.teacherName} · {selectedParentRes.date} {selectedParentRes.timeSlot}
              </div>
            </div>

            {modalQrCodeUrl && (
              <div className="flex justify-center py-2">
                <div className="p-3 bg-white border border-slate-200 rounded-xl shadow-xs">
                  <img
                    src={modalQrCodeUrl}
                    alt="Slip URL QR Code"
                    className="w-48 h-48 object-contain"
                  />
                </div>
              </div>
            )}

            <p className="text-[11px] text-slate-600 leading-relaxed">
              학부모님의 스마트폰 카메라로 위 QR코드를 비추시면, 즉시 최종 상담 예약 완료 화면이 열리며 [이미지 저장]이 가능합니다.
            </p>

            <button
              onClick={() => setSelectedParentRes(null)}
              className="w-full py-2.5 bg-[#00193c] text-white rounded-xl text-xs font-bold"
            >
              닫기
            </button>
          </div>
        </div>
      )}

      {/* Teacher Add/Edit Modal */}
      {teacherModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveTeacher}
            className="bg-white rounded-2xl p-6 w-full max-w-[440px] shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <span className="text-sm font-bold text-[#00193c]">
                {editingTeacher ? "교사 정보 및 상담 옵션 수정" : "새 상담 교사 등록"}
              </span>
              <button
                type="button"
                onClick={() => setTeacherModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  영문 교사명 (예: Ms. Monica Yu)
                </label>
                <input
                  type="text"
                  required
                  value={teacherFormNameEn}
                  onChange={(e) => setTeacherFormNameEn(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#00193c]"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  한글 교사명 (예: 유미연)
                </label>
                <input
                  type="text"
                  required
                  value={teacherFormNameKo}
                  onChange={(e) => setTeacherFormNameKo(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#00193c]"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  직책/과목 (예: M6 담임교사)
                </label>
                <input
                  type="text"
                  required
                  value={teacherFormRole}
                  onChange={(e) => setTeacherFormRole(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#00193c]"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  상담 옵션 목록 (쉼표로 구분, 최대 8개)
                </label>
                <input
                  type="text"
                  placeholder="M6 담임 관련, M6 English, M7 Math"
                  value={teacherFormOptions}
                  onChange={(e) => setTeacherFormOptions(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#00193c]"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setTeacherModalOpen(false)}
                className="flex-1 py-2.5 border border-slate-300 rounded-xl text-xs font-semibold text-slate-600"
              >
                취소
              </button>
              <button
                type="submit"
                className="flex-1 py-2.5 bg-[#00193c] text-white rounded-xl text-xs font-bold hover:bg-[#002d62]"
              >
                저장하기
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
