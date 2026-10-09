/**
 * Application Configuration
 * Holds default Google Spreadsheet ID and allows runtime override for term transitions,
 * conference notice content, and dates editable by Admin.
 */

export interface AppConfig {
  spreadsheetId: string;
  conferenceTitle: string;
  academicYear: string;
  conferenceDates: string;
  conferenceTimes: string;
  noticeTitle: string;
  noticeContent: string;
  bookingLimitPerStudent: number;
}

export const DEFAULT_CONFIG: AppConfig = {
  spreadsheetId: "1A_fUTXGHHGSNH8tE8Vh49sS5MKDRcz05W0wiiVfdFeA",
  conferenceTitle: "2026-2027 Fall PTC Booking",
  academicYear: "2026–2027",
  conferenceDates: "2026년 10월 30일(목) · 11월 1일(금)",
  conferenceTimes: "13:50 ~ 17:30 (세션당 20분 진행)",
  noticeTitle: "운영 안내 및 신청 공지",
  noticeContent: "상담을 원하시는 선생님과 상담 항목을 최대 4개까지 선택하신 후 예약하시기 바랍니다.",
  bookingLimitPerStudent: 4,
};

// Global in-memory config for runtime modifications (e.g. from Admin console)
let currentConfig: AppConfig = { ...DEFAULT_CONFIG };

export function getConfig(): AppConfig {
  return currentConfig;
}

export function updateConfig(newConfig: Partial<AppConfig>): AppConfig {
  currentConfig = { ...currentConfig, ...newConfig };
  return currentConfig;
}
