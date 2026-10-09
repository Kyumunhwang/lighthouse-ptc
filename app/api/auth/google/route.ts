import { NextRequest, NextResponse } from "next/server";
import { syncSheetsData } from "@/lib/sheets";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, name, roleOverride } = body;

    if (!email) {
      return NextResponse.json(
        { success: false, error: "Email is required" },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();
    const { teacherEmails, teachers } = await syncSheetsData();

    // Check if user is in teacher_email sheet
    const teacherMatch = teacherEmails.find(
      (t) => t.email.toLowerCase().trim() === normalizedEmail
    );

    let role: "운영자" | "교사" | "학부모" = "학부모";
    let matchedTeacherName: string | undefined = undefined;

    if (roleOverride && ["운영자", "교사", "학부모"].includes(roleOverride)) {
      role = roleOverride;
    } else if (teacherMatch) {
      role = teacherMatch.role;
      matchedTeacherName = teacherMatch.name;
    }

    // If teacher role, verify corresponding teacher schedule entry
    let teacherProfile = undefined;
    if (role === "교사" && matchedTeacherName) {
      teacherProfile = teachers.find(
        (t) =>
          t.nameKo.includes(matchedTeacherName!) ||
          matchedTeacherName!.includes(t.nameKo) ||
          t.nameEn.toLowerCase().includes(matchedTeacherName!.toLowerCase())
      );
    }

    return NextResponse.json({
      success: true,
      user: {
        email: normalizedEmail,
        name: name || teacherMatch?.name || "Parent User",
        role,
        teacherProfile: teacherProfile || null,
      },
    });
  } catch (error: any) {
    console.error("Auth API error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Authentication failed" },
      { status: 500 }
    );
  }
}
