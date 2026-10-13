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

interface StudentRecord {
  id: string;
  grade: string;
  studentNameKo: string;
  studentNameEn: string;
  parentFather: string;
  parentMother: string;
}

interface TeacherEmailRecord {
  email: string;
  name: string;
  role: "교사" | "운영자";
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

const SUPABASE_SQL_SCHEMA = `CREATE TABLE IF NOT EXISTS public.ptc_state (
  id TEXT PRIMARY KEY DEFAULT 'default',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.ptc_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow full access to ptc_state" ON public.ptc_state;
CREATE POLICY "Allow full access to ptc_state"
  ON public.ptc_state FOR ALL USING (true) WITH CHECK (true);

INSERT INTO public.ptc_state (id, payload, updated_at)
VALUES ('default', '{}'::jsonb, NOW()) ON CONFLICT (id) DO NOTHING;`;

export default function AdminConsolePage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  // Core Data
  const [teachers, setTeachers] = useState<TeacherRecord[]>([]);
  const [timeSlots, setTimeSlots] = useState<TimeSlotRecord[]>([]);
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [teacherEmails, setTeacherEmails] = useState<TeacherEmailRecord[]>([]);
  const [reservations, setReservations] = useState<ReservationRecord[]>([]);
  const [config, setConfig] = useState<any>({});
  const [supabaseStatus, setSupabaseStatus] = useState<any>({
    connected: false,
    supabaseUrl: "",
    hasAnonKey: false,
    source: "none",
  });

  // Supabase connection form
  const [supabaseUrlInput, setSupabaseUrlInput] = useState("");
  const [supabaseKeyInput, setSupabaseKeyInput] = useState("");
  const [savingSupabase, setSavingSupabase] = useState(false);
  const [showSqlModal, setShowSqlModal] = useState(false);

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

  // Admin & Teacher Account Email Modal (운영자 및 교사 계정 관리)
  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [editingRoleEmail, setEditingRoleEmail] = useState<string | null>(null);
  const [roleFormEmail, setRoleFormEmail] = useState("");
  const [roleFormName, setRoleFormName] = useState("");
  const [roleFormType, setRoleFormType] = useState<"운영자" | "교사">("교사");
  const [roleSearchQuery, setRoleSearchQuery] = useState("");

