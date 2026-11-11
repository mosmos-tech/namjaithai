import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getOfflineSos, processOfflineSos, saveOfflineSos } from "../offline-queue-core";

function createMemoryIndexedDb() {
  const databases = new Map<string, Map<string, Map<IDBValidKey, unknown>>>();

  function cloneValue<T>(value: T): T {
    return structuredClone(value);
  }

  return {
    open(name: string) {
      const req: Record<string, unknown> = {
        result: null,
        error: null,
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
      };

      queueMicrotask(() => {
        let stores = databases.get(name);
        const isUpgrade = !stores;
        if (!stores) {
          stores = new Map();
          databases.set(name, stores);
        }

        const db = {
          createObjectStore(storeName: string) {
            if (!stores!.has(storeName)) {
              stores!.set(storeName, new Map());
            }
          },
          close() {},
          transaction(storeName: string) {
            const storeMap = stores!.get(storeName)!;
            const snapshot = new Map(storeMap);
            let aborted = false;

            const tx: Record<string, unknown> = {
              error: null,
              oncomplete: null,
              onerror: null,
              onabort: null,
              abort() {
                aborted = true;
                stores!.set(storeName, snapshot);
                queueMicrotask(() => (tx.onabort as (() => void) | null)?.());
              },
              objectStore() {
                return {
                  get(key: IDBValidKey) {
                    const getReq: Record<string, unknown> = {
                      result: undefined,
                      onsuccess: null,
                    };
                    queueMicrotask(() => {
                      const val = storeMap.get(key);
                      getReq.result = val === undefined ? undefined : cloneValue(val);
                      (getReq.onsuccess as (() => void) | null)?.();
                      queueMicrotask(() => {
                        if (!aborted) (tx.oncomplete as (() => void) | null)?.();
                      });
                    });
                    return getReq;
                  },
                  put(value: unknown, key: IDBValidKey) {
                    storeMap.set(key, cloneValue(value));
                  },
                  delete(key: IDBValidKey) {
                    storeMap.delete(key);
                  },
                };
              },
            };

            return tx;
          },
        };

        req.result = db;
        if (isUpgrade) {
          (req.onupgradeneeded as (() => void) | null)?.();
        }
        (req.onsuccess as (() => void) | null)?.();
      });

      return req as unknown as IDBOpenDBRequest;
    },
  } as unknown as IDBFactory;
}

