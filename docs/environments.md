# สภาพแวดล้อม (Environments) — TF-64

ระบบมี 4 ที่ที่โค้ดรันอยู่ แต่ละที่ใช้ branch และฐานข้อมูลต่างกัน เพื่อให้ทดสอบได้โดยไม่แตะข้อมูลผู้ประสบภัยจริง

| สภาพแวดล้อม    | branch     | เว็บ                              | Supabase                              | `NEXT_PUBLIC_APP_ENV` | แถบบนหัวเว็บ                 |
| -------------- | ---------- | --------------------------------- | ------------------------------------- | --------------------- | ---------------------------- |
| **local**      | ทุก branch | http://localhost:3000             | Docker ในเครื่อง (`npm run db:start`) | `development`         | ไม่มี                        |
| **dev**        | `develop`  | https://namjaithai-dev.vercel.app | project 1 `nsetseehwiabwqtsmjvv`      | `dev`                 | ฟ้า "DEV · ข้อมูลทดสอบ"      |
| **uat**        | `uat`      | https://namjaithai-uat.vercel.app | project 1 (ใช้ร่วมกับ dev)            | `uat`                 | ส้ม "UAT · ตรวจก่อนขึ้นจริง" |
| **production** | `main`     | https://namjaithai.vercel.app     | project 2 `uucczpzmpnfzqbxnghwp`      | `production`          | ไม่มี                        |

- ลิงก์ preview ของ PR ทุกใบ (`namjaithai-git-<branch>-jupiter-f675.vercel.app`) ใช้ค่าเดียวกับ dev
- Supabase project 1 ชื่อ `namjaithai-dev`, project 2 ชื่อ `namjaithai` (project ref ไม่ใช่ความลับ อยู่ใน URL ของเว็บอยู่แล้ว)

> Supabase แบบฟรีมีได้ 2 project ต่อองค์กร จึงให้ dev กับ uat ใช้ project เดียวกัน

## ลำดับการ merge

```
feature/TF-xx ──PR──▶ develop ──PR──▶ uat ──PR──▶ main
                         │              │            │
                    migration ลง    (ไม่ลงซ้ำ ใช้   รอกดอนุมัติ → migration ลง project 2
                    project 1 เอง    ฐานข้อมูล dev)  → ผ่านแล้วค่อย deploy เว็บจริง
```

1. ทำงานใน branch ของการ์ด → เปิด PR เข้า `develop` (CI ต้องผ่าน + เพื่อน approve 1 คน)
2. merge แล้ว GitHub Actions **Deploy DB** ส่ง migration ใหม่ขึ้น project 1 อัตโนมัติ และ Vercel deploy เว็บ dev
3. ทดสอบบนเว็บ dev แล้วเปิด PR `develop → uat` ให้ทีมตรวจรอบสุดท้ายบนเว็บ uat
4. ผ่านแล้วเปิด PR `uat → main` → merge แล้ว Deploy DB **รอ mosmos-tech กดอนุมัติ** (Actions → งาน Deploy DB → **Review deployments** → ติ๊ก production → **Approve and deploy**)
5. Deploy DB ลง migration ที่ production ก่อน **ผ่านแล้วค่อยสั่ง Vercel deploy เว็บจริง** ผ่าน Deploy Hook

เปิด PR จาก `uat` เข้า `main` เสมอ (ไม่ใช่จาก `develop` ตรงๆ) เพื่อให้ขึ้นจริงเฉพาะของที่ตรวจบน uat แล้ว

### ทำไม production ต้อง migration ก่อน deploy

ถ้าโค้ดใหม่ขึ้นก่อน แต่ฐานข้อมูลยังเป็นแบบเก่า (เช่นโค้ดอ่านคอลัมน์ที่ยังไม่ได้สร้าง) เว็บจริงจะพังช่วงนั้น
จึงปิด auto deploy ของ `main` ไว้ใน `vercel.json` (`git.deploymentEnabled.main = false`) และให้ Deploy DB เป็นคนสั่ง deploy หลัง migration ผ่าน
**migration ล้มเหลว = ไม่ deploy** เว็บจริงยังเป็นรุ่นเดิมที่เข้ากับฐานข้อมูลเดิม

