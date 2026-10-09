/**
 * Google Sheets Adapter
 * Reads teacher, time, roster, and teacher_email sheets from the configured Google Spreadsheet.
 * Maintains local reservations store for instant sub-millisecond response & writes.
 */

import { getConfig } from "./config";

export interface TeacherRecord {
  id: string;
  nameEn: string;
  nameKo: string;
  role: string;
  options: string[];
}

export interface TimeSlotRecord {
  id: string;
  day: string;
  time: string;
  date: string;
  comment?: string;
}

export interface StudentRecord {
  id: string;
  grade: string;
  studentNameKo: string;
  studentNameEn: string;
  parentFather: string;
  parentMother: string;
}

export interface TeacherEmailRecord {
  email: string;
  name: string;
  role: "교사" | "운영자";
}

export interface ReservationRecord {
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

export interface BlockedSlotRecord {
  id: string;
  teacherName: string; // If 'ALL', applies to all teachers
  date: string;        // E.g. 'Oct. 30' or 'ALL'
  timeSlot: string;    // E.g. '1:50-2:10pm' or 'ALL'
  reason: string;
  createdAt: string;
}

// In-memory cache
interface CachedSheetData {
  teachers: TeacherRecord[];
  timeSlots: TimeSlotRecord[];
  students: StudentRecord[];
  teacherEmails: TeacherEmailRecord[];
  reservations: ReservationRecord[];
  blockedSlots: BlockedSlotRecord[];
  lastSyncedAt: number;
}

const cache: CachedSheetData = {
  teachers: [],
  timeSlots: [],
  students: [],
  teacherEmails: [],
  reservations: [],
  blockedSlots: [],
  lastSyncedAt: 0,
};

/**
 * Robust CSV Line Parser that handles quotes and commas correctly
 */
function parseCsv(csvText: string): string[][] {
  const rows: string[][] = [];
  const lines = csvText.split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) continue;
    const row: string[] = [];
    let insideQuotes = false;
    let currentCell = "";
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (insideQuotes && line[i + 1] === '"') {
          currentCell += '"';
          i++; // Skip next quote
        } else {
          insideQuotes = !insideQuotes;
        }
      } else if (char === "," && !insideQuotes) {
        row.push(currentCell.trim());
        currentCell = "";
      } else {
        currentCell += char;
      }
    }
    row.push(currentCell.trim());
    rows.push(row);
  }
  return rows;
}

/**
 * Fetch raw CSV from Google Spreadsheet GViz endpoint
 */
async function fetchSheetCsv(sheetName: string, spreadsheetId: string): Promise<string[][]> {
  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
  const resp = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
    cache: "no-store",
  });
  if (!resp.ok) {
    throw new Error(`Failed to fetch sheet "${sheetName}": HTTP ${resp.status}`);
  }
  const text = await resp.text();
  return parseCsv(text);
}

/**
 * Synchronize and reload all sheets from Google Spreadsheet
 */
