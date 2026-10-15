"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface StudentRecord {
  id: string;
  grade: string;
  studentNameKo: string;
  studentNameEn: string;
  parentFather: string;
  parentMother: string;
}

export default function WelcomePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [authEmail, setAuthEmail] = useState("");
  const [userName, setUserName] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userRole, setUserRole] = useState<"운영자" | "교사" | "학부모" | null>(null);

  // Student matching states
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [availableGrades, setAvailableGrades] = useState<string[]>([]);
  const [selectedGrade, setSelectedGrade] = useState("");
  const [gradeStudents, setGradeStudents] = useState<StudentRecord[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [parentNameInput, setParentNameInput] = useState("");
  const [verificationError, setVerificationError] = useState("");
  const [siteConfig, setSiteConfig] = useState<any>(null);

  const getGradeOrderWeight = (g: string): number => {
    const clean = (g || "").trim().toUpperCase();
    const order = ["M6", "M7", "M8", "H9", "H10", "H11", "H12", "G6", "G7", "G8", "G9", "G10", "G11", "G12"];
    const idx = order.indexOf(clean);
    if (idx >= 0) return idx;
    const numMatch = clean.match(/\d+/);
    return numMatch ? parseInt(numMatch[0], 10) + 20 : 999;
  };

  // Sync data on load
  useEffect(() => {
    async function loadInitial() {
      try {
        const res = await fetch("/api/sheets/sync");
        const json = await res.json();
        if (json.success) {
          setStudents(json.students || []);
          setSiteConfig(json.config || null);
          const grades = (
            Array.from(
              new Set((json.students || []).map((s: StudentRecord) => s.grade))
            ).filter(Boolean) as string[]
          ).sort((a, b) => getGradeOrderWeight(a) - getGradeOrderWeight(b));
          setAvailableGrades(grades);
        }
      } catch (err) {
        console.error("Initial load error:", err);
      } finally {
        setLoading(false);
      }
    }
    loadInitial();
  }, []);

  // Update filtered students when grade changes
  useEffect(() => {
    if (selectedGrade) {
      const filtered = students
        .filter((s) => s.grade === selectedGrade)
        .sort((a, b) => a.studentNameKo.localeCompare(b.studentNameKo, "ko"));
      setGradeStudents(filtered);
      setSelectedStudentId("");
    } else {
      setGradeStudents([]);
    }
  }, [selectedGrade, students]);

  // Handle Login & Role Check (운영자 / 교사 / 학부모 구분)
  const handleGoogleLogin = async () => {
    setVerificationError("");

    const trimmedEmail = authEmail.trim();
    if (!trimmedEmail) {
      setVerificationError("이메일을 입력해주세요");
      return;
    }

    if (!trimmedEmail.includes("@")) {
      setVerificationError("올바른 이메일 주소 형식을 입력해 주세요.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: trimmedEmail,
          name: userName || trimmedEmail.split("@")[0],
        }),
      });
      const data = await res.json();
      if (data.success) {
        const user = data.user;
        setIsLoggedIn(true);
        setUserRole(user.role);
        setAuthEmail(user.email);
        localStorage.setItem("ptc_user", JSON.stringify(user));
        sessionStorage.setItem("ptc_user", JSON.stringify(user));

        if (user.role === "운영자") {
          router.push("/admin");
        } else if (user.role === "교사") {
          router.push("/teacher");
        }
      } else {
        setVerificationError(data.error || "로그인 확인 중 오류가 발생했습니다.");
      }
    } catch (err: any) {
      setVerificationError(err.message || "네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  // Handle Parent Student Verification (자녀 및 학부모 성명 검증)
  const handleParentVerification = (e: React.FormEvent) => {
    e.preventDefault();
    setVerificationError("");

    if (!selectedStudentId) {
      setVerificationError("자녀 학생을 먼저 선택해 주세요.");
      return;
    }

    const matched = students.find((s) => s.id === selectedStudentId);
    if (!matched) {
      setVerificationError("선택하신 학생 정보를 찾을 수 없습니다.");
      return;
    }

    const inputClean = parentNameInput.trim().replace(/\s+/g, "").toLowerCase();
    if (!inputClean) {
      setVerificationError("학부모 성함을 입력해 주세요.");
      return;
    }

    const fatherClean = (matched.parentFather || "").trim().replace(/\s+/g, "").toLowerCase();
    const motherClean = (matched.parentMother || "").trim().replace(/\s+/g, "").toLowerCase();

    // Verify parent name matches either father or mother in roster (when registered in roster)
    if (fatherClean || motherClean) {
      const fatherMatches =
        fatherClean.length > 0 &&
        (fatherClean.includes(inputClean) || inputClean.includes(fatherClean));
      const motherMatches =
        motherClean.length > 0 &&
        (motherClean.includes(inputClean) || inputClean.includes(motherClean));

      if (!fatherMatches && !motherMatches) {
        setVerificationError(
          `입력하신 학부모 성함(${parentNameInput.trim()})이 ${matched.studentNameKo} (${matched.studentNameEn}) 학생의 학교 등록 학부모 명부와 일치하지 않습니다. 성함을 다시 확인해 주세요.`
        );
        return;
      }
    }

    // Save session context
    const studentContext = {
      studentId: matched.id,
      grade: matched.grade,
      studentNameKo: matched.studentNameKo,
      studentNameEn: matched.studentNameEn,
      parentName: parentNameInput.trim() || matched.parentFather || matched.parentMother || "학부모",
      email: authEmail,
    };
    sessionStorage.setItem("ptc_student_context", JSON.stringify(studentContext));

    // Redirect to booking screen
    router.push("/booking");
  };

  return (
    <div className="flex flex-col items-center min-h-screen bg-[#f8f9ff]">
      <div className="w-full max-w-[440px] flex flex-col min-h-screen bg-[#f8f9ff] shadow-[0_4px_24px_rgba(0,45,98,0.08)]">
        {/* Collegiate Crest & Header Area */}
        <div className="px-5 pt-8 pb-4 flex flex-col items-center text-center">
          <div className="w-20 h-20 rounded-full bg-white p-1 flex items-center justify-center shadow-md mb-3 border border-slate-200">
            <img src="/emblum.png" alt="등대교육공동체 엠블럼" className="w-full h-full object-contain" />
          </div>
          <h1 className="text-2xl font-bold text-[#00193c] tracking-tight font-serif">
            등대교육공동체
          </h1>
          <p className="text-xs text-[#43474f] mt-1 font-medium">
            학부모 상담 예약 시스템
          </p>
        </div>

        <div className="px-5 flex flex-col space-y-4 pb-12 flex-1">
          {/* Notice Card */}
          <div className="bg-[#fdfbf7] rounded-xl p-4 border border-[#e2e8f0] shadow-sm relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#00193c] via-[#cca730] to-[#aa3344]"></div>
            <div className="flex items-center justify-between mb-3 pt-1">
              <div className="flex items-center gap-1.5 text-[#00193c]">
                <span className="material-symbols-outlined text-[20px] text-[#735c00]">
                  campaign
                </span>
                <span className="font-semibold text-sm">
                  {siteConfig?.noticeTitle || "운영 안내 및 신청 공지"}
                </span>
              </div>
              <span className="bg-[#f7f4eb] text-[#4f3e00] text-[10px] font-semibold px-2 py-0.5 rounded-full border border-[#cca730]/30">
                Official Notice
              </span>
            </div>
            <div className="space-y-2.5 text-xs text-[#171c22]">
              <div className="flex items-start gap-2 bg-white/90 p-2.5 rounded-lg border border-slate-100">
                <span className="material-symbols-outlined text-[#aa3344] text-[18px]">
                  event
                </span>
                <div>
                  <div className="font-semibold text-[#00193c]">Conference Dates</div>
                  <div className="text-slate-600">
                    {siteConfig?.conferenceDates || "2026년 10월 30일(목) · 11월 1일(금)"}{" "}
                    {siteConfig?.conferenceTimes ? `(${siteConfig.conferenceTimes})` : "(13:50 ~ 17:30)"}
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-2 bg-white/90 p-2.5 rounded-lg border border-slate-100">
                <span className="material-symbols-outlined text-[#735c00] text-[18px]">
                  format_list_numbered
                </span>
                <div>
                  <div className="font-semibold text-[#00193c]">신청 제한 (Quota)</div>
                  <div className="text-slate-600">
                    학생 1인당 <span className="font-bold text-[#aa3344]">최대 4개 상담교과</span>까지 예약 가능
                  </div>
                  {siteConfig?.noticeContent && (
                    <div className="text-[11px] text-slate-500 mt-1">
                      {siteConfig.noticeContent}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Authentication Card */}
          <div className="bg-white rounded-xl p-5 border border-[#e2e8f0] shadow-sm">
            {isLoggedIn && (
              <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
                <span className="text-xs uppercase font-bold text-[#002d62]">
                  Login Status
                </span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-semibold">
                  {userRole} 모드
                </span>
              </div>
            )}

            {!isLoggedIn ? (
              <div className="space-y-3">
                {/* Email input */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">
                    이메일을 입력해주세요
                  </label>
                  <input
                    type="email"
                    placeholder="예: example@gmail.com"
                    value={authEmail}
                    onChange={(e) => {
                      setAuthEmail(e.target.value);
                      if (verificationError) setVerificationError("");
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleGoogleLogin();
                      }
                    }}
                    className="w-full px-3 py-2.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002d62]"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => handleGoogleLogin()}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-[#00193c] text-white border border-[#00193c] rounded-lg text-xs font-bold hover:bg-[#002d62] transition shadow-sm"
                >
                  <span className="material-symbols-outlined text-base">login</span>
                  {loading ? "인증 확인 중..." : "Lighthouse PTC Login"}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="p-3 bg-slate-50 rounded-lg flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#002d62]">account_circle</span>
                    <div>
                      <div className="text-xs font-bold text-slate-800">{authEmail}</div>
                      <div className="text-[11px] text-slate-500">인증 완료 ({userRole})</div>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setIsLoggedIn(false);
                      setUserRole(null);
                      setVerificationError("");
                    }}
                    className="text-[11px] text-red-600 hover:underline font-semibold"
                  >
                    처음 로그인 화면으로
                  </button>
                </div>

                {/* If Parent Role, show Student Matching Form */}
                <form onSubmit={handleParentVerification} className="space-y-3 pt-2">
                  <div className="text-xs font-bold text-[#00193c] flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm text-[#002d62]">
                      badge
                    </span>
                    자녀 학생 정보 및 학부모 확인
                  </div>

                  {/* Grade Select */}
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                      1. 학년 선택 (Grade)
                    </label>
                    <select
                      value={selectedGrade}
                      onChange={(e) => setSelectedGrade(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#002d62]"
                      required
                    >
                      <option value="">-- 학년을 선택하세요 --</option>
                      {availableGrades.map((g) => (
                        <option key={g} value={g}>
                          {g} 학년
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Student Select */}
                  {selectedGrade && (
                    <div>
                      <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                        2. 학생 선택 (Student Name)
                      </label>
                      <select
                        value={selectedStudentId}
                        onChange={(e) => setSelectedStudentId(e.target.value)}
                        className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#002d62]"
                        required
                      >
                        <option value="">-- 학생을 선택하세요 --</option>
                        {gradeStudents.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.studentNameKo} ({s.studentNameEn})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Parent Name Input */}
                  {selectedStudentId && (
                    <div>
                      <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                        3. 학부모 성함 (Parent Name - 아버지 또는 어머니 성함)
                      </label>
                      <input
                        type="text"
                        placeholder="학교에 등록된 학부모 성함을 입력하세요"
                        value={parentNameInput}
                        onChange={(e) => setParentNameInput(e.target.value)}
                        className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002d62]"
                        required
                      />
                    </div>
                  )}

                  {verificationError && (
                    <div className="p-2.5 rounded-lg bg-red-50 text-red-700 text-xs flex items-center gap-1.5 border border-red-200">
                      <span className="material-symbols-outlined text-sm">error</span>
                      <span>{verificationError}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={!selectedStudentId}
                    className="w-full mt-2 py-3 bg-[#00193c] text-white rounded-lg text-xs font-bold hover:bg-[#002d62] disabled:opacity-50 transition shadow-md flex items-center justify-center gap-2"
                  >
                    <span>상담 교사 및 시간표 예약하기</span>
                    <span className="material-symbols-outlined text-sm">arrow_forward</span>
                  </button>
                </form>
              </div>
            )}

            {verificationError && !isLoggedIn && (
              <div className="mt-3 p-2.5 rounded-lg bg-red-50 text-red-700 text-xs flex items-center gap-1.5 border border-red-200 font-medium">
                <span className="material-symbols-outlined text-sm">error</span>
                <span>{verificationError}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
