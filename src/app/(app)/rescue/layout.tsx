import { LocationSharingProvider } from "@/features/rescue/components/LocationSharingProvider";

// TF-28: โหมดปฏิบัติงานอยู่ระดับ layout — สลับ /rescue/map ↔ /rescue/my-tasks แล้วยังแชร์ตำแหน่งต่อ
export default function RescueLayout({ children }: { children: React.ReactNode }) {
  return <LocationSharingProvider>{children}</LocationSharingProvider>;
}
