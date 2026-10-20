"use client";

import React, { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { isTeacherMatch } from "@/lib/teacher-matcher";
import { parseStartEndTime, triggerCsvDownload } from "@/lib/time-slot-utils";

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

/**
 * Strip honorifics (Mr., Ms., Mrs., etc.) for client-side matching
 */
function cleanNameToken(name: string): string {
  if (!name) return "";
  return name
    .replace(/^(mr\.?|ms\.?|mrs\.?|miss\.?|dr\.?|prof\.?)\s+/i, "")
    .replace(/\s*(선생님|교사)\s*$/g, "")
    .trim()
    .toLowerCase();
}

const KNOWN_ALIASES: Record<string, string[]> = {
  "피터": ["peter yoo", "유찬호"],
  "유찬호": ["peter yoo", "피터"],
  "다니엘": ["daniel kim", "다니엘"],
  "유미연": ["monica yu"],
  "이나라": ["nara lee"],
  "이재원": ["jaewon lee"],
  "김혜정": ["hyejeong kim", "hyejung kim"],
  "박진희": ["jinhee park"],
  "최규성": ["kyuseong choi"],
  "류한나": ["hanna ryu", "hannah ryu"],
  "심재희": ["jaehee shim"],
  "이은실": ["eunsil lee"],
  "노희진": ["heejin roh", "heejin noh"],
  "오선민": ["sunmin oh", "seonmin oh"],
  "김에스더": ["esther kim"],
  "이주은": ["jueun lee", "jooeun lee"],
  "정다움": ["daum jung", "daum jeong"],
};

export default function TeacherPortalPage() {
  const router = useRouter();

  const [authChecked, setAuthChecked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [teachers, setTeachers] = useState<TeacherRecord[]>([]);
  const [loggedTeacherQuery, setLoggedTeacherQuery] = useState<string>("");
  const [loggedEmail, setLoggedEmail] = useState<string>("");
  const [reservations, setReservations] = useState<ReservationRecord[]>([]);

  useEffect(() => {
    // 1. Strip any accidental query parameters from browser address bar so personal info never shows in URL
    if (typeof window !== "undefined" && window.location.search) {
      window.history.replaceState({}, "", "/teacher");
    }

    // 2. Verify authenticated Teacher or Admin session from sessionStorage / localStorage
    let validUser: any = null;
    if (typeof window !== "undefined") {
      try {
        const raw = sessionStorage.getItem("ptc_user") || localStorage.getItem("ptc_user");
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && (parsed.role === "교사" || parsed.role === "운영자") && parsed.email) {
            validUser = parsed;
          }
        }
      } catch {
        validUser = null;
      }
    }

    if (!validUser) {
      router.replace("/");
      return;
    }

    if (validUser.teacherProfile?.nameEn) {
      setLoggedTeacherQuery(validUser.teacherProfile.nameEn);
    } else if (validUser.name) {
      setLoggedTeacherQuery(validUser.name);
    }
    if (validUser.email) {
      setLoggedEmail(validUser.email);
    }
    setAuthChecked(true);

    async function loadData() {
      try {
        const res = await fetch("/api/sheets/sync");
        const json = await res.json();
        if (json.success) {
          setTeachers(json.teachers || []);
          setReservations(json.reservations || []);
        }
      } catch (err) {
        console.error("Teacher portal load error:", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [router]);

  // Robustly resolve Current Teacher Profile from teacher sheet
  const currentProfile = useMemo(() => {
    if (!teachers || teachers.length === 0) return undefined;
    const qRaw = (loggedTeacherQuery || "").trim();
    const qClean = cleanNameToken(qRaw);
    const emailPrefix = loggedEmail ? loggedEmail.split("@")[0].toLowerCase().replace(/[^a-z]/g, "") : "";

    // 1. Exact match
    let found = teachers.find(
      (t) =>
        t.nameEn.trim().toLowerCase() === qRaw.toLowerCase() ||
        t.nameKo.trim() === qRaw ||
        cleanNameToken(t.nameEn) === qClean
    );
    if (found) return found;

    // 2. Known aliases
    const aliases = KNOWN_ALIASES[qRaw] || KNOWN_ALIASES[qClean] || [];
    if (aliases.length > 0) {
      found = teachers.find((t) => {
        const enClean = cleanNameToken(t.nameEn);
        const koClean = t.nameKo.trim().toLowerCase();
        return aliases.some((a) => enClean.includes(a) || koClean.includes(a));
      });
      if (found) return found;
    }

    // 3. Substring / token match
    if (qClean.length >= 2) {
      found = teachers.find((t) => {
        const enClean = cleanNameToken(t.nameEn);
        const koClean = t.nameKo.trim().toLowerCase();
        return (
          (koClean && (koClean.includes(qClean) || qClean.includes(koClean))) ||
          (enClean && (enClean.includes(qClean) || qClean.includes(enClean)))
        );
      });
      if (found) return found;
    }

    // 4. Email prefix match
    if (emailPrefix.length >= 3) {
      found = teachers.find((t) => {
        const enTokens = cleanNameToken(t.nameEn).split(/\s+/);
        return enTokens.some((tok) => tok.length >= 3 && emailPrefix.includes(tok));
      });
      if (found) return found;
    }

    return undefined;
  }, [teachers, loggedTeacherQuery, loggedEmail]);

  // Filtered reservations for this teacher
  const mySchedules = useMemo(() => {
    if (!loggedTeacherQuery && !currentProfile) return [];
    const qClean = cleanNameToken(loggedTeacherQuery);
    const pEn = currentProfile ? currentProfile.nameEn.trim().toLowerCase() : "";
    const pEnClean = currentProfile ? cleanNameToken(currentProfile.nameEn) : "";
    const pKo = currentProfile ? currentProfile.nameKo.trim().toLowerCase() : "";

    const filtered = reservations.filter((r) => {
      if (r.status !== "CONFIRMED") return false;
      if (currentProfile && isTeacherMatch(currentProfile, r.teacherName)) return true;
      if (loggedTeacherQuery && isTeacherMatch({ nameEn: loggedTeacherQuery, nameKo: loggedTeacherQuery }, r.teacherName)) return true;
      return false;
    });

    // Sort by Date then Start Time asc
    return filtered.sort((a, b) => {
      if (a.date !== b.date) return (a.date || "").localeCompare(b.date || "");
      const tA = parseStartEndTime(a.timeSlot).startTime;
      const tB = parseStartEndTime(b.timeSlot).startTime;
      return tA.localeCompare(tB);
    });
  }, [reservations, loggedTeacherQuery, currentProfile]);

  // Export teacher's confirmed schedule to Excel/CSV with parsed start and end times
  const handleDownloadScheduleExcel = () => {
    if (mySchedules.length === 0) {
      alert("다운로드할 상담 일정 내역이 없습니다.");
      return;
    }

    const header = [
      "상담 일자",
      "상담 시작시간",
      "상담 종료시간",
      "상담 시간대(슬롯)",
      "시작시간(12h)",
      "종료시간(12h)",
      "학생명",
      "학생 학년",
      "학부모 성명",
      "상담 교과",
      "예약 상태",
    ];

    const dataRows = mySchedules.map((item) => {
      const parsed = parseStartEndTime(item.timeSlot);
      return [
        item.date || "",
        parsed.startTime,
        parsed.endTime,
        item.timeSlot || "",
        parsed.startTime12,
        parsed.endTime12,
        item.studentName || "",
        item.studentGrade || "",
        item.parentName || "",
        item.option || "",
        "확정(CONFIRMED)",
      ];
    });

    const teacherName = currentProfile
      ? (currentProfile.nameKo || currentProfile.nameEn)
      : (loggedTeacherQuery || "교사");
    const todayStr = new Date().toISOString().slice(0, 10);
    const filename = `등대PTC_상담일정_${teacherName}_시작종료시간분리_${todayStr}.csv`;
    triggerCsvDownload(filename, [header, ...dataRows]);
  };

  const handleReturnToLogin = () => {
    sessionStorage.removeItem("ptc_user");
    localStorage.removeItem("ptc_user");
    router.replace("/");
  };

  if (!authChecked) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#f8f9ff]">
        <div className="w-8 h-8 border-4 border-[#002d62] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8f9ff]">
      {/* Top Navigation */}
      <header className="bg-[#002d62] text-white px-6 py-4 shadow-md flex items-center justify-between print:hidden">
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

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleReturnToLogin}
            className="px-3 py-1.5 bg-white text-[#00193c] hover:bg-blue-50 rounded-lg text-xs font-bold flex items-center gap-1.5 transition shadow-xs"
          >
            <span className="material-symbols-outlined text-sm">login</span>
            <span>처음 Google 로그인 화면으로</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto p-6 space-y-6">
        {/* Logged-in Teacher Summary Card */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="text-[11px] font-bold text-[#aa3344] uppercase tracking-wider">
              Faculty Dashboard · 본인 전용 상담 일정
            </span>
            <h1 className="text-xl font-bold text-[#00193c]">
              {currentProfile
                ? `${currentProfile.nameEn} (${currentProfile.nameKo})`
                : loggedTeacherQuery
                ? `${loggedTeacherQuery} 선생님 상담 일정표`
                : "교사 상담 일정표"}
            </h1>
            <p className="text-xs text-slate-500">
              {currentProfile?.role || "로그인하신 선생님의 배정된 학부모 상담 타임테이블 현황입니다."}
            </p>
            <p className="text-[11px] text-[#aa3344] font-semibold pt-1">
              ※ 확정된 상담 예약의 취소 권한은 운영자(Admin)에게만 있으며, 교사 및 학부모 화면에서는 임의 취소가 불가합니다.
            </p>
          </div>

          <div className="flex items-center gap-2 print:hidden">
            {loggedEmail && (
              <span className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold border border-slate-200">
                인증 계정: {loggedEmail}
              </span>
            )}
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
            <div className="flex items-center gap-2 print:hidden">
              <button
                type="button"
                onClick={handleDownloadScheduleExcel}
                title="상담 일정을 시작시간과 종료시간으로 분리하여 엑셀(CSV) 파일로 다운로드합니다."
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs transition"
              >
                <span className="material-symbols-outlined text-sm">download</span>
                <span>일정 엑셀 다운로드 (시작·종료시간 분리)</span>
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-semibold text-slate-700 flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-xs">print</span>
                일정표 출력
              </button>
            </div>
          </div>

          {loading ? (
            <div className="p-12 text-center text-slate-400 text-xs">
              일정 데이터를 불러오는 중입니다...
            </div>
          ) : mySchedules.length === 0 ? (
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
                    <th className="p-3">선택 상담교과</th>
                    <th className="p-3">상태</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {mySchedules.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/80 transition">
                      <td className="p-3 font-medium text-slate-800">{item.date}</td>
                      <td className="p-3">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-bold text-[#002d62] bg-[#f0f4fc] px-2 py-0.5 rounded w-fit">
                            {parseStartEndTime(item.timeSlot).startTime ? `${parseStartEndTime(item.timeSlot).startTime} ~ ${parseStartEndTime(item.timeSlot).endTime}` : item.timeSlot}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono pl-0.5">
                            ({item.timeSlot})
                          </span>
                        </div>
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