- Deploy DB รัน**ทุกครั้ง**ที่ push เข้า `develop` หรือ `main` (รอบที่ไม่มี migration ใหม่ `db push` จะไม่ทำอะไร) และไม่ทำงานกับ PR (โค้ดใน PR ยังไม่ผ่านรีวิว ห้ามแตะฐานข้อมูลจริง)
- `develop` และ `uat` ยัง deploy เว็บเองอัตโนมัติตามเดิม (เว็บทดสอบ พังชั่วคราวได้)

### กดรันเอง (workflow_dispatch)

ใช้เมื่อแก้ secret แล้วอยากลองใหม่ หรือสั่ง deploy production ซ้ำ:
GitHub → **Actions** → **Deploy DB** (เมนูซ้าย) → **Run workflow** →

- **Use workflow from**: เลือก `develop` ถ้าจะลง dev / `main` ถ้าจะลง production
- **target**: `dev` หรือ `production` (ต้องคู่กับ branch ด้านบน ไม่งั้นงานจะแดงพร้อมบอกว่าเลือกผิด)
- target `production` ต้องรอกดอนุมัติเหมือนเดิม และ deploy เว็บจริงให้ด้วยหลัง migration ผ่าน

## กฎ: ชื่อไฟล์ migration ต้องใหม่กว่าไฟล์ล่าสุดใน develop

Supabase ลง migration ตามเวลาหน้าชื่อไฟล์ (`20261103000000_...`) และ**ไม่ยอมลงไฟล์ที่เวลาเก่ากว่าไฟล์ล่าสุดที่ลงไปแล้ว**
ถ้าสร้าง migration ไว้นานแล้วเพื่อน merge ของใหม่กว่าเข้าไปก่อน พอ merge ของเราตาม Deploy DB จะล้มด้วยข้อความ
`Found local migration files to be inserted before the last migration on remote database`

**ก่อน merge PR ที่มี migration** (คนรีวิวช่วยเช็กด้วย):

1. ดูไฟล์ล่าสุดใน develop: `git fetch && git ls-tree --name-only origin/develop supabase/migrations/ | tail -1`
2. ถ้าไฟล์ของเราเวลาเก่ากว่า → เปลี่ยนชื่อให้ใหม่กว่า (ไฟล์ยังไม่เคยลงที่ไหนจึงเปลี่ยนได้):
   ```bash
   git mv supabase/migrations/20261103000000_tf20_x.sql supabase/migrations/<เวลาตอนนี้>_tf20_x.sql
   ```
   เวลาตอนนี้ดูได้จาก `date -u +%Y%m%d%H%M%S`
3. `npm run db:reset` + `npm run test:db` ให้ผ่านอีกรอบ แล้วค่อย merge

**ถ้าหลุดไปแล้ว** (Deploy DB แดงด้วยข้อความข้างบน) ดูวิธีแก้ในหัวข้อ "เมื่อ migration ล้มเหลว" ข้อ 5

## ข้อควรรู้: uat ใช้ฐานข้อมูลเดียวกับ dev

merge เข้า `develop` ปุ๊บ ฐานข้อมูลของ uat เปลี่ยนตามทันที แต่โค้ดบนเว็บ uat ยังเป็นรุ่นเก่า

- ถ้า migration ใน develop **ลบหรือเปลี่ยนชื่อคอลัมน์** (เช่น TF-49 ลบ `cases.water_level`) เว็บ uat ที่ยังอ่านคอลัมน์เดิม **จะพังชั่วคราว** จนกว่าจะ merge `develop → uat`
- ถ้าเป็นแค่ **เพิ่ม** ตาราง/คอลัมน์ เว็บ uat ใช้ต่อได้ปกติ
- ช่วงที่กำลังให้ทีมหรืออาจารย์ทดสอบบน uat ให้เลื่อน PR ที่ลบ/เปลี่ยนชื่อคอลัมน์ไปก่อน หรือแบ่ง migration เป็น 2 รอบ: รอบแรกเพิ่มของใหม่ รอบถัดไป (หลังโค้ดเลิกใช้ของเก่าแล้ว) ค่อยลบ
- ข้อมูลทดสอบที่สร้างบน dev ก็เห็นบน uat และในทางกลับกัน

