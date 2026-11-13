// Shared by the page and the generated service worker. One durable request per device.
// IMPORTANT: scripts/pwa/build.mjs only strips "export async function" when building public/sw.js.
// Internal helpers and constants in this file must NOT use `export`.
const SOS_DB = "namjaithai-offline-sos";
const SOS_STORE = "queue";
const SOS_KEY = "current";
const SOS_SUBMIT_TIMEOUT_MS = 12000;

function openSosDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(SOS_DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(SOS_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// All read-modify-write operations happen in one IndexedDB transaction across tabs and SW.
async function updateSosQueue(change) {
  const db = await openSosDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SOS_STORE, "readwrite");
    const store = tx.objectStore(SOS_STORE);
    const get = store.get(SOS_KEY);
    let result;
    get.onsuccess = () => {
      try {
        const action = change(get.result || null);
        result = action.result;
        if (action.remove) store.delete(SOS_KEY);
        else if (action.value !== undefined) store.put(action.value, SOS_KEY);
      } catch (error) {
        tx.abort();
        reject(error);
      }
    };
    tx.oncomplete = () => {
      db.close();
      resolve(result);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
    tx.onabort = () => {
      db.close();
      reject(tx.error || new Error("Storage transaction aborted"));
    };
  });
}

export async function getOfflineSos() {
  return updateSosQueue((current) => ({ result: current }));
}

export async function saveOfflineSos(id, body, received) {
  return updateSosQueue((current) => {
    if (current && current.id !== id) throw new Error("มีคำขอรอส่งอยู่แล้ว กรุณาตรวจสอบคำขอเดิม");
    if (current) return { result: current };
    const value = {
      id,
      body,
      status: "pending",
      lastAttempt: new Date().toISOString(),
      lease: 0,
      ...(received
        ? {
            caseReceived: true,
            caseCode: received.caseCode,
            trackingToken: received.trackingToken,
            confirmationToken: received.confirmationToken,
            error: "ส่งรูปยังไม่สำเร็จ ระบบจะลองอีกครั้ง",
          }
        : {}),
    };
    return { value, result: value };
  });
}

export async function clearSentOfflineSos(id) {
  return updateSosQueue((current) => ({
    remove: !!current && current.id === id && current.status === "sent",
  }));
}

// TF-66: เซิร์ฟเวอร์ปฏิเสธถาวร (4xx เช่น ประเภทเหตุถูกปิดระหว่างรอ) ผู้แจ้งเลือกทิ้งคำขอเพื่อกรอกใหม่ได้
export async function discardBlockedOfflineSos(id) {
  return updateSosQueue((current) => ({
    remove: !!current && current.id === id && current.status === "blocked",
  }));
}

function parseQueueBody(rawBody) {
  try {
    return JSON.parse(rawBody || "{}");
  } catch {
    return {};
  }
}

function splitCaseBody(rawBody) {
  const parsed = parseQueueBody(rawBody);
  const hasPhotos = Array.isArray(parsed.photos) && parsed.photos.length > 0;
  if (!hasPhotos) return { parsed, hasPhotos: false, caseBody: rawBody };
  const withoutPhotos = { ...parsed };
  delete withoutPhotos.photos;
  return { parsed, hasPhotos: true, caseBody: JSON.stringify(withoutPhotos) };
}

function buildSentResult(item, parsedBody, data, photoWarning) {
  return {
    id: item.id,
    status: "sent",
    lastAttempt: item.lastAttempt,
    caseCode: data.caseCode || item.caseCode,
    trackingToken: data.trackingToken || item.trackingToken,
    confirmationToken: data.confirmationToken || item.confirmationToken,
    phoneLast4: String(parsedBody.phone || "")
      .replace(/\D/g, "")
      .slice(-4),
    incidentType: parsedBody.incidentType,
    photoWarning: photoWarning || data.photoWarning,
  };
}

async function fetchCaseWithTimeout(id, body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SOS_SUBMIT_TIMEOUT_MS);
  try {
    const response = await fetch("/api/cases", {
      method: "POST",
      credentials: "same-origin",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", "Idempotency-Key": id },
      body,
    });
    const data = await response.json().catch(() => ({}));
    return { response, data };
  } finally {
    clearTimeout(timeout);
  }
}

