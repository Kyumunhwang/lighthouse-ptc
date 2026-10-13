"use client";

import React, { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";

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
  teacherName: string;
  timeSlot: string;
  date: string;
  studentName?: string;
  studentGrade?: string;
  status: "CONFIRMED" | "CANCELLED";
}

interface SelectedBookingSlot {
  teacherName: string;
  option: string;
  timeSlot: string;
  date: string;
}

export default function SlotBookingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  // Context from Welcome page
  const [studentContext, setStudentContext] = useState<any>(null);

  // Data
  const [teachers, setTeachers] = useState<TeacherRecord[]>([]);
  const [timeSlots, setTimeSlots] = useState<TimeSlotRecord[]>([]);
  const [reservations, setReservations] = useState<ReservationRecord[]>([]);
  const [blockedSlots, setBlockedSlots] = useState<any[]>([]);

  // Selected date tab
  const [selectedDate, setSelectedDate] = useState<string>("Oct. 30");

  // Selection states (Max 4 items)
  // Each selection: { teacherName, option, timeSlot, date }
  const [selectedBookings, setSelectedBookings] = useState<SelectedBookingSlot[]>([]);

  // Currently opened teacher card for choosing options
  const [activeTeacher, setActiveTeacher] = useState<TeacherRecord | null>(null);
  const [tempOption, setTempOption] = useState<string>("");

  useEffect(() => {
    // Check student context
    const stored = sessionStorage.getItem("ptc_student_context");
    if (!stored) {
      router.push("/");
      return;
    }
    setStudentContext(JSON.parse(stored));

    async function fetchData() {
      try {
        const res = await fetch("/api/sheets/sync");
        const json = await res.json();
        if (json.success) {
          setTeachers(json.teachers || []);
          setTimeSlots(json.timeSlots || []);
          setReservations(json.reservations || []);
          setBlockedSlots(json.blockedSlots || []);

          if (json.timeSlots && json.timeSlots.length > 0) {
            setSelectedDate(json.timeSlots[0].date);
          }
        }
      } catch (err: any) {
        setErrorMessage("학교 상담 일정표를 불러오는 중 오류가 발생했습니다.");
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [router]);

  // Unique Dates
  const availableDates = useMemo(() => {
    return Array.from(new Set(timeSlots.map((t) => t.date))).filter(Boolean);
  }, [timeSlots]);

  const parseTimeSlotMinutes = (timeStr: string): number => {
    if (!timeStr) return 9999;
    const match = timeStr.match(/^(\d{1,2}):(\d{2})/);
    if (!match) return 9999;
    let hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const isPm = /pm/i.test(timeStr);
    const isAm = /am/i.test(timeStr);
    if (isPm && hours < 12) hours += 12;
    if (isAm && hours === 12) hours = 0;
    if (!isPm && !isAm && hours >= 1 && hours <= 7) hours += 12;
    return hours * 60 + minutes;
  };

  // Filtered Time Slots for selected date (sorted chronologically)
  const filteredSlots = useMemo(() => {
    return [...timeSlots]
      .filter((t) => t.date === selectedDate)
      .sort((a, b) => parseTimeSlotMinutes(a.time) - parseTimeSlotMinutes(b.time));
  }, [timeSlots, selectedDate]);

  // Already confirmed reservations for THIS student (locked; cannot be cancelled by parent)
  const studentConfirmedList = useMemo(() => {
    if (!studentContext) return [];
    const sName = `${studentContext.studentNameKo} (${studentContext.studentNameEn})`.trim().toLowerCase();
    const sGrade = (studentContext.grade || "").trim().toLowerCase();
    return reservations.filter(
      (r) =>
        r.status === "CONFIRMED" &&
        (r.studentGrade || "").trim().toLowerCase() === sGrade &&
        ((r.studentName || "").trim().toLowerCase() === sName ||
          (r.studentName || "").includes(studentContext.studentNameKo))
    );
  }, [reservations, studentContext]);

  const studentConfirmedCount = studentConfirmedList.length;

  const maxSelectable = Math.max(0, 4 - studentConfirmedCount);

  // Check if slot is blocked by Admin
  const isSlotBlockedByAdmin = (teacherName: string, timeSlot: string, date: string): { blocked: boolean; reason?: string } => {
    const found = blockedSlots.find((b) => {
      const teacherMatch = b.teacherName === "ALL" || b.teacherName.trim().toLowerCase() === teacherName.trim().toLowerCase();
      const dateMatch = b.date === "ALL" || b.date.trim().toLowerCase() === date.trim().toLowerCase();
      const timeMatch = b.timeSlot === "ALL" || b.timeSlot.trim().toLowerCase() === timeSlot.trim().toLowerCase();
      return teacherMatch && dateMatch && timeMatch;
    });
    if (found) {
      return { blocked: true, reason: found.reason || "상담 불가 시간" };
    }
    return { blocked: false };
  };

  // Check if a teacher + time slot is already reserved by ANY parent
  const isSlotReserved = (teacherName: string, timeSlot: string, date: string): boolean => {
    return reservations.some(
      (r) =>
        r.status === "CONFIRMED" &&
        r.teacherName.trim() === teacherName.trim() &&
        r.timeSlot.trim() === timeSlot.trim() &&
        r.date.trim() === date.trim()
    );
  };

  // Check if current user has already selected this slot in their draft
  const isSelectedByMe = (teacherName: string, timeSlot: string, date: string): boolean => {
    return selectedBookings.some(
      (b) =>
        b.teacherName === teacherName &&
        b.timeSlot === timeSlot &&
        b.date === date
    );
  };

  // Check if student has already booked this teacher in draft OR in confirmed bookings
  const isTeacherAlreadySelected = (teacherName: string): boolean => {
    return (
      selectedBookings.some((b) => b.teacherName === teacherName) ||
      studentConfirmedList.some((r) => r.teacherName.trim() === teacherName.trim())
    );
  };

  // Toggle slot selection
  const handleSlotClick = (teacher: TeacherRecord, slot: TimeSlotRecord) => {
    setErrorMessage("");

    // 1. If blocked by Admin -> disabled
    const adminBlock = isSlotBlockedByAdmin(teacher.nameEn, slot.time, slot.date);
    if (adminBlock.blocked) {
      setErrorMessage(`선택하신 시간은 학교 운영상 상담 불가로 지정된 시간입니다. (${adminBlock.reason})`);
      return;
    }

    // 2. If already reserved -> disabled (cannot cancel confirmed reservation)
    if (isSlotReserved(teacher.nameEn, slot.time, slot.date)) {
      const isMineConfirmed = studentConfirmedList.some(
        (r) =>
          r.teacherName.trim() === teacher.nameEn.trim() &&
          r.timeSlot.trim() === slot.time.trim() &&
          r.date.trim() === slot.date.trim()
      );
      if (isMineConfirmed) {
        setErrorMessage(
          "이미 확정된 예약입니다. 학부모님은 직접 예약을 취소하거나 변경할 수 없으며, 오직 운영자에 의해서만 예약 취소가 가능합니다."
        );
      }
      return;
    }

    // 2b. If already selected by me in current draft, unselect draft item
    const existingIndex = selectedBookings.findIndex(
      (b) =>
        b.teacherName === teacher.nameEn &&
        b.timeSlot === slot.time &&
        b.date === slot.date
    );

    if (existingIndex >= 0) {
      setSelectedBookings((prev) => prev.filter((_, idx) => idx !== existingIndex));
      return;
    }

    // 3. Check student-wide quota (Max 4 total slots including existing bookings)
    if (studentConfirmedCount >= 4) {
      setErrorMessage(
        `해당 학생은 이미 4개의 상담 예약이 확정되어 있어 추가 예약이나 변경이 불가능합니다. (취소/변경은 운영자에게만 권한이 있습니다)`
      );
      return;
    }

    if (selectedBookings.length >= maxSelectable) {
      setErrorMessage(
        studentConfirmedCount > 0
          ? `해당 학생은 이미 ${studentConfirmedCount}개의 예약이 확정되어 있어, 추가로 최대 ${maxSelectable}개까지만 선택할 수 있습니다. (학생 1인당 총 4개 제한)`
          : "학생 1인당 최대 4개 상담교과까지만 선택할 수 있습니다."
      );
      return;
    }

    // 4. Check if student already selected or confirmed this same teacher
    if (isTeacherAlreadySelected(teacher.nameEn)) {
      setErrorMessage(`${teacher.nameEn} (${teacher.nameKo}) 교사는 이미 선택 또는 예약 확정되어 있습니다.`);
      return;
    }

    // 5. Check if user already booked another teacher at the EXACT same time slot (Schedule clash in draft or confirmed)
    const timeClash =
      selectedBookings.some((b) => b.date === slot.date && b.timeSlot === slot.time) ||
      studentConfirmedList.some(
        (r) => r.date.trim() === slot.date.trim() && r.timeSlot.trim() === slot.time.trim()
      );
    if (timeClash) {
      setErrorMessage(`동일한 시간대(${slot.time})에 이미 다른 교사 상담이 선택 또는 확정되어 있습니다.`);
      return;
    }

    // Open option picker modal or default to first option
    setActiveTeacher(teacher);
    setTempOption(teacher.options[0] || "General Consultation");

    // Temporarily save pending slot
    setPendingSlot({
      teacherName: teacher.nameEn,
      timeSlot: slot.time,
      date: slot.date,
    });
  };

  const [pendingSlot, setPendingSlot] = useState<{
    teacherName: string;
    timeSlot: string;
    date: string;
  } | null>(null);

  const confirmOptionSelection = () => {
    if (pendingSlot && activeTeacher) {
      setSelectedBookings((prev) => [
        ...prev,
        {
          teacherName: pendingSlot.teacherName,
          option: tempOption,
          timeSlot: pendingSlot.timeSlot,
          date: pendingSlot.date,
        },
      ]);
    }
    setActiveTeacher(null);
    setPendingSlot(null);
  };

  // Submit Final Booking
  const handleFinalSubmit = async () => {
    if (selectedBookings.length === 0) {
      setErrorMessage("최소 1개 이상의 상담 시간을 선택해 주세요.");
      return;
    }

    const ok = confirm(
      `선택하신 ${selectedBookings.length}개의 상담 예약을 최종 확정하시겠습니까?\n\n※ 예약이 확정된 후에는 학부모님이 직접 취소하거나 변경할 수 없으며, 오직 운영자에 의해서만 예약 취소가 가능합니다.`
    );
    if (!ok) return;

    setSubmitting(true);
    setErrorMessage("");

    try {
      const res = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: studentContext.email,
          studentGrade: studentContext.grade,
          studentName: `${studentContext.studentNameKo} (${studentContext.studentNameEn})`,
          parentName: studentContext.parentName,
          bookings: selectedBookings,
        }),
      });

      const data = await res.json();
      if (data.success) {
        // Clear draft & redirect to confirmation slip
        sessionStorage.removeItem("ptc_student_context");
        router.push(`/slip/${data.masterToken}`);
      } else {
        setErrorMessage(data.error || "예약 처리 중 오류가 발생했습니다.");
        // Refresh reservations to reflect the conflicting slot
        const refreshRes = await fetch("/api/sheets/sync?force=true");
        const refreshData = await refreshRes.json();
        if (refreshData.reservations) {
          setReservations(refreshData.reservations);
        }
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Network error occurred.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || !studentContext) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#f8f9ff]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-[#00193c] border-t-transparent rounded-full animate-spin"></div>
          <span className="text-xs text-slate-600 font-medium">스케줄 정보를 불러오는 중입니다...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center min-h-screen bg-[#f8f9ff]">
      <div className="w-full max-w-[440px] flex flex-col min-h-screen bg-[#f8f9ff] shadow-[0_4px_24px_rgba(0,45,98,0.08)] relative pb-28">
        {/* Header */}
        <header className="sticky top-0 z-40 bg-[#f8f9ff]/90 backdrop-blur-md border-b border-slate-200 px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => router.push("/")}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-700 hover:bg-slate-100"
          >
            <span className="material-symbols-outlined text-[18px]">arrow_back</span>
          </button>
          <div className="flex items-center gap-2">
            <img src="/emblum.png" alt="Lighthouse PTC Emblem" className="w-6 h-6 object-contain" />
            <div className="text-left">
              <h1 className="text-sm font-bold text-[#00193c]">Lighthouse PTC</h1>
              <span className="text-[10px] text-slate-500 block">
                {studentContext.studentNameKo} ({studentContext.grade})
              </span>
            </div>
          </div>
          <div className="w-8"></div>
        </header>

        {/* Step Progress & Quota Tracker */}
        <div className="px-4 py-3 bg-[#f0f4fc] border-b border-slate-200">
          <div className="flex items-center justify-between mb-2 text-xs">
            <span className="font-semibold text-slate-700 flex items-center gap-1">
              <span className="material-symbols-outlined text-sm text-[#002d62]">
                checklist
              </span>
              선택한 상담교과
            </span>
            <div className="text-right">
              <span className="font-bold text-[#aa3344] bg-white px-2 py-0.5 rounded-full border border-slate-200 text-[11px]">
                {selectedBookings.length}개 선택 / 추가 {maxSelectable}개 가능
              </span>
              {studentConfirmedCount > 0 && (
                <div className="text-[10px] text-blue-700 font-medium mt-0.5">
                  기존 예약 완료: {studentConfirmedCount}개 (총 4개 제한)
                </div>
              )}
            </div>
          </div>

          <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
            <div
              className="bg-[#002d62] h-full transition-all duration-300"
              style={{ width: `${((selectedBookings.length + studentConfirmedCount) / 4) * 100}%` }}
            ></div>
          </div>

          <div className="mt-2 text-[11px] text-[#aa3344] font-semibold flex items-start gap-1">
            <span className="material-symbols-outlined text-[14px] shrink-0 mt-0.5">info</span>
            <span>
              확정된 예약은 학부모님이 직접 취소하거나 변경할 수 없으며, 오직 운영자에 의해서만 예약 취소가 가능합니다.
            </span>
          </div>

          {studentConfirmedList.length > 0 && (
            <div className="mt-2.5 p-2.5 bg-white rounded-lg border border-blue-200 space-y-1">
              <div className="text-[10px] font-bold text-[#002d62] flex items-center justify-between">
                <span>이미 확정된 상담 예약 ({studentConfirmedList.length}건)</span>
                <span className="text-[10px] text-slate-500 font-normal">취소/변경 불가 (운영자 전용)</span>
              </div>
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {studentConfirmedList.map((r) => (
                  <span
                    key={r.id}
                    className="px-2 py-0.5 bg-blue-50 text-[#00193c] border border-blue-200 rounded text-[10px] font-semibold"
                  >
                    🔒 {r.teacherName} · {r.date} {r.timeSlot}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Date Selector Tabs */}
        <div className="px-4 pt-3 flex gap-2">
          {availableDates.map((date) => (
            <button
              key={date}
              onClick={() => setSelectedDate(date)}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg border transition ${
                selectedDate === date
                  ? "bg-[#00193c] text-white border-[#00193c] shadow-sm"
                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
              }`}
            >
              {date} (상담일)
            </button>
          ))}
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="mx-4 mt-3 p-3 bg-red-50 text-red-700 text-xs rounded-lg border border-red-200 flex items-center gap-2">
            <span className="material-symbols-outlined text-sm">warning</span>
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Selected Draft Chips */}
        {selectedBookings.length > 0 && (
          <div className="px-4 pt-3">
            <div className="text-[11px] font-bold text-slate-600 mb-1.5">선택된 항목 목록:</div>
            <div className="flex flex-wrap gap-1.5">
              {selectedBookings.map((b, idx) => (
                <div
                  key={idx}
                  className="bg-white border border-[#002d62]/30 rounded-lg px-2.5 py-1 text-[11px] flex items-center gap-1.5 shadow-xs"
                >
                  <span className="font-bold text-[#00193c]">{b.teacherName}</span>
                  <span className="text-slate-500">· {b.timeSlot}</span>
                  <button
                    onClick={() =>
                      setSelectedBookings((prev) => prev.filter((_, i) => i !== idx))
                    }
                    className="text-slate-400 hover:text-red-500"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Teacher Schedule Cards */}
        <div className="p-4 space-y-4">
          {teachers.map((teacher) => {
            const isBookedForTeacher = selectedBookings.find(
              (b) => b.teacherName === teacher.nameEn
            );

            return (
              <div
                key={teacher.id}
                className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 relative overflow-hidden"
              >
                {/* Teacher Header */}
                <div className="flex items-start justify-between pb-2.5 border-b border-slate-100">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-bold text-[#00193c]">
                        {teacher.nameEn}
                      </span>
                      <span className="text-xs text-slate-500">({teacher.nameKo})</span>
                    </div>
                    <div className="text-[11px] text-[#735c00] font-medium mt-0.5">
                      {teacher.role}
                    </div>
                  </div>
                  {isBookedForTeacher && (
                    <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-bold rounded-full border border-blue-200">
                      선택 완료: {isBookedForTeacher.timeSlot}
                    </span>
                  )}
                </div>

                {/* Available options tag list */}
                <div className="py-2 flex flex-wrap gap-1">
                  {teacher.options.map((opt, i) => (
                    <span
                      key={i}
                      className="text-[10px] px-2 py-0.5 rounded bg-slate-50 text-slate-600 border border-slate-100"
                    >
                      {opt}
                    </span>
                  ))}
                </div>

                {/* Time Slots Grid */}
                <div className="pt-2">
                  <div className="text-[10px] font-semibold text-slate-500 mb-1.5">
                    예약 가능 시간 ({selectedDate})
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {filteredSlots.map((slot) => {
                      const adminBlock = isSlotBlockedByAdmin(teacher.nameEn, slot.time, slot.date);
                      const reserved = isSlotReserved(teacher.nameEn, slot.time, slot.date);
                      const mySelection = isSelectedByMe(
                        teacher.nameEn,
                        slot.time,
                        slot.date
                      );

                      if (adminBlock.blocked) {
                        return (
                          <div
                            key={slot.id}
                            className="py-2 px-1 text-center rounded-lg bg-[#fff1f2] text-[#e11d48] text-[10px] font-medium border border-[#fecdd3] cursor-not-allowed select-none"
                            title={`상담 불가 시간: ${adminBlock.reason}`}
                          >
                            <span className="line-through">{slot.time}</span>
                            <div className="text-[9px] text-[#e11d48] font-semibold">상담불가</div>
                          </div>
                        );
                      }

                      if (reserved) {
                        return (
                          <div
                            key={slot.id}
                            className="py-2 px-1 text-center rounded-lg bg-[#f1f5f9] text-[#94a3b8] text-[10px] font-medium border border-slate-200 cursor-not-allowed select-none"
                            title="다른 학부모가 이미 예약한 시간입니다"
                          >
                            <span className="line-through">{slot.time}</span>
                            <div className="text-[9px] text-slate-400">마감됨</div>
                          </div>
                        );
                      }

                      return (
                        <button
                          key={slot.id}
                          type="button"
                          onClick={() => handleSlotClick(teacher, slot)}
                          className={`py-2 px-1 text-center rounded-lg text-[10px] font-semibold transition border ${
                            mySelection
                              ? "bg-[#002d62] text-white border-[#002d62] shadow-sm"
                              : "bg-[#f0fdf4] text-[#15803d] border-[#86efac] hover:bg-[#dcfce7]"
                          }`}
                        >
                          <div>{slot.time}</div>
                          <div className="text-[9px] font-normal">
                            {mySelection ? "선택됨" : "예약 가능"}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Sticky Bottom Action Bar */}
        <div className="fixed bottom-0 left-0 right-0 max-w-[440px] mx-auto bg-white/95 backdrop-blur-md border-t border-slate-200 p-4 shadow-lg flex items-center justify-between gap-3 z-50">
          <div className="flex flex-col">
            <span className="text-[10px] text-slate-500">선택 완료 현황</span>
            <span className="text-xs font-bold text-[#00193c]">
              {selectedBookings.length}개 / 4개 과목
            </span>
          </div>

          <button
            onClick={handleFinalSubmit}
            disabled={selectedBookings.length === 0 || submitting}
            className="flex-1 py-3 px-4 bg-[#00193c] text-white rounded-xl text-xs font-bold hover:bg-[#002d62] disabled:opacity-50 transition shadow-md flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>동시성 검증 및 예약 중...</span>
              </>
            ) : (
              <>
                <span>최종 상담 예약 확정하기</span>
                <span className="material-symbols-outlined text-sm">check_circle</span>
              </>
            )}
          </button>
        </div>

        {/* Option Select Modal */}
        {activeTeacher && pendingSlot && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl p-5 w-full max-w-[360px] shadow-2xl space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <span className="text-sm font-bold text-[#00193c]">
                  상담 세부 항목 선택
                </span>
                <button
                  onClick={() => {
                    setActiveTeacher(null);
                    setPendingSlot(null);
                  }}
                  className="text-slate-400 hover:text-slate-600"
                >
                  ✕
                </button>
              </div>

              <div className="text-xs text-slate-600">
                <span className="font-bold text-[#002d62]">{activeTeacher.nameEn}</span>{" "}
                교사와의 {pendingSlot.timeSlot} ({pendingSlot.date}) 상담에서 다루실 항목을 선택해 주세요.
              </div>

              <div className="space-y-1.5">
                {activeTeacher.options.map((opt, i) => (
                  <label
                    key={i}
                    className={`flex items-center gap-2 p-2.5 rounded-lg border text-xs cursor-pointer transition ${
                      tempOption === opt
                        ? "bg-blue-50 border-[#002d62] text-[#002d62] font-semibold"
                        : "border-slate-200 text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="consultOption"
                      checked={tempOption === opt}
                      onChange={() => setTempOption(opt)}
                      className="text-[#002d62]"
                    />
                    <span>{opt}</span>
                  </label>
                ))}
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTeacher(null);
                    setPendingSlot(null);
                  }}
                  className="flex-1 py-2 text-xs font-semibold rounded-lg border border-slate-300 text-slate-600"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={confirmOptionSelection}
                  className="flex-1 py-2 text-xs font-semibold rounded-lg bg-[#00193c] text-white"
                >
                  상담교과 담기
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
