// TF-58: keep only the capability needed to find this device's pending confirmations.
export type DeviceCaseRef = { caseCode: string; trackingToken: string };
const KEY = "namjaithai:confirmation-cases";
export function readDeviceCases(storage: Storage): DeviceCaseRef[] {
  try {
    const data: unknown = JSON.parse(storage.getItem(KEY) ?? "[]");
    if (!Array.isArray(data)) return [];
    return data
      .filter(
        (x): x is DeviceCaseRef =>
          typeof x?.caseCode === "string" && typeof x?.trackingToken === "string",
      )
      .slice(-20);
  } catch {
    return [];
  }
}
export function rememberDeviceCase(storage: Storage, item: DeviceCaseRef) {
  try {
    const cases = readDeviceCases(storage).filter((x) => x.caseCode !== item.caseCode);
    storage.setItem(KEY, JSON.stringify([...cases, item].slice(-20)));
    if (typeof window !== "undefined") window.dispatchEvent(new Event("namjaithai:device-cases"));
  } catch {
    /* private browsing can disallow storage */
  }
}
export function forgetDeviceCase(storage: Storage, caseCode: string) {
  try {
    storage.setItem(
      KEY,
      JSON.stringify(readDeviceCases(storage).filter((x) => x.caseCode !== caseCode)),
    );
  } catch {
    /* storage unavailable */
  }
}
