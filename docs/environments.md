# สภาพแวดล้อม (Environments) — TF-64

ระบบมี 4 ที่ที่โค้ดรันอยู่ แต่ละที่ใช้ branch และฐานข้อมูลต่างกัน เพื่อให้ทดสอบได้โดยไม่แตะข้อมูลผู้ประสบภัยจริง

| สภาพแวดล้อม    | branch     | เว็บ                              | Supabase                                    | `NEXT_PUBLIC_APP_ENV` | แถบบนหัวเว็บ                 |
| -------------- | ---------- | --------------------------------- | ------------------------------------------- | --------------------- | ---------------------------- |
| **local**      | ทุก branch | http://localhost:3000             | Docker ในเครื่อง (`npm run db:start`)       | `development`         | ไม่มี                        |
| **dev**        | `develop`  | https://namjaithai-dev.vercel.app | project 1 `namjaithai-dev`                  | `dev`                 | ฟ้า "DEV · ข้อมูลทดสอบ"      |
| **uat**        | `uat`      | https://namjaithai-uat.vercel.app | project 1 `namjaithai-dev` (ใช้ร่วมกับ dev) | `uat`                 | ส้ม "UAT · ตรวจก่อนขึ้นจริง" |
| **production** | `main`     | https://namjaithai.vercel.app     | project 2 `uucczpzmpnfzqbxnghwp`            | `production`          | ไม่มี                        |

- ลิงก์ preview ของ PR ทุกใบ (`namjaithai-git-<branch>-jupiter-f675.vercel.app`) ใช้ค่าเดียวกับ dev
- ถ้าชื่อโดเมน `namjaithai-dev` / `namjaithai-uat` มีคนใช้แล้ว ให้เลือกชื่ออื่นแล้วแก้ตารางนี้

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

## ข้อควรรู้: uat ใช้ฐานข้อมูลเดียวกับ dev

merge เข้า `develop` ปุ๊บ ฐานข้อมูลของ uat เปลี่ยนตามทันที แต่โค้ดบนเว็บ uat ยังเป็นรุ่นเก่า

- ถ้า migration ใน develop **ลบหรือเปลี่ยนชื่อคอลัมน์** (เช่น TF-49 ลบ `cases.water_level`) เว็บ uat ที่ยังอ่านคอลัมน์เดิม **จะพังชั่วคราว** จนกว่าจะ merge `develop → uat`
- ถ้าเป็นแค่ **เพิ่ม** ตาราง/คอลัมน์ เว็บ uat ใช้ต่อได้ปกติ
- ช่วงที่กำลังให้ทีมหรืออาจารย์ทดสอบบน uat ให้เลื่อน PR ที่ลบ/เปลี่ยนชื่อคอลัมน์ไปก่อน หรือแบ่ง migration เป็น 2 รอบ: รอบแรกเพิ่มของใหม่ รอบถัดไป (หลังโค้ดเลิกใช้ของเก่าแล้ว) ค่อยลบ
- ข้อมูลทดสอบที่สร้างบน dev ก็เห็นบน uat และในทางกลับกัน

## เมื่อ migration ล้มเหลว

อาการ: หน้า **Actions** ของ GitHub มีงาน **Deploy DB** สีแดง

