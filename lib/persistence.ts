/**
 * Persistent Storage & Supabase Adapter (lib/persistence.ts)
 *
 * Provides dual-layer persistence:
 * 1. Primary Cloud DB: Supabase REST API (`ptc_state` table with JSONB payload)
 *    - Works across all devices, browsers, days, and Vercel serverless cold starts.
 *    - Supports credentials via Environment Variables (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
 *      or runtime Admin Console configuration.
 * 2. Local File Fallback: `data/ptc-store.json` (or `/tmp/ptc-store.json` in serverless environments)
 *    - Ensures immediate local persistence even before Supabase credentials are entered.
 */

import fs from "fs";
import path from "path";
import { AppConfig } from "./config";
import {
  ReservationRecord,
  BlockedSlotRecord,
  TeacherRecord,
  TeacherEmailRecord,
  StudentRecord,
} from "./sheets";

export interface PersistentOverrides {
  // Custom or modified teachers
  upsertedTeachers: TeacherRecord[];
  deletedTeacherIds: string[];

  // Custom or modified admin/teacher emails
  upsertedTeacherEmails: TeacherEmailRecord[];
  deletedTeacherEmails: string[]; // lowercased email strings

  // Custom or modified students/parents
  upsertedStudents: StudentRecord[];
  deletedStudentIds: string[];
}

export interface PersistentStorePayload {
  config?: Partial<AppConfig>;
  reservations: ReservationRecord[];
  blockedSlots: BlockedSlotRecord[];
  overrides: PersistentOverrides;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  updatedAt: string;
}

const DEFAULT_OVERRIDES: PersistentOverrides = {
  upsertedTeachers: [],
  deletedTeacherIds: [],
  upsertedTeacherEmails: [],
  deletedTeacherEmails: [],
  upsertedStudents: [],
  deletedStudentIds: [],
};

const DEFAULT_PAYLOAD: PersistentStorePayload = {
  reservations: [],
  blockedSlots: [],
  overrides: { ...DEFAULT_OVERRIDES },
  updatedAt: new Date().toISOString(),
};

// Runtime Supabase connection cache
let runtimeSupabaseUrl: string = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
let runtimeSupabaseKey: string = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "";

/**
 * Resolve writable local file path for fallback persistence
 */
function getLocalStorePath(): string {
  try {
    const dataDir = path.join(process.cwd(), "data");
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    return path.join(dataDir, "ptc-store.json");
  } catch {
    // Fallback to /tmp in read-only serverless environments (like Vercel)
    return path.join("/tmp", "ptc-store.json");
  }
}

/**
 * Read local JSON store
 */
export function readLocalStore(): PersistentStorePayload {
  try {
    const filePath = getLocalStorePath();
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(raw);
      if (parsed.supabaseUrl && !runtimeSupabaseUrl) {
        runtimeSupabaseUrl = parsed.supabaseUrl;
      }
      if (parsed.supabaseAnonKey && !runtimeSupabaseKey) {
        runtimeSupabaseKey = parsed.supabaseAnonKey;
      }
      return {
        ...DEFAULT_PAYLOAD,
        ...parsed,
        overrides: {
          ...DEFAULT_OVERRIDES,
          ...(parsed.overrides || {}),
        },
      };
    }
  } catch (err) {
    console.warn("Warning: Could not read local store:", err);
  }
  return {
    ...DEFAULT_PAYLOAD,
    overrides: { ...DEFAULT_OVERRIDES },
  };
}

/**
 * Write local JSON store
 */
export function writeLocalStore(payload: PersistentStorePayload): void {
  try {
    const filePath = getLocalStorePath();
    const toSave: PersistentStorePayload = {
      ...payload,
      supabaseUrl: runtimeSupabaseUrl || payload.supabaseUrl,
      supabaseAnonKey: runtimeSupabaseKey || payload.supabaseAnonKey,
      updatedAt: new Date().toISOString(),
    };
    fs.writeFileSync(filePath, JSON.stringify(toSave, null, 2), "utf-8");
  } catch (err) {
    console.warn("Warning: Could not write local store:", err);
  }
}

/**
 * Configure Supabase credentials dynamically from Admin Console
 */
