// OCR confidence threshold used by the OCR Requests page (original default 0.95).
export const OCR_THRESHOLD_FALLBACK = 0.95;
export function useOcrThreshold(): number {
  return OCR_THRESHOLD_FALLBACK;
}
