import { useCallback, useEffect, useRef, useState } from "react";

interface DateTimePickerProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
  title?: string;
  variant?: "inline" | "field";
}

const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] as const;
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

function parseDateTimeValue(value: string): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
} {
  if (!value) {
    const now = new Date();
    return {
      year: now.getFullYear(),
      month: now.getMonth(),
      day: now.getDate(),
      hour: now.getHours(),
      minute: now.getMinutes(),
    };
  }
  const [datePart, timePart] = value.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = (timePart || "12:00").split(":").map(Number);
  return { year, month: month - 1, day, hour, minute };
}

function formatDisplay(value: string): string {
  if (!value) return "";
  const { year, month, day, hour, minute } = parseDateTimeValue(value);
  const h = hour % 12 || 12;
  const ampm = hour >= 12 ? "PM" : "AM";
  return `${MONTHS[month].slice(0, 3)} ${day}, ${year} at ${h}:${pad(minute)} ${ampm}`;
}

function toDateTimeLocal(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): string {
  return `${year}-${pad(month + 1)}-${pad(day)}T${pad(hour)}:${pad(minute)}`;
}

export function DateTimePicker({
  value,
  onChange,
  className = "",
  placeholder = "Set date and time",
  title,
  variant = "inline",
}: DateTimePickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const parsed = parseDateTimeValue(value);
  const [viewYear, setViewYear] = useState(parsed.year);
  const [viewMonth, setViewMonth] = useState(parsed.month);
  const [selectedHour, setSelectedHour] = useState(parsed.hour);
  const [selectedMinute, setSelectedMinute] = useState(parsed.minute);
  const [isPM, setIsPM] = useState(parsed.hour >= 12);

  useEffect(() => {
    if (value) {
      const p = parseDateTimeValue(value);
      setViewYear(p.year);
      setViewMonth(p.month);
      setSelectedHour(p.hour);
      setSelectedMinute(p.minute);
      setIsPM(p.hour >= 12);
    }
  }, [value]);

  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (ref.current && !ref.current.contains(e.target as Node)) {
      setOpen(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open, handleClickOutside]);

  const selectDay = (day: number) => {
    onChange(toDateTimeLocal(viewYear, viewMonth, day, selectedHour, selectedMinute));
  };

  const updateTime = (hour: number, minute: number, pm: boolean) => {
    const h24 = pm ? (hour === 12 ? 12 : hour + 12) : hour === 12 ? 0 : hour;
    setSelectedHour(h24);
    setSelectedMinute(minute);
    setIsPM(pm);
    if (value) {
      const p = parseDateTimeValue(value);
      onChange(toDateTimeLocal(p.year, p.month, p.day, h24, minute));
    }
  };

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(viewYear - 1);
    } else {
      setViewMonth(viewMonth - 1);
    }
  };

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(viewYear + 1);
    } else {
      setViewMonth(viewMonth + 1);
    }
  };

  const clearValue = () => {
    onChange("");
    setOpen(false);
  };

  const setToday = () => {
    const now = new Date();
    setViewYear(now.getFullYear());
    setViewMonth(now.getMonth());
    onChange(
      toDateTimeLocal(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        selectedHour,
        selectedMinute,
      ),
    );
  };

  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDay = getFirstDayOfMonth(viewYear, viewMonth);
  const selectedDay = value ? parseDateTimeValue(value).day : -1;
  const selectedMonth = value ? parseDateTimeValue(value).month : -1;
  const selectedYear = value ? parseDateTimeValue(value).year : -1;

  const display12Hour = selectedHour % 12 || 12;

  const isField = variant === "field";

  return (
    <div ref={ref} className={`relative ${className}`}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={
          isField
            ? "input mt-1.5 flex w-full items-center gap-2 text-left"
            : "flex cursor-pointer items-center gap-1.5 border border-surface-3 bg-surface-1 px-3 py-1 text-xs text-ink-1 outline-none hover:bg-surface-2"
        }
        title={title}
      >
        <svg
          className={`${isField ? "h-4 w-4" : "h-3 w-3"} shrink-0 text-ink-2`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
        <span className={value ? "text-ink-0" : "text-ink-2"}>
          {value ? formatDisplay(value) : placeholder}
        </span>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 border border-surface-3 bg-surface-0 shadow-elevated animate-in fade-in slide-in-from-top-1">
          <div className="flex">
            {/* Calendar side */}
            <div className="w-[260px] border-r border-surface-3 p-3">
              {/* Month/year nav */}
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium text-ink-0">
                  {MONTHS[viewMonth]} {viewYear}
                </span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={prevMonth}
                    className="p-1 text-ink-2 hover:bg-surface-2 hover:text-ink-0"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={nextMonth}
                    className="p-1 text-ink-2 hover:bg-surface-2 hover:text-ink-0"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Day labels */}
              <div className="grid grid-cols-7 gap-0">
                {DAYS.map((d) => (
                  <div
                    key={d}
                    className="flex h-8 items-center justify-center text-[11px] font-medium text-ink-2"
                  >
                    {d}
                  </div>
                ))}

                {/* Empty cells before first day */}
                {Array.from({ length: firstDay }, (_, i) => (
                  <div key={`empty-${i}`} className="h-8" />
                ))}

                {/* Day cells */}
                {Array.from({ length: daysInMonth }, (_, i) => {
                  const day = i + 1;
                  const isSelected =
                    day === selectedDay &&
                    viewMonth === selectedMonth &&
                    viewYear === selectedYear;
                  const isToday =
                    day === new Date().getDate() &&
                    viewMonth === new Date().getMonth() &&
                    viewYear === new Date().getFullYear();

                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => selectDay(day)}
                      className={`flex h-8 w-full items-center justify-center text-xs transition-colors ${
                        isSelected
                          ? "bg-accent font-semibold text-white"
                          : isToday
                            ? "border border-accent text-accent"
                            : "text-ink-0 hover:bg-surface-2"
                      }`}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>

              {/* Footer actions */}
              <div className="mt-2 flex items-center justify-between border-t border-surface-3 pt-2">
                <button
                  type="button"
                  onClick={clearValue}
                  className="text-xs text-ink-2 hover:text-ink-0"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={setToday}
                  className="text-xs text-accent hover:text-accent-hover"
                >
                  Today
                </button>
              </div>
            </div>

            {/* Time side */}
            <div className="flex w-[140px] flex-col">
              <div className="flex flex-1">
                {/* Hour column */}
                <div className="flex-1 overflow-y-auto border-r border-surface-3 scrollbar-hide" style={{ maxHeight: 280 }}>
                  {Array.from({ length: 12 }, (_, i) => {
                    const h = i === 0 ? 12 : i;
                    const isActive = display12Hour === h;
                    return (
                      <button
                        key={h}
                        type="button"
                        onClick={() => updateTime(h, selectedMinute, isPM)}
                        className={`flex h-8 w-full items-center justify-center text-xs transition-colors ${
                          isActive
                            ? "bg-accent font-semibold text-white"
                            : "text-ink-0 hover:bg-surface-2"
                        }`}
                      >
                        {pad(h)}
                      </button>
                    );
                  })}
                </div>

                {/* Minute column */}
                <div className="flex-1 overflow-y-auto border-r border-surface-3 scrollbar-hide" style={{ maxHeight: 280 }}>
                  {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((m) => {
                    const isActive = selectedMinute === m;
                    return (
                      <button
                        key={m}
                        type="button"
                        onClick={() => updateTime(display12Hour, m, isPM)}
                        className={`flex h-8 w-full items-center justify-center text-xs transition-colors ${
                          isActive
                            ? "bg-accent font-semibold text-white"
                            : "text-ink-0 hover:bg-surface-2"
                        }`}
                      >
                        {pad(m)}
                      </button>
                    );
                  })}
                </div>

                {/* AM/PM column */}
                <div className="flex w-10 flex-col">
                  <button
                    type="button"
                    onClick={() => updateTime(display12Hour, selectedMinute, false)}
                    className={`flex h-8 w-full items-center justify-center text-xs transition-colors ${
                      !isPM
                        ? "bg-accent font-semibold text-white"
                        : "text-ink-0 hover:bg-surface-2"
                    }`}
                  >
                    AM
                  </button>
                  <button
                    type="button"
                    onClick={() => updateTime(display12Hour, selectedMinute, true)}
                    className={`flex h-8 w-full items-center justify-center text-xs transition-colors ${
                      isPM
                        ? "bg-accent font-semibold text-white"
                        : "text-ink-0 hover:bg-surface-2"
                    }`}
                  >
                    PM
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