## เมื่อ migration ล้มเหลว

อาการ: หน้า **Actions** ของ GitHub มีงาน **Deploy DB** สีแดง

1. **อ่าน log** ที่ขั้น "Apply migrations" ว่าไฟล์ไหนล้ม และ error ว่าอะไร
   - ขั้น "Check secrets" ล้ม = ยังไม่ได้ตั้ง secret ใน GitHub Environment นั้น (ดูหัวข้อ C ในบันทึกการตั้งค่า)
   - ขั้น "Deploy production" ล้ม = migration ผ่านแล้ว แต่เรียก Deploy Hook ไม่ได้ (URL ผิด/ถูกลบ) แก้ secret `VERCEL_DEPLOY_HOOK_PRODUCTION` แล้ว Re-run
   - ขั้น dry run ล้ม ดูข้อความ:
     | ข้อความใน log                                          | สาเหตุ                                                                                | แก้                                                          |
     | ------------------------------------------------------ | ------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
     | `Invalid access token format`                          | secret `SUPABASE_ACCESS_TOKEN` ไม่ใช่ token ล้วน (มีชื่อ/ช่องว่างติดมา หรือวางผิดตัว) | วางใหม่ ต้องขึ้นต้นด้วย `sbp_` ตัวแรก                        |
     | `password authentication failed`                       | `SUPABASE_DB_PASSWORD` ผิด                                                            | Reset password ของ project นั้นใน Supabase แล้วอัปเดต secret |
     | `Found local migration files to be inserted before...` | ไฟล์ migration เวลาเก่ากว่าไฟล์ล่าสุดที่ลงแล้ว                                        | ดูข้อ 5 ด้านล่าง                                             |
     | ต่อไม่ได้ / timeout                                    | project ถูกพักเพราะไม่ได้ใช้นาน (แพ็กเกจฟรี)                                          | เข้าหน้า Supabase แล้วกด Restore                             |
2. **ห้ามแก้ไฟล์ migration ที่ merge ไปแล้ว** เพราะอาจลงสำเร็จไปแล้วในบางที่ (เช่น ลง dev ผ่าน แต่ production ล้ม) แก้ไฟล์เดิมแล้วแต่ละที่จะไม่ตรงกัน
3. **แก้ด้วย migration ใหม่**: เปิดการ์ด/branch `fix/...` สร้างไฟล์ใหม่ด้วย `npx supabase migration new <ชื่อ>` เขียนคำสั่งแก้ ทดสอบ `npm run db:reset` และ `npm run test:db` ในเครื่องให้ผ่านก่อน แล้ว PR ตามลำดับปกติ
4. **ถ้าประวัติ migration บน Supabase ไม่ตรงกับ repo** (log บอก `Remote migration versions not found in local migrations directory`) ให้คนที่มีรหัสผ่านฐานข้อมูลรันในเครื่อง:
   ```bash
   # ดูว่าแต่ละไฟล์ลงที่ไหนแล้วบ้าง
   npx supabase migration list --project-ref <PROJECT_REF>
   # บอก Supabase ว่าไฟล์นี้ "ยังไม่ได้ลง" (ใช้เมื่อแน่ใจว่าคำสั่งในไฟล์ไม่ได้ถูกรันจริง)
   npx supabase migration repair --status reverted <เลขหน้าชื่อไฟล์> --project-ref <PROJECT_REF>
   ```
   ไม่แน่ใจให้ถามในกลุ่มก่อน อย่าเดา