export async function syncSheetsData(force: boolean = false): Promise<CachedSheetData> {
  const now = Date.now();
  // Cache for 60 seconds unless forced
  if (!force && cache.lastSyncedAt > 0 && now - cache.lastSyncedAt < 60000 && cache.teachers.length > 0) {
    return cache;
  }

  const { spreadsheetId } = getConfig();

  try {
    const [teacherRows, timeRows, rosterRows, emailRows] = await Promise.all([
      fetchSheetCsv("teacher", spreadsheetId),
      fetchSheetCsv("time", spreadsheetId),
      fetchSheetCsv("roster", spreadsheetId),
      fetchSheetCsv("teacher_email", spreadsheetId),
    ]);

    // 1. Parse teachers
    const teachers: TeacherRecord[] = [];
    for (let i = 1; i < teacherRows.length; i++) {
      const row = teacherRows[i];
      if (!row || !row[0]) continue;
      const nameEn = row[0] || "";
      const nameKo = row[1] || "";
      const role = row[2] || "";
      const options = row.slice(3).filter((opt) => opt && opt.trim().length > 0);
      teachers.push({
        id: `t_${i}_${nameEn.replace(/\s+/g, "_")}`,
        nameEn,
        nameKo,
        role,
        options,
      });
    }

    // 2. Parse time slots
    const timeSlots: TimeSlotRecord[] = [];
    for (let i = 1; i < timeRows.length; i++) {
      const row = timeRows[i];
      if (!row || !row[1]) continue;
      timeSlots.push({
        id: `time_${i}`,
        day: row[0] || "",
        time: row[1] || "",
        date: row[2] || "",
        comment: row[3] || "",
      });
    }

    // 3. Parse roster (students)
    const students: StudentRecord[] = [];
    for (let i = 1; i < rosterRows.length; i++) {
      const row = rosterRows[i];
      if (!row || !row[1]) continue;
      students.push({
        id: `stu_${i}`,
        grade: row[0] || "",
        studentNameKo: row[1] || "",
        studentNameEn: row[2] || "",
        parentFather: row[3] || "",
        parentMother: row[4] || "",
      });
    }

    // 4. Parse teacher_email
    const teacherEmails: TeacherEmailRecord[] = [];
    for (let i = 1; i < emailRows.length; i++) {
      const row = emailRows[i];
      if (!row || !row[0]) continue;
      const email = row[0].toLowerCase().trim();
      const name = row[1] || "";
      const rawRole = (row[2] || "").trim();
      const role = rawRole.includes("운영자") ? "운영자" : "교사";
      teacherEmails.push({ email, name, role });
    }

    cache.teachers = teachers;
    cache.timeSlots = timeSlots;
    cache.students = students;
    cache.teacherEmails = teacherEmails;
    cache.lastSyncedAt = now;

    return cache;
  } catch (error) {
    console.error("Error syncing Google Sheets data:", error);
    // If cache already has data, return it fallback
    if (cache.teachers.length > 0) return cache;
    throw error;
  }
}

/**
 * Get all existing reservations
 */
export function getReservations(): ReservationRecord[] {
  return cache.reservations;
}

/**
 * Find reservation by token
 */
export function getReservationByToken(token: string): ReservationRecord | undefined {
  return cache.reservations.find((r) => r.uniqueToken === token);
}

/**
 * Add a confirmed reservation to the store
 */
export function addReservation(reservation: ReservationRecord): void {
  cache.reservations.push(reservation);
}

/**
 * Cancel or update reservation status
 */
export function updateReservationStatus(id: string, status: "CONFIRMED" | "CANCELLED"): boolean {
  const item = cache.reservations.find((r) => r.id === id);
  if (item) {
    item.status = status;
    return true;
  }
  return false;
}

/**
 * Add / Update / Delete teachers dynamically (Admin Console Feature)
 */
export function adminAddTeacher(teacher: TeacherRecord): void {
  cache.teachers.push(teacher);
}

export function adminDeleteTeacher(teacherId: string): void {
  cache.teachers = cache.teachers.filter((t) => t.id !== teacherId);
}

export function adminUpdateTeacher(updated: TeacherRecord): void {
  const index = cache.teachers.findIndex((t) => t.id === updated.id);
  if (index !== -1) {
    cache.teachers[index] = updated;
  }
}

/**
 * Blocked slots management for Admin
 */
export function getBlockedSlots(): BlockedSlotRecord[] {
  return cache.blockedSlots;
}

export function addBlockedSlot(item: BlockedSlotRecord): void {
  cache.blockedSlots.push(item);
}

export function deleteBlockedSlot(id: string): void {
  cache.blockedSlots = cache.blockedSlots.filter((b) => b.id !== id);
}

export function isSlotBlocked(teacherName: string, timeSlot: string, date: string): boolean {
  return cache.blockedSlots.some((b) => {
    const teacherMatches = b.teacherName === "ALL" || b.teacherName.trim().toLowerCase() === teacherName.trim().toLowerCase();
    const dateMatches = b.date === "ALL" || b.date.trim().toLowerCase() === date.trim().toLowerCase();
    const timeMatches = b.timeSlot === "ALL" || b.timeSlot.trim().toLowerCase() === timeSlot.trim().toLowerCase();
    return teacherMatches && dateMatches && timeMatches;
  });
}