describe("TF-69: offline-queue-core processOfflineSos", () => {
  const originalIndexedDb = globalThis.indexedDB;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.stubGlobal("indexedDB", createMemoryIndexedDb());
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.indexedDB = originalIndexedDb;
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("ส่งเคสแบบไม่มีรูปสำเร็จด้วย Idempotency-Key เดิม", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => {
      return new Response(
        JSON.stringify({ caseCode: "FL-2611-Q1", trackingToken: "tok_q1" }),
        { status: 201 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    await saveOfflineSos(
      "idem-q-1",
      JSON.stringify({ incidentType: "FLOOD", phone: "0812345678", lat: 13.75, lng: 100.5 }),
    );
    await processOfflineSos(true);

    const saved = await getOfflineSos();
    expect(saved?.status).toBe("sent");
    expect(saved?.caseCode).toBe("FL-2611-Q1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("คำขอในคิวค้างเกิน 12 วินาที -> abort และปลด lease เพื่อให้กดส่งซ้ำได้ทันที", async () => {
    vi.useFakeTimers();

    let aborted = false;
    const fetchMock = vi.fn<typeof fetch>((_input, init) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          aborted = true;
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await saveOfflineSos(
      "idem-q-timeout",
      JSON.stringify({ incidentType: "FLOOD", phone: "0812345678", lat: 13.75, lng: 100.5 }),
    );
    const runPromise = processOfflineSos(true);
    const rejectionExpectation = expect(runPromise).rejects.toThrow();

    await vi.advanceTimersByTimeAsync(10_500);
    expect(aborted).toBe(false);

    await vi.advanceTimersByTimeAsync(1_600);
    await rejectionExpectation;
    expect(aborted).toBe(true);

    const current = await getOfflineSos();
    expect(current?.status).toBe("pending");
    expect((current as { lease?: number } | null)?.lease).toBe(0);
  });

  it("คำขอในคิวมีรูป: ส่งเคสไม่มีรูปก่อน แล้วค่อยอัปโหลดรูปด้วย Idempotency-Key เดิม", async () => {
    const sentBodies: Array<Record<string, unknown>> = [];
    const sentKeys: Array<string | null> = [];
    const fetchMock = vi.fn<typeof fetch>(async (_input, init) => {
      const headers = new Headers(init?.headers);
      sentKeys.push(headers.get("idempotency-key"));
      sentBodies.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
      return new Response(
        JSON.stringify({ caseCode: "FL-2611-Q2", trackingToken: "tok_q2" }),
        { status: sentBodies.length === 1 ? 201 : 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    await saveOfflineSos(
      "idem-q-photo",
      JSON.stringify({
        incidentType: "FLOOD",
        phone: "0812345678",
        lat: 13.75,
        lng: 100.5,
        photos: ["data:image/jpeg;base64,BBBB"],
      }),
    );

    await processOfflineSos(true);

    expect(sentBodies).toHaveLength(2);
    expect(sentKeys).toEqual(["idem-q-photo", "idem-q-photo"]);
    expect(sentBodies[0].photos).toBeUndefined();
    expect(sentBodies[1].photos).toEqual(["data:image/jpeg;base64,BBBB"]);

    const saved = await getOfflineSos();
    expect(saved?.status).toBe("sent");
    expect(saved?.caseCode).toBe("FL-2611-Q2");
  });

  it("คิวส่งเคสได้รหัสแล้วแต่รูปค้าง/503 -> เก็บ caseReceived+caseCode และรอบถัดไปส่งเฉพาะคำขอรูป", async () => {
    const sentBodies: Array<Record<string, unknown>> = [];
    let attempt = 0;
    const fetchMock = vi.fn<typeof fetch>(async (_input, init) => {
      attempt += 1;
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      sentBodies.push(body);
      if (attempt === 1) {
        return new Response(
          JSON.stringify({ caseCode: "FL-2611-Q3", trackingToken: "tok_q3" }),
          { status: 201 },
        );
      }
      if (attempt === 2) {
        return new Response(
          JSON.stringify({
            caseCode: "FL-2611-Q3",
            trackingToken: "tok_q3",
            photosPending: true,
            error: "ส่งรูปยังไม่สำเร็จ",
          }),
          { status: 503 },
        );
      }
      return new Response(
        JSON.stringify({ caseCode: "FL-2611-Q3", trackingToken: "tok_q3" }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    await saveOfflineSos(
      "idem-q-retry-photo",
      JSON.stringify({
        incidentType: "FLOOD",
        phone: "0812345678",
        lat: 13.75,
        lng: 100.5,
        photos: ["data:image/jpeg;base64,CCCC"],
      }),
    );

    await expect(processOfflineSos(true)).rejects.toThrow("Photos still pending");
    const mid = await getOfflineSos();
    expect(mid?.status).toBe("pending");
    expect(mid?.caseReceived).toBe(true);
    expect(mid?.caseCode).toBe("FL-2611-Q3");

    await processOfflineSos(true);
    expect(sentBodies).toHaveLength(3);
    expect(sentBodies[0].photos).toBeUndefined();
    expect(sentBodies[1].photos).toEqual(["data:image/jpeg;base64,CCCC"]);
    // รอบถัดไป caseReceived=true แล้ว -> ยิงคำขอรูปเลยไม่ยิงสร้างเคสซ้ำ
    expect(sentBodies[2].photos).toEqual(["data:image/jpeg;base64,CCCC"]);

    const done = await getOfflineSos();
    expect(done?.status).toBe("sent");
    expect(done?.caseCode).toBe("FL-2611-Q3");
  });

  it("คิวส่งเคสได้รหัสแล้วแต่รูปโดนปฏิเสธ 400 ถาวร -> สถานะเป็น sent พร้อมคำเตือน (ไม่เป็น blocked)", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (_input, init) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      if (!body.photos) {
        return new Response(
          JSON.stringify({ caseCode: "FL-2611-Q4", trackingToken: "tok_q4" }),
          { status: 201 },
        );
      }
      return new Response(JSON.stringify({ error: "รูปแบบรูปไม่ถูกต้อง" }), { status: 400 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await saveOfflineSos(
      "idem-q-400-photo",
      JSON.stringify({
        incidentType: "FLOOD",
        phone: "0812345678",
        lat: 13.75,
        lng: 100.5,
        photos: ["data:image/jpeg;base64,DDDD"],
      }),
    );

    await processOfflineSos(true);
    const done = await getOfflineSos();
    expect(done?.status).toBe("sent");
    expect(done?.caseCode).toBe("FL-2611-Q4");
    expect(done?.photoWarning).toContain("รูปแบบรูปไม่ถูกต้อง");
  });
});