  // Student & Parent Roster Modal (학생 및 학부모 명부 관리)
  const [studentModalOpen, setStudentModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<StudentRecord | null>(null);
  const [stuFormGrade, setStuFormGrade] = useState("");
  const [stuFormNameKo, setStuFormNameKo] = useState("");
  const [stuFormNameEn, setStuFormNameEn] = useState("");
  const [stuFormFather, setStuFormFather] = useState("");
  const [stuFormMother, setStuFormMother] = useState("");
  const [studentSearchQuery, setStudentSearchQuery] = useState("");
  const [studentGradeFilter, setStudentGradeFilter] = useState("ALL");

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
        setStudents(json.students || []);
        setTeacherEmails(json.teacherEmails || []);
        setReservations(json.reservations || []);
        setBlockedSlots(json.blockedSlots || []);
        setConfig(json.config || {});
        if (json.supabaseStatus) {
          setSupabaseStatus(json.supabaseStatus);
          if (json.supabaseStatus.supabaseUrl && !supabaseUrlInput) {
            setSupabaseUrlInput(json.supabaseStatus.supabaseUrl);
          }
        }
        setSpreadsheetIdInput(json.config?.spreadsheetId || "");
        setAcademicYearInput(json.config?.academicYear || "2026–2027");
        setNoticeDatesInput(json.config?.conferenceDates || "2026년 10월 30일(목) · 11월 1일(금)");
        setNoticeTimesInput(json.config?.conferenceTimes || "13:50 ~ 17:30 (세션당 20분 진행)");
        setNoticeTitleInput(json.config?.noticeTitle || "운영 안내 및 신청 공지");
        setNoticeContentInput(
          json.config?.noticeContent ||
            "상담을 원하시는 선생님과 상담 항목을 최대 4개까지 선택하신 후 예약하시기 바랍니다."
        );
      }
    } catch (err) {
      console.error("Admin sync error:", err);
    } finally {
      setLoading(false);
      if (force) setSyncing(false);
    }
  };

  useEffect(() => {
    // Enforce login authentication check: direct URL access to /admin without logging in redirects to "/"
    let isAuthorizedAdmin = false;
    if (typeof window !== "undefined") {
      try {
        const raw = sessionStorage.getItem("ptc_user");
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.role === "운영자" && parsed.email) {
            isAuthorizedAdmin = true;
          }
        }
      } catch {
        isAuthorizedAdmin = false;
      }
    }

    if (!isAuthorizedAdmin) {
      router.replace("/");
      return;
    }

    setAuthChecked(true);
    loadData();
  }, [router]);

  const handleReturnToLogin = () => {
    sessionStorage.removeItem("ptc_user");
    localStorage.removeItem("ptc_user");
    router.replace("/");
  };

  // --- Supabase Connection Save ---
  const handleSaveSupabaseConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabaseUrlInput.trim() || !supabaseKeyInput.trim()) {
      alert("Supabase Project URL과 Anon Key를 모두 입력해 주세요.");
      return;
    }
    setSavingSupabase(true);
    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "UPDATE_SUPABASE_CONFIG",
          supabaseUrl: supabaseUrlInput.trim(),
          supabaseAnonKey: supabaseKeyInput.trim(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        alert("Supabase 클라우드 영구 저장소 연동 설정이 저장되었습니다!");
        setSupabaseKeyInput("");
        loadData(true);
      } else {
        alert("연동 오류: " + (data.error || ""));
      }
    } catch (err: any) {
      alert("연동 오류: " + err.message);
    } finally {
      setSavingSupabase(false);
    }
  };

  // --- Reservation Cancel & Reset (예약 취소 / 전체 예약 초기화 - 운영자 전용) ---
  const handleCancelSingleReservation = async (resItem: ReservationRecord) => {
    if (
      !confirm(
        `[${resItem.studentName}] 학생의 ${resItem.teacherName} 선생님 (${resItem.date} ${resItem.timeSlot}) 상담 예약을 취소(삭제)하시겠습니까?`
      )
    ) {
      return;
    }

    try {
      const res = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "CANCEL_ONE",
          id: resItem.id,
          requesterRole: "운영자",
        }),
      });
      const data = await res.json();
      if (data.success) {
        loadData();
      } else {
        alert(data.error || "예약 취소 실패");
      }
    } catch (err: any) {
      alert("예약 취소 중 오류: " + err.message);
    }
  };

  const handleClearAllReservations = async () => {
    const confirmedCount = reservations.filter((r) => r.status === "CONFIRMED").length;
    if (confirmedCount === 0 && reservations.length === 0) {
      alert("현재 등록된 예약 내역이 없습니다.");
      return;
    }

    const firstConfirm = confirm(
      `[주의] 현재 등록된 모든 상담 예약 내역(${reservations.length}건)을 전체 초기화하시겠습니까?\n\n교사 베타 테스트 종료 후 실제 학부모 오픈 전에만 실행해 주세요.`
    );
    if (!firstConfirm) return;

    try {
      const res = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "CLEAR_ALL",
          requesterRole: "운영자",
        }),
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message || "전체 예약 내역이 모두 초기화되었습니다.");
        loadData();
      } else {
        alert(data.error || "초기화 실패");
      }
    } catch (err: any) {
      alert("초기화 오류: " + err.message);
    }
  };

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

  // --- Teacher Add/Edit/Delete ---
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

  const handleSaveTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    const optionsArray = teacherFormOptions
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    try {
      if (editingTeacher) {
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

  const handleDeleteTeacher = async (id: string) => {
    if (!confirm("정말 이 상담 교사를 삭제하시겠습니까?")) return;
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

  // --- Admin / Teacher Account Role CRUD (운영자 및 교사 계정 관리) ---
  const handleOpenRoleModal = (record?: TeacherEmailRecord) => {
    if (record) {
      setEditingRoleEmail(record.email);
      setRoleFormEmail(record.email);
      setRoleFormName(record.name);
      setRoleFormType(record.role);
    } else {
      setEditingRoleEmail(null);
      setRoleFormEmail("");
      setRoleFormName("");
      setRoleFormType("교사");
    }
    setRoleModalOpen(true);
  };

  const handleSaveRoleAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "UPSERT_USER_ROLE",
          previousEmail: editingRoleEmail,
          userRoleData: {
            email: roleFormEmail.trim(),
            name: roleFormName.trim(),
            role: roleFormType,
          },
        }),
      });
      const data = await res.json();
      if (data.success) {
        setRoleModalOpen(false);
        loadData();
      } else {
        alert(data.error || "계정 저장 오류");
      }
    } catch (err: any) {
      alert("계정 저장 오류: " + err.message);
    }
  };

  const handleDeleteRoleAccount = async (email: string) => {
    if (!confirm(`[${email}] 계정을 운영자/교사 권한 목록에서 삭제하시겠습니까?`)) return;
    try {
      await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "DELETE_USER_ROLE", email }),
      });
      loadData();
    } catch (err: any) {
      alert("계정 삭제 오류: " + err.message);
    }
  };

  // --- Student & Parent Roster CRUD (학생 및 학부모 명부 관리) ---
  const handleOpenStudentModal = (student?: StudentRecord) => {
    if (student) {
      setEditingStudent(student);
      setStuFormGrade(student.grade);
      setStuFormNameKo(student.studentNameKo);
      setStuFormNameEn(student.studentNameEn);
      setStuFormFather(student.parentFather);
      setStuFormMother(student.parentMother);
    } else {
      setEditingStudent(null);
      setStuFormGrade(studentGradeFilter !== "ALL" ? studentGradeFilter : "G9");
      setStuFormNameKo("");
      setStuFormNameEn("");
      setStuFormFather("");
      setStuFormMother("");
    }
    setStudentModalOpen(true);
  };

  const handleSaveStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "UPSERT_STUDENT",
          studentData: {
            id: editingStudent?.id || `stu_custom_${Date.now()}`,
            grade: stuFormGrade.trim(),
            studentNameKo: stuFormNameKo.trim(),
            studentNameEn: stuFormNameEn.trim(),
            parentFather: stuFormFather.trim(),
            parentMother: stuFormMother.trim(),
          },
        }),
      });
      const data = await res.json();
      if (data.success) {
        setStudentModalOpen(false);
        loadData();
      } else {
        alert(data.error || "학생/학부모 저장 오류");
      }
    } catch (err: any) {
      alert("학생/학부모 저장 오류: " + err.message);
    }
  };

  const handleDeleteStudent = async (student: StudentRecord) => {
    if (
      !confirm(
        `[${student.grade}] ${student.studentNameKo} (${student.studentNameEn}) 학생 및 학부모 명부 정보를 삭제하시겠습니까?`
      )
    ) {
      return;
    }
    try {
      await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "DELETE_STUDENT", studentId: student.id }),
      });
      loadData();
    } catch (err: any) {
      alert("학생 삭제 오류: " + err.message);
    }
  };

  // --- Student Grade Promotion (진급 일괄 처리: M6->M7, M7->M8, M8->H9, H9->H10, H10->H11, H11->H12, H12->졸업 삭제) ---
  const [promoting, setPromoting] = useState(false);

  const handlePromoteStudents = async () => {
    const confirmMsg =
      "전체 재학생 학년 진급 처리를 실행하시겠습니까?\n\n" +
      "• M6 → M7\n" +
      "• M7 → M8\n" +
      "• M8 → H9\n" +
      "• H9 → H10\n" +
      "• H10 → H11\n" +
      "• H11 → H12\n" +
      "• H12 → 졸업(명부에서 자동 삭제)\n\n" +
      "진급 처리 후 새로 입학한 M6 또는 전입생은 [CSV 업로드] 또는 [학생/학부모 추가]로 등록하실 수 있습니다.";

    if (!confirm(confirmMsg)) return;

    setPromoting(true);
    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "PROMOTE_STUDENTS" }),
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message || "학생 진급 및 졸업생 삭제 처리가 완료되었습니다.");
        loadData();
      } else {
        alert(data.error || "진급 처리 중 오류가 발생했습니다.");
      }
    } catch (err: any) {
      alert("진급 처리 오류: " + err.message);
    } finally {
      setPromoting(false);
    }
  };

  // --- CSV Template Download & Bulk Upload Helpers ---
  const parseCsvClient = (csvText: string): string[][] => {
    const cleanText = csvText.replace(/^\uFEFF/, ""); // Strip UTF-8 BOM if present
    const rows: string[][] = [];
    const lines = cleanText.split(/\r?\n/);
    for (const line of lines) {
      if (!line.trim()) continue;
      const row: string[] = [];
      let insideQuotes = false;
      let cell = "";
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (insideQuotes && line[i + 1] === '"') {
            cell += '"';
            i++;
          } else {
            insideQuotes = !insideQuotes;
          }
        } else if (ch === "," && !insideQuotes) {
          row.push(cell.trim());
          cell = "";
        } else {
          cell += ch;
        }
      }
      row.push(cell.trim());
      rows.push(row);
    }
    return rows;
  };

  const escapeCsvCell = (val: string) => {
    const s = String(val ?? "");
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const downloadCsvFile = (filename: string, rows: string[][]) => {
    const csvContent =
      "\uFEFF" + rows.map((r) => r.map(escapeCsvCell).join(",")).join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // 1) Students & Parents CSV Template Download & Upload
  const handleDownloadStudentCsvTemplate = () => {
    const header = ["학년", "학생한글성명", "학생영문성명", "아버지성명", "어머니성명"];
    const dataRows =
      students.length > 0
        ? students.map((s) => [
            s.grade,
            s.studentNameKo,
            s.studentNameEn,
            s.parentFather,
            s.parentMother,
          ])
        : [
            ["M6", "김하준", "Hajun Kim", "김철수", "이영희"],
            ["H9", "박서연", "Seoyeon Park", "박민수", "최지은"],
          ];
    downloadCsvFile("학생_및_학부모_명부_템플릿.csv", [header, ...dataRows]);
  };

  const handleUploadStudentCsv = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    try {
      const text = await file.text();
      const rows = parseCsvClient(text);
      if (rows.length < 2) {
        alert("CSV 파일에 데이터가 없습니다. 헤더(1행) 아래에 학생 데이터를 입력해 주세요.");
        return;
      }

      // Skip header if first row contains '학년' or 'grade'
      const firstCell = (rows[0][0] || "").toLowerCase();
      const startIdx =
        firstCell.includes("학년") || firstCell.includes("grade") ? 1 : 0;

      const parsedRecords = rows
        .slice(startIdx)
        .filter((r) => r.length >= 2 && (r[0] || "").trim() && (r[1] || "").trim())
        .map((r) => ({
          grade: (r[0] || "").trim(),
          studentNameKo: (r[1] || "").trim(),
          studentNameEn: (r[2] || "").trim(),
          parentFather: (r[3] || "").trim(),
          parentMother: (r[4] || "").trim(),
        }));

      if (parsedRecords.length === 0) {
        alert("유효한 학생 데이터가 없습니다. (학년, 학생한글성명 필수)");
        return;
      }

      const replaceAll = confirm(
        `총 ${parsedRecords.length}명의 학생/학부모 데이터를 읽었습니다.\n\n` +
          `[확인]을 누르면 기존 명부에 병합(추가 및 업데이트)합니다.\n` +
          `[취소]를 누르면 전체 교체 여부를 선택할 수 있습니다.`
      );

      let mode: "merge" | "replace" = "merge";
      if (!replaceAll) {
        const confirmReplace = confirm(
          `기존 학생 명부를 모두 지우고 업로드한 CSV 파일(${parsedRecords.length}명)로 전체 교체하시겠습니까?`
        );
        if (!confirmReplace) return;
        mode = "replace";
      }

      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "BULK_UPLOAD_STUDENTS",
          records: parsedRecords,
          mode,
        }),
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message);
        loadData();
      } else {
        alert(data.error || "CSV 업로드 실패");
      }
    } catch (err: any) {
      alert("CSV 파일 읽기 오류: " + err.message);
    }
  };

  // 2) Admin & Teacher Account Roles CSV Template Download & Upload
  const handleDownloadRoleCsvTemplate = () => {
    const header = ["교사이메일", "교사명", "권한"];
    const dataRows =
      teacherEmails.length > 0
        ? teacherEmails.map((item) => [item.email, item.name, item.role])
        : [
            ["stigma153.peter@gmail.com", "피터", "운영자"],
            ["lis.monicayu@gmail.com", "유미연", "교사"],
          ];
    downloadCsvFile("운영자_및_교사_계정권한_템플릿.csv", [header, ...dataRows]);
  };

  const handleUploadRoleCsv = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    try {
      const text = await file.text();
      const rows = parseCsvClient(text);
      if (rows.length < 2) {
        alert("CSV 파일에 계정 데이터가 없습니다.");
        return;
      }

      const firstCell = (rows[0][0] || "").toLowerCase();
      const startIdx =
        firstCell.includes("이메일") || firstCell.includes("email") ? 1 : 0;

      const parsedRecords = rows
        .slice(startIdx)
        .filter((r) => r.length >= 2 && (r[0] || "").includes("@"))
        .map((r) => ({
          email: (r[0] || "").toLowerCase().trim(),
          name: (r[1] || "").trim(),
          role: ((r[2] || "").includes("운영자") ? "운영자" : "교사") as
            | "운영자"
            | "교사",
        }));

      if (parsedRecords.length === 0) {
        alert("유효한 이메일 계정 데이터가 없습니다.");
        return;
      }

      const mergeChoice = confirm(
        `총 ${parsedRecords.length}개의 운영자/교사 계정 데이터를 읽었습니다.\n\n` +
          `[확인]을 누르면 기존 계정 목록에 병합(추가/수정)합니다.\n` +
          `[취소]를 누르면 전체 교체 여부를 선택할 수 있습니다.`
      );

      let mode: "merge" | "replace" = "merge";
      if (!mergeChoice) {
        const confirmReplace = confirm(
          `기존 운영자/교사 계정 목록을 모두 지우고 업로드한 CSV 파일(${parsedRecords.length}명)로 전체 교체하시겠습니까?`
        );
        if (!confirmReplace) return;
        mode = "replace";
      }

      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "BULK_UPLOAD_USER_ROLES",
          records: parsedRecords,
          mode,
        }),
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message);
        loadData();
      } else {
        alert(data.error || "CSV 업로드 실패");
      }
    } catch (err: any) {
      alert("CSV 파일 처리 오류: " + err.message);
    }
  };

  // 3) Consultation Teachers & Options CSV Template Download & Upload
  const handleDownloadTeacherCsvTemplate = () => {
    const header = [
      "영문교사명",
      "한글교사명",
      "직책",
      "상담교과옵션1",
      "상담교과옵션2",
      "상담교과옵션3",
      "상담교과옵션4",
      "상담교과옵션5",
      "상담교과옵션6",
      "상담교과옵션7",
      "상담교과옵션8",
    ];
    const dataRows =
      teachers.length > 0
        ? teachers.map((t) => [
            t.nameEn,
            t.nameKo,
            t.role,
            t.options[0] || "",
            t.options[1] || "",
            t.options[2] || "",
            t.options[3] || "",
            t.options[4] || "",
            t.options[5] || "",
            t.options[6] || "",
            t.options[7] || "",
          ])
        : [
            [
              "Ms. Monica Yu",
              "유미연",
              "M6 담임교사",
              "M6 담임상담",
              "M6 English",
              "M7 English",
              "",
              "",
              "",
              "",
              "",
            ],
          ];
    downloadCsvFile("상담교사_및_상담교과옵션_템플릿.csv", [header, ...dataRows]);
  };

  const handleUploadTeacherCsv = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    try {
      const text = await file.text();
      const rows = parseCsvClient(text);
      if (rows.length < 2) {
        alert("CSV 파일에 상담 교사 데이터가 없습니다.");
        return;
      }

      const firstCell = (rows[0][0] || "").toLowerCase();
      const startIdx =
        firstCell.includes("교사") || firstCell.includes("name") || firstCell.includes("영문")
          ? 1
          : 0;

      const parsedRecords = rows
        .slice(startIdx)
        .filter((r) => r.length >= 2 && ((r[0] || "").trim() || (r[1] || "").trim()))
        .map((r) => ({
          nameEn: (r[0] || "").trim(),
          nameKo: (r[1] || "").trim(),
          role: (r[2] || "").trim(),
          options: r
            .slice(3, 11)
            .map((opt) => (opt || "").trim())
            .filter(Boolean),
        }));

      if (parsedRecords.length === 0) {
        alert("유효한 상담 교사 데이터가 없습니다.");
        return;
      }

      const mergeChoice = confirm(
        `총 ${parsedRecords.length}명의 상담 교사 및 상담교과 데이터를 읽었습니다.\n\n` +
          `[확인]을 누르면 기존 교사 목록에 병합(추가/수정)합니다.\n` +
          `[취소]를 누르면 전체 교체 여부를 선택할 수 있습니다.`
      );

      let mode: "merge" | "replace" = "merge";
      if (!mergeChoice) {
        const confirmReplace = confirm(
          `기존 상담 교사 목록을 모두 지우고 업로드한 CSV 파일(${parsedRecords.length}명)로 전체 교체하시겠습니까?`
        );
        if (!confirmReplace) return;
        mode = "replace";
      }

      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "BULK_UPLOAD_TEACHERS",
          records: parsedRecords,
          mode,
        }),
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message);
        loadData();
      } else {
        alert(data.error || "CSV 업로드 실패");
      }
    } catch (err: any) {
      alert("CSV 파일 처리 오류: " + err.message);
    }
  };

  // Filtered Reservations Search
  const filteredReservations = useMemo(() => {
    const activeList = reservations.filter((r) => r.status === "CONFIRMED");
    if (!searchQuery.trim()) return activeList;
    const q = searchQuery.toLowerCase().trim();
    return activeList.filter(
      (r) =>
        r.studentName.toLowerCase().includes(q) ||
        r.parentName.toLowerCase().includes(q) ||
        r.teacherName.toLowerCase().includes(q) ||
        r.uniqueToken.toLowerCase().includes(q)
    );
  }, [reservations, searchQuery]);

  // Filtered Role Accounts
  const filteredRoleAccounts = useMemo(() => {
    if (!roleSearchQuery.trim()) return teacherEmails;
    const q = roleSearchQuery.toLowerCase().trim();
    return teacherEmails.filter(
      (item) =>
        item.email.toLowerCase().includes(q) ||
        item.name.toLowerCase().includes(q) ||
        item.role.includes(q)
    );
  }, [teacherEmails, roleSearchQuery]);

  const [studentSortMode, setStudentSortMode] = useState<
    "grade_asc" | "grade_desc" | "name_asc" | "name_desc"
  >("grade_asc");

  const getGradeOrderWeight = (g: string): number => {
    const clean = (g || "").trim().toUpperCase();
    const order = [
      "M6",
      "M7",
      "M8",
      "H9",
      "H10",
      "H11",
      "H12",
      "G6",
      "G7",
      "G8",
      "G9",
      "G10",
      "G11",
      "G12",
    ];
    const idx = order.indexOf(clean);
    if (idx >= 0) return idx;
    const numMatch = clean.match(/\d+/);
    return numMatch ? parseInt(numMatch[0], 10) + 20 : 999;
  };

  // Distinct Student Grades (sorted M6 -> H12) & Filtered/Sorted Students
  const availableGrades = useMemo(() => {
    return Array.from(new Set(students.map((s) => s.grade).filter(Boolean))).sort(
      (a, b) => getGradeOrderWeight(a) - getGradeOrderWeight(b)
    );
  }, [students]);

  const filteredStudents = useMemo(() => {
    const filtered = students.filter((s) => {
      if (studentGradeFilter !== "ALL" && s.grade !== studentGradeFilter) return false;
      if (!studentSearchQuery.trim()) return true;
      const q = studentSearchQuery.toLowerCase().trim();
      return (
        s.studentNameKo.toLowerCase().includes(q) ||
        s.studentNameEn.toLowerCase().includes(q) ||
        (s.parentFather || "").toLowerCase().includes(q) ||
        (s.parentMother || "").toLowerCase().includes(q) ||
        s.grade.toLowerCase().includes(q)
      );
    });

    return [...filtered].sort((a, b) => {
      if (studentSortMode === "grade_asc") {
        const diff = getGradeOrderWeight(a.grade) - getGradeOrderWeight(b.grade);
        if (diff !== 0) return diff;
        return a.studentNameKo.localeCompare(b.studentNameKo, "ko");
      }
      if (studentSortMode === "grade_desc") {
        const diff = getGradeOrderWeight(b.grade) - getGradeOrderWeight(a.grade);
        if (diff !== 0) return diff;
        return a.studentNameKo.localeCompare(b.studentNameKo, "ko");
      }
      if (studentSortMode === "name_asc") {
        const nameCmp = a.studentNameKo.localeCompare(b.studentNameKo, "ko");
        if (nameCmp !== 0) return nameCmp;
        return getGradeOrderWeight(a.grade) - getGradeOrderWeight(b.grade);
      }
      if (studentSortMode === "name_desc") {
        const nameCmp = b.studentNameKo.localeCompare(a.studentNameKo, "ko");
        if (nameCmp !== 0) return nameCmp;
        return getGradeOrderWeight(a.grade) - getGradeOrderWeight(b.grade);
      }
      return 0;
    });
  }, [students, studentGradeFilter, studentSearchQuery, studentSortMode]);

  // --- Schedule Matrix Calculations & Helpers (Loop-Free & Null-Safe) ---
  const [showMatrixView, setShowMatrixView] = useState(true);

  const matrixDates = useMemo(() => {
    return Array.from(new Set(timeSlots.map((t) => t?.date).filter(Boolean))) as string[];
  }, [timeSlots]);

  const activeDate =
    matrixSelectedDate && matrixDates.includes(matrixSelectedDate)
      ? matrixSelectedDate
      : matrixDates[0] || "";

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

  const formatStartTime = (timeStr?: string) => {
    if (!timeStr) return "";
    const parts = timeStr.split(/[-~]/);
    const startPart = parts[0]?.trim() || timeStr;
    const matchMeridiem = timeStr.match(/(am|pm)/i);
    if (
      matchMeridiem &&
      !startPart.toLowerCase().includes("am") &&
      !startPart.toLowerCase().includes("pm")
    ) {
      return `${startPart}${matchMeridiem[0].toLowerCase()}`;
    }
    return startPart;
  };

  const formatStudentNameOnly = (fullName?: string) => {
    if (!fullName) return "";
    const namePart = fullName.split("(")[0]?.trim();
    return namePart || fullName;
  };

  const getCellReservation = (
    teacher: TeacherRecord,
    slotTime: string,
    date: string
  ): ReservationRecord | undefined => {
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

  const getCellBlocked = (
    teacher: TeacherRecord,
    slotTime: string,
    date: string
  ): { blocked: boolean; reason?: string } => {
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
        bTeacher === "all" || (tEn && bTeacher === tEn) || (tKo && bTeacher === tKo);
      const dateMatch = bDate === "all" || bDate === targetDate;
      const timeMatch = bTime === "all" || bTime === targetTime;

      return teacherMatch && dateMatch && timeMatch;
    });

    return found ? { blocked: true, reason: found.reason || "상담 불가" } : { blocked: false };
  };

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

  if (!authChecked) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#f8f9ff]">
        <div className="w-8 h-8 border-4 border-[#00193c] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8f9ff]">
      {/* Top Header */}
      <header className="bg-[#00193c] text-white px-6 py-4 shadow-md flex flex-wrap items-center justify-between gap-3 sticky top-0 z-40">
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

        <div className="flex items-center gap-2 flex-wrap">
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
          <a
            href="/Lighthouse_PTC_Admin_Manual.docx"
            download="Lighthouse_PTC_운영자_매뉴얼.docx"
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition shadow-xs"
          >
            <span className="material-symbols-outlined text-sm">menu_book</span>
            <span>운영자 매뉴얼 다운로드 (Google Docs)</span>
          </a>
          <button
            onClick={() => loadData(true)}
            disabled={syncing}
            className="px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition"
          >
            <span className={`material-symbols-outlined text-sm ${syncing ? "animate-spin" : ""}`}>
              sync
            </span>
            <span>{syncing ? "동기화 중..." : "Sheets 실시간 동기화"}</span>
          </button>
          <button
            onClick={handleReturnToLogin}
            className="px-3 py-1.5 bg-white text-[#00193c] hover:bg-blue-50 rounded-lg text-xs font-bold flex items-center gap-1.5 transition shadow-xs"
          >
            <span className="material-symbols-outlined text-sm">login</span>
            <span>처음 Google 로그인 화면으로</span>
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 space-y-6">
        {/* KPI Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <span className="text-[10px] font-bold text-slate-400 uppercase">등록 교사 / 학생 수</span>
            <div className="text-2xl font-bold text-[#00193c] mt-1">
              {teachers.length}명 / {students.length}명
            </div>
            <span className="text-[11px] text-emerald-600">권한 계정 {teacherEmails.length}개 등록됨</span>
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
            <span className="text-[11px] text-slate-500">실시간 반영 및 영구 보존</span>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <span className="text-[10px] font-bold text-slate-400 uppercase">데이터 영구 저장소 상태</span>
            <div className="text-sm font-bold text-[#00193c] mt-1 truncate flex items-center gap-1.5">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  supabaseStatus?.connected ? "bg-emerald-500" : "bg-amber-500"
                }`}
              ></span>
              <span>
                {supabaseStatus?.connected ? "Supabase Cloud 연동됨" : "로컬 저장소 활성 (Supabase 대기)"}
              </span>
            </div>
            <span className="text-[11px] text-slate-500">
              학년도: {config.academicYear || "2026–2027"}
            </span>
          </div>
        </div>

        {/* Schedule Matrix Overview Table (날짜별 교사·시간대별 예약 종합 현황표) */}
        <div
          id="schedule-matrix-section"
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4"
        >
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div>
              <div className="flex items-center gap-1.5 text-xs font-bold text-[#00193c]">
                <span className="material-symbols-outlined text-base text-[#002d62]">
                  grid_view
                </span>
                날짜별 교사·시간대별 상담 예약 현황 매트릭스 (종합 상황판)
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                가로는 시작시간, 세로는 한글 교사명으로 정렬되어 각 셀에서 예약된 학생 이름을 한눈에 확인하실 수 있습니다. 예약된 셀을 클릭하면 확인증/취소 관리가 가능합니다.
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
              <span>
                현재 현황표가 접혀 있습니다. 우측 상단의 <strong>[전체 예약 화면 열기]</strong> 버튼을 누르면 상담 예약 매트릭스가 표시됩니다.
              </span>
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
                  <span>
                    총 교사: <strong className="text-slate-800">{teachers.length}명</strong>
                  </span>
                  <span className="text-slate-300">|</span>
                  <span>
                    시간대: <strong className="text-slate-800">{matrixTimeSlots.length}타임</strong>
                  </span>
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
                      <th className="sticky top-0 left-0 z-40 bg-slate-100 text-slate-700 font-bold border-b border-r border-slate-200 px-3 py-2 text-center text-[11px] min-w-[95px] max-w-[110px] whitespace-nowrap shadow-xs">
                        교사명 \ 시작시간
                      </th>
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

                        {matrixTimeSlots.map((slot) => {
                          const res = getCellReservation(teacher, slot.time, activeDate);
                          const block = !res ? getCellBlocked(teacher, slot.time, activeDate) : { blocked: false };

                          if (res) {
                            return (
                              <td
                                key={slot.id || slot.time}
                                onClick={() => handleOpenQrModal(res)}
                                title={`학생: ${res.studentName} (${res.studentGrade})\n학부모: ${res.parentName}\n상담교과: ${res.option}\n(클릭 시 상세/취소)`}
                                className="border-b border-r border-slate-200 p-1 text-center min-w-[76px] max-w-[88px] h-[36px] bg-blue-50/40 cursor-pointer hover:bg-blue-100/60"
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

        {/* On-Site Parent Search, QR Code Issuance & Reservation Cancel/Reset Desk */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden p-5 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-[#00193c] flex items-center gap-1.5">
                <span className="material-symbols-outlined text-base text-[#aa3344]">
                  qr_code_scanner
                </span>
                예약 내역 검색 · 현장 QR 발급 · 예약 취소 및 전체 초기화 ({filteredReservations.length}건)
              </h2>
              <p className="text-[11px] text-slate-500">
                개별 예약을 취소하거나, 교사 베타 테스트가 끝난 뒤 [전체 예약 초기화] 버튼으로 테스트 데이터를 일괄 삭제할 수 있습니다.
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="w-full sm:w-64">
                <input
                  type="text"
                  placeholder="학생명, 학부모명, 교사명, SLIP ID 검색..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00193c]"
                />
              </div>
              <button
                type="button"
                onClick={handleClearAllReservations}
                className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 transition shadow-xs shrink-0"
              >
                <span className="material-symbols-outlined text-sm">delete_sweep</span>
                <span>전체 예약 초기화</span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto max-h-[380px]">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 bg-slate-50 z-10">
                <tr className="border-b border-slate-200 text-slate-600 font-semibold">
                  <th className="p-2.5">Slip ID</th>
                  <th className="p-2.5">학생명 (학년)</th>
                  <th className="p-2.5">학부모 성명</th>
                  <th className="p-2.5">상담 교사 (상담교과)</th>
                  <th className="p-2.5">상담 시간</th>
                  <th className="p-2.5 text-right">관리 (QR / 예약 취소)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredReservations.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-slate-400">
                      현재 등록된 예약 내역이 없습니다.
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
                      <td className="p-2.5">
                        <span className="font-semibold text-[#00193c]">{item.teacherName}</span>
                        <span className="text-[11px] text-[#735c00] ml-1.5">({item.option})</span>
                      </td>
                      <td className="p-2.5">
                        <span className="font-semibold text-blue-800 bg-blue-50 px-2 py-0.5 rounded">
                          {item.date} {item.timeSlot}
                        </span>
                      </td>
                      <td className="p-2.5 text-right space-x-1.5 whitespace-nowrap">
                        <button
                          onClick={() => handleOpenQrModal(item)}
                          className="px-2.5 py-1 bg-[#00193c] text-white rounded text-[11px] font-semibold hover:bg-[#002d62] inline-flex items-center gap-1 shadow-xs"
                        >
                          <span className="material-symbols-outlined text-xs">qr_code</span>
                          QR 보기
                        </button>
                        <button
                          onClick={() => handleCancelSingleReservation(item)}
                          className="px-2.5 py-1 bg-red-50 text-red-600 border border-red-200 rounded text-[11px] font-semibold hover:bg-red-600 hover:text-white inline-flex items-center gap-1 transition"
                        >
                          <span className="material-symbols-outlined text-xs">cancel</span>
                          예약 취소
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Admin & Teacher Account Email Management (운영자 및 교사 로그인 계정/권한 관리) */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden p-5 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-[#00193c] flex items-center gap-1.5">
                <span className="material-symbols-outlined text-base text-[#002d62]">
                  admin_panel_settings
                </span>
                운영자 및 교사 Google 로그인 계정 권한 관리 ({teacherEmails.length}명)
              </h2>
              <p className="text-[11px] text-slate-500">
                Google 이메일 로그인 시 이 목록에 등록된 계정은 <strong>운영자</strong> 또는 <strong>교사</strong>로 자동 구분되며, 등록되지 않은 일반 이메일은 <strong>학부모</strong>로 로그인됩니다.
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="text"
                placeholder="이메일 또는 성명 검색..."
                value={roleSearchQuery}
                onChange={(e) => setRoleSearchQuery(e.target.value)}
                className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00193c]"
              />
              <button
                type="button"
                onClick={handleDownloadRoleCsvTemplate}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold transition flex items-center gap-1 shrink-0"
              >
                <span className="material-symbols-outlined text-sm">download</span>
                CSV 템플릿 다운로드
              </button>
              <label className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer shrink-0">
                <span className="material-symbols-outlined text-sm">upload_file</span>
                CSV 일괄 업로드
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleUploadRoleCsv}
                  className="hidden"
                />
              </label>
              <button
                onClick={() => handleOpenRoleModal()}
                className="px-3 py-1.5 bg-[#00193c] text-white rounded-lg text-xs font-bold hover:bg-[#002d62] transition flex items-center gap-1 shadow-xs shrink-0"
              >
                <span className="material-symbols-outlined text-sm">person_add</span>
                운영자/교사 계정 추가
              </button>
            </div>
          </div>

          <div className="overflow-x-auto max-h-[320px]">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 bg-slate-50 z-10">
                <tr className="border-b border-slate-200 text-slate-600 font-semibold">
                  <th className="p-2.5">Google 이메일 주소</th>
                  <th className="p-2.5">성명 (교사/운영자명)</th>
                  <th className="p-2.5">시스템 권한 구분</th>
                  <th className="p-2.5 text-right">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRoleAccounts.map((acc) => (
                  <tr key={acc.email} className="hover:bg-slate-50 transition">
                    <td className="p-2.5 font-mono font-semibold text-[#00193c]">{acc.email}</td>
                    <td className="p-2.5 font-medium text-slate-800">{acc.name}</td>
                    <td className="p-2.5">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          acc.role === "운영자"
                            ? "bg-red-50 text-[#aa3344] border border-red-200"
                            : "bg-blue-50 text-[#002d62] border border-blue-200"
                        }`}
                      >
                        {acc.role}
                      </span>
                    </td>
                    <td className="p-2.5 text-right space-x-2">
                      <button
                        onClick={() => handleOpenRoleModal(acc)}
                        className="text-blue-600 hover:underline font-semibold"
                      >
                        수정
                      </button>
                      <button
                        onClick={() => handleDeleteRoleAccount(acc.email)}
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

        {/* Student & Parent Roster Management (우리 학교 학생 및 학부모 성명 검증 명부 관리) */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden p-5 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-[#00193c] flex items-center gap-1.5">
                <span className="material-symbols-outlined text-base text-[#735c00]">
                  family_restroom
                </span>
                학생 및 학부모 명부 관리 — 학부모 성명 검증용 ({students.length}명)
              </h2>
              <p className="text-[11px] text-slate-500">
                학부모 로그인 시 본교 재학생 학부모인지 검증하기 위한 <strong>학생 성명 및 아버지/어머니 성함</strong>을 관리하며, 새 학기 진급 시 <strong>[전체 학년 일괄 진급 (M6→H12)]</strong> 버튼으로 한 번에 진급 및 H12 졸업 삭제가 가능합니다.
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={studentGradeFilter}
                onChange={(e) => setStudentGradeFilter(e.target.value)}
                className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white font-semibold"
              >
                <option value="ALL">전체 학년 ({students.length}명)</option>
                {availableGrades.map((g) => {
                  const cnt = students.filter((s) => s.grade === g).length;
                  return (
                    <option key={g} value={g}>
                      {g} 학년 ({cnt}명)
                    </option>
                  );
                })}
              </select>
              <select
                value={studentSortMode}
                onChange={(e) => setStudentSortMode(e.target.value as any)}
                className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white font-semibold"
              >
                <option value="grade_asc">학년순 정렬 (M6 → H12)</option>
                <option value="grade_desc">학년 역순 정렬 (H12 → M6)</option>
                <option value="name_asc">학생 이름순 (가나다)</option>
                <option value="name_desc">학생 이름 역순 (하타파)</option>
              </select>
              <input
                type="text"
                placeholder="학생명 또는 학부모 성함 검색..."
                value={studentSearchQuery}
                onChange={(e) => setStudentSearchQuery(e.target.value)}
                className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00193c]"
              />
              <button
                type="button"
                onClick={handlePromoteStudents}
                disabled={promoting}
                title="M6→M7, M7→M8, M8→H9, H9→H10, H10→H11, H11→H12 진급 및 H12 졸업 삭제"
                className="px-3 py-1.5 bg-[#cca730] hover:bg-[#b89425] text-[#00193c] rounded-lg text-xs font-bold transition flex items-center gap-1 shadow-xs shrink-0"
              >
                <span className="material-symbols-outlined text-sm">school</span>
                <span>{promoting ? "진급 처리 중..." : "전체 학년 일괄 진급 (H12 졸업삭제)"}</span>
              </button>
              <button
                type="button"
                onClick={handleDownloadStudentCsvTemplate}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold transition flex items-center gap-1 shrink-0"
              >
                <span className="material-symbols-outlined text-sm">download</span>
                CSV 템플릿 다운로드
              </button>
              <label className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer shrink-0">
                <span className="material-symbols-outlined text-sm">upload_file</span>
                CSV 일괄 업로드
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleUploadStudentCsv}
                  className="hidden"
                />
              </label>
              <button
                onClick={() => handleOpenStudentModal()}
                className="px-3 py-1.5 bg-[#aa3344] text-white rounded-lg text-xs font-bold hover:bg-[#89192f] transition flex items-center gap-1 shadow-xs shrink-0"
              >
                <span className="material-symbols-outlined text-sm">person_add</span>
                학생/학부모 추가
              </button>
            </div>
          </div>

          {/* Quick Grade Filter Pills */}
          <div className="flex items-center gap-1.5 flex-wrap pt-1 pb-1 border-b border-slate-100">
            <span className="text-[11px] font-bold text-slate-500 mr-1">학년 빠른 선택:</span>
            <button
              type="button"
              onClick={() => setStudentGradeFilter("ALL")}
              className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition border ${
                studentGradeFilter === "ALL"
                  ? "bg-[#00193c] text-white border-[#00193c]"
                  : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
              }`}
            >
              전체 ({students.length}명)
            </button>
            {availableGrades.map((g) => {
              const cnt = students.filter((s) => s.grade === g).length;
              return (
                <button
                  key={g}
                  type="button"
                  onClick={() => setStudentGradeFilter(g)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition border ${
                    studentGradeFilter === g
                      ? "bg-[#002d62] text-white border-[#002d62]"
                      : "bg-white text-slate-700 border-slate-200 hover:bg-blue-50"
                  }`}
                >
                  {g} ({cnt}명)
                </button>
              );
            })}
          </div>

          <div className="overflow-x-auto max-h-[360px]">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 bg-slate-50 z-10">
                <tr className="border-b border-slate-200 text-slate-600 font-semibold">
                  <th
                    onClick={() =>
                      setStudentSortMode((prev) =>
                        prev === "grade_asc" ? "grade_desc" : "grade_asc"
                      )
                    }
                    className="p-2.5 cursor-pointer hover:bg-slate-100 select-none transition"
                    title="클릭하여 학년순(오름차순/내림차순) 정렬"
                  >
                    <div className="flex items-center gap-1">
                      <span>학년 (Grade)</span>
                      <span className="text-[10px] text-[#002d62] font-bold">
                        {studentSortMode === "grade_asc"
                          ? "▲"
                          : studentSortMode === "grade_desc"
                          ? "▼"
                          : "↕"}
                      </span>
                    </div>
                  </th>
                  <th
                    onClick={() =>
                      setStudentSortMode((prev) =>
                        prev === "name_asc" ? "name_desc" : "name_asc"
                      )
                    }
                    className="p-2.5 cursor-pointer hover:bg-slate-100 select-none transition"
                    title="클릭하여 학생 성명순 정렬"
                  >
                    <div className="flex items-center gap-1">
                      <span>학생 성명 (한글 / 영문)</span>
                      <span className="text-[10px] text-[#002d62] font-bold">
                        {studentSortMode === "name_asc"
                          ? "▲"
                          : studentSortMode === "name_desc"
                          ? "▼"
                          : "↕"}
                      </span>
                    </div>
                  </th>
                  <th className="p-2.5">아버지 성명 (Father)</th>
                  <th className="p-2.5">어머니 성명 (Mother)</th>
                  <th className="p-2.5 text-right">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredStudents.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-slate-400">
                      조건에 해당하는 학생/학부모 명부가 없습니다.
                    </td>
                  </tr>
                ) : (
                  filteredStudents.map((stu) => (
                    <tr key={stu.id} className="hover:bg-slate-50 transition">
                      <td className="p-2.5 font-bold text-[#002d62]">{stu.grade}</td>
                      <td className="p-2.5 font-bold text-[#00193c]">
                        {stu.studentNameKo}{" "}
                        <span className="font-normal text-slate-500">({stu.studentNameEn})</span>
                      </td>
                      <td className="p-2.5 text-slate-700">{stu.parentFather || "-"}</td>
                      <td className="p-2.5 text-slate-700">{stu.parentMother || "-"}</td>
                      <td className="p-2.5 text-right space-x-2">
                        <button
                          onClick={() => handleOpenStudentModal(stu)}
                          className="text-blue-600 hover:underline font-semibold"
                        >
                          수정
                        </button>
                        <button
                          onClick={() => handleDeleteStudent(stu)}
                          className="text-red-600 hover:underline font-semibold"
                        >
                          삭제
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
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-[#00193c] flex items-center gap-1.5">
                <span className="material-symbols-outlined text-base text-[#002d62]">
                  manage_accounts
                </span>
                상담 교사 및 상담교과 옵션 관리 ({teachers.length}명)
              </h2>
              <p className="text-[11px] text-slate-500">
                운영자 모드에서 상담 교사 및 담당 상담교과를 실시간으로 추가, 수정, 삭제하거나 CSV 파일로 일괄 업로드할 수 있습니다.
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={handleDownloadTeacherCsvTemplate}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold transition flex items-center gap-1 shrink-0"
              >
                <span className="material-symbols-outlined text-sm">download</span>
                CSV 템플릿 다운로드
              </button>
              <label className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer shrink-0">
                <span className="material-symbols-outlined text-sm">upload_file</span>
                CSV 일괄 업로드
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleUploadTeacherCsv}
                  className="hidden"
                />
              </label>
              <button
                onClick={() => handleOpenTeacherModal()}
                className="px-3 py-1.5 bg-[#aa3344] text-white rounded-lg text-xs font-bold hover:bg-[#89192f] transition flex items-center gap-1 shadow-xs shrink-0"
              >
                <span className="material-symbols-outlined text-sm">person_add</span>
                새 상담 교사 추가
              </button>
            </div>
          </div>

          <div className="overflow-x-auto max-h-[380px]">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 bg-slate-50 z-10">
                <tr className="border-b border-slate-200 text-slate-600 font-semibold">
                  <th className="p-2.5">교사명 (영문 / 한글)</th>
                  <th className="p-2.5">직책</th>
                  <th className="p-2.5">개설 상담교과 옵션 (최대 8개)</th>
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
                    <td className="p-2.5 text-right space-x-2 whitespace-nowrap">
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

          <form
            onSubmit={handleAddBlockedSlot}
            className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs"
          >
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
                {Array.from(new Set(timeSlots.map((t) => t.date)))
                  .filter(Boolean)
                  .map((d) => (
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
                {Array.from(new Set(timeSlots.map((t) => t.time)))
                  .filter(Boolean)
                  .map((tm) => (
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

        {/* Supabase Persistent Database Configuration Card */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 pb-2 border-b border-slate-100">
            <div>
              <div className="flex items-center gap-1.5 text-xs font-bold text-[#00193c]">
                <span className="material-symbols-outlined text-base text-emerald-600">
                  database
                </span>
                Supabase 클라우드 영구 저장소 연동 관리
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                어제 예약한 내역을 다음 날 다른 컴퓨터나 스마트폰에서도 영구적으로 조회/유지할 수 있도록 Supabase DB와 실시간 연동합니다.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowSqlModal(true)}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-sm">code</span>
                <span>초기 테이블 생성 SQL 보기</span>
              </button>
            </div>
          </div>

          <form onSubmit={handleSaveSupabaseConfig} className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <div>
              <label className="font-semibold text-slate-700 block mb-1">
                Supabase Project URL (`NEXT_PUBLIC_SUPABASE_URL`)
              </label>
              <input
                type="url"
                placeholder="https://xxxx.supabase.co"
                value={supabaseUrlInput}
                onChange={(e) => setSupabaseUrlInput(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00193c]"
              />
            </div>
            <div>
              <label className="font-semibold text-slate-700 block mb-1">
                Supabase Anon Public Key (`NEXT_PUBLIC_SUPABASE_ANON_KEY`)
              </label>
              <input
                type="password"
                placeholder={
                  supabaseStatus?.hasAnonKey
                    ? "•••••••••••••••• (이미 등록됨 - 변경 시에만 입력)"
                    : "eyJhbGciOiJIUzI1NiIsInR5cCI..."
                }
                value={supabaseKeyInput}
                onChange={(e) => setSupabaseKeyInput(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00193c]"
              />
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={savingSupabase}
                className="w-full py-2 px-4 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg font-bold transition shadow-xs flex items-center justify-center gap-1.5"
              >
                <span className="material-symbols-outlined text-sm">cloud_sync</span>
                <span>{savingSupabase ? "연동 중..." : "Supabase 연결 및 동기화 저장"}</span>
              </button>
            </div>
          </form>
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
              학기가 바뀔 때 새로운 스프레드시트의 ID를 입력하면 시스템 재배포 없이 즉시 새 학기 기본 데이터로 자동 동기화됩니다.
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

            <div className="md:col-span-2">
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
      </main>

      {/* On-Site Parent QR Code & Quick Cancel Modal */}
      {selectedParentRes && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-[380px] shadow-2xl text-center space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <span className="text-sm font-bold text-[#00193c]">예약 상세 및 현장 확인증 QR</span>
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
              <div className="text-xs font-semibold text-[#aa3344] bg-red-50 py-1.5 px-2 rounded-lg">
                {selectedParentRes.teacherName} ({selectedParentRes.option}) · {selectedParentRes.date}{" "}
                {selectedParentRes.timeSlot}
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
              학부모님의 스마트폰 카메라로 위 QR코드를 스캔하면 즉시 확인증 화면이 열리며 [이미지 저장]이 가능합니다.
            </p>

            <div className="flex gap-2">
              <button
                onClick={() => {
                  const target = selectedParentRes;
                  setSelectedParentRes(null);
                  handleCancelSingleReservation(target);
                }}
                className="flex-1 py-2.5 bg-red-50 text-red-600 border border-red-200 rounded-xl text-xs font-bold hover:bg-red-600 hover:text-white transition"
              >
                이 예약 취소(삭제)
              </button>
              <button
                onClick={() => setSelectedParentRes(null)}
                className="flex-1 py-2.5 bg-[#00193c] text-white rounded-xl text-xs font-bold"
              >
                닫기
              </button>
            </div>
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
                {editingTeacher ? "교사 정보 및 상담교과 수정" : "새 상담 교사 등록"}
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
                  직책/담당 (예: M6 담임교사)
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
                  상담교과 옵션 목록 (쉼표로 구분, 최대 8개)
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

      {/* Admin / Teacher Account Role Add/Edit Modal */}
      {roleModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveRoleAccount}
            className="bg-white rounded-2xl p-6 w-full max-w-[420px] shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <span className="text-sm font-bold text-[#00193c]">
                {editingRoleEmail ? "운영자/교사 계정 권한 수정" : "새 운영자/교사 계정 등록"}
              </span>
              <button
                type="button"
                onClick={() => setRoleModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Google 이메일 주소
                </label>
                <input
                  type="email"
                  required
                  placeholder="teacher@liskorea.net"
                  value={roleFormEmail}
                  onChange={(e) => setRoleFormEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#00193c]"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  교사 또는 운영자 성명 (한글 또는 영문 교사명과 일치 권장)
                </label>
                <input
                  type="text"
                  required
                  placeholder="예: 유미연 또는 Ms. Monica Yu"
                  value={roleFormName}
                  onChange={(e) => setRoleFormName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#00193c]"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  권한 구분 (Role)
                </label>
                <select
                  value={roleFormType}
                  onChange={(e) => setRoleFormType(e.target.value as "운영자" | "교사")}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-[#00193c]"
                >
                  <option value="교사">교사 (Teacher - 본인 상담 일정 열람)</option>
                  <option value="운영자">운영자 (Admin - 전체 마스터 콘솔 관리)</option>
                </select>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRoleModalOpen(false)}
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

      {/* Student & Parent Roster Add/Edit Modal */}
      {studentModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveStudent}
            className="bg-white rounded-2xl p-6 w-full max-w-[440px] shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <span className="text-sm font-bold text-[#00193c]">
                {editingStudent ? "학생 및 학부모 명부 수정" : "새 학생 및 학부모 명부 등록"}
              </span>
              <button
                type="button"
                onClick={() => setStudentModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  학년 (Grade - 예: E1, M6, G9, G11 등)
                </label>
                <input
                  type="text"
                  required
                  placeholder="예: G9"
                  value={stuFormGrade}
                  onChange={(e) => setStuFormGrade(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#00193c]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    학생 한글 성명
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="예: 김민준"
                    value={stuFormNameKo}
                    onChange={(e) => setStuFormNameKo(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#00193c]"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    학생 영문 성명
                  </label>
                  <input
                    type="text"
                    placeholder="예: Minjun Kim"
                    value={stuFormNameEn}
                    onChange={(e) => setStuFormNameEn(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#00193c]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    아버지 성명 (학부모 확인용)
                  </label>
                  <input
                    type="text"
                    placeholder="아버지 성함"
                    value={stuFormFather}
                    onChange={(e) => setStuFormFather(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#00193c]"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    어머니 성명 (학부모 확인용)
                  </label>
                  <input
                    type="text"
                    placeholder="어머니 성함"
                    value={stuFormMother}
                    onChange={(e) => setStuFormMother(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#00193c]"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setStudentModalOpen(false)}
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

      {/* Supabase SQL Schema Guide Modal */}
      {showSqlModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-[540px] shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <span className="text-sm font-bold text-[#00193c]">
                Supabase 초기 테이블 생성 SQL 스크립트 (`supabase_schema.sql`)
              </span>
              <button
                onClick={() => setShowSqlModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Supabase 프로젝트 생성 후 좌측 메뉴의 <strong>SQL Editor</strong>에 아래 SQL을 복사해 붙여넣고 <strong>[Run]</strong>을 한 번만 실행하시면 모든 준비가 완료됩니다.
            </p>

            <pre className="p-3 bg-slate-900 text-emerald-300 rounded-xl text-[11px] overflow-x-auto font-mono leading-relaxed">
              {SUPABASE_SQL_SCHEMA}
            </pre>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(SUPABASE_SQL_SCHEMA);
                  alert("SQL 스크립트가 클립보드에 복사되었습니다!");
                }}
                className="flex-1 py-2.5 bg-emerald-700 text-white rounded-xl text-xs font-bold hover:bg-emerald-800"
              >
                SQL 클립보드 복사하기
              </button>
              <button
                type="button"
                onClick={() => setShowSqlModal(false)}
                className="flex-1 py-2.5 bg-slate-200 text-slate-700 rounded-xl text-xs font-bold"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
