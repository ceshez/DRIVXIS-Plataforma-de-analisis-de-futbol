export type StorageUsagePayload = {
  usedBytes: string;
  limitBytes: string;
  remainingBytes: string;
  percentUsed: number;
};

export function buildStorageUsagePayload(usedBytes: bigint, limitBytes: bigint): StorageUsagePayload {
  const safeLimit = limitBytes > 0n ? limitBytes : 1n;
  const safeUsed = usedBytes < 0n ? 0n : usedBytes;
  const remainingBytes = safeLimit > safeUsed ? safeLimit - safeUsed : 0n;
  const percentRaw = Number((safeUsed * 10000n) / safeLimit) / 100;
  const percentUsed = Math.max(0, Math.min(100, Number.isFinite(percentRaw) ? percentRaw : 0));

  return {
    usedBytes: safeUsed.toString(),
    limitBytes: safeLimit.toString(),
    remainingBytes: remainingBytes.toString(),
    percentUsed,
  };
}

export function clampStorageUsed(usedBytes: bigint, deltaBytes: bigint) {
  const next = usedBytes + deltaBytes;
  return next < 0n ? 0n : next;
}
