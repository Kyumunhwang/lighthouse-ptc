/**
 * Time Slot Parsing & Excel Export Utilities (lib/time-slot-utils.ts)
 * 
 * Provides robust start/end time extraction from consultation time slots
 * (e.g. "1:50-2:10pm", "1:30-1:50pm", "5:40-6:00pm", "11:30-11:50am")
 * and Excel/CSV export formatting.
 */

export interface ParsedTimeSlot {
  startTime: string;       // 24-hour format: "13:50"
  endTime: string;         // 24-hour format: "14:10"
  startTime12: string;     // 12-hour format: "01:50 PM"
  endTime12: string;       // 12-hour format: "02:10 PM"
  originalSlot: string;    // e.g. "1:50-2:10pm"
}

/**
 * Parses a time slot string into structured start time and end time.
 * Handles formats like:
 * - "1:50-2:10pm" -> start: "13:50", end: "14:10"
 * - "1:30-1:50pm" -> start: "13:30", end: "13:50"
 * - "11:30-11:50am" -> start: "11:30", end: "11:50"
 * - "5:40-6:00pm" -> start: "17:40", end: "18:00"
 * - "13:50-14:10" -> start: "13:50", end: "14:10"
 */
export function parseStartEndTime(timeSlot: string): ParsedTimeSlot {
  const safeSlot = (timeSlot || "").trim();
  if (!safeSlot || safeSlot.toUpperCase() === "ALL") {
    return {
      startTime: "",
      endTime: "",
      startTime12: "",
      endTime12: "",
      originalSlot: safeSlot,
    };
  }

  // Split on hyphen or tilde
  const parts = safeSlot.split(/[-~]/).map((p) => p.trim());
  if (parts.length < 2) {
    return {
      startTime: safeSlot,
      endTime: "",
      startTime12: safeSlot,
      endTime12: "",
      originalSlot: safeSlot,
    };
  }

  const rawStart = parts[0];
  const rawEnd = parts[1];

  const endHasAm = /am/i.test(rawEnd);
  const endHasPm = /pm/i.test(rawEnd);
  const startHasAm = /am/i.test(rawStart);
  const startHasPm = /pm/i.test(rawStart);

  // Infer meridiem: if start lacks am/pm, inherit from end
  const startMeridiem = startHasAm ? "AM" : startHasPm ? "PM" : endHasAm ? "AM" : endHasPm ? "PM" : "";
  const endMeridiem = endHasAm ? "AM" : endHasPm ? "PM" : "";

  const startDigits = rawStart.replace(/[^0-9:]/g, "");
  const endDigits = rawEnd.replace(/[^0-9:]/g, "");

  const [sHStr, sMStr = "00"] = startDigits.split(":");
  const [eHStr, eMStr = "00"] = endDigits.split(":");

  const sH = parseInt(sHStr, 10);
  const sM = parseInt(sMStr, 10);
  const eH = parseInt(eHStr, 10);
  const eM = parseInt(eMStr, 10);

  if (isNaN(sH) || isNaN(eH)) {
    return {
      startTime: rawStart,
      endTime: rawEnd,
      startTime12: rawStart,
      endTime12: rawEnd,
      originalSlot: safeSlot,
    };
  }

  // Convert to 24-hour format
  let sHour24 = sH;
  let eHour24 = eH;

  if (startMeridiem === "PM") {
    if (sH < 12) sHour24 += 12;
  } else if (startMeridiem === "AM") {
    if (sH === 12) sHour24 = 0;
  } else {
    // School conferences usually run in the afternoon (1pm ~ 7pm)
    if (sH >= 1 && sH <= 7) sHour24 += 12;
  }

  if (endMeridiem === "PM") {
    if (eH < 12) eHour24 += 12;
  } else if (endMeridiem === "AM") {
    if (eH === 12) eHour24 = 0;
  } else {
    if (eH >= 1 && eH <= 7) eHour24 += 12;
  }

  const pad = (n: number) => String(n).padStart(2, "0");
  const startTime24 = `${pad(sHour24)}:${pad(isNaN(sM) ? 0 : sM)}`;
  const endTime24 = `${pad(eHour24)}:${pad(isNaN(eM) ? 0 : eM)}`;

  const format12 = (h24: number, min: number) => {
    const period = h24 >= 12 ? "PM" : "AM";
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    return `${pad(h12)}:${pad(isNaN(min) ? 0 : min)} ${period}`;
  };

  return {
    startTime: startTime24,
    endTime: endTime24,
    startTime12: format12(sHour24, sM),
    endTime12: format12(eHour24, eM),
    originalSlot: safeSlot,
  };
}

/**
 * Escapes CSV special characters and quotes fields containing commas, quotes, or newlines.
 */
export function escapeCsvCell(val: any): string {
  const s = String(val ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Triggers a browser download of a CSV file with UTF-8 BOM (\uFEFF)
 * ensuring full compatibility with Microsoft Excel in Korean and English.
 */
export function triggerCsvDownload(filename: string, rows: (string | number)[][]): void {
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
}
