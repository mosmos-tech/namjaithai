import { setTestOnlyIncidentTypes } from "./helpers/db";

/** หลังรัน E2E: ปิดประเภทเหตุที่เปิดไว้เฉพาะตอน test คืน (ดู global-setup) */
export default async function globalTeardown() {
  await setTestOnlyIncidentTypes(false);
}
