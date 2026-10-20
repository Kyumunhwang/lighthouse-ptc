/**
 * Teacher Name Matching & Normalization Engine (lib/teacher-matcher.ts)
 * 
 * Provides collision-free, exact-token matching between Teacher records and
 * reservation/blocked-slot teacher names.
 * Strictly prevents partial substring collisions (e.g. "Lee" matching "Michelle Lee",
 * "Kim" matching "Daniel Kim", "Dan" matching "Daniel").
 */

export interface BasicTeacherProfile {
  id?: string;
  nameEn?: string;
  nameKo?: string;
  role?: string;
}

export const KNOWN_TEACHER_ALIASES: Record<string, string[]> = {
  "피터": ["peter yoo", "유찬호"],
  "유찬호": ["peter yoo", "피터"],
  "다니엘": ["daniel kim", "다니엘"],
  "유미연": ["monica yu"],
  "이나라": ["nara lee"],
  "이재원": ["jaewon lee", "jae lee", "jae"],
  "재이": ["jae lee", "jae", "jaewon lee"],
  "김혜정": ["hyejeong kim", "hyejung kim"],
  "박진희": ["jinhee park", "christine park"],
  "최규성": ["kyuseong choi"],
  "류한나": ["hanna ryu", "hannah ryu"],
  "심재희": ["jaehee shim"],
  "이은실": ["eunsil lee"],
  "노희진": ["heejin roh", "heejin noh"],
  "오선민": ["sunmin oh", "seonmin oh"],
  "김에스더": ["esther kim"],
  "이주은": ["jueun lee", "jooeun lee"],
  "정다움": ["daum jung", "daum jeong"],
  "나경식": ["david nah"],
  "강소라": ["sora kang"],
  "곽혜미": ["hyemi kwak"],
  "박예진": ["jinny park"],
  "평상규": ["danny pyung"],
  "이영은": ["michelle lee"],
};

/**
 * Normalizes a teacher name by removing honorifics (Mr., Ms., Dr.), titles (선생님, 교사),
 * and parenthetical qualifiers (e.g. "(영어로 상담 진행)").
 */
export function normalizeTeacherNameToken(name: string): string {
  if (!name) return "";
  return name
    .replace(/\(.*?\)/g, "")
    .replace(/^(mr\.?|ms\.?|mrs\.?|miss\.?|dr\.?|prof\.?)\s+/i, "")
    .replace(/\s*(선생님|교사)\s*$/g, "")
    .trim()
    .toLowerCase();
}

/**
 * Robust, collision-free matcher between a teacher profile and a target teacher name string.
 * Strictly prevents substring overlap collisions (e.g., "Lee" mistakenly matching "Michelle Lee").
 */
export function isTeacherMatch(
  teacher: BasicTeacherProfile | undefined,
  targetTeacherName: string | undefined
): boolean {
  if (!teacher || !targetTeacherName) return false;

  const rawTarget = targetTeacherName.trim();
  if (!rawTarget) return false;

  const rawEn = (teacher.nameEn || "").trim();
  const rawKo = (teacher.nameKo || "").trim();

  // 1. Direct exact match (case-insensitive)
  const lowerTarget = rawTarget.toLowerCase();
  if (rawEn && rawEn.toLowerCase() === lowerTarget) return true;
  if (rawKo && rawKo.toLowerCase() === lowerTarget) return true;

  // 2. Normalized token match (exact equality after honorific stripping)
  const targetClean = normalizeTeacherNameToken(rawTarget);
  const enClean = normalizeTeacherNameToken(rawEn);
  const koClean = normalizeTeacherNameToken(rawKo);

  if (targetClean && enClean && targetClean === enClean) return true;
  if (targetClean && koClean && targetClean === koClean) return true;

  // 3. Known Korean <-> English aliases exact match
  const aliasesForTarget = KNOWN_TEACHER_ALIASES[targetClean] || [];
  if (aliasesForTarget.some((a) => a === enClean || a === koClean)) return true;

  const aliasesForKo = KNOWN_TEACHER_ALIASES[koClean] || [];
  if (aliasesForKo.some((a) => a === targetClean)) return true;

  const aliasesForEn = KNOWN_TEACHER_ALIASES[enClean] || [];
  if (aliasesForEn.some((a) => a === targetClean)) return true;

  return false;
}
