import { NextRequest, NextResponse } from "next/server";
import { getConfig, updateConfig } from "@/lib/config";
import {
  adminAddTeacher,
  adminDeleteTeacher,
  adminUpdateTeacher,
  adminUpsertTeacherEmail,
  adminDeleteTeacherEmail,
  adminUpsertStudent,
  adminDeleteStudent,
  adminPromoteStudents,
  adminBulkUploadStudents,
  adminBulkUploadTeacherEmails,
  adminBulkUploadTeachers,
  addBlockedSlot,
  deleteBlockedSlot,
  persistCurrentState,
  syncSheetsData,
  TeacherRecord,
  TeacherEmailRecord,
  StudentRecord,
} from "@/lib/sheets";
import {
  getSupabaseStatus,
  setSupabaseCredentials,
  loadPersistentState,
} from "@/lib/persistence";

export const dynamic = "force-dynamic";

export async function GET() {
  await syncSheetsData(false);
  return NextResponse.json({
    success: true,
    config: getConfig(),
    supabaseStatus: getSupabaseStatus(),
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, configData, teacherData, teacherId } = body;

    if (action === "UPDATE_CONFIG") {
      const updated = updateConfig(configData);
      await persistCurrentState();
      await syncSheetsData(true);
      return NextResponse.json({ success: true, config: updated });
    }

    if (action === "UPDATE_SUPABASE_CONFIG") {
      const { supabaseUrl, supabaseAnonKey } = body;
      setSupabaseCredentials(supabaseUrl || "", supabaseAnonKey || "");
      await loadPersistentState();
      await persistCurrentState();
      return NextResponse.json({
        success: true,
        supabaseStatus: getSupabaseStatus(),
      });
    }

    if (action === "ADD_TEACHER") {
      const newTeacher: TeacherRecord = {
        id: `t_custom_${Date.now()}`,
        nameEn: teacherData.nameEn || "",
        nameKo: teacherData.nameKo || "",
        role: teacherData.role || "",
        options: teacherData.options || [],
      };
      await adminAddTeacher(newTeacher);
      return NextResponse.json({ success: true, teacher: newTeacher });
    }

    if (action === "UPDATE_TEACHER") {
      await adminUpdateTeacher(teacherData);
      return NextResponse.json({ success: true, teacher: teacherData });
    }

    if (action === "DELETE_TEACHER") {
      await adminDeleteTeacher(teacherId);
      return NextResponse.json({ success: true, teacherId });
    }

    if (action === "BULK_UPLOAD_TEACHERS") {
      const { records, mode } = body;
      if (!Array.isArray(records) || records.length === 0) {
        return NextResponse.json(
          { success: false, error: "업로드할 상담 교사 데이터가 없습니다." },
          { status: 400 }
        );
      }
      const result = await adminBulkUploadTeachers(records, mode || "merge");
      return NextResponse.json({
        success: true,
        count: result.count,
        message: `상담 교사 CSV 일괄 업로드가 완료되었습니다. (총 ${result.count}명)`,
      });
    }

    // --- Admin & Teacher Account Email Management (운영자 및 교사 계정 관리) ---
    if (action === "UPSERT_USER_ROLE") {
      const { userRoleData, previousEmail } = body;
      const record: TeacherEmailRecord = {
        email: (userRoleData.email || "").toLowerCase().trim(),
        name: (userRoleData.name || "").trim(),
        role: userRoleData.role === "운영자" ? "운영자" : "교사",
      };
      if (!record.email || !record.name) {
        return NextResponse.json(
          { success: false, error: "이메일과 성명을 모두 입력해 주세요." },
          { status: 400 }
        );
      }
      await adminUpsertTeacherEmail(record, previousEmail);
      return NextResponse.json({ success: true, userRole: record });
    }

    if (action === "DELETE_USER_ROLE") {
      const { email } = body;
      if (!email) {
        return NextResponse.json(
          { success: false, error: "삭제할 이메일이 필요합니다." },
          { status: 400 }
        );
      }
      await adminDeleteTeacherEmail(email);
      return NextResponse.json({ success: true, email });
    }

    if (action === "BULK_UPLOAD_USER_ROLES") {
      const { records, mode } = body;
      if (!Array.isArray(records) || records.length === 0) {
        return NextResponse.json(
          { success: false, error: "업로드할 계정 데이터가 없습니다." },
          { status: 400 }
        );
      }
      const result = await adminBulkUploadTeacherEmails(records, mode || "merge");
      return NextResponse.json({
        success: true,
        count: result.count,
        message: `운영자/교사 계정 CSV 일괄 업로드가 완료되었습니다. (총 ${result.count}명)`,
      });
    }

    // --- Student & Parent Roster Management (학생 및 학부모 명부 관리) ---
    if (action === "UPSERT_STUDENT") {
      const { studentData } = body;
      const record: StudentRecord = {
        id: studentData.id || `stu_custom_${Date.now()}`,
        grade: (studentData.grade || "").trim(),
        studentNameKo: (studentData.studentNameKo || "").trim(),
        studentNameEn: (studentData.studentNameEn || "").trim(),
        parentFather: (studentData.parentFather || "").trim(),
        parentMother: (studentData.parentMother || "").trim(),
      };
      if (!record.grade || !record.studentNameKo) {
        return NextResponse.json(
          { success: false, error: "학년과 학생 한글 성명은 필수 입력 항목입니다." },
          { status: 400 }
        );
      }
      await adminUpsertStudent(record);
      return NextResponse.json({ success: true, student: record });
    }

    if (action === "DELETE_STUDENT") {
      const { studentId } = body;
      if (!studentId) {
        return NextResponse.json(
          { success: false, error: "삭제할 학생 ID가 필요합니다." },
          { status: 400 }
        );
      }
      await adminDeleteStudent(studentId);
      return NextResponse.json({ success: true, studentId });
    }

    if (action === "PROMOTE_STUDENTS") {
      const result = await adminPromoteStudents();
      return NextResponse.json({
        success: true,
        promotedCount: result.promotedCount,
        graduatedCount: result.graduatedCount,
        message: `진급 처리가 완료되었습니다! (진급: ${result.promotedCount}명, H12 졸업 삭제: ${result.graduatedCount}명)`,
      });
    }

    if (action === "BULK_UPLOAD_STUDENTS") {
      const { records, mode } = body;
      if (!Array.isArray(records) || records.length === 0) {
        return NextResponse.json(
          { success: false, error: "업로드할 학생/학부모 데이터가 없습니다." },
          { status: 400 }
        );
      }
      const result = await adminBulkUploadStudents(records, mode || "merge");
      return NextResponse.json({
        success: true,
        count: result.count,
        message: `학생 및 학부모 명부 CSV 일괄 업로드가 완료되었습니다. (총 ${result.count}명)`,
      });
    }

    // --- Blocked Slots Management ---
    if (action === "ADD_BLOCKED_SLOT") {
      const { blockData } = body;
      const newBlocked = {
        id: `blk_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        teacherName: blockData.teacherName || "ALL",
        date: blockData.date || "ALL",
        timeSlot: blockData.timeSlot || "ALL",
        reason: blockData.reason || "학교 운영상 상담 불가",
        createdAt: new Date().toISOString(),
      };
      await addBlockedSlot(newBlocked);
      return NextResponse.json({ success: true, blockedSlot: newBlocked });
    }

    if (action === "DELETE_BLOCKED_SLOT") {
      const { blockId } = body;
      await deleteBlockedSlot(blockId);
      return NextResponse.json({ success: true, blockId });
    }

    return NextResponse.json({ success: false, error: "유효하지 않은 요청입니다." }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "운영자 설정 저장 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
