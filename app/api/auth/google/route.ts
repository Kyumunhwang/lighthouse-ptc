import { NextRequest, NextResponse } from "next/server";
import { syncSheetsData, matchTeacherRecord } from "@/lib/sheets";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, name } = body;

    if (!email || !email.trim()) {
      return NextResponse.json(
        { success: false, error: "이메일 주소를 먼저 입력해 주세요." },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();
    const { teacherEmails, teachers } = await syncSheetsData();

    // Check if user is in teacher_email list (Admin or Teacher)
    const teacherMatch = teacherEmails.find(
      (t) => t.email.toLowerCase().trim() === normalizedEmail
    );

    let role: "운영자" | "교사" | "학부모" = "학부모";
    let matchedTeacherName: string | undefined = undefined;

    if (teacherMatch) {
      role = teacherMatch.role;
      matchedTeacherName = teacherMatch.name;
    }

    // If teacher role, find corresponding teacher schedule entry using robust matcher
    let teacherProfile = undefined;
    if (role === "교사") {
      teacherProfile = matchTeacherRecord(
        matchedTeacherName || name || "",
        teachers,
        normalizedEmail
      );
    }

    return NextResponse.json({
      success: true,
      user: {
        email: normalizedEmail,
        name: teacherProfile?.nameEn || matchedTeacherName || name || normalizedEmail.split("@")[0],
        displayNameKo: teacherProfile?.nameKo || matchedTeacherName || "",
        role,
        teacherProfile: teacherProfile || null,
      },
    });
  } catch (error: any) {
    console.error("Auth API error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "로그인 인증 처리 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
