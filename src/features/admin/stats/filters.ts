type Params = Record<string, string | string[] | undefined>;

export function parseStatsFilters(params: Params) {
  const value = (key: string) => (typeof params[key] === "string" ? (params[key] as string) : "");
  const province = value("province").trim();
  const from = value("from");
  const to = value("to");
  const valid = (s: string) => {
    if (!s) return true;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const date = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === s;
  };
  const error =
    !valid(from) || !valid(to) || (from && to && from > to)
      ? "กรุณาเลือกช่วงวันที่ให้ถูกต้อง"
      : null;
  return { province, from, to, error };
}
