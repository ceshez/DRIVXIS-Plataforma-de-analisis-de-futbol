export const ANALYSIS_CANCELLED_BY_USER = "ANALYSIS_CANCELLED_BY_USER";

export function isAnalysisCancelled(error: string | null | undefined) {
  return error === ANALYSIS_CANCELLED_BY_USER;
}
