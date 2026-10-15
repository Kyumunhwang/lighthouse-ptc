/**
 * Google Sheets + Persistent Storage (Supabase / Local JSON) Adapter
 * Reads base teacher, time, roster, and teacher_email sheets from the configured Google Spreadsheet,
 * and merges persistent overrides, reservations, blocked slots, and configuration from Supabase / local JSON.
 */

import { getConfig, updateConfig } from "./config";
import {
  loadPersistentState,
  savePersistentState,
  PersistentOverrides,
  PersistentStorePayload,
} from "./persistence";

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

interface CachedSheetData {
  baseTeachers: TeacherRecord[];
  baseStudents: StudentRecord[];
  baseTeacherEmails: TeacherEmailRecord[];
  baseTimeSlots: TimeSlotRecord[];
  teachers: TeacherRecord[];
  timeSlots: TimeSlotRecord[];
  students: StudentRecord[];
  teacherEmails: TeacherEmailRecord[];
  reservations: ReservationRecord[];
  blockedSlots: BlockedSlotRecord[];
  overrides: PersistentOverrides;
  lastSyncedAt: number;
  initializedFromStore: boolean;
}

const cache: CachedSheetData = {
  baseTeachers: [],
  baseStudents: [],
  baseTeacherEmails: [],
  baseTimeSlots: [],
  teachers: [],
  timeSlots: [],
  students: [],
  teacherEmails: [],
  reservations: [],
  blockedSlots: [],
  overrides: {
    upsertedTeachers: [],
    deletedTeacherIds: [],
    upsertedTeacherEmails: [],
    deletedTeacherEmails: [],
    upsertedStudents: [],
    deletedStudentIds: [],
    dateMapping: {},
  },
  lastSyncedAt: 0,
  initializedFromStore: false,
};

/**
 * Helper to strip honorifics (Mr., Ms., Mrs., Miss, Teacher, 선생님, etc.) and normalize name
 */
export function normalizeTeacherNameToken(name: string): string {
  if (!name) return "";
  return name
    .replace(/^(mr\.?|ms\.?|mrs\.?|miss\.?|dr\.?|prof\.?)\s+/i, "")
    .replace(/\s*(선생님|교사)\s*$/g, "")
    .trim()
    .toLowerCase();
}

/**
 * Robust matcher between a query name (from teacher_email or URL param) and a TeacherRecord
 */