export function setSupabaseCredentials(url: string, anonKey: string): void {
  runtimeSupabaseUrl = url.trim().replace(/\/+$/, "");
  runtimeSupabaseKey = anonKey.trim();
}

/**
 * Get current Supabase connection status & masked info
 */
export function getSupabaseStatus(): {
  connected: boolean;
  supabaseUrl: string;
  hasAnonKey: boolean;
  source: "env" | "runtime" | "none";
} {
  // Ensure local store is checked if runtime vars are empty
  if (!runtimeSupabaseUrl || !runtimeSupabaseKey) {
    readLocalStore();
  }
  const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const envKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "";

  if (envUrl && envKey) {
    return {
      connected: true,
      supabaseUrl: envUrl,
      hasAnonKey: true,
      source: "env",
    };
  }
  if (runtimeSupabaseUrl && runtimeSupabaseKey) {
    return {
      connected: true,
      supabaseUrl: runtimeSupabaseUrl,
      hasAnonKey: true,
      source: "runtime",
    };
  }
  return {
    connected: false,
    supabaseUrl: "",
    hasAnonKey: false,
    source: "none",
  };
}

/**
 * Load state from Supabase REST API (`ptc_state` table, row id = 'default')
 * Falls back to local JSON store if Supabase is not configured or unreachable.
 */
export async function loadPersistentState(): Promise<PersistentStorePayload> {
  const localData = readLocalStore();
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || runtimeSupabaseUrl || "").replace(/\/+$/, "");
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || runtimeSupabaseKey || "";

  if (!url || !key) {
    return localData;
  }

  try {
    const endpoint = `${url}/rest/v1/ptc_state?id=eq.default&select=payload,updated_at`;
    const resp = await fetch(endpoint, {
      method: "GET",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    if (resp.ok) {
      const rows = await resp.json();
      if (Array.isArray(rows) && rows.length > 0 && rows[0].payload) {
        const remotePayload = rows[0].payload as Partial<PersistentStorePayload>;
        // Check if remote payload actually has initialized content
        if (
          remotePayload.reservations ||
          remotePayload.blockedSlots ||
          remotePayload.overrides ||
          remotePayload.config
        ) {
          const merged: PersistentStorePayload = {
            config: remotePayload.config || localData.config,
            reservations: Array.isArray(remotePayload.reservations)
              ? remotePayload.reservations
              : localData.reservations,
            blockedSlots: Array.isArray(remotePayload.blockedSlots)
              ? remotePayload.blockedSlots
              : localData.blockedSlots,
            overrides: {
              ...DEFAULT_OVERRIDES,
              ...(localData.overrides || {}),
              ...(remotePayload.overrides || {}),
            },
            supabaseUrl: url,
            supabaseAnonKey: key,
            updatedAt: rows[0].updated_at || new Date().toISOString(),
          };
          writeLocalStore(merged);
          return merged;
        }
      }
    }
  } catch (err) {
    console.warn("Supabase fetch warning (falling back to local store):", err);
  }

  return localData;
}

/**
 * Save state to both Local JSON Store and Supabase REST API (`ptc_state` table)
 */
export async function savePersistentState(payload: PersistentStorePayload): Promise<boolean> {
  writeLocalStore(payload);

  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || runtimeSupabaseUrl || "").replace(/\/+$/, "");
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || runtimeSupabaseKey || "";

  if (!url || !key) {
    return false;
  }

  try {
    const endpoint = `${url}/rest/v1/ptc_state`;
    // Do not store raw supabaseAnonKey inside remote DB JSONB payload for security
    const cleanRemotePayload: PersistentStorePayload = {
      config: payload.config,
      reservations: payload.reservations,
      blockedSlots: payload.blockedSlots,
      overrides: payload.overrides,
      updatedAt: new Date().toISOString(),
    };

    const resp = await fetch(endpoint, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({
        id: "default",
        payload: cleanRemotePayload,
        updated_at: new Date().toISOString(),
      }),
      cache: "no-store",
    });

    return resp.ok;
  } catch (err) {
    console.warn("Supabase save warning:", err);
    return false;
  }
}