1. **อ่าน log** ที่ขั้น "Apply migrations" ว่าไฟล์ไหนล้ม และ error ว่าอะไร
   - ขั้น "Check secrets" ล้ม = ยังไม่ได้ตั้ง secret ใน GitHub Environment นั้น (ดูเช็กลิสต์ข้อ C3–C4)
   - ขั้น "Deploy production" ล้ม = migration ผ่านแล้ว แต่เรียก Deploy Hook ไม่ได้ (URL ผิด/ถูกลบ) แก้ secret `VERCEL_DEPLOY_HOOK_PRODUCTION` แล้ว Re-run
   - ขั้น dry run ล้ม = ต่อฐานข้อมูลไม่ได้ (project ref / รหัสผ่านผิด หรือ project ถูกพักเพราะไม่ได้ใช้นาน — เข้าหน้า Supabase แล้วกด Restore)
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
5. แก้แล้วกด **Re-run jobs** ที่งานเดิมในหน้า Actions ได้ (ไม่ต้อง push ใหม่ ถ้าปัญหาอยู่ที่ secret หรือ project ถูกพัก)
6. **ถ้า production ล้ม** ไม่ต้องรีบ: ขั้น deploy ไม่ได้รัน เว็บจริงยังเป็นรุ่นเดิมที่ใช้กับฐานข้อมูลเดิมได้ แก้ตามข้อ 3–5 แล้วรอบที่ผ่านจะ deploy ให้เอง

---

## เช็กลิสต์ตั้งค่าครั้งแรก (ต้องกดเองในเว็บ)

ทำตามลำดับ A → E ใช้เวลาประมาณ 1 ชั่วโมง **ต้องทำให้ครบก่อน merge TF-64 เข้า `main`** เพราะ `vercel.json` ปิด auto deploy ของ main ถ้ายังไม่ตั้ง Deploy Hook เว็บจริงจะไม่ deploy เลย ระหว่างทางจะได้ค่าลับหลายตัว (รหัสผ่านฐานข้อมูล, คีย์, token)
**เก็บไว้ในที่ปลอดภัย เช่น password manager ห้ามวางในแชท ห้ามใส่ในไฟล์ที่ขึ้น git ห้ามแคปหน้าจอที่เห็นค่า**

### A. Supabase — สร้าง project 1 สำหรับ dev/uat

1. เข้า https://supabase.com/dashboard → เลือกองค์กร **Jupiter** → กด **New project**
   - Name: `namjaithai-dev`
   - Database Password: กด **Generate a password** แล้ว **คัดลอกเก็บไว้ทันที** (ดูย้อนหลังไม่ได้) เรียกว่า `DEV_DB_PASSWORD`
   - Region: **Northeast Asia (Tokyo)** ให้ตรงกับ production
   - กด **Create new project** แล้วรอ 1–2 นาที
2. เมนูซ้าย **Project Settings → General** → คัดลอก **Project ID** (ตัวอักษร 20 ตัว) เรียกว่า `DEV_REF`
3. **Project Settings → API Keys** → คัดลอก
   - **Publishable key** (`sb_publishable_…`) เรียกว่า `DEV_PUBLISHABLE_KEY`
   - **Secret keys** → กด **Add new secret key** ตั้งชื่อ `vercel` → คัดลอก (`sb_secret_…`) เรียกว่า `DEV_SECRET_KEY`
4. **Authentication → URL Configuration**
   - Site URL: `https://namjaithai-dev.vercel.app`
   - Redirect URLs กด **Add URL** ทีละอัน:
     - `https://namjaithai-dev.vercel.app/auth/callback`
     - `https://namjaithai-uat.vercel.app/auth/callback`
     - `https://*-jupiter-f675.vercel.app/**` (ลิงก์ preview ของ PR)
   - กด **Save**
5. **ลง migration และข้อมูลจังหวัดครั้งแรก** (ครั้งเดียว ครั้งต่อไป GitHub ทำให้เอง) ใน terminal ของ VS Code ที่โฟลเดอร์โปรเจกต์:
   ```bash
   npx supabase db push --project-ref <DEV_REF> --include-seed
   ```
   ระบบจะถามรหัสผ่าน → วาง `DEV_DB_PASSWORD` (พิมพ์แล้วไม่ขึ้นบนจอเป็นเรื่องปกติ) → ตอบ `Y` ทุกคำถาม
   เสร็จแล้วจะขึ้น `Finished supabase db push.`