export function matchTeacherRecord(
  queryName: string,
  teachers: TeacherRecord[],
  emailHint?: string
): TeacherRecord | undefined {
  if (!teachers || teachers.length === 0) return undefined;

  const qRaw = (queryName || "").trim();
  const qClean = normalizeTeacherNameToken(qRaw);
  const emailPrefix = emailHint ? emailHint.split("@")[0].toLowerCase().replace(/[^a-z]/g, "") : "";

  // Known alias map for Lighthouse faculty where teacher_email uses Korean/nickname and teacher sheet uses formal name
  const knownAliases: Record<string, string[]> = {
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

  // 1. Exact match on Korean name or English name
  let found = teachers.find(
    (t) =>
      t.nameKo.trim() === qRaw ||
      t.nameEn.trim().toLowerCase() === qRaw.toLowerCase() ||
      normalizeTeacherNameToken(t.nameEn) === qClean
  );
  if (found) return found;

  // 2. Check known aliases
  const aliases = knownAliases[qRaw] || knownAliases[qClean] || [];
  if (aliases.length > 0) {
    found = teachers.find((t) => {
      const enClean = normalizeTeacherNameToken(t.nameEn);
      const koClean = t.nameKo.trim().toLowerCase();
      return aliases.some((a) => enClean.includes(a) || koClean.includes(a));
    });
    if (found) return found;
  }

  // 3. Substring / token match on Korean or stripped English name
  if (qClean.length >= 2) {
    found = teachers.find((t) => {
      const enClean = normalizeTeacherNameToken(t.nameEn);
      const koClean = t.nameKo.trim().toLowerCase();
      return (
        (koClean && (koClean.includes(qClean) || qClean.includes(koClean))) ||
        (enClean && (enClean.includes(qClean) || qClean.includes(enClean)))
      );
    });
    if (found) return found;
  }

  // 4. Match using email prefix if provided (e.g. "king@liskorea.net" -> "leigh king")
  if (emailPrefix && emailPrefix.length >= 3) {
    found = teachers.find((t) => {
      const enTokens = normalizeTeacherNameToken(t.nameEn).split(/\s+/);
      return enTokens.some((tok) => tok.length >= 3 && emailPrefix.includes(tok));
    });
    if (found) return found;
  }

  return undefined;
}

/**
 * Apply persistent overrides on top of base Google Sheet records
 */
function recomputeMergedRecords(): void {
  const ov = cache.overrides;

  // 1. Merge Teachers
  const deletedTSet = new Set(ov.deletedTeacherIds || []);
  const upsertedTMap = new Map<string, TeacherRecord>();
  for (const t of ov.upsertedTeachers || []) {
    upsertedTMap.set(t.id, t);
  }

  const mergedTeachers: TeacherRecord[] = [];
  const seenTIds = new Set<string>();

  for (const baseT of cache.baseTeachers) {
    if (deletedTSet.has(baseT.id)) continue;
    if (upsertedTMap.has(baseT.id)) {
      mergedTeachers.push(upsertedTMap.get(baseT.id)!);
      seenTIds.add(baseT.id);
    } else {
      mergedTeachers.push(baseT);
      seenTIds.add(baseT.id);
    }
  }
  for (const [id, customT] of upsertedTMap.entries()) {
    if (!seenTIds.has(id) && !deletedTSet.has(id)) {
      mergedTeachers.push(customT);
    }
  }
  cache.teachers = mergedTeachers;

  // 2. Merge Teacher/Admin Emails
  const deletedESet = new Set((ov.deletedTeacherEmails || []).map((e) => e.toLowerCase().trim()));
  const upsertedEMap = new Map<string, TeacherEmailRecord>();
  for (const eRec of ov.upsertedTeacherEmails || []) {
    upsertedEMap.set(eRec.email.toLowerCase().trim(), {
      email: eRec.email.toLowerCase().trim(),
      name: eRec.name.trim(),
      role: eRec.role,
    });
  }

  const mergedEmails: TeacherEmailRecord[] = [];
  const seenEmails = new Set<string>();

  for (const baseE of cache.baseTeacherEmails) {
    const key = baseE.email.toLowerCase().trim();
    if (deletedESet.has(key)) continue;
    if (upsertedEMap.has(key)) {
      mergedEmails.push(upsertedEMap.get(key)!);
      seenEmails.add(key);
    } else {
      mergedEmails.push(baseE);
      seenEmails.add(key);
    }
  }
  for (const [key, customE] of upsertedEMap.entries()) {
    if (!seenEmails.has(key) && !deletedESet.has(key)) {
      mergedEmails.push(customE);
    }
  }
  cache.teacherEmails = mergedEmails;

  // 3. Merge Students (Roster)
  const deletedSSet = new Set(ov.deletedStudentIds || []);
  const upsertedSMap = new Map<string, StudentRecord>();
  for (const s of ov.upsertedStudents || []) {
    upsertedSMap.set(s.id, s);
  }

  const mergedStudents: StudentRecord[] = [];
  const seenSIds = new Set<string>();

  for (const baseS of cache.baseStudents) {
    if (deletedSSet.has(baseS.id)) continue;
    if (upsertedSMap.has(baseS.id)) {
      mergedStudents.push(upsertedSMap.get(baseS.id)!);
      seenSIds.add(baseS.id);
    } else {
      mergedStudents.push(baseS);
      seenSIds.add(baseS.id);
    }
  }
  for (const [id, customS] of upsertedSMap.entries()) {
    if (!seenSIds.has(id) && !deletedSSet.has(id)) {
      mergedStudents.push(customS);
    }
  }
  cache.students = mergedStudents;

  // 4. Merge & Map Time Slots (Date Renaming / Override)
  const dMap = ov.dateMapping || {};
  if (cache.baseTimeSlots.length > 0) {
    cache.timeSlots = cache.baseTimeSlots.map((ts) => {
      const targetDate = dMap[ts.date.trim()] || ts.date;
      return { ...ts, date: targetDate };
    }).sort((a, b) => {
      if (a.date !== b.date) {
        return a.date.localeCompare(b.date);
      }
      return parseTimeSlotMinutes(a.time) - parseTimeSlotMinutes(b.time);
    });
  }
}

/**
 * Persist current cache state to Supabase + Local JSON
 */
export async function persistCurrentState(): Promise<void> {
  const payload: PersistentStorePayload = {
    config: getConfig(),
    reservations: cache.reservations,
    blockedSlots: cache.blockedSlots,
    overrides: cache.overrides,
    updatedAt: new Date().toISOString(),
  };
  await savePersistentState(payload);
}

/**
 * Load persistent state from Supabase / Local JSON into memory cache
 */
export async function hydrateFromPersistentStore(): Promise<void> {
  const stored = await loadPersistentState();
  if (stored.config) {
    updateConfig(stored.config);
  }
  cache.reservations = Array.isArray(stored.reservations) ? stored.reservations : [];
  cache.blockedSlots = Array.isArray(stored.blockedSlots) ? stored.blockedSlots : [];
  cache.overrides = {
    upsertedTeachers: stored.overrides?.upsertedTeachers || [],
    deletedTeacherIds: stored.overrides?.deletedTeacherIds || [],
    upsertedTeacherEmails: stored.overrides?.upsertedTeacherEmails || [],
    deletedTeacherEmails: stored.overrides?.deletedTeacherEmails || [],
    upsertedStudents: stored.overrides?.upsertedStudents || [],
    deletedStudentIds: stored.overrides?.deletedStudentIds || [],
    dateMapping: stored.overrides?.dateMapping || {},
  };
  cache.initializedFromStore = true;
  if (
    cache.baseTeachers.length > 0 ||
    cache.baseStudents.length > 0 ||
    cache.baseTimeSlots.length > 0
  ) {
    recomputeMergedRecords();
  }
}

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
          i++;
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

export function parseTimeSlotMinutes(timeStr: string): number {
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
}

export const REQUIRED_EXTRA_TIME_SLOTS: TimeSlotRecord[] = [
  // 1:30-1:50pm
  { id: "time_extra_oct30_130", day: "목요일", time: "1:30-1:50pm", date: "Oct. 30", comment: "" },
  { id: "time_extra_nov01_130", day: "금요일", time: "1:30-1:50pm", date: "Nov. 1", comment: "" },
  // 2:30-2:50pm (User requested)
  { id: "time_extra_oct30_230", day: "목요일", time: "2:30-2:50pm", date: "Oct. 30", comment: "" },
  { id: "time_extra_nov01_230", day: "금요일", time: "2:30-2:50pm", date: "Nov. 1", comment: "" },
  // 4:00-4:20pm (User requested)
  { id: "time_extra_oct30_400", day: "목요일", time: "4:00-4:20pm", date: "Oct. 30", comment: "" },
  { id: "time_extra_nov01_400", day: "금요일", time: "4:00-4:20pm", date: "Nov. 1", comment: "" },
  // 4:30-4:50pm (User requested)
  { id: "time_extra_oct30_430", day: "목요일", time: "4:30-4:50pm", date: "Oct. 30", comment: "" },
  { id: "time_extra_nov01_430", day: "금요일", time: "4:30-4:50pm", date: "Nov. 1", comment: "" },
  // 5:10-5:30pm
  { id: "time_extra_oct30_510", day: "목요일", time: "5:10-5:30pm", date: "Oct. 30", comment: "" },
  { id: "time_extra_nov01_510", day: "금요일", time: "5:10-5:30pm", date: "Nov. 1", comment: "" },
];

/**
 * Synchronize and reload all sheets from Google Spreadsheet + Persistent Store
 */
export async function syncSheetsData(force: boolean = false): Promise<CachedSheetData> {
  // Always hydrate latest reservations/overrides from Supabase/local store so multi-instance/multi-device stays in sync
  await hydrateFromPersistentStore();

  const now = Date.now();
  if (!force && cache.lastSyncedAt > 0 && now - cache.lastSyncedAt < 60000 && cache.baseTeachers.length > 0) {
    recomputeMergedRecords();
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

    // 1. Parse base teachers
    const baseTeachers: TeacherRecord[] = [];
    for (let i = 1; i < teacherRows.length; i++) {
      const row = teacherRows[i];
      if (!row || !row[0]) continue;
      const nameEn = row[0] || "";
      const nameKo = row[1] || "";
      const role = row[2] || "";
      const options = row.slice(3).filter((opt) => opt && opt.trim().length > 0);
      baseTeachers.push({
        id: `t_${i}_${nameEn.replace(/\s+/g, "_")}`,
        nameEn,
        nameKo,
        role,
        options,
      });
    }

    // 2. Parse time slots and guarantee required slots
    const timeSlotMap = new Map<string, TimeSlotRecord>();
    for (let i = 1; i < timeRows.length; i++) {
      const row = timeRows[i];
      if (!row || !row[1]) continue;
      const day = (row[0] || "").trim();
      let time = (row[1] || "").trim();
      let date = (row[2] || "").trim();
      const comment = (row[3] || "").trim();
      // Replace any old 1:20-1:50pm with 1:30-1:50pm
      if (time === "1:20-1:50pm") {
        time = "1:30-1:50pm";
      }
      // Fix potential Google Sheet typo where Friday rows (e.g. 4:00-4:20pm, 4:30-4:50pm) were entered with "Oct. 30" instead of "Nov. 1"
      if (day.includes("금") && date === "Oct. 30") {
        date = "Nov. 1";
      }
      const key = `${date}__${time}`.toLowerCase();
      timeSlotMap.set(key, {
        id: `time_${i}`,
        day,
        time,
        date,
        comment,
      });
    }

    // Remove legacy 1:20-1:50pm keys if any
    for (const key of Array.from(timeSlotMap.keys())) {
      if (key.includes("1:20-1:50pm")) {
        timeSlotMap.delete(key);
      }
    }

    // Merge required extra slots if missing in Google Sheets
    for (const reqSlot of REQUIRED_EXTRA_TIME_SLOTS) {
      const key = `${reqSlot.date}__${reqSlot.time}`.toLowerCase();
      if (!timeSlotMap.has(key)) {
        timeSlotMap.set(key, reqSlot);
      }
    }

    const timeSlots = Array.from(timeSlotMap.values()).sort((a, b) => {
      if (a.date !== b.date) {
        return a.date.localeCompare(b.date);
      }
      return parseTimeSlotMinutes(a.time) - parseTimeSlotMinutes(b.time);
    });

    // 3. Parse base roster (students)
    const baseStudents: StudentRecord[] = [];
    for (let i = 1; i < rosterRows.length; i++) {
      const row = rosterRows[i];
      if (!row || !row[1]) continue;
      baseStudents.push({
        id: `stu_${i}`,
        grade: row[0] || "",
        studentNameKo: row[1] || "",
        studentNameEn: row[2] || "",
        parentFather: row[3] || "",
        parentMother: row[4] || "",
      });
    }

    // 4. Parse base teacher_email
    const baseTeacherEmails: TeacherEmailRecord[] = [];
    for (let i = 1; i < emailRows.length; i++) {
      const row = emailRows[i];
      if (!row || !row[0]) continue;
      const email = row[0].toLowerCase().trim();
      const name = row[1] || "";
      const rawRole = (row[2] || "").trim();
      const role = rawRole.includes("운영자") ? "운영자" : "교사";
      baseTeacherEmails.push({ email, name, role });
    }

    cache.baseTeachers = baseTeachers;
    cache.baseTimeSlots = timeSlots;
    cache.timeSlots = timeSlots;
    cache.baseStudents = baseStudents;
    cache.baseTeacherEmails = baseTeacherEmails;
    cache.lastSyncedAt = now;

    recomputeMergedRecords();

    return cache;
  } catch (error) {
    console.error("Error syncing Google Sheets data:", error);
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
 * Add confirmed reservation(s) and persist immediately
 */
export async function addReservation(reservation: ReservationRecord): Promise<void> {
  cache.reservations.push(reservation);
  await persistCurrentState();
}

export async function addMultipleReservations(records: ReservationRecord[]): Promise<void> {
  cache.reservations.push(...records);
  await persistCurrentState();
}

/**
 * Cancel or update reservation status
 */
export async function updateReservationStatus(
  id: string,
  status: "CONFIRMED" | "CANCELLED"
): Promise<boolean> {
  await hydrateFromPersistentStore();
  const item = cache.reservations.find((r) => r.id === id);
  if (item) {
    item.status = status;
    await persistCurrentState();
    return true;
  }
  return false;
}

/**
 * Delete a single reservation permanently
 */
export async function deleteReservationById(id: string): Promise<boolean> {
  await hydrateFromPersistentStore();
  const before = cache.reservations.length;
  cache.reservations = cache.reservations.filter((r) => r.id !== id);
  if (cache.reservations.length !== before) {
    await persistCurrentState();
    return true;
  }
  return false;
}

/**
 * Clear ALL reservations (Beta Test Reset Feature)
 */
export async function clearAllReservations(): Promise<number> {
  await hydrateFromPersistentStore();
  const count = cache.reservations.length;
  cache.reservations = [];
  await persistCurrentState();
  return count;
}

/**
 * Admin Date Mapping CRUD (운영자 상담 일자 일괄 변경 및 동기화)
 */
export async function adminUpdateDates(
  newDateMapping: Record<string, string>,
  conferenceDatesText?: string
): Promise<{ timeSlots: TimeSlotRecord[]; updatedDates: string[] }> {
  await hydrateFromPersistentStore();

  const currentMapping = cache.overrides.dateMapping || {};
  const mergedMapping: Record<string, string> = { ...currentMapping };

  // Update mapping
  for (const [oldDate, newDate] of Object.entries(newDateMapping)) {
    const trimmedOld = oldDate.trim();
    const trimmedNew = newDate.trim();
    if (trimmedOld && trimmedNew) {
      mergedMapping[trimmedOld] = trimmedNew;

      // Cascade update to existing confirmed/pending reservations
      cache.reservations.forEach((r) => {
        if (r.date.trim() === trimmedOld) {
          r.date = trimmedNew;
        }
      });

      // Cascade update to blocked slots
      cache.blockedSlots.forEach((b) => {
        if (b.date.trim() === trimmedOld) {
          b.date = trimmedNew;
        }
      });
    }
  }

  cache.overrides.dateMapping = mergedMapping;

  if (conferenceDatesText) {
    updateConfig({ conferenceDates: conferenceDatesText });
  }

  recomputeMergedRecords();
  await persistCurrentState();

  const distinctDates = Array.from(new Set(cache.timeSlots.map((t) => t.date))).filter(Boolean);
  return { timeSlots: cache.timeSlots, updatedDates: distinctDates };
}

/**
 * Teacher CRUD (Admin Console Feature - Persisted in Overrides)
 */
export async function adminAddTeacher(teacher: TeacherRecord): Promise<void> {
  await hydrateFromPersistentStore();
  cache.overrides.deletedTeacherIds = cache.overrides.deletedTeacherIds.filter(
    (id) => id !== teacher.id
  );
  const idx = cache.overrides.upsertedTeachers.findIndex((t) => t.id === teacher.id);
  if (idx >= 0) {
    cache.overrides.upsertedTeachers[idx] = teacher;
  } else {
    cache.overrides.upsertedTeachers.push(teacher);
  }
  recomputeMergedRecords();
  await persistCurrentState();
}

export async function adminUpdateTeacher(updated: TeacherRecord): Promise<void> {
  await adminAddTeacher(updated);
}

export async function adminDeleteTeacher(teacherId: string): Promise<void> {
  await hydrateFromPersistentStore();
  cache.overrides.upsertedTeachers = cache.overrides.upsertedTeachers.filter(
    (t) => t.id !== teacherId
  );
  if (!cache.overrides.deletedTeacherIds.includes(teacherId)) {
    cache.overrides.deletedTeacherIds.push(teacherId);
  }
  recomputeMergedRecords();
  await persistCurrentState();
}

/**
 * Admin / Teacher Email Role CRUD (운영자 및 교사 계정 관리)
 */
export async function adminUpsertTeacherEmail(record: TeacherEmailRecord, previousEmail?: string): Promise<void> {
  await hydrateFromPersistentStore();
  const normEmail = record.email.toLowerCase().trim();
  const cleanRecord: TeacherEmailRecord = {
    email: normEmail,
    name: record.name.trim(),
    role: record.role,
  };

  if (previousEmail && previousEmail.toLowerCase().trim() !== normEmail) {
    const oldNorm = previousEmail.toLowerCase().trim();
    cache.overrides.upsertedTeacherEmails = cache.overrides.upsertedTeacherEmails.filter(
      (e) => e.email.toLowerCase().trim() !== oldNorm
    );
    if (!cache.overrides.deletedTeacherEmails.includes(oldNorm)) {
      cache.overrides.deletedTeacherEmails.push(oldNorm);
    }
  }

  cache.overrides.deletedTeacherEmails = cache.overrides.deletedTeacherEmails.filter(
    (e) => e.toLowerCase().trim() !== normEmail
  );

  const idx = cache.overrides.upsertedTeacherEmails.findIndex(
    (e) => e.email.toLowerCase().trim() === normEmail
  );
  if (idx >= 0) {
    cache.overrides.upsertedTeacherEmails[idx] = cleanRecord;
  } else {
    cache.overrides.upsertedTeacherEmails.push(cleanRecord);
  }

  recomputeMergedRecords();
  await persistCurrentState();
}

export async function adminDeleteTeacherEmail(email: string): Promise<void> {
  await hydrateFromPersistentStore();
  const normEmail = email.toLowerCase().trim();
  cache.overrides.upsertedTeacherEmails = cache.overrides.upsertedTeacherEmails.filter(
    (e) => e.email.toLowerCase().trim() !== normEmail
  );
  if (!cache.overrides.deletedTeacherEmails.includes(normEmail)) {
    cache.overrides.deletedTeacherEmails.push(normEmail);
  }
  recomputeMergedRecords();
  await persistCurrentState();
}

/**
 * Student & Parent Roster CRUD (학생 및 학부모 명부 관리)
 */
export async function adminUpsertStudent(student: StudentRecord): Promise<void> {
  await hydrateFromPersistentStore();
  cache.overrides.deletedStudentIds = cache.overrides.deletedStudentIds.filter(
    (id) => id !== student.id
  );
  const idx = cache.overrides.upsertedStudents.findIndex((s) => s.id === student.id);
  if (idx >= 0) {
    cache.overrides.upsertedStudents[idx] = student;
  } else {
    cache.overrides.upsertedStudents.push(student);
  }
  recomputeMergedRecords();
  await persistCurrentState();
}

export async function adminDeleteStudent(studentId: string): Promise<void> {
  await hydrateFromPersistentStore();
  cache.overrides.upsertedStudents = cache.overrides.upsertedStudents.filter(
    (s) => s.id !== studentId
  );
  if (!cache.overrides.deletedStudentIds.includes(studentId)) {
    cache.overrides.deletedStudentIds.push(studentId);
  }
  recomputeMergedRecords();
  await persistCurrentState();
}

/**
 * Promote all students by 1 grade:
 * M6 -> M7, M7 -> M8, M8 -> H9, H9 -> H10, H10 -> H11, H11 -> H12, H12 -> Graduated (Deleted)
 */
export async function adminPromoteStudents(): Promise<{
  promotedCount: number;
  graduatedCount: number;
}> {
  await syncSheetsData(false);

  const promotionMap: Record<string, string> = {
    M6: "M7",
    M7: "M8",
    M8: "H9",
    H9: "H10",
    H10: "H11",
    H11: "H12",
    // Also support G-prefixed variants if any exist
    G6: "M7",
    G7: "M8",
    G8: "H9",
    G9: "H10",
    G10: "H11",
    G11: "H12",
  };

  let promotedCount = 0;
  let graduatedCount = 0;

  const currentList = [...cache.students];
  const nextUpserted: StudentRecord[] = [];
  const nextDeletedSet = new Set<string>(cache.overrides.deletedStudentIds || []);

  for (const stu of currentList) {
    const cleanGrade = (stu.grade || "").trim().toUpperCase();
    if (cleanGrade === "H12" || cleanGrade === "G12") {
      // Graduated -> delete
      graduatedCount++;
      nextDeletedSet.add(stu.id);
    } else if (promotionMap[cleanGrade]) {
      promotedCount++;
      nextDeletedSet.delete(stu.id);
      nextUpserted.push({
        ...stu,
        grade: promotionMap[cleanGrade],
      });
    } else {
      // Keep unchanged
      nextDeletedSet.delete(stu.id);
      nextUpserted.push({ ...stu });
    }
  }

  cache.overrides.upsertedStudents = nextUpserted;
  cache.overrides.deletedStudentIds = Array.from(nextDeletedSet);
  recomputeMergedRecords();
  await persistCurrentState();

  return { promotedCount, graduatedCount };
}

/**
 * Bulk Upload Students from CSV (merge or replace mode)
 */
export async function adminBulkUploadStudents(
  records: Omit<StudentRecord, "id">[],
  mode: "merge" | "replace" = "merge"
): Promise<{ count: number }> {
  await syncSheetsData(false);

  if (mode === "replace") {
    const allDeleted = new Set<string>(cache.overrides.deletedStudentIds || []);
    for (const s of cache.baseStudents) {
      allDeleted.add(s.id);
    }
    for (const s of cache.students) {
      allDeleted.add(s.id);
    }
    cache.overrides.deletedStudentIds = Array.from(allDeleted);
    cache.overrides.upsertedStudents = records.map((r, i) => ({
      id: `stu_csv_${Date.now()}_${i}`,
      grade: (r.grade || "").trim(),
      studentNameKo: (r.studentNameKo || "").trim(),
      studentNameEn: (r.studentNameEn || "").trim(),
      parentFather: (r.parentFather || "").trim(),
      parentMother: (r.parentMother || "").trim(),
    }));
  } else {
    // Merge mode: update if matching grade + studentNameKo (or studentNameKo + studentNameEn), else insert
    const currentMap = new Map<string, StudentRecord>();
    for (const s of cache.students) {
      currentMap.set(s.id, { ...s });
    }

    let idx = 0;
    for (const r of records) {
      const g = (r.grade || "").trim();
      const ko = (r.studentNameKo || "").trim();
      const en = (r.studentNameEn || "").trim();
      if (!g || !ko) continue;

      const existing = Array.from(currentMap.values()).find(
        (s) =>
          s.studentNameKo.trim() === ko &&
          (s.grade.trim().toUpperCase() === g.toUpperCase() ||
            (en && s.studentNameEn.trim().toLowerCase() === en.toLowerCase()))
      );

      if (existing) {
        currentMap.set(existing.id, {
          ...existing,
          grade: g,
          studentNameKo: ko,
          studentNameEn: en || existing.studentNameEn,
          parentFather: (r.parentFather || "").trim() || existing.parentFather,
          parentMother: (r.parentMother || "").trim() || existing.parentMother,
        });
        cache.overrides.deletedStudentIds = cache.overrides.deletedStudentIds.filter(
          (id) => id !== existing.id
        );
      } else {
        const newId = `stu_csv_${Date.now()}_${idx++}`;
        currentMap.set(newId, {
          id: newId,
          grade: g,
          studentNameKo: ko,
          studentNameEn: en,
          parentFather: (r.parentFather || "").trim(),
          parentMother: (r.parentMother || "").trim(),
        });
      }
    }

    cache.overrides.upsertedStudents = Array.from(currentMap.values());
  }

  recomputeMergedRecords();
  await persistCurrentState();
  return { count: cache.students.length };
}

/**
 * Bulk Upload Admin / Teacher Account Emails from CSV (merge or replace mode)
 */
export async function adminBulkUploadTeacherEmails(
  records: TeacherEmailRecord[],
  mode: "merge" | "replace" = "merge"
): Promise<{ count: number }> {
  await syncSheetsData(false);

  if (mode === "replace") {
    const allDeleted = new Set<string>(cache.overrides.deletedTeacherEmails || []);
    for (const e of cache.baseTeacherEmails) {
      allDeleted.add(e.email.toLowerCase().trim());
    }
    for (const e of cache.teacherEmails) {
      allDeleted.add(e.email.toLowerCase().trim());
    }
    const cleanRecords: TeacherEmailRecord[] = [];
    for (const r of records) {
      const em = (r.email || "").toLowerCase().trim();
      const nm = (r.name || "").trim();
      if (!em || !nm) continue;
      allDeleted.delete(em);
      cleanRecords.push({
        email: em,
        name: nm,
        role: (r.role || "").includes("운영자") ? "운영자" : "교사",
      });
    }
    cache.overrides.deletedTeacherEmails = Array.from(allDeleted);
    cache.overrides.upsertedTeacherEmails = cleanRecords;
  } else {
    for (const r of records) {
      const em = (r.email || "").toLowerCase().trim();
      const nm = (r.name || "").trim();
      if (!em || !nm) continue;
      const role: "운영자" | "교사" = (r.role || "").includes("운영자") ? "운영자" : "교사";
      cache.overrides.deletedTeacherEmails = cache.overrides.deletedTeacherEmails.filter(
        (d) => d.toLowerCase().trim() !== em
      );
      const idx = cache.overrides.upsertedTeacherEmails.findIndex(
        (u) => u.email.toLowerCase().trim() === em
      );
      if (idx >= 0) {
        cache.overrides.upsertedTeacherEmails[idx] = { email: em, name: nm, role };
      } else {
        cache.overrides.upsertedTeacherEmails.push({ email: em, name: nm, role });
      }
    }
  }

  recomputeMergedRecords();
  await persistCurrentState();
  return { count: cache.teacherEmails.length };
}

/**
 * Bulk Upload Consultation Teachers & Options from CSV (merge or replace mode)
 */
export async function adminBulkUploadTeachers(
  records: Omit<TeacherRecord, "id">[],
  mode: "merge" | "replace" = "merge"
): Promise<{ count: number }> {
  await syncSheetsData(false);

  if (mode === "replace") {
    const allDeleted = new Set<string>(cache.overrides.deletedTeacherIds || []);
    for (const t of cache.baseTeachers) {
      allDeleted.add(t.id);
    }
    for (const t of cache.teachers) {
      allDeleted.add(t.id);
    }
    cache.overrides.deletedTeacherIds = Array.from(allDeleted);
    cache.overrides.upsertedTeachers = records
      .filter((r) => (r.nameEn || "").trim() || (r.nameKo || "").trim())
      .map((r, i) => ({
        id: `t_csv_${Date.now()}_${i}`,
        nameEn: (r.nameEn || "").trim(),
        nameKo: (r.nameKo || "").trim(),
        role: (r.role || "").trim(),
        options: (r.options || []).map((o) => o.trim()).filter(Boolean).slice(0, 8),
      }));
  } else {
    const currentMap = new Map<string, TeacherRecord>();
    for (const t of cache.teachers) {
      currentMap.set(t.id, { ...t });
    }

    let idx = 0;
    for (const r of records) {
      const en = (r.nameEn || "").trim();
      const ko = (r.nameKo || "").trim();
      if (!en && !ko) continue;

      const existing = Array.from(currentMap.values()).find(
        (t) =>
          (en && t.nameEn.trim().toLowerCase() === en.toLowerCase()) ||
          (ko && t.nameKo.trim() === ko)
      );

      const cleanOptions = (r.options || []).map((o) => o.trim()).filter(Boolean).slice(0, 8);

      if (existing) {
        currentMap.set(existing.id, {
          ...existing,
          nameEn: en || existing.nameEn,
          nameKo: ko || existing.nameKo,
          role: (r.role || "").trim() || existing.role,
          options: cleanOptions.length > 0 ? cleanOptions : existing.options,
        });
        cache.overrides.deletedTeacherIds = cache.overrides.deletedTeacherIds.filter(
          (id) => id !== existing.id
        );
      } else {
        const newId = `t_csv_${Date.now()}_${idx++}`;
        currentMap.set(newId, {
          id: newId,
          nameEn: en,
          nameKo: ko,
          role: (r.role || "").trim(),
          options: cleanOptions,
        });
      }
    }

    cache.overrides.upsertedTeachers = Array.from(currentMap.values());
  }

  recomputeMergedRecords();
  await persistCurrentState();
  return { count: cache.teachers.length };
}

/**
 * Blocked slots management for Admin
 */
export function getBlockedSlots(): BlockedSlotRecord[] {
  return cache.blockedSlots;
}

export async function addBlockedSlot(item: BlockedSlotRecord): Promise<void> {
  await hydrateFromPersistentStore();
  cache.blockedSlots.push(item);
  await persistCurrentState();
}

export async function deleteBlockedSlot(id: string): Promise<void> {
  await hydrateFromPersistentStore();
  cache.blockedSlots = cache.blockedSlots.filter((b) => b.id !== id);
  await persistCurrentState();
}

export function isSlotBlocked(teacherName: string, timeSlot: string, date: string): boolean {
  return cache.blockedSlots.some((b) => {
    const teacherMatches =
      b.teacherName === "ALL" ||
      b.teacherName.trim().toLowerCase() === teacherName.trim().toLowerCase();
    const dateMatches =
      b.date === "ALL" || b.date.trim().toLowerCase() === date.trim().toLowerCase();
    const timeMatches =
      b.timeSlot === "ALL" || b.timeSlot.trim().toLowerCase() === timeSlot.trim().toLowerCase();
    return teacherMatches && dateMatches && timeMatches;
  });
}

