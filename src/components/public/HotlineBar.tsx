function PhoneIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M3.6 1.2C3.3.5 2.5.2 1.8.6L.6 1.3C-.1 1.7-.2 2.6.3 3.3 1.5 5.2 3 6.8 4.8 8.1c1.8 1.3 3.8 2.3 5.9 2.9.8.2 1.7-.1 2.1-.8l.6-1.2c.4-.8.1-1.7-.6-2L11 6.4c-.7-.3-1.5 0-1.9.6l-.2.4C7.5 6.9 6.1 6 5 4.9l.3-.2c.7-.4.9-1.2.6-1.9L5.2 1.5c-.3-.8-1.2-1.1-1.9-.8l-.3.2c.2-.2.5-.3.6.3z" />
    </svg>
  );
}

const HOTLINES = [
  { label: "ปภ.", number: "1784" },
  { label: "กู้ชีพ", number: "1669" },
  { label: "กู้ภัย", number: "199" },
];

export function HotlineBar() {
  return (
    <div className="bg-primary-700 px-4 py-2.5">
      <div className="mx-auto flex max-w-6xl items-center justify-center gap-3 sm:gap-4">
        {/* ซ่อนบนมือถือ */}
        <span className="hidden font-heading text-xs font-semibold text-white/80 sm:block sm:text-sm">
          สายด่วนฉุกเฉิน โทรได้ไม่ต้องใช้เน็ต
        </span>

        <div className="flex items-center gap-2 sm:gap-3">
          {HOTLINES.map(({ label, number }) => (
            <a
              key={number}
              href={`tel:${number}`}
              className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 font-heading text-xs font-semibold text-white transition-colors hover:bg-white/20 active:bg-white/30 sm:text-sm"
            >
              <PhoneIcon />
              {/* ชื่อหน่วยงาน ซ่อนบนมือถือ */}
              <span className="hidden text-white/70 sm:inline">{label}</span>
              <span>{number}</span>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
