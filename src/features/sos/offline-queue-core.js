// Shared by the page and the generated service worker. One durable request per device.
const SOS_DB = "namjaithai-offline-sos";
const SOS_STORE = "queue";
const SOS_KEY = "current";

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
  let result;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch("/api/cases", {
      method: "POST",
      credentials: "same-origin",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", "Idempotency-Key": item.id },
      body: item.body,
    });
    const data = await response.json().catch(() => ({}));
    if (response.ok && data.caseCode && data.trackingToken) {
      const body = JSON.parse(item.body);
      result = {
        id: item.id,
        status: "sent",
        lastAttempt: item.lastAttempt,
        caseCode: data.caseCode,
        trackingToken: data.trackingToken,
        phoneLast4: String(body.phone || "")
          .replace(/\D/g, "")
          .slice(-4),
        incidentType: body.incidentType,
        photoWarning: data.photoWarning,
      };
    } else if (data.photosPending && data.caseCode && data.trackingToken) {
      result = {
        ...item,
        lease: 0,
        status: "pending",
        caseReceived: true,
        caseCode: data.caseCode,
        trackingToken: data.trackingToken,
        error: data.error || "ส่งรูปยังไม่สำเร็จ ระบบจะลองอีกครั้ง",
      };
    } else if (response.status >= 400 && response.status < 500 && response.status !== 429) {
      result = {
        ...item,
        lease: 0,
        status: "blocked",
        error: data.error || "ส่งไม่ได้ กรุณาโทรสายด่วน",
      };
    } else {
      throw new Error("Server unavailable");
    }
  } catch (error) {
    await updateSosQueue((current) =>
      current && current.id === item.id && current.lease === lease
        ? { value: { ...current, lease: 0 } }
        : {},
    );
    throw error;
  } finally {
    clearTimeout(timeout);
  }
  await updateSosQueue((current) =>
    current && current.id === item.id && current.lease === lease ? { value: result } : {},
  );
  // Reject the background-sync event so Android retries while no page is open.
  if (result.status === "pending" && result.caseReceived) throw new Error("Photos still pending");
}
