import Link from "next/link";

export default function PrivacyPage() {
  return (
    <article className="text-text-primary mx-auto max-w-3xl space-y-6 px-6 py-10">
      <h1 className="font-heading text-3xl font-bold">นโยบายความเป็นส่วนตัว</h1>
      <p>น้ำใจไทย SOS ใช้ข้อมูลที่คุณแจ้งเพื่อประเมินเหตุ ประสานทีมช่วยเหลือ และติดต่อกลับ</p>
      <section>
        <h2 className="font-heading text-xl font-bold">ข้อมูลที่เก็บ</h2>
        <p>
          ตำแหน่ง จุดสังเกต ชื่อ เบอร์โทร LINE ID รายละเอียดเหตุ รูป และข้อมูลสุขภาพที่คุณระบุ
          รวมถึงข้อมูลความยินยอม
        </p>
      </section>
      <section>
        <h2 className="font-heading text-xl font-bold">ผู้ที่เข้าถึงข้อมูล</h2>
        <p>
          ข้อมูลติดต่อจำกัดให้ผู้แจ้งที่เข้าสู่ระบบ กู้ภัยที่รับเคส และแอดมิน
          คำตอบสุขภาพที่แยกเก็บให้กู้ภัยที่รับเคส หัวหน้าหน่วยที่รับเคส และแอดมินเข้าถึงได้
          รายละเอียดหรือรูปที่คุณแนบอาจมีข้อมูลสุขภาพและผู้ที่มีสิทธิ์ดูเคสอาจเห็นได้
        </p>
      </section>
      <section>
        <h2 className="font-heading text-xl font-bold">ระยะเวลาเก็บข้อมูล</h2>
        <p>โครงการกำหนดให้ลบข้อมูลส่วนบุคคลหลังปิดเคส 90 วัน ระบบลบอัตโนมัติอยู่ระหว่างพัฒนา</p>
      </section>
      <section>
        <h2 className="font-heading text-xl font-bold">สิทธิและช่องทางติดต่อ</h2>
        <p>
          คุณสามารถขอเข้าถึง แก้ไข ลบ หรือถอนความยินยอมได้ โดยติดต่อผู้ดูแลผ่าน{" "}
          <a
            className="text-primary-700 underline"
            href="https://github.com/mosmos-tech/namjaithai/issues"
          >
            ช่องทางโครงการ
          </a>{" "}
          กรุณาอย่าใส่ข้อมูลส่วนตัวในข้อความสาธารณะ
        </p>
      </section>
      <p>
        <Link href="/request" className="text-primary-700 underline">
          กลับไปแจ้งขอความช่วยเหลือ
        </Link>
      </p>
    </article>
  );
}
