import { NextRequest, NextResponse } from "next/server";
import {
  getReservations,
  addMultipleReservations,
  updateReservationStatus,
  deleteReservationById,
  clearAllReservations,
  getReservationByToken,
  hydrateFromPersistentStore,
  isSlotBlocked,
  ReservationRecord,
} from "@/lib/sheets";
import { slotLockManager } from "@/lib/lock";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  await hydrateFromPersistentStore();
  const token = req.nextUrl.searchParams.get("token");
  if (token) {
    const item = getReservationByToken(token);
    if (!item) {
      return NextResponse.json(
        { success: false, error: "해당 예약 확인증을 찾을 수 없습니다." },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true, reservation: item });
  }

  const reservations = getReservations();
  return NextResponse.json({ success: true, reservations });
}

export async function POST(req: NextRequest) {
  try {
    await hydrateFromPersistentStore();
    const body = await req.json();

    // Support admin actions via POST as well (e.g., CLEAR_ALL, CANCEL_ONE)
    if (body.action === "CLEAR_ALL") {
      const removedCount = await clearAllReservations();
      return NextResponse.json({
        success: true,
        message: `전체 예약 내역(${removedCount}건)이 모두 초기화되었습니다.`,
        removedCount,
      });
    }

    if (body.action === "CANCEL_ONE" && body.id) {
      const deleted = await deleteReservationById(body.id);
      return NextResponse.json({
        success: deleted,
        message: deleted ? "해당 상담 예약이 취소(삭제)되었습니다." : "예약 내역을 찾을 수 없습니다.",
      });
    }

    const {
      email,
      studentGrade,
      studentName,
      parentName,
      bookings, // Array of { teacherName, option, timeSlot, date }
    } = body;

    if (!studentName || !parentName || !bookings || !Array.isArray(bookings)) {
      return NextResponse.json(
        { success: false, error: "필수 예약 정보(학생명, 학부모 성함, 선택 시간)가 누락되었습니다." },
        { status: 400 }
      );
    }

    if (bookings.length > 4) {
      return NextResponse.json(
        { success: false, error: "학생 1인당 최대 4개 상담교과까지만 예약할 수 있습니다." },
        { status: 400 }
      );
    }

    const userId = `${email || parentName}_${Date.now()}`;
    const acquiredLocks: { teacherName: string; timeSlot: string; date: string }[] = [];

    const existingReservations = getReservations().filter((r) => r.status === "CONFIRMED");

    // Student-level total quota check: ensure total confirmed reservations for this student + new bookings <= 4
    const studentConfirmedCount = existingReservations.filter(
      (r) =>
        r.studentName.trim().toLowerCase() === studentName.trim().toLowerCase() &&
        r.studentGrade.trim().toLowerCase() === studentGrade.trim().toLowerCase()
    ).length;

    if (studentConfirmedCount + bookings.length > 4) {
      const remainingQuota = Math.max(0, 4 - studentConfirmedCount);
      return NextResponse.json(
        {
          success: false,
          error: `해당 학생(${studentName})은 이미 ${studentConfirmedCount}개의 상담이 예약되어 있어, 추가로 최대 ${remainingQuota}개까지만 예약 가능합니다. (학생 1인당 총 상담 4개 제한)`,
          studentConfirmedCount,
          remainingQuota,
        },
        { status: 400 }
      );
    }

    for (const b of bookings) {
      // Check if slot is blocked by Admin
      if (isSlotBlocked(b.teacherName, b.timeSlot, b.date)) {
        for (const lock of acquiredLocks) {
          slotLockManager.releaseLock(lock.teacherName, lock.timeSlot, lock.date, userId);
        }
        return NextResponse.json(
          {
            success: false,
            error: `선택하신 ${b.teacherName} 선생님의 ${b.date} ${b.timeSlot} 시간은 학교 운영 정책상 상담이 제한된 시간입니다. 다른 시간을 선택해 주세요.`,
            blockedSlot: b,
          },
          { status: 400 }
        );
      }

      // Check if slot is already confirmed in DB
      const alreadyBooked = existingReservations.some(
        (r) =>
          r.teacherName.trim() === b.teacherName.trim() &&
          r.timeSlot.trim() === b.timeSlot.trim() &&
          r.date.trim() === b.date.trim()
      );

      if (alreadyBooked) {
        // Release any locks acquired so far
        for (const lock of acquiredLocks) {
          slotLockManager.releaseLock(lock.teacherName, lock.timeSlot, lock.date, userId);
        }
        return NextResponse.json(
          {
            success: false,
            error: `선택하신 ${b.teacherName} 선생님의 ${b.date} ${b.timeSlot} 상담 시간은 방금 다른 학부모님께서 먼저 예약하셨습니다. 다른 시간대를 선택해 주세요.`,
            conflictSlot: b,
          },
          { status: 409 }
        );
      }

      // Try acquiring lock
      const lockSuccess = slotLockManager.acquireLock(b.teacherName, b.timeSlot, b.date, userId);
      if (!lockSuccess) {
        for (const lock of acquiredLocks) {
          slotLockManager.releaseLock(lock.teacherName, lock.timeSlot, lock.date, userId);
        }
        return NextResponse.json(
          {
            success: false,
            error: `선택하신 ${b.teacherName} 선생님의 ${b.date} ${b.timeSlot} 상담 시간은 현재 다른 학부모님께서 예약 진행 중입니다. 다른 시간대를 선택해 주세요.`,
            conflictSlot: b,
          },
          { status: 409 }
        );
      }
      acquiredLocks.push(b);
    }

    // Step 2: Commit Bookings
    const timestamp = new Date().toISOString();
    const createdTokens: string[] = [];
    const createdRecords: ReservationRecord[] = [];

    for (const b of bookings) {
      const uniqueToken = `PTC-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      const record: ReservationRecord = {
        id: `res_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        timestamp,
        email: email || "",
        studentGrade,
        studentName,
        parentName,
        teacherName: b.teacherName,
        option: b.option,
        timeSlot: b.timeSlot,
        date: b.date,
        status: "CONFIRMED",
        uniqueToken,
      };

      createdRecords.push(record);
      createdTokens.push(uniqueToken);
    }

    await addMultipleReservations(createdRecords);

    // Release temporary locks after committing
    for (const lock of acquiredLocks) {
      slotLockManager.releaseLock(lock.teacherName, lock.timeSlot, lock.date, userId);
    }

    return NextResponse.json({
      success: true,
      message: "상담 예약이 정상적으로 확정되었습니다.",
      reservations: createdRecords,
      masterToken: createdTokens[0], // Primary token for the slip view
    });
  } catch (error: any) {
    console.error("Booking error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "예약 처리 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    if (body.clearAll) {
      const count = await clearAllReservations();
      return NextResponse.json({ success: true, removedCount: count });
    }
    const { id } = body;
    if (!id) {
      return NextResponse.json({ success: false, error: "예약 ID가 필요합니다." }, { status: 400 });
    }
    const success = await deleteReservationById(id);
    if (!success) {
      const updated = await updateReservationStatus(id, "CANCELLED");
      return NextResponse.json({ success: updated });
    }
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