6. **Access token สำหรับ GitHub**: กดรูปโปรไฟล์มุมขวาบน → **Account preferences → Access Tokens** → **Generate new token** ตั้งชื่อ `github-deploy-db` → คัดลอก (`sbp_…`) เรียกว่า `SUPABASE_ACCESS_TOKEN`
   (token นี้ใช้ได้ทุก project ในบัญชี ใช้ตัวเดียวกันทั้ง dev และ production)
7. หา **รหัสผ่านฐานข้อมูลของ production** (`uucczpzmpnfzqbxnghwp`) ที่ตั้งไว้ตอนสร้าง project เรียกว่า `PROD_DB_PASSWORD`
   ถ้าจำไม่ได้: เปิด project production → **Project Settings → Database → Reset database password** (เว็บจริงไม่กระทบ เพราะเว็บต่อผ่าน API key ไม่ได้ใช้รหัสนี้)
8. **ตรวจประวัติ migration ของ production ครั้งแรก** (project นี้เคยลง migration ด้วยมือมาก่อน) ใน terminal:
   ```bash
   npx supabase db push --project-ref uucczpzmpnfzqbxnghwp --dry-run
   ```
   วาง `PROD_DB_PASSWORD` เมื่อถูกถาม คำสั่งนี้**แค่แสดงรายการ ไม่ได้ลงจริง**
   - **ปกติ**: ขึ้นรายการไฟล์ที่ยังไม่ได้ลง เป็นไฟล์ที่ merge หลังจากลงมือครั้งล่าสุด (ตั้งแต่ `..._tf19_...` เป็นต้นไป) → ไม่ต้องทำอะไร GitHub จะลงให้ตอน merge เข้า main
   - **ไม่ตรง**: ขึ้น error `Remote migration versions not found in local migrations directory` หรือรายการมีไฟล์ที่รู้ว่าลงไปแล้ว → แก้ด้วย `migration list` / `migration repair` ตามหัวข้อ [เมื่อ migration ล้มเหลว](#เมื่อ-migration-ล้มเหลว) ข้อ 4 แล้วรัน dry run ซ้ำจนรายการถูกต้อง
   - ห้ามรันแบบไม่มี `--dry-run` เอง ให้ GitHub เป็นคนลง production เสมอ (จะได้มีคนกดอนุมัติและมี log)

### B. LINE — ให้ล็อกอินบน dev/uat ได้

1. https://developers.line.biz/console/ → channel **Namjaithai** (LINE Login, ID `2012292444`) → แท็บ **LINE Login**
2. **Callback URL** → **Edit** → เพิ่มบรรทัดใหม่ (ของเดิมเก็บไว้ทั้งหมด):
   ```
   https://<DEV_REF>.supabase.co/auth/v1/callback
   ```
   → **Update**
3. ลงทะเบียน LINE ใน project dev: สร้างไฟล์ `.env.dev.local` ที่โฟลเดอร์บนสุดของโปรเจกต์ (ชื่อขึ้นต้น `.env` จึงไม่ขึ้น git)
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://<DEV_REF>.supabase.co
   SUPABASE_SECRET_KEY=<DEV_SECRET_KEY>
   LINE_CHANNEL_ID=2012292444
   LINE_CHANNEL_SECRET=<channel secret ตัวปัจจุบัน — LINE console → Basic settings>
   ```
   แล้วรัน:
   ```bash
   node --env-file=.env.dev.local scripts/auth/setup-line-provider.mjs
   ```
   ต้องขึ้น `สร้าง provider custom:line แล้ว`
   (ถ้าวันหลังกด Issue channel secret ใหม่ ต้องรันคำสั่งนี้กับทุก project: local, dev และ production)

### C. GitHub — branch uat, กฎกันพลาด และ Environments

1. **สร้าง branch `uat` จาก `main`**: หน้า repo → ปุ่มเลือก branch (มุมซ้ายบนของรายการไฟล์) → **View all branches** → **New branch** → ชื่อ `uat`, Source: `main` → **Create branch**
2. **ป้องกัน uat แบบเดียวกับ main/develop**: **Settings → Rules → Rulesets** → เปิด `protect main & develop` → ส่วน **Target branches** → **Add target → Include by pattern** → พิมพ์ `uat` → **Save changes**
3. **Environment `dev`**: **Settings → Environments → New environment** → ชื่อ `dev` → **Configure environment**
   - **Deployment branches and tags** → เลือก **Selected branches and tags** → **Add deployment branch or tag rule** → `develop`
   - **Environment secrets → Add environment secret** ทีละตัว:
     | Name                    | Value                            |
     | ----------------------- | -------------------------------- |
     | `SUPABASE_ACCESS_TOKEN` | `SUPABASE_ACCESS_TOKEN` (ข้อ A6) |
     | `SUPABASE_PROJECT_REF`  | `DEV_REF`                        |
     | `SUPABASE_DB_PASSWORD`  | `DEV_DB_PASSWORD`                |
4. **Environment `production`**: **New environment** → ชื่อ `production`
   - ติ๊ก **Required reviewers** → เพิ่ม `mosmos-tech` → **Save protection rules**
   - **Deployment branches and tags** → **Selected branches and tags** → เพิ่ม `main`
   - **Environment secrets**:

     | Name                    | Value                       |
     | ----------------------- | --------------------------- |
     | `SUPABASE_ACCESS_TOKEN` | ตัวเดียวกับข้อ A6           |
     | `SUPABASE_PROJECT_REF`  | `uucczpzmpnfzqbxnghwp`      |
     | `SUPABASE_DB_PASSWORD`  | `PROD_DB_PASSWORD` (ข้อ A7) |

     secret ตัวที่ 4 `VERCEL_DEPLOY_HOOK_PRODUCTION` ได้จาก Vercel ในข้อ D6 ค่อยกลับมาเพิ่มตอนนั้น

### D. Vercel — ค่า env แยกตาม branch และโดเมน

Vercel แบบฟรีสร้าง environment ชื่อ dev/uat เองไม่ได้ จึงใช้ **Preview** แล้วระบุ branch แทน

1. https://vercel.com → project **namjaithai** → **Settings → Environment Variables**
2. **Production** (ของเดิมมี 4 ตัวแล้ว) เพิ่มอีกตัว:
   | Key                   | Value        | Type   | Environments |
   | --------------------- | ------------ | ------ | ------------ |
   | `NEXT_PUBLIC_APP_ENV` | `production` | Config | Production   |
3. **Preview ทุก branch → project dev** (ใช้กับ develop และ PR ทุกใบ) กด **Add Environment Variable** ทีละตัว Environments เลือก **Preview** อย่างเดียว ไม่ต้องเลือก branch:
   | Key                                    | Value                                           | Type       |
   | -------------------------------------- | ----------------------------------------------- | ---------- |
   | `NEXT_PUBLIC_SUPABASE_URL`             | `https://<DEV_REF>.supabase.co`                 | Config     |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `DEV_PUBLISHABLE_KEY`                           | Config     |
   | `SUPABASE_SECRET_KEY`                  | `DEV_SECRET_KEY`                                | **Secret** |
   | `SUPER_ADMIN_LINE_IDS`                 | LINE user ID ของแอดมิน (ตัวเดียวกับ production) | Secret     |
   | `NEXT_PUBLIC_APP_ENV`                  | `dev`                                           | Config     |
4. **uat ใช้แถบสีส้ม**: เพิ่มอีกตัว Environments เลือก **Preview** แล้วกดช่อง **Git branch** พิมพ์ `uat`:

   | Key                   | Value | Type   |
   | --------------------- | ----- | ------ |
   | `NEXT_PUBLIC_APP_ENV` | `uat` | Config |

   (ค่าที่ระบุ branch ชนะค่า Preview ทั่วไป ตัวอื่นของ uat ใช้ของ dev เพราะฐานข้อมูลเดียวกัน)

5. **ผูกโดเมนกับ branch**: **Settings → Domains → Add Domain**
   - พิมพ์ `namjaithai-dev.vercel.app` → **Add** → เปิดโดเมนที่เพิ่ง add → **Edit** → **Connect to an environment: Preview** → Git Branch: `develop` → **Save**
   - ทำซ้ำกับ `namjaithai-uat.vercel.app` → Git Branch: `uat`
6. **Deploy Hook สำหรับ production** (ให้ GitHub สั่ง deploy หลัง migration ผ่าน):
   - **Settings → Git → Deploy Hooks** → Name: `github-deploy-db`, Branch: `main` → **Create Hook**
   - คัดลอก URL ที่ได้ (`https://api.vercel.com/v1/integrations/deploy/…`) **URL นี้เป็นค่าลับ** ใครมีก็สั่ง deploy ได้
   - กลับไป GitHub → **Settings → Environments → production → Add environment secret**
     Name: `VERCEL_DEPLOY_HOOK_PRODUCTION` · Value: URL ที่คัดลอก
7. **ปิด Vercel Authentication ของ Preview** (ต้องทำ): **Settings → Deployment Protection → Vercel Authentication** → เปลี่ยนเป็น **Disabled** → **Save**
   Vercel แบบฟรีเชิญเพื่อนเข้าทีมไม่ได้ ถ้าเปิดไว้ เพื่อนและอาจารย์จะเปิดเว็บ dev/uat ไม่ได้ (ต้องล็อกอินเป็นเจ้าของ project)
   ปิดแล้วใครมีลิงก์ก็เปิด dev/uat ได้ ข้อมูลบน dev/uat จึงต้องเป็น**ข้อมูลทดสอบเท่านั้น ห้ามใส่ข้อมูลคนจริง**
8. **Deploy ใหม่ให้ค่ามีผล**: **Deployments** → หา deployment ล่าสุดของ `develop` → **⋯ → Redeploy** แล้วทำซ้ำกับ `uat` (ค่า env ใหม่มีผลเฉพาะ deployment ที่สร้างหลังตั้งค่า)

### E. ตรวจว่าครบ

| เปิด                                         | ต้องเห็น                                   |
| -------------------------------------------- | ------------------------------------------ |
| https://namjaithai-dev.vercel.app            | แถบฟ้า "DEV · ข้อมูลทดสอบ" บนสุด           |
| https://namjaithai-dev.vercel.app/dev/db     | "เชื่อมต่อฐานข้อมูลสำเร็จ"                 |
| https://namjaithai-uat.vercel.app            | แถบส้ม "UAT · ตรวจก่อนขึ้นจริง"            |
| https://namjaithai.vercel.app                | ไม่มีแถบ                                   |
| กด "เข้าสู่ระบบด้วย LINE" บน dev             | ล็อกอินผ่าน กลับมาหน้าเว็บ dev             |
| GitHub → Actions → Deploy DB                 | รอบถัดไปที่ merge เข้า develop เป็นสีเขียว |
| เปิด dev จากมือถือเพื่อน (ไม่ล็อกอิน Vercel) | เปิดได้ ไม่ถูกถามให้ล็อกอิน Vercel         |

**ครั้งแรกที่ merge `uat → main`** (หลังตั้งค่าครบแล้ว):

1. Vercel จะ**ไม่** deploy เองทันที (ถูกต้อง เพราะ `vercel.json` ปิดไว้)
2. GitHub → Actions → Deploy DB ขึ้น **Waiting** → กด **Review deployments** → ติ๊ก `production` → ดูรายการในขั้น dry run ให้ตรงกับข้อ A8 → **Approve and deploy**
3. migration ผ่าน → ขั้น "Deploy production" สั่ง Vercel → Vercel → **Deployments** มีรายการใหม่ของ `main` ภายในไม่กี่วินาที
4. เปิด https://namjaithai.vercel.app/dev/db ต้องขึ้น "เชื่อมต่อฐานข้อมูลสำเร็จ"