5. **ไฟล์เวลาเก่ากว่า (`inserted before the last migration`)**: เปิดไฟล์นั้นดูก่อนว่าแก้ของเดียวกับ migration ที่ใหม่กว่าหรือไม่ (เช่น `create or replace function` ชื่อเดียวกัน)
   - **ไม่ชนกัน** → คนที่มีรหัสผ่านฐานข้อมูลลงเองครั้งเดียว: `npx supabase db push --project-ref <PROJECT_REF> --include-all` (ทำบน `develop` ล่าสุด) แล้ว Re-run งาน
   - **ชนกัน** หรือไม่แน่ใจ → ถามในกลุ่มก่อน อย่าใช้ `--include-all` เพราะไฟล์เก่าจะไปทับของใหม่
   - ห้ามใส่ `--include-all` ไว้ใน workflow ถาวร (เว็บจริงจะลงไฟล์ย้อนหลังเงียบๆ โดยไม่มีใครเช็ก)
   - เคยเกิดแล้วครั้งหนึ่ง (5 พ.ย. 2569): TF-20 `20261103000000` merge หลัง TF-49 `20261104201201` ลงที่ dev ไปแล้ว แก้ด้วย `--include-all` เพราะไม่ชนกัน
6. แก้แล้วกด **Re-run jobs → Re-run failed jobs** ที่งานเดิมในหน้า Actions ได้ (ไม่ต้อง push ใหม่ ถ้าปัญหาอยู่ที่ secret หรือ project ถูกพัก)
7. **ถ้า production ล้ม** ไม่ต้องรีบ: ขั้น deploy ไม่ได้รัน เว็บจริงยังเป็นรุ่นเดิมที่ใช้กับฐานข้อมูลเดิมได้ แก้ตามข้อ 3–5 แล้วรอบที่ผ่านจะ deploy ให้เอง

---

## บันทึกการตั้งค่า (ทำแล้ว 5 พ.ย. 2569)

ตั้งค่าครั้งแรกเสร็จแล้วตามรายการข้างล่าง เก็บไว้ดูเวลาต้องแก้ ต้องตั้งใหม่ หรือต้องเปลี่ยนคีย์
**ค่าลับทุกตัวห้ามวางในแชท/Discord ห้ามใส่ไฟล์ที่ขึ้น git ห้ามแคปหน้าจอตอนค่าแสดงอยู่** เก็บใน password manager หรือ Notes ที่ล็อกไว้

### A. Supabase

|                           | dev/uat (project 1)                                                                                                                          | production (project 2)                                                                |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| ชื่อ project              | `namjaithai-dev`                                                                                                                             | `namjaithai`                                                                          |
| project ref               | `nsetseehwiabwqtsmjvv`                                                                                                                       | `uucczpzmpnfzqbxnghwp`                                                                |
| Region                    | Northeast Asia (Tokyo)                                                                                                                       | Northeast Asia (Tokyo)                                                                |
| Site URL                  | `https://namjaithai-dev.vercel.app`                                                                                                          | `https://namjaithai.vercel.app`                                                       |
| Redirect URLs             | `https://namjaithai-dev.vercel.app/auth/callback`, `https://namjaithai-uat.vercel.app/auth/callback`, `https://*-jupiter-f675.vercel.app/**` | `https://namjaithai.vercel.app/auth/callback`, `https://*-jupiter-f675.vercel.app/**` |
| Secret key ที่ Vercel ใช้ | ชื่อ `vercel`                                                                                                                                | ตัวที่สร้างตอน deploy รอบแรก                                                          |

**Access token แยก 2 ตัว** (รูปโปรไฟล์ → Account preferences → Access Tokens → Generate new token):

- `github-deploy-db-dev`: Resource access **Project** → เลือก `namjaithai-dev` อย่างเดียว · Preset **Full access** · หมดอายุ **Never**
- `github-deploy-db-prod`: เหมือนกันแต่เลือก `namjaithai` อย่างเดียว
- แยกกันเพื่อให้ token ของ dev หลุดแล้วแตะเว็บจริงไม่ได้ · token แสดงค่าครั้งเดียว ถ้าหายให้ลบแล้วสร้างใหม่
- token ที่ขึ้นป้าย `LEGACY` ชื่อ `cli_...` คือ token ของ `npx supabase login` ในเครื่องแต่ละคน อย่าลบ

