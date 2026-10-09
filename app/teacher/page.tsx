"use client";

import React, { useEffect, useState, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

interface ReservationRecord {
  id: string;
  studentGrade: string;
  studentName: string;
  parentName: string;
  teacherName: string;
  option: string;
  timeSlot: string;
  date: string;
  status: "CONFIRMED" | "CANCELLED";
}

interface TeacherRecord {
  id: string;
  nameEn: string;
  nameKo: string;
  role: string;
}

function TeacherContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTeacherName = searchParams.get("name") || "";

  const [loading, setLoading] = useState(true);
  const [teachers, setTeachers] = useState<TeacherRecord[]>([]);
  const [selectedTeacher, setSelectedTeacher] = useState<string>(initialTeacherName);
  const [reservations, setReservations] = useState<ReservationRecord[]>([]);

  useEffect(() => {
    async function loadData() {
      try {
        const res = await fetch("/api/sheets/sync");
        const json = await res.json();
        if (json.success) {
          setTeachers(json.teachers || []);
          setReservations(json.reservations || []);

          if (!initialTeacherName && json.teachers && json.teachers.length > 0) {
            setSelectedTeacher(json.teachers[0].nameEn);
          }
        }
      } catch (err) {
        console.error("Teacher portal load error:", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [initialTeacherName]);

  // Current Teacher Profile
  const currentProfile = useMemo(() => {
    return teachers.find(
      (t) =>
        t.nameEn === selectedTeacher ||
        t.nameKo === selectedTeacher ||
        selectedTeacher.includes(t.nameKo)
    );
  }, [teachers, selectedTeacher]);

  // Filtered reservations for this teacher
  const mySchedules = useMemo(() => {
    if (!selectedTeacher) return [];
    return reservations.filter(
      (r) =>
        r.status === "CONFIRMED" &&
        (r.teacherName.toLowerCase().includes(selectedTeacher.toLowerCase()) ||
          (currentProfile && r.teacherName.includes(currentProfile.nameEn)))
    );
  }, [reservations, selectedTeacher, currentProfile]);

  return (
    <div className="min-h-screen bg-[#f8f9ff]">
      {/* Top Navigation */}
      <header className="bg-[#002d62] text-white px-6 py-4 shadow-md flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white p-1 flex items-center justify-center shadow-xs">
            <img src="/emblum.png" alt="Lighthouse PTC Emblem" className="w-full h-full object-contain" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm tracking-tight">Lighthouse PTC</span>
              <span className="bg-[#aa3344] text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase">
                Teacher
              </span>
            </div>
            <div className="text-[11px] text-blue-200">PTC Faculty Schedule Portal</div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/")}
            className="text-xs text-blue-100 hover:text-white flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-sm">logout</span>
            로그아웃
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto p-6 space-y-6">
        {/* Teacher Switcher & Summary Card */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="text-[11px] font-bold text-[#aa3344] uppercase tracking-wider">
              Faculty Dashboard
            </span>
            <h1 className="text-xl font-bold text-[#00193c]">
              {currentProfile ? `${currentProfile.nameEn} (${currentProfile.nameKo})` : "교사 상담 일정표"}
            </h1>
            <p className="text-xs text-slate-500">
              {currentProfile?.role || "배정된 학부모 상담 타임테이블 현황입니다."}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <label className="text-xs font-semibold text-slate-600">교사 전환:</label>
            <select
              value={selectedTeacher}
              onChange={(e) => setSelectedTeacher(e.target.value)}
              className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#002d62]"
            >
              {teachers.map((t) => (
                <option key={t.id} value={t.nameEn}>
                  {t.nameEn} ({t.nameKo})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Schedule Counter Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <span className="text-[10px] font-bold text-slate-400 uppercase">예약 확정 학부모</span>
            <div className="text-2xl font-bold text-[#00193c] mt-1">{mySchedules.length}건</div>
            <span className="text-[11px] text-emerald-600">실시간 상담 확정</span>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <span className="text-[10px] font-bold text-slate-400 uppercase">상담 일정 기간</span>
            <div className="text-base font-bold text-[#00193c] mt-1">10월 30일 · 11월 1일</div>
            <span className="text-[11px] text-slate-500">세션당 20분 배정</span>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <span className="text-[10px] font-bold text-slate-400 uppercase">상담 장소</span>
            <div className="text-base font-bold text-[#00193c] mt-1">각 교사 지정 테이블</div>
            <span className="text-[11px] text-slate-500">Chapel / Gym</span>
          </div>
        </div>

        {/* Schedule Table */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-bold text-[#00193c] flex items-center gap-1.5">
              <span className="material-symbols-outlined text-base text-[#002d62]">
                event_note
              </span>
              예약된 학부모 상담 타임테이블 ({mySchedules.length}건)
            </h2>
            <button
              onClick={() => window.print()}
              className="px-3 py-1 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-semibold text-slate-700 flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-xs">print</span>
              일정표 출력
            </button>
          </div>

          {mySchedules.length === 0 ? (
            <div className="p-12 text-center text-slate-400">
              <span className="material-symbols-outlined text-4xl mb-2">event_busy</span>
              <p className="text-xs">현재 예약된 학부모 상담 내역이 없습니다.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                    <th className="p-3">상담 일자</th>
                    <th className="p-3">상담교과 시간</th>
                    <th className="p-3">학생명 (학년)</th>
                    <th className="p-3">학부모 성명</th>
                    <th className="p-3">선택 상담 항목</th>
                    <th className="p-3">상태</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {mySchedules.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/80 transition">
                      <td className="p-3 font-medium text-slate-800">{item.date}</td>
                      <td className="p-3">
                        <span className="font-bold text-[#002d62] bg-[#f0f4fc] px-2 py-0.5 rounded">
                          {item.timeSlot}
                        </span>
                      </td>
                      <td className="p-3 font-semibold text-[#00193c]">
                        {item.studentName} ({item.studentGrade})
                      </td>
                      <td className="p-3 text-slate-700">{item.parentName}</td>
                      <td className="p-3 text-[#735c00] font-medium">{item.option}</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-bold text-[10px]">
                          확정 (CONFIRMED)
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default function TeacherPortalPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen bg-[#f8f9ff]">
          <div className="w-8 h-8 border-4 border-[#002d62] border-t-transparent rounded-full animate-spin"></div>
        </div>
      }
    >
      <TeacherContent />
    </Suspense>
  );
}
