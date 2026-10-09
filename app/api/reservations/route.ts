import { NextRequest, NextResponse } from "next/server";
import {
  getReservations,
  addReservation,
  updateReservationStatus,
  getReservationByToken,
  isSlotBlocked,
  ReservationRecord,
} from "@/lib/sheets";
import { slotLockManager } from "@/lib/lock";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (token) {
    const item = getReservationByToken(token);
    if (!item) {
      return NextResponse.json(
        { success: false, error: "Reservation not found" },
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
    const body = await req.json();
    const {
      email,
      studentGrade,
      studentName,
      parentName,
      bookings, // Array of { teacherName, option, timeSlot, date }
    } = body;

    if (!studentName || !parentName || !bookings || !Array.isArray(bookings)) {
      return NextResponse.json(
        { success: false, error: "Missing required booking details" },
        { status: 400 }
      );
    }

    if (bookings.length > 4) {
      return NextResponse.json(
        { success: false, error: "Maximum 4 booking slots allowed per student" },
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
            error: `Slot for ${b.teacherName} at ${b.timeSlot} (${b.date}) has just been reserved by another parent. Please choose another time.`,
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
            error: `Slot for ${b.teacherName} at ${b.timeSlot} (${b.date}) is currently being selected by another user. Please choose another time.`,
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

      addReservation(record);
      createdRecords.push(record);
      createdTokens.push(uniqueToken);
    }

    // Release temporary locks after committing
    for (const lock of acquiredLocks) {
      slotLockManager.releaseLock(lock.teacherName, lock.timeSlot, lock.date, userId);
    }

    return NextResponse.json({
      success: true,
      message: "Reservations confirmed successfully",
      reservations: createdRecords,
      masterToken: createdTokens[0], // Primary token for the slip view
    });
  } catch (error: any) {
    console.error("Booking error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to process booking" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json();
    if (!id) {
      return NextResponse.json({ success: false, error: "ID required" }, { status: 400 });
    }
    const success = updateReservationStatus(id, "CANCELLED");
    return NextResponse.json({ success });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
