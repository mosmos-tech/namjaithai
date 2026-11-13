# หลักฐาน E2E ตามเกณฑ์ขอบเขต (TF-39)

ภาพทุกภาพมาจาก test จริง ใช้ข้อมูลทดสอบที่ test สร้างเองเท่านั้น (ชื่อขึ้นต้นด้วย `TF..` เบอร์สุ่ม ฐานข้อมูลในเครื่อง)
ทุก test รัน 2 ขนาดจอ: `-mobile` (iPhone SE 375 px) และ `-desktop` (1280 px)

## เกณฑ์ → test → ภาพ

| ข้อ | เกณฑ์                                                                                                                   | test                                                                                                                                       | ภาพ                                                          |
| --- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| 1   | ส่ง SOS แล้วหมุดขึ้นบนแผนที่กู้ภัยภายใน 3 วินาที (วัดเวลาจริงตั้งแต่ส่งจนหมุดขึ้น)                                      | `e2e/realtime-cases.spec.ts` › ส่ง SOS แล้วหมุดและสถานะขึ้นบนแผนที่… ภายใน 3 วินาที                                                        | `1-sos-pin-on-rescue-map-*.webp`                             |
| 2   | กู้ภัย 2 คนกดรับเคสเดียวกันพร้อมกัน ได้คนเดียว อีกคนเห็นว่าเคสถูกรับแล้ว                                                | `e2e/claim-case.spec.ts` › 2 คนกดรับพร้อมกัน ได้คนเดียวทุกรอบ… และ › จอ 375px: รับเคสแล้ว… คนกดช้าเห็นชื่อหน่วย…                           | `2-claim-race-loser-*.webp`                                  |
| 3   | ผู้แจ้งเห็นสถานะและทีมใน /track: ชื่อหน่วย แถบ 5 ขั้น หมุดทีมตอน EN_ROUTE                                               | `e2e/reporter-team-tracking.spec.ts` › กำลังมา: เห็นหมุดทีมและเวลาที่คาดว่าจะถึง…                                                          | `3-track-team-en-route-*.webp`                               |
| 4   | บัญชีกู้ภัยที่ยังไม่อนุมัติเข้าหน้ากู้ภัยไม่ได้ และเรียก RPC/ตารางตรงๆ ก็ไม่ได้ข้อมูลเคส                                | `e2e/tf39-unapproved-rescuer.spec.ts` (2 test)                                                                                             | `4-unapproved-rescuer-denied-*.webp`                         |
| 5   | ส่ง SOS ตอน offline แล้วส่งสำเร็จเมื่อกลับมาออนไลน์                                                                     | `e2e/pwa.spec.ts` › TF-15 ส่งคิวที่ยินยอมแล้วเข้า API จริงเพียงหนึ่งเคส (+ TF-15 อีก 2 test ในไฟล์เดียวกัน) — ชุด `npm run e2e:pwa`        | `5-offline-queue-sent-*.webp`                                |
| 6   | เหตุที่ไม่ใช่น้ำท่วม 1 เส้นทาง (เปิดประเภทเฉพาะใน test ไม่แก้ seed)                                                     | `e2e/sos-non-flood.spec.ts` › TF-66: ส่ง SOS ไฟไหม้ครบ 5 ขั้น… (มือถือ) + `e2e/sent-and-track.spec.ts` › TF-53 คำแนะนำกับสายด่วนตรงประเภท… | `6-non-flood-fire-sent-mobile.webp`                          |
| 7   | แถบโทรทันที (tel:) กดได้ก่อน hydrate                                                                                    | `e2e/slow-hydration.spec.ts` › ฟอร์ม SOS ตอน JS ยังไม่มา… + `e2e/english-sos.spec.ts` › หน้า /en ตอน JS ยังไม่มา…                          | `7-call-before-hydrate-*.webp`                               |
| 8   | เส้นทางเต็ม NEW → ACCEPTED → EN_ROUTE → ON_SITE → AWAITING_CONFIRMATION → ผู้แจ้งยืนยัน → RESOLVED (REPORTER_CONFIRMED) | `e2e/tf39-full-journey.spec.ts`                                                                                                            | `8-reporter-confirm-button-*.webp`, `8-case-resolved-*.webp` |
| 9   | เส้นทางภาษาอังกฤษ                                                                                                       | `e2e/english-sos.spec.ts` › ส่ง SOS น้ำท่วมภาษาอังกฤษสำเร็จ… กู้ภัยเห็นป้ายผู้แจ้งใช้ภาษาอังกฤษ                                            | `9-english-reporter-badge-*.webp`                            |

ข้อ 6 มีภาพเฉพาะมือถือ เพราะ test นี้รันจอเดียว ไม่ให้ 2 worker เปิด/คืนค่าประเภทเหตุทับกัน

## สร้างภาพใหม่

```bash
npm run build
E2E_EVIDENCE=1 E2E_SERVER=production npx playwright test \
  e2e/realtime-cases.spec.ts e2e/claim-case.spec.ts e2e/reporter-team-tracking.spec.ts \
  e2e/tf39-unapproved-rescuer.spec.ts e2e/sos-non-flood.spec.ts e2e/slow-hydration.spec.ts \
  e2e/tf39-full-journey.spec.ts e2e/english-sos.spec.ts
E2E_EVIDENCE=1 npx playwright test --config playwright.pwa.config.ts -g "ส่งคิวที่ยินยอมแล้วเข้า API จริง"
# แปลง PNG เป็น webp ลงโฟลเดอร์นี้ (ต้องมี cwebp: brew install webp) — รวมราว 1.3 MB
for f in test-results/evidence/*.png; do
  cwebp -quiet -q 65 "$f" -o "docs/e2e-scope/$(basename "${f%.png}").webp"
done
```

ภาพเก็บด้วย `saveEvidence()` ใน `e2e/helpers/evidence.ts` ซึ่งเขียนไฟล์เฉพาะตอนตั้ง `E2E_EVIDENCE=1` (รันปกติ/CI ไม่เขียน)
PNG ต้นฉบับอยู่ใน `test-results/evidence/` (ไม่ขึ้น git) — Playwright ล้าง `test-results/` ทุกครั้งที่รันชุดหลัก จึงแปลงทันทีหลังรันเสร็จ