**รหัสผ่านฐานข้อมูล** (Project Settings → Database → Reset password) ดูย้อนหลังไม่ได้ ลืมให้ Reset ใหม่แล้วอัปเดต secret ใน GitHub (เว็บไม่กระทบ เพราะเว็บต่อผ่าน API key)
หน้าตา: ตัวอักษรมั่วๆ ไม่มีคำนำหน้า (ต่างจากคีย์ที่ขึ้นต้น `sbp_` / `sb_secret_` / `sb_publishable_`)

**ลง migration + ข้อมูลจังหวัดให้ project ใหม่ครั้งแรก** (ทำครั้งเดียว ครั้งต่อไป Deploy DB ทำให้):

```bash
git checkout develop && git pull   # ต้องเป็น develop ล่าสุด
npx supabase db push --project-ref <PROJECT_REF> --include-seed
```

### B. LINE

LINE Login channel `2012292444` → แท็บ LINE Login → Callback URL มี 3 บรรทัด:

```
http://127.0.0.1:54321/auth/v1/callback
https://uucczpzmpnfzqbxnghwp.supabase.co/auth/v1/callback
https://nsetseehwiabwqtsmjvv.supabase.co/auth/v1/callback
```

ลงทะเบียน LINE ใน Supabase แต่ละ project ด้วยสคริปต์ (ไฟล์ `.env*` ไม่ขึ้น git):

| project    | คำสั่ง                                                                  |
| ---------- | ----------------------------------------------------------------------- |
| local      | `npm run auth:setup-line` (อ่าน `.env.local`)                           |
| dev/uat    | `node --env-file=.env.dev.local scripts/auth/setup-line-provider.mjs`   |
| production | `node --env-file=.env.cloud.local scripts/auth/setup-line-provider.mjs` |

ไฟล์ `.env.dev.local` / `.env.cloud.local` มี `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SECRET_KEY` (ของ project นั้น), `LINE_CHANNEL_ID`, `LINE_CHANNEL_SECRET`
ถ้า `Invalid API key` = secret key ผิด project หรือมีช่องว่างติดมา · **ถ้ากด Issue channel secret ใหม่ ต้องรันครบทั้ง 3 project**

### C. GitHub

- branch `uat` สร้างจาก `main` · ruleset `protect main & develop` ครอบ `main`, `develop`, `uat` (Settings → Rulesets)
- **Environments** (Settings → Environments):

|                                 | `dev`                        | `production`                                |
| ------------------------------- | ---------------------------- | ------------------------------------------- |
| Deployment branches             | Selected → `develop`         | Selected → `main`                           |
| Required reviewers              | —                            | `mosmos-tech` (ไม่ติ๊ก Prevent self-review) |
| Allow administrators to bypass  | ติ๊กได้                      | **ไม่ติ๊ก** (ทุกครั้งต้องกดอนุมัติ)         |
| `SUPABASE_ACCESS_TOKEN`         | token `github-deploy-db-dev` | token `github-deploy-db-prod`               |
| `SUPABASE_PROJECT_REF`          | `nsetseehwiabwqtsmjvv`       | `uucczpzmpnfzqbxnghwp`                      |
| `SUPABASE_DB_PASSWORD`          | รหัสผ่าน project dev         | รหัสผ่าน project production                 |
| `VERCEL_DEPLOY_HOOK_PRODUCTION` | —                            | URL จาก Vercel Deploy Hook (ข้อ D)          |

ชื่อ secret ต้องตรงตามตารางเป๊ะ (ไม่มี `_DEV`/`_PROD` ต่อท้าย) เพราะ workflow เรียกด้วยชื่อนี้

### D. Vercel (project `namjaithai`)

Vercel ฟรีไม่มี environment ชื่อ dev/uat จึงใช้ **Preview** แทน · หน้า Settings → Environment Variables
ฟอร์ม Add Environment Variable: **Type ที่เลือกด้านบนใช้กับทุกแถวในฟอร์ม** จึงต้องแยกกรอก Config กับ Secret คนละรอบ
ช่อง Environments มี 2 ชั้น: **Environments** (Production / Preview / Development) และ **Preview Branches** (เลือกเฉพาะ branch)