export async function processOfflineSos(manual = false) {
  const now = Date.now();
  const lease = now + 20000;
  const item = await updateSosQueue((current) => {
    if (!current || current.status === "sent" || (!manual && current.status === "blocked"))
      return { result: null };
    if ((current.lease || 0) > now) return { result: "locked" };
    const value = { ...current, lease, lastAttempt: new Date(now).toISOString() };
    return { value, result: value };
  });
  if (item === "locked") throw new Error("Request is already being sent");
  if (!item) return;

  const { parsed, hasPhotos, caseBody } = splitCaseBody(item.body);
  let activeItem = item;
  let result;
  try {
    // ขั้น 1 (TF-69): ถ้ามีรูปและยังไม่ได้รับรหัสเคส ส่งคำขอสร้างเคสแบบไม่มีรูปก่อนเสมอ
    if (hasPhotos && !activeItem.caseReceived) {
      const { response: caseRes, data: caseData } = await fetchCaseWithTimeout(
        activeItem.id,
        caseBody,
      );
      if (caseRes.ok && caseData.caseCode && caseData.trackingToken) {
        const checkpoint = {
          ...activeItem,
          caseReceived: true,
          caseCode: caseData.caseCode,
          trackingToken: caseData.trackingToken,
          confirmationToken: caseData.confirmationToken,
          error: "ส่งรูปยังไม่สำเร็จ ระบบจะลองอีกครั้ง",
        };
        await updateSosQueue((current) =>
          current && current.id === activeItem.id && current.lease === lease
            ? { value: checkpoint }
            : {},
        );
        activeItem = checkpoint;
      } else if (caseData.photosPending && caseData.caseCode && caseData.trackingToken) {
        result = {
          ...activeItem,
          lease: 0,
          status: "pending",
          caseReceived: true,
          caseCode: caseData.caseCode,
          trackingToken: caseData.trackingToken,
          confirmationToken: caseData.confirmationToken,
          error: caseData.error || "ส่งรูปยังไม่สำเร็จ ระบบจะลองอีกครั้ง",
        };
      } else if (caseRes.status >= 400 && caseRes.status < 500 && caseRes.status !== 429) {
        result = {
          ...activeItem,
          lease: 0,
          status: "blocked",
          error: caseData.error || "ส่งไม่ได้ กรุณาโทรสายด่วน",
        };
      } else {
        throw new Error("Server unavailable");
      }
    }

    // ขั้น 2: ส่งคำขอฉบับเต็ม (ไม่มีรูป = ส่งเคสครั้งแรก, มีรูป = อัปโหลดรูปหลังได้รหัสเคส)
    if (!result) {
      const { response, data } = await fetchCaseWithTimeout(activeItem.id, activeItem.body);
      if (
        response.ok &&
        (data.caseCode || activeItem.caseCode) &&
        (data.trackingToken || activeItem.trackingToken)
      ) {
        result = buildSentResult(activeItem, parsed, data);
      } else if (data.photosPending && data.caseCode && data.trackingToken) {
        result = {
          ...activeItem,
          lease: 0,
          status: "pending",
          caseReceived: true,
          caseCode: data.caseCode,
          trackingToken: data.trackingToken,
          confirmationToken: data.confirmationToken,
          error: data.error || "ส่งรูปยังไม่สำเร็จ ระบบจะลองอีกครั้ง",
        };
      } else if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        if (activeItem.caseReceived && activeItem.caseCode && activeItem.trackingToken) {
          // เคสสร้างสำเร็จแล้ว — รูปล้มถาวรต้องไม่บล็อกเคสที่ได้รับรหัสแล้ว
          result = buildSentResult(
            activeItem,
            parsed,
            data,
            data.error || "ไม่สามารถแนบรูปได้ แต่ทีมกู้ภัยได้รับคำขอของคุณแล้ว",
          );
        } else {
          result = {
            ...activeItem,
            lease: 0,
            status: "blocked",
            error: data.error || "ส่งไม่ได้ กรุณาโทรสายด่วน",
          };
        }
      } else if (activeItem.caseReceived) {
        throw new Error("Photos still pending");
      } else {
        throw new Error("Server unavailable");
      }
    }
  } catch (error) {
    await updateSosQueue((current) =>
      current && current.id === item.id && current.lease === lease
        ? { value: { ...current, lease: 0 } }
        : {},
    );
    throw error;
  }

  await updateSosQueue((current) =>
    current && current.id === item.id && current.lease === lease ? { value: result } : {},
  );
  // Reject the background-sync event so Android retries while no page is open.
  if (result.status === "pending" && result.caseReceived) throw new Error("Photos still pending");
}
