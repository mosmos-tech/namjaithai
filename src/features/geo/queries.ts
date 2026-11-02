import { cacheLife } from "next/cache";
import { createPublicClient } from "@/lib/supabase/server";
import type { AdminArea, LocatedArea } from "@/lib/domain";

// รายชื่อจังหวัด/อำเภอ/ตำบล เปลี่ยนเฉพาะตอนอัปเดต seed เลย cache ไว้นาน
// ไม่ต้องถามฐานข้อมูลทุกครั้งที่มีคนเปิดฟอร์ม SOS

type AreaRow = { code: number; name_th: string; name_en: string };
const toArea = (r: AreaRow): AdminArea => ({ code: r.code, nameTh: r.name_th, nameEn: r.name_en });

export async function listProvinces(): Promise<AdminArea[]> {
  "use cache";
  cacheLife("weeks");
  const { data, error } = await createPublicClient()
    .from("provinces")
    .select("code, name_th, name_en")
    .order("name_th");
  if (error) throw error;
  return data.map(toArea);
}

export async function listDistricts(provinceCode: number): Promise<AdminArea[]> {
  "use cache";
  cacheLife("weeks");
  const { data, error } = await createPublicClient()
    .from("districts")
    .select("code, name_th, name_en")
    .eq("province_code", provinceCode)
    .order("name_th");
  if (error) throw error;
  return data.map(toArea);
}

export async function listSubdistricts(districtCode: number): Promise<AdminArea[]> {
  "use cache";
  cacheLife("weeks");
  const { data, error } = await createPublicClient()
    .from("subdistricts")
    .select("code, name_th, name_en")
    .eq("district_code", districtCode)
    .order("name_th");
  if (error) throw error;
  return data.map(toArea);
}

// แปลงพิกัดเป็นที่อยู่ ไม่ cache เพราะพิกัดแทบไม่ซ้ำกันเลย และฐานข้อมูลตอบได้ในไม่ถึง 1 ms
// คืน null ถ้าจุดอยู่นอกประเทศไทย
export async function locateAdminArea(lat: number, lng: number): Promise<LocatedArea | null> {
  const { data, error } = await createPublicClient()
    .rpc("locate_admin_area", { p_lat: lat, p_lng: lng })
    .maybeSingle<{
      subdistrict_code: number;
      subdistrict_name_th: string;
      district_code: number;
      district_name_th: string;
      province_code: number;
      province_name_th: string;
      distance_m: number;
    }>();
  if (error) throw error;
  if (!data) return null;
  return {
    province: { code: data.province_code, nameTh: data.province_name_th },
    district: { code: data.district_code, nameTh: data.district_name_th },
    subdistrict: { code: data.subdistrict_code, nameTh: data.subdistrict_name_th },
    distanceM: Math.round(data.distance_m),
  };
}
