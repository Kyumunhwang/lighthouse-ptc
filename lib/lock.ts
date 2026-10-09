/**
 * In-memory concurrency lock manager (Pessimistic Locking)
 * Prevents double booking on the same teacher + time slot.
 */

interface LockEntry {
  lockedAt: number;
  userId: string;
}

class SlotLockManager {
  private locks: Map<string, LockEntry> = new Map();
  private readonly LOCK_TIMEOUT_MS = 15000; // 15 seconds lock duration during booking action

  private makeKey(teacherName: string, timeSlot: string, date: string): string {
    return `${teacherName.trim()}:::${timeSlot.trim()}:::${date.trim()}`;
  }

  /**
   * Attempts to acquire lock for a slot
   */
  public acquireLock(teacherName: string, timeSlot: string, date: string, userId: string): boolean {
    const key = this.makeKey(teacherName, timeSlot, date);
    const now = Date.now();
    const existing = this.locks.get(key);

    if (existing && now - existing.lockedAt < this.LOCK_TIMEOUT_MS && existing.userId !== userId) {
      // Slot is currently locked by another user
      return false;
    }

    this.locks.set(key, { lockedAt: now, userId });
    return true;
  }

  /**
   * Release lock for a slot
   */
  public releaseLock(teacherName: string, timeSlot: string, date: string, userId: string): void {
    const key = this.makeKey(teacherName, timeSlot, date);
    const existing = this.locks.get(key);
    if (existing && existing.userId === userId) {
      this.locks.delete(key);
    }
  }

  /**
   * Checks if slot is currently being processed by someone else
   */
  public isLocked(teacherName: string, timeSlot: string, date: string, excludeUserId?: string): boolean {
    const key = this.makeKey(teacherName, timeSlot, date);
    const existing = this.locks.get(key);
    if (!existing) return false;

    if (Date.now() - existing.lockedAt >= this.LOCK_TIMEOUT_MS) {
      this.locks.delete(key);
      return false;
    }

    if (excludeUserId && existing.userId === excludeUserId) {
      return false;
    }

    return true;
  }
}

// Singleton lock manager
export const slotLockManager = new SlotLockManager();