| Key                                    | Production     | Preview (ทุก branch)                       | Preview branch `uat` | Type       |
| -------------------------------------- | -------------- | ------------------------------------------ | -------------------- | ---------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | URL project 2  | `https://nsetseehwiabwqtsmjvv.supabase.co` | —                    | Config     |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | ของ project 2  | ของ project 1                              | —                    | Config     |
| `SUPABASE_SECRET_KEY`                  | ของ project 2  | ของ project 1 (ชื่อ `vercel`)              | —                    | **Secret** |
| `SUPER_ADMIN_LINE_IDS`                 | LINE ID แอดมิน | LINE ID แอดมิน                             | —                    | Secret     |
| `NEXT_PUBLIC_APP_ENV`                  | `production`   | `dev`                                      | `uat`                | Config     |

ค่าที่ระบุ branch ชนะค่า Preview ทั่วไป · ตัวแปรที่ขึ้นต้น `NEXT_PUBLIC_` ต้องเป็น Config (Vercel ไม่ยอมให้เป็น Secret)
ตั้งค่าใหม่แล้วมีผลเฉพาะ deployment ถัดไป (Deployments → ⋯ → Redeploy)

- **Domains** → Add Existing → Connect to an environment: **Preview** + เลือก branch
  `namjaithai-dev.vercel.app` → `develop` · `namjaithai-uat.vercel.app` → `uat`
- **Settings → Git → Deploy Hooks**: Name `github-deploy-db`, Branch `main` (พิมพ์เอง ตัวจางในช่องเป็นแค่ตัวอย่าง) → URL เป็นค่าลับ ใส่ GitHub secret `VERCEL_DEPLOY_HOOK_PRODUCTION`
- **Settings → Deployment Protection → Vercel Authentication**: ปิดสวิตช์ **Require Log In** (Vercel ฟรีเชิญเพื่อนเข้าทีมไม่ได้ ถ้าเปิดไว้คนอื่นเปิด dev/uat ไม่ได้) → dev/uat ใครมีลิงก์ก็เปิดได้ **ใส่ได้แค่ข้อมูลทดสอบ**

### E. ตรวจว่าครบ

| เปิด                                     | ต้องเห็น                                          | สถานะ                          |
| ---------------------------------------- | ------------------------------------------------- | ------------------------------ |
| https://namjaithai-dev.vercel.app        | แถบฟ้า "DEV · ข้อมูลทดสอบ" บนสุด ไม่บังแถบสายด่วน | ✅                             |
| https://namjaithai-dev.vercel.app/dev/db | "เชื่อมต่อฐานข้อมูลสำเร็จ"                        | ✅                             |
| ล็อกอิน LINE บน dev                      | กลับมาเว็บ dev เป็นแอดมิน                         | ✅                             |
| GitHub → Actions → Deploy DB (develop)   | สีเขียว                                           | ✅                             |
| https://namjaithai.vercel.app            | ไม่มีแถบ                                          | ✅                             |
| https://namjaithai-uat.vercel.app        | แถบส้ม "UAT · ตรวจก่อนขึ้นจริง"                   | รอ PR `develop → uat` ครั้งแรก |

**ครั้งแรกที่ merge `uat → main`:**

1. Vercel จะ**ไม่** deploy เองทันที (ถูกต้อง เพราะ `vercel.json` ปิดไว้)
2. GitHub → Actions → Deploy DB ขึ้น **Waiting** → **Review deployments** → ติ๊ก `production` → ดูรายการในขั้น dry run (production ยังขาด migration ตั้งแต่ `..._tf19_...` เป็นต้นไป) → **Approve and deploy**
3. migration ผ่าน → ขั้น "Deploy production" สั่ง Vercel → Vercel → **Deployments** มีรายการใหม่ของ `main`
4. เปิด https://namjaithai.vercel.app/dev/db ต้องขึ้น "เชื่อมต่อฐานข้อมูลสำเร็จ"
