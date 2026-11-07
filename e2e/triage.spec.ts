import { test, expect } from "@playwright/test";
import { adminDb, createCaseViaApi, randomPhone } from "./helpers/db";
import {
  answerStep1,
  expectStep,
  nextButton,
  openFreshSosForm,
  seedLocationIntoDraft,
} from "./helpers/sos";

// TF-55: ระบบคำนวณความเร่งด่วนจากคำตอบ ผู้แจ้งไม่เลือกสีและไม่เห็นระดับที่ได้

async function caseInDb(caseCode: string) {
  const { data, error } = await adminDb()
    .from("cases")
    .select("id, urgency, triage_reasons, details, case_sensitive_details(details)")
    .eq("case_code", caseCode)
    .single();
  if (error) throw error;
  // case_sensitive_details ผูก 1:1 กับเคส (case_id เป็น primary key) จึงได้ object เดียว
  return data as unknown as {
    urgency: string;
    triage_reasons: string[];
    details: Record<string, unknown>;
    case_sensitive_details: { details: Record<string, unknown> } | null;
  };
}

test("ส่งจากฟอร์มพร้อมสัญญาณอันตราย: ระบบให้แดง เก็บข้อมูลสุขภาพแยก และผู้แจ้งไม่เห็นระดับ", async ({
  page,
}) => {
  await openFreshSosForm(page);
  await answerStep1(page, { dangerSigns: ["มีคนหมดสติ"], canSelfEvacuate: true });
  await page.getByRole("radio", { name: "ระดับข้อเท้า–เข่า" }).click();
  await nextButton(page).click();
  await expectStep(page, 2);
  await seedLocationIntoDraft(page);
  for (const step of [3, 4, 5]) {
    await nextButton(page).click();
    await expectStep(page, step);
  }

  await page.getByPlaceholder("เช่น สมชาย ใจดี (หรือชื่อเล่น)").fill("ทดสอบ TF-55");
  await page.getByPlaceholder("เช่น 0812345678 หรือ 081-234-5678").fill(randomPhone());
  await page.getByRole("checkbox", { name: /^ยินยอมให้ใช้ข้อมูลเพื่อ/ }).check();
  await page.getByRole("checkbox", { name: /^ยินยอมให้ใช้ข้อมูลสุขภาพ/ }).check();
  const responsePromise = page.waitForResponse(
    (r) => r.url().endsWith("/api/cases") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "แจ้งขอความช่วยเหลือทันที" }).click();
  const response = await responsePromise;
  const body = (await response.json()) as Record<string, unknown>;

  // เบราว์เซอร์ของผู้แจ้งไม่ได้รับระดับหรือคะแนน
  expect(body).not.toHaveProperty("urgency");
  expect(body).not.toHaveProperty("priorityScore");
  await expect(page.getByText(/รหัสเคสของคุณคือ/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/วิกฤต|สีแดง/)).toHaveCount(0);

  const saved = await caseInDb(body.caseCode as string);
  expect(saved.urgency).toBe("RED");
  expect(saved.triage_reasons[0]).toBe("DANGER_SIGN");
  expect(saved.details).toEqual({ waterLevel: "ANKLE_KNEE", canSelfEvacuate: true });
  expect(saved.case_sensitive_details?.details).toEqual({ dangerSigns: ["UNCONSCIOUS"] });

  // หน้าติดตามเคสก็ไม่ส่งระดับมา
  const track = await page.request.get(
    `/api/track/${body.caseCode}?t=${encodeURIComponent(body.trackingToken as string)}`,
  );
  expect(track.ok()).toBe(true);
  expect(await track.json()).not.toHaveProperty("urgency");
});

test("API: ส่ง urgency มาเองถูกเมิน ใช้ระดับที่ระบบคำนวณ", async ({ baseURL }) => {
  const created = await createCaseViaApi(baseURL!, {
    urgency: "GREEN",
    dangerSigns: ["PERSON_IN_WATER"],
    canSelfEvacuate: true,
  });
  const saved = await caseInDb(created.caseCode);
  expect(saved.urgency).toBe("RED");
});

test("API: ไม่ตอบระดับน้ำ ทั้งที่ตอบอย่างอื่นเป็นเขียว ได้เหลือง พร้อมเหตุผล ไม่ทราบระดับน้ำ", async ({
  baseURL,
}) => {
  const created = await createCaseViaApi(baseURL!, {
    canSelfEvacuate: true,
    needs: ["DRINKING_WATER"],
  });
  const saved = await caseInDb(created.caseCode);
  expect(saved.urgency).toBe("YELLOW");
  expect(saved.triage_reasons).toContain("WATER_LEVEL_UNKNOWN");
});
