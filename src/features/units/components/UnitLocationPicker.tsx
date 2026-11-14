"use client";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { parseGoogleMapsUrl, type LocatedArea } from "@/lib/domain";
const Map = dynamic(() => import("@/features/sos/components/Step3LocationMap"), {
  ssr: false,
  loading: () => <p>กำลังโหลดแผนที่…</p>,
});
type Point = { lat: number; lng: number };
type Props = {
  unitId: string;
  unitName: string;
  province: string;
  lat: number | null;
  lng: number | null;
  onSave: (point: Point | null) => Promise<boolean>;
};
const input = "min-h-12 w-full min-w-0 rounded-lg border border-slate-400 bg-white px-3";
const button = "min-h-12 rounded-full bg-sky-700 px-5 font-semibold text-white disabled:opacity-50";
export function UnitLocationPicker({ unitId, unitName, province, lat, lng, onSave }: Props) {
  const [point, setPoint] = useState<Point | null>(
    lat === null || lng === null ? null : { lat, lng },
  );
  const [manualLat, setManualLat] = useState(lat?.toString() ?? "");
  const [manualLng, setManualLng] = useState(lng?.toString() ?? "");
  const [url, setUrl] = useState("");
  const [area, setArea] = useState<LocatedArea | null>(null);
  const [areaState, setAreaState] = useState<"idle" | "loading" | "ready" | "error">(
    lat !== null && lng !== null ? "loading" : "idle",
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  function choose(p: Point) {
    if (
      !Number.isFinite(p.lat) ||
      !Number.isFinite(p.lng) ||
      p.lat < 5 ||
      p.lat > 21 ||
      p.lng < 97 ||
      p.lng > 106
    ) {
      setError("พิกัดต้องอยู่ในประเทศไทย");
      return;
    }
    setPoint(p);
    setManualLat(String(p.lat));
    setManualLng(String(p.lng));
    setError("");
  }
  useEffect(() => {
    if (!point) return;
    const controller = new AbortController();
    fetch(`/api/geo/reverse?lat=${point.lat}&lng=${point.lng}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error();
        const result = (await res.json()) as LocatedArea;
        if (!controller.signal.aborted) {
          setArea(result);
          setAreaState("ready");
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setArea(null);
          setAreaState("error");
        }
      });
    return () => controller.abort();
  }, [point]);
  function select(p: Point) {
    if (
      !Number.isFinite(p.lat) ||
      !Number.isFinite(p.lng) ||
      p.lat < 5 ||
      p.lat > 21 ||
      p.lng < 97 ||
      p.lng > 106
    ) {
      setError("พิกัดต้องอยู่ในประเทศไทย");
      return;
    }
    setArea(null);
    setAreaState("loading");
    choose(p);
  }
  async function resolve() {
    setError("");
    const result = parseGoogleMapsUrl(url);
    if (result.ok) {
      select({ lat: result.lat, lng: result.lng });
      return;
    }
    if (result.code !== "SHORT_LINK_NEEDS_RESOLVE") {
      setError(result.error);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/geo/gmaps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok || typeof data.lat !== "number" || typeof data.lng !== "number")
        throw new Error();
      select({ lat: data.lat, lng: data.lng });
    } catch {
      setError("แปลงลิงก์ไม่สำเร็จ กรุณาลองใหม่หรือใช้วิธีอื่น");
    } finally {
      setBusy(false);
    }
  }
  function gps() {
    setError("");
    if (!navigator.geolocation) {
      setError("อุปกรณ์นี้ไม่รองรับ GPS กรุณาปักหมุดหรือวางลิงก์แทน");
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setBusy(false);
        select({ lat: p.coords.latitude, lng: p.coords.longitude });
      },
      () => {
        setBusy(false);
        setError("ใช้ GPS ไม่ได้หรือไม่ได้รับอนุญาต กรุณาปักหมุดหรือวางลิงก์แทน");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }
  async function save(p: Point | null) {
    if (p && areaState === "loading") return;
    if (
      p &&
      areaState === "ready" &&
      area?.province.nameTh !== province &&
      !window.confirm(
        `หมุดอยู่จังหวัด${area?.province.nameTh} แต่หน่วยอยู่จังหวัด${province} ยืนยันบันทึกหรือไม่?`,
      )
    )
      return;
    if (
      p &&
      areaState === "error" &&
      !window.confirm("ตรวจสอบจังหวัดจากหมุดไม่ได้ กรุณาตรวจตำแหน่งบนแผนที่ ยืนยันบันทึกหรือไม่?")
    )
      return;
    setBusy(true);
    setError("");
    try {
      if (!(await onSave(p))) setError("บันทึกไม่สำเร็จ กรุณาลองใหม่");
      else if (!p) {
        setPoint(null);
        setManualLat("");
        setManualLng("");
        setArea(null);
        setAreaState("idle");
      }
    } catch {
      setError("บันทึกไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setBusy(false);
    }
  }
  return (
    <fieldset className="space-y-3" key={unitId}>
      <legend className="font-semibold">พิกัดที่ตั้งหน่วย {unitName}</legend>
      <p className="text-sm text-slate-600">ปักหมุดที่ตั้งหน่วย ใช้เรียงระยะทางตอนส่งต่อเคส</p>
      <Map pin={point ?? undefined} onPinChange={select} disableFallbackPin />
      <button type="button" className={button} disabled={busy} onClick={gps}>
        ใช้ตำแหน่งปัจจุบัน (GPS)
      </button>
      <label className="block">
        ลิงก์ Google Maps
        <input
          className={input}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="วางลิงก์ Google Maps"
        />
      </label>
      <button
        type="button"
        className={button}
        disabled={busy || !url.trim()}
        onClick={() => void resolve()}
      >
        ใช้ลิงก์ Google Maps
      </button>
      <details>
        <summary className="cursor-pointer py-3">กรอกพิกัดเอง</summary>
        <div className="grid gap-3 sm:grid-cols-2">
          <label>
            ละติจูด
            <input
              className={input}
              inputMode="decimal"
              value={manualLat}
              onChange={(e) => setManualLat(e.target.value)}
            />
          </label>
          <label>
            ลองจิจูด
            <input
              className={input}
              inputMode="decimal"
              value={manualLng}
              onChange={(e) => setManualLng(e.target.value)}
            />
          </label>
        </div>
        <button
          type="button"
          className={button}
          disabled={!manualLat.trim() || !manualLng.trim()}
          onClick={() => select({ lat: Number(manualLat), lng: Number(manualLng) })}
        >
          ใช้พิกัดนี้
        </button>
      </details>
      {point && (
        <p>
          ตำแหน่งที่เลือก: {point.lat.toFixed(5)}, {point.lng.toFixed(5)}
        </p>
      )}
      {areaState === "loading" && <p role="status">กำลังตรวจสอบพื้นที่…</p>}
      {areaState === "ready" && area && (
        <p>
          พื้นที่: {area.subdistrict.nameTh} · {area.district.nameTh} · {area.province.nameTh}
          {area.province.nameTh !== province && (
            <strong className="block text-amber-700">
              จังหวัดไม่ตรงกับหน่วย กรุณาตรวจสอบก่อนบันทึก
            </strong>
          )}
        </p>
      )}
      {areaState === "error" && <p>ตรวจสอบชื่อพื้นที่ไม่ได้ กรุณาตรวจหมุดก่อนบันทึก</p>}
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className={button}
          disabled={!point || busy || areaState === "loading" || !!error}
          onClick={() => void save(point)}
        >
          บันทึกพิกัดหน่วย
        </button>
        {lat !== null && (
          <button
            type="button"
            className="min-h-12 rounded-full border px-5"
            disabled={busy}
            onClick={() => void save(null)}
          >
            ล้างพิกัด
          </button>
        )}
      </div>
    </fieldset>
  );
}
