import type { Metadata } from "next";
import { SosWizard } from "@/features/sos/components/SosWizard";

export const metadata: Metadata = {
  title: "แจ้งขอความช่วยเหลือ — น้ำใจไทย SOS",
  description: "ฟอร์มแจ้งขอความช่วยเหลือผู้ประสบภัยน้ำท่วม 5 ขั้นตอน",
};

export default function SosPage() {
  return <SosWizard />;
}
