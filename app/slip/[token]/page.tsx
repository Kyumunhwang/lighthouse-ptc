"use client";

import React, { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import QRCode from "qrcode";

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

/**
 * Helper to draw rounded rectangle on HTML5 2D Canvas
 */
function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fillStyle?: string,
  strokeStyle?: string,
  lineWidth: number = 1
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  if (fillStyle) {
    ctx.fillStyle = fillStyle;
    ctx.fill();
  }
  if (strokeStyle) {
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

/**
 * Load an HTMLImageElement from URL/DataURL safely
 */
function loadImageElement(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
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
          } else {
            setAllStudentReservations([mainRes]);
          }

          // Generate QR code pointing to this exact slip URL
          const currentUrl = typeof window !== "undefined" ? window.location.href : "";
          const qrUrl = await QRCode.toDataURL(
            currentUrl || `https://lighthouse-ptc.vercel.app/slip/${token}`,
            {
              width: 240,
              margin: 1,
              color: { dark: "#00193c", light: "#ffffff" },
            }
          );
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

  /**
   * High-DPI Native HTML5 2D Canvas Slip Generator
   * Bypasses Tailwind v4 `oklch()` parsing crash in html2canvas and works 100% reliably on iOS/Android/Desktop.
   */
  const handleSaveAsImage = async () => {
    if (!primaryReservation) return;
    setDownloading(true);

    try {
      const items = allStudentReservations.length > 0 ? allStudentReservations : [primaryReservation];
      const scale = 2; // Retina High-DPI
      const width = 460;
      const itemRowHeight = 76;
      const height = 490 + items.length * itemRowHeight;

      const canvas = document.createElement("canvas");
      canvas.width = width * scale;
      canvas.height = height * scale;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas context unavailable");

      ctx.scale(scale, scale);

      // 1. Background
      drawRoundedRect(ctx, 0, 0, width, height, 20, "#fdfbf7", "#e2e8f0", 2);

      // 2. Top Ribbon Gradient
      const grad = ctx.createLinearGradient(0, 0, width, 0);
      grad.addColorStop(0, "#00193c");
      grad.addColorStop(0.5, "#aa3344");
      grad.addColorStop(1, "#cca730");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, 8);

      // 3. Header Texts & Emblem
      ctx.fillStyle = "#735c00";
      ctx.font = "bold 11px sans-serif";
      ctx.fillText("OFFICIAL ACADEMIC SLIP", 24, 34);

      ctx.fillStyle = "#00193c";
      ctx.font = "bold 22px Georgia, serif";
      ctx.fillText("Lighthouse PTC Slip", 24, 60);

      ctx.fillStyle = "#64748b";
      ctx.font = "12px sans-serif";
      ctx.fillText("Lighthouse International School · 2026–2027", 24, 80);

      const emblemImg = await loadImageElement("/emblum.png");
      if (emblemImg) {
        drawRoundedRect(ctx, width - 80, 22, 56, 56, 28, "#ffffff", "#e2e8f0", 1);
        ctx.drawImage(emblemImg, width - 74, 28, 44, 44);
      }

      // Divider
      ctx.strokeStyle = "#e2e8f0";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(24, 96);
      ctx.lineTo(width - 24, 96);
      ctx.stroke();

      // 4. Slip ID & Issue Date Strip
      drawRoundedRect(ctx, 24, 110, width - 48, 54, 12, "#ffffff", "#e2e8f0", 1);
      ctx.fillStyle = "#94a3b8";
      ctx.font = "bold 10px sans-serif";
      ctx.fillText("SLIP ID", 38, 128);
      ctx.fillStyle = "#00193c";
      ctx.font = "bold 13px monospace";
      ctx.fillText(token, 38, 148);

      const issueDateStr = new Date(primaryReservation.timestamp).toLocaleDateString("ko-KR");
      ctx.textAlign = "right";
      ctx.fillStyle = "#94a3b8";
      ctx.font = "bold 10px sans-serif";
      ctx.fillText("발급일시", width - 38, 128);
      ctx.fillStyle = "#475569";
      ctx.font = "bold 12px sans-serif";
      ctx.fillText(issueDateStr, width - 38, 148);
      ctx.textAlign = "left";

      // 5. Student & Parent Profile Boxes
      const colW = (width - 58) / 2;
      drawRoundedRect(ctx, 24, 174, colW, 68, 12, "#ffffff", "#e2e8f0", 1);
      ctx.fillStyle = "#94a3b8";
      ctx.font = "bold 10px sans-serif";
      ctx.fillText("학생 성명", 36, 192);
      ctx.fillStyle = "#1e293b";
      ctx.font = "bold 13px sans-serif";
      ctx.fillText(primaryReservation.studentName.slice(0, 22), 36, 212);
      ctx.fillStyle = "#2563eb";
      ctx.font = "bold 11px sans-serif";
      ctx.fillText(`학년: ${primaryReservation.studentGrade}`, 36, 230);

      drawRoundedRect(ctx, 34 + colW, 174, colW, 68, 12, "#ffffff", "#e2e8f0", 1);
      ctx.fillStyle = "#94a3b8";
      ctx.font = "bold 10px sans-serif";
      ctx.fillText("학부모 성명", 46 + colW, 192);
      ctx.fillStyle = "#1e293b";
      ctx.font = "bold 13px sans-serif";
      ctx.fillText(primaryReservation.parentName.slice(0, 18), 46 + colW, 212);
      ctx.fillStyle = "#64748b";
      ctx.font = "11px sans-serif";
      ctx.fillText((primaryReservation.email || "Google Verified").slice(0, 24), 46 + colW, 230);

      // 6. Location Banner
      drawRoundedRect(ctx, 24, 252, width - 48, 52, 12, "#f0f4fc", "#dbeafe", 1);
      ctx.fillStyle = "#475569";
      ctx.font = "bold 12px sans-serif";
      ctx.fillText("상담 장소", 38, 282);

      ctx.textAlign = "right";
      ctx.fillStyle = "#00193c";
      ctx.font = "bold 13px sans-serif";
      ctx.fillText("각 교사 지정 테이블", width - 38, 274);
      ctx.fillStyle = "#64748b";
      ctx.font = "11px sans-serif";
      ctx.fillText("Chapel / Gym", width - 38, 292);
      ctx.textAlign = "left";

      // 7. Confirmed Schedule List Title
      ctx.fillStyle = "#334155";
      ctx.font = "bold 12px sans-serif";
      ctx.fillText(`확정된 상담 일정 목록 (총 ${items.length}개)`, 24, 328);

      // 8. Schedule Rows
      let currentY = 340;
      for (const item of items) {
        drawRoundedRect(ctx, 24, currentY, width - 48, 66, 12, "#ffffff", "#e2e8f0", 1);

        // Teacher & Date
        ctx.fillStyle = "#00193c";
        ctx.font = "bold 13px sans-serif";
        ctx.fillText(`${item.teacherName}  (${item.date})`, 38, currentY + 26);

        // Option / Subject
        ctx.fillStyle = "#735c00";
        ctx.font = "12px sans-serif";
        ctx.fillText(`상담교과: ${item.option}`, 38, currentY + 48);

        // Time Badge
        const timeStr = item.timeSlot;
        ctx.font = "bold 12px sans-serif";
        const badgeW = Math.max(96, ctx.measureText(timeStr).width + 24);
        const badgeX = width - 38 - badgeW;
        drawRoundedRect(ctx, badgeX, currentY + 18, badgeW, 30, 8, "#f0f4fc", "#bfdbfe", 1);

        ctx.fillStyle = "#002d62";
        ctx.textAlign = "center";
        ctx.fillText(timeStr, badgeX + badgeW / 2, currentY + 37);
        ctx.textAlign = "left";

        currentY += itemRowHeight;
      }

      // 9. QR Code Box
      const qrBoxY = currentY + 6;
      drawRoundedRect(ctx, 24, qrBoxY, width - 48, 96, 12, "#ffffff", "#e2e8f0", 1);
      ctx.fillStyle = "#00193c";
      ctx.font = "bold 13px sans-serif";
      ctx.fillText("모바일 패스 및 스마트폰 확인증", 38, qrBoxY + 30);

      ctx.fillStyle = "#64748b";
      ctx.font = "11px sans-serif";
      ctx.fillText("당일 학교 방문 시 본 확인증 이미지를 제시해 주세요.", 38, qrBoxY + 52);
      ctx.fillText("우측 QR코드 스캔 시 실시간 확인증 열람이 가능합니다.", 38, qrBoxY + 70);

      if (qrCodeDataUrl) {
        const qrImg = await loadImageElement(qrCodeDataUrl);
        if (qrImg) {
          drawRoundedRect(ctx, width - 114, qrBoxY + 8, 80, 80, 8, "#ffffff", "#e2e8f0", 1);
          ctx.drawImage(qrImg, width - 110, qrBoxY + 12, 72, 72);
        }
      }

      // 10. Footer
      ctx.textAlign = "center";
      ctx.fillStyle = "#94a3b8";
      ctx.font = "11px sans-serif";
      ctx.fillText(
        "본 확인증은 Lighthouse PTC 학부모 상담 포털에서 공식 발급되었습니다.",
        width / 2,
        height - 16
      );

      // Export PNG and trigger download
      const dataUrl = canvas.toDataURL("image/png");
      const safeStudentName = (primaryReservation.studentName || "Booking")
        .replace(/[^a-zA-Z0-9가-힣_-]/g, "_");
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = `Lighthouse_PTC_${safeStudentName}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error("Image generation error:", err);
      alert("이미지 생성 중 오류가 발생했습니다. 화면 캡처 또는 인쇄 기능을 이용해 주세요.");
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
        <p className="text-xs text-slate-500 mt-1">유효하지 않거나 취소된 예약 코드입니다.</p>
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
    <div className="flex flex-col items-center min-h-screen bg-[#f8f9ff] py-6 px-4 print:bg-white print:py-0 print:px-0">
      <div className="w-full max-w-[440px] flex flex-col gap-4">
        {/* Navigation & Actions (Hidden during print) */}
        <div className="flex items-center justify-between print:hidden">
          <button
            onClick={() => router.push("/")}
            className="flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-slate-900"
          >
            <span className="material-symbols-outlined text-sm">home</span>
            처음으로
          </button>
          <div className="flex gap-2">
            <button
              onClick={() => window.print()}
              className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-xs flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-sm">print</span>
              인쇄 / PDF
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

        {/* Success Alert Banner (Hidden during print) */}
        <div className="bg-[#f0fdf4] text-[#15803d] border border-[#86efac] rounded-xl p-3 flex items-center gap-2.5 shadow-xs print:hidden">
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
          className="bg-[#fdfbf7] rounded-2xl border border-slate-200 shadow-md overflow-hidden relative p-5 print:shadow-none print:border-slate-300"
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
                Lighthouse International School · 2026–2027
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
              <span className="text-[10px] text-slate-500 block mt-0.5 truncate">
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
                    <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px]">
                      {res.date}
                    </span>
                  </div>
                  <div className="text-[11px] text-[#735c00] font-medium mt-0.5">
                    상담교과: {res.option}
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
