"use client";

import React, { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import QRCode from "qrcode";
import html2canvas from "html2canvas";

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

export default function ConfirmationSlipPage() {
  const params = useParams();
  const router = useRouter();
  const token = params?.token as string;

  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [primaryReservation, setPrimaryReservation] = useState<ReservationRecord | null>(null);
  const [allStudentReservations, setAllStudentReservations] = useState<ReservationRecord[]>([]);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>("");
  const slipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function fetchSlipData() {
      try {
        const res = await fetch(`/api/reservations?token=${encodeURIComponent(token)}`);
        const json = await res.json();
        if (json.success && json.reservation) {
          const mainRes = json.reservation;
          setPrimaryReservation(mainRes);

          // Also fetch all reservations for this same student name
          const allRes = await fetch("/api/reservations");
          const allJson = await allRes.json();
          if (allJson.success && allJson.reservations) {
            const related = allJson.reservations.filter(
              (r: ReservationRecord) =>
                r.studentName === mainRes.studentName &&
                r.parentName === mainRes.parentName &&
                r.status === "CONFIRMED"
            );
            setAllStudentReservations(related.length > 0 ? related : [mainRes]);
          }

          // Generate QR code pointing to this exact slip URL
          const currentUrl = typeof window !== "undefined" ? window.location.href : "";
          const qrUrl = await QRCode.toDataURL(currentUrl || `https://lis-ptc.vercel.app/slip/${token}`, {
            width: 180,
            margin: 1,
            color: { dark: "#00193c", light: "#ffffff" },
          });
          setQrCodeDataUrl(qrUrl);
        }
      } catch (err) {
        console.error("Slip loading error:", err);
      } finally {
        setLoading(false);
      }
    }
    if (token) {
      fetchSlipData();
    }
  }, [token]);

  // Image Save (PNG Download) via html2canvas
  const handleSaveAsImage = async () => {
    if (!slipRef.current) return;
    setDownloading(true);

    try {
      const canvas = await html2canvas(slipRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#fdfbf7",
      });
      const dataUrl = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `PTC_Slip_${primaryReservation?.studentName || "Booking"}.png`;
      a.click();
    } catch (err) {
      console.error("Image generation error:", err);
      alert("이미지 저장 중 오류가 발생했습니다. 브라우저 인쇄 기능을 이용해 주세요.");
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#f8f9ff]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-[#00193c] border-t-transparent rounded-full animate-spin"></div>
          <span className="text-xs text-slate-600 font-medium">예약 확인증을 생성하는 중입니다...</span>
        </div>
      </div>
    );
  }

  if (!primaryReservation) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center">
        <h2 className="text-base font-bold text-slate-800">예약증을 찾을 수 없습니다.</h2>
        <p className="text-xs text-slate-500 mt-1">유효하지 않거나 만료된 예약 코드입니다.</p>
        <button
          onClick={() => router.push("/")}
          className="mt-4 px-4 py-2 bg-[#00193c] text-white rounded-lg text-xs font-semibold"
        >
          처음 화면으로 이동
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center min-h-screen bg-[#f8f9ff] py-6 px-4">
      <div className="w-full max-w-[440px] flex flex-col gap-4">
        {/* Navigation & Actions */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => router.push("/")}
            className="flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-slate-900"
          >
            <span className="material-symbols-outlined text-sm">home</span>
            홈으로
          </button>
          <div className="flex gap-2">
            <button
              onClick={() => window.print()}
              className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-xs flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-sm">print</span>
              인쇄
            </button>
            <button
              onClick={handleSaveAsImage}
              disabled={downloading}
              className="px-3 py-1.5 bg-[#00193c] text-white rounded-lg text-xs font-bold hover:bg-[#002d62] shadow-sm flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-sm">download</span>
              {downloading ? "저장 중..." : "이미지 저장 (PNG)"}
            </button>
          </div>
        </div>

        {/* Success Alert Banner */}
        <div className="bg-[#f0fdf4] text-[#15803d] border border-[#86efac] rounded-xl p-3 flex items-center gap-2.5 shadow-xs">
          <span className="material-symbols-outlined text-xl">check_circle</span>
          <div>
            <div className="text-xs font-bold">상담 예약이 최종 확정되었습니다!</div>
            <div className="text-[11px] text-emerald-700">
              당일 학교 방문 시 본 확인증 화면 또는 저장한 이미지를 제시해 주세요.
            </div>
          </div>
        </div>

        {/* Printable Slip Card */}
        <div
          ref={slipRef}
          className="bg-[#fdfbf7] rounded-2xl border border-slate-200 shadow-md overflow-hidden relative p-5"
        >
          {/* Top Decorative Academic Ribbon */}
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#00193c] via-[#aa3344] to-[#cca730]"></div>

          {/* Document Header */}
          <div className="flex items-start justify-between pb-4 border-b border-slate-200/60 mt-1">
            <div>
              <span className="text-[10px] uppercase font-bold text-[#735c00] tracking-wider">
                Official Academic Slip
              </span>
              <h2 className="text-lg font-bold text-[#00193c] font-serif leading-tight mt-0.5">
                Lighthouse PTC Slip
              </h2>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Lighthouse International School · 2024 Fall
              </p>
            </div>
            <div className="w-14 h-14 rounded-full bg-white border border-slate-200 p-1 flex items-center justify-center shadow-xs">
              <img src="/emblum.png" alt="Lighthouse PTC Emblem" className="w-full h-full object-contain" />
            </div>
          </div>

          {/* Document Metadata Strip */}
          <div className="my-3 p-2.5 bg-white rounded-xl border border-slate-200 flex items-center justify-between text-xs">
            <div>
              <span className="text-[10px] text-slate-400 font-semibold block">SLIP ID</span>
              <span className="font-mono font-bold text-[#00193c]">{token}</span>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-slate-400 font-semibold block">발급일시</span>
              <span className="text-slate-600 font-medium">
                {new Date(primaryReservation.timestamp).toLocaleDateString("ko-KR")}
              </span>
            </div>
          </div>

          {/* Student & Parent Profile */}
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div className="bg-white p-2.5 rounded-xl border border-slate-200">
              <span className="text-[10px] text-slate-400 font-semibold block">학생 성명</span>
              <span className="text-xs font-bold text-slate-800">
                {primaryReservation.studentName}
              </span>
              <span className="text-[10px] text-blue-600 block mt-0.5 font-medium">
                학년: {primaryReservation.studentGrade}
              </span>
            </div>
            <div className="bg-white p-2.5 rounded-xl border border-slate-200">
              <span className="text-[10px] text-slate-400 font-semibold block">학부모 성명</span>
              <span className="text-xs font-bold text-slate-800">
                {primaryReservation.parentName}
              </span>
              <span className="text-[10px] text-slate-500 block mt-0.5">
                {primaryReservation.email || "Google Verified"}
              </span>
            </div>
          </div>

          {/* Location Info Banner */}
          <div className="bg-[#f0f4fc] p-2.5 rounded-xl border border-blue-100 flex items-center justify-between mb-3 text-xs">
            <span className="font-semibold text-slate-600 flex items-center gap-1 text-[11px]">
              <span className="material-symbols-outlined text-sm text-[#00193c]">location_on</span>
              상담 장소
            </span>
            <div className="text-right">
              <span className="font-bold text-[#00193c] text-xs">각 교사 지정 테이블</span>
              <span className="text-[10px] text-slate-500 block">Chapel / Gym</span>
            </div>
          </div>

          {/* Confirmed Schedule List */}
          <div className="space-y-2 mb-4">
            <div className="text-[11px] font-bold text-slate-700 flex items-center gap-1">
              <span className="material-symbols-outlined text-sm text-[#00193c]">
                calendar_month
              </span>
              확정된 상담 일정 목록 (총 {allStudentReservations.length}개)
            </div>

            {allStudentReservations.map((res, i) => (
              <div
                key={res.id || i}
                className="bg-white p-3 rounded-xl border border-slate-200 flex items-center justify-between shadow-xs"
              >
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-[#00193c]">
                      {res.teacherName}
                    </span>
                    <span className="px-1.5 py-0.2 bg-slate-100 text-slate-600 rounded text-[10px]">
                      {res.date}
                    </span>
                  </div>
                  <div className="text-[11px] text-[#735c00] font-medium mt-0.5">
                    주제: {res.option}
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-xs font-bold text-[#002d62] bg-[#f0f4fc] px-2 py-1 rounded-md">
                    {res.timeSlot}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* QR Code Pass Section */}
          <div className="p-3 bg-white rounded-xl border border-slate-200 flex items-center justify-between gap-3">
            <div className="flex-1">
              <div className="text-xs font-bold text-[#00193c]">
                모바일 패스 및 스마트폰 저장
              </div>
              <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">
                스마트폰 카메라로 우측 QR코드를 스캔하시면 언제든지 본 확인증을 열람 및 다운로드하실 수 있습니다.
              </p>
            </div>
            {qrCodeDataUrl && (
              <div className="w-20 h-20 bg-white p-1 rounded-lg border border-slate-200 shrink-0 flex items-center justify-center">
                <img src={qrCodeDataUrl} alt="Slip QR Code" className="w-full h-full object-contain" />
              </div>
            )}
          </div>

          {/* Footer Note */}
          <div className="text-center text-[10px] text-slate-400 mt-4 border-t border-slate-200/50 pt-2">
            본 확인증은 Lighthouse PTC 학부모 상담 포털에서 공식 발급되었습니다.
          </div>
        </div>
      </div>
    </div>
  );
}
