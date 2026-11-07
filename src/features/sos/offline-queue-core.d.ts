export type OfflineSos = {
  id: string;
  status: "pending" | "blocked" | "sent";
  body?: string;
  lastAttempt: string;
  error?: string;
  caseCode?: string;
  trackingToken?: string;
  phoneLast4?: string;
  incidentType?: string;
  caseReceived?: boolean;
  photoWarning?: string;
};
export function getOfflineSos(): Promise<OfflineSos | null>;
export function saveOfflineSos(
  id: string,
  body: string,
  received?: { caseCode: string; trackingToken: string },
): Promise<OfflineSos>;
export function clearSentOfflineSos(id: string): Promise<void>;
export function processOfflineSos(manual?: boolean): Promise<void>;
