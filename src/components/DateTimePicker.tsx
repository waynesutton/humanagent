import { useCallback, useEffect, useRef, useState } from "react";

interface DateTimePickerProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
  title?: string;
  variant?: "inline" | "field";
}

const DAYS = ["S", "M", "T", "W", "T", "F", "S"] as const;
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

const QUICK_TIMES = [
  { label: "9:00 AM", hour: 9, minute: 0 },
  { label: "12:00 PM", hour: 12, minute: 0 },
  { label: "3:00 PM", hour: 15, minute: 0 },
  { label: "5:00 PM", hour: 17, minute: 0 },
  { label: "6:00 PM", hour: 18, minute: 0 },
  { label: "9:00 PM", hour: 21, minute: 0 },
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
      hour: 12,
      minute: 0,
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

function formatShortDisplay(value: string): string {
  if (!value) return "";
  const { month, day, hour, minute } = parseDateTimeValue(value);
  const h = hour % 12 || 12;
  const ampm = hour >= 12 ? "PM" : "AM";
  return `${MONTHS[month].slice(0, 3)} ${day}, ${h}:${pad(minute)} ${ampm}`;
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

  useEffect(() => {
    if (value) {
      const p = parseDateTimeValue(value);
      setViewYear(p.year);
      setViewMonth(p.month);
      setSelectedHour(p.hour);
      setSelectedMinute(p.minute);
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

  const selectTime = (hour: number, minute: number) => {
    setSelectedHour(hour);
    setSelectedMinute(minute);
    if (value) {
      const p = parseDateTimeValue(value);
      onChange(toDateTimeLocal(p.year, p.month, p.day, hour, minute));
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

  const setTomorrow = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setViewYear(tomorrow.getFullYear());
    setViewMonth(tomorrow.getMonth());
    onChange(
      toDateTimeLocal(
        tomorrow.getFullYear(),
        tomorrow.getMonth(),
        tomorrow.getDate(),
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

  const isField = variant === "field";

  const todayDate = new Date();
  const isCurrentMonth = viewMonth === todayDate.getMonth() && viewYear === todayDate.getFullYear();

  return (
    <div ref={ref} className={`relative ${className}`}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={
          isField
            ? "input mt-1.5 flex w-full items-center gap-2 text-left"
            : `flex cursor-pointer items-center gap-1.5 rounded-full border border-surface-3 bg-surface-1 px-3 py-1 text-xs outline-none transition-colors hover:bg-surface-2 ${value ? "text-ink-0" : "text-ink-2"}`
        }
        title={title}
      >
        <svg
          className={`${isField ? "h-4 w-4" : "h-3.5 w-3.5"} shrink-0`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"
          />
        </svg>
        <span>
          {value ? formatShortDisplay(value) : placeholder}
        </span>
        {value && !isField && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              clearValue();
            }}
            className="ml-0.5 rounded-full p-0.5 hover:bg-surface-3"
            aria-label="Clear date"
          >
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute left-0 top-full z-50 mt-2 w-[280px] rounded-xl border border-surface-3 bg-surface-0 p-4 shadow-lg">
          {/* Quick date buttons */}
          <div className="mb-3 flex gap-2">
            <button
              type="button"
              onClick={setToday}
              className="flex-1 rounded-lg border border-surface-3 px-3 py-1.5 text-xs font-medium text-ink-0 transition-colors hover:bg-surface-1"
            >
              Today
            </button>
            <button
              type="button"
              onClick={setTomorrow}
              className="flex-1 rounded-lg border border-surface-3 px-3 py-1.5 text-xs font-medium text-ink-0 transition-colors hover:bg-surface-1"
            >
              Tomorrow
            </button>
          </div>

          {/* Month/year nav */}
          <div className="mb-3 flex items-center justify-between">
            <button
              type="button"
              onClick={prevMonth}
              className="rounded-lg p-1.5 text-ink-2 transition-colors hover:bg-surface-1 hover:text-ink-0"
              aria-label="Previous month"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span className="text-sm font-medium text-ink-0">
              {MONTHS[viewMonth]} {viewYear}
            </span>
            <button
              type="button"
              onClick={nextMonth}
              className="rounded-lg p-1.5 text-ink-2 transition-colors hover:bg-surface-1 hover:text-ink-0"
              aria-label="Next month"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* Day labels */}
          <div className="mb-1 grid grid-cols-7 gap-0">
            {DAYS.map((d, i) => (
              <div
                key={`${d}-${i}`}
                className="flex h-8 items-center justify-center text-xs font-medium text-ink-2"
              >
                {d}
              </div>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7 gap-0">
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
              const isToday = isCurrentMonth && day === todayDate.getDate();
              const isPast = 
                viewYear < todayDate.getFullYear() ||
                (viewYear === todayDate.getFullYear() && viewMonth < todayDate.getMonth()) ||
                (isCurrentMonth && day < todayDate.getDate());

              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => selectDay(day)}
                  className={`flex h-8 w-full items-center justify-center rounded-lg text-sm transition-colors ${
                    isSelected
                      ? "bg-ink-0 font-medium text-surface-0"
                      : isToday
                        ? "font-medium text-ink-0 ring-1 ring-inset ring-ink-0"
                        : isPast
                          ? "text-ink-2 hover:bg-surface-1"
                          : "text-ink-0 hover:bg-surface-1"
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>

          {/* Divider */}
          <div className="my-3 border-t border-surface-3" />

          {/* Time selection */}
          <div>
            <p className="mb-2 text-xs font-medium text-ink-2">Time</p>
            <div className="grid grid-cols-3 gap-1.5">
              {QUICK_TIMES.map((t) => {
                const isActive = selectedHour === t.hour && selectedMinute === t.minute;
                return (
                  <button
                    key={t.label}
                    type="button"
                    onClick={() => selectTime(t.hour, t.minute)}
                    className={`rounded-lg px-2 py-1.5 text-xs font-medium transition-colors ${
                      isActive
                        ? "bg-ink-0 text-surface-0"
                        : "bg-surface-1 text-ink-1 hover:bg-surface-2 hover:text-ink-0"
                    }`}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>

            {/* Custom time input */}
            <div className="mt-2 flex items-center gap-2">
              <input
                type="time"
                value={`${pad(selectedHour)}:${pad(selectedMinute)}`}
                onChange={(e) => {
                  const [h, m] = e.target.value.split(":").map(Number);
                  if (!isNaN(h) && !isNaN(m)) {
                    selectTime(h, m);
                  }
                }}
                className="flex-1 rounded-lg border border-surface-3 bg-surface-1 px-3 py-1.5 text-sm text-ink-0 outline-none focus:border-ink-2"
              />
            </div>
          </div>

          {/* Footer */}
          {isField && value && (
            <div className="mt-3 flex justify-end border-t border-surface-3 pt-3">
              <button
                type="button"
                onClick={clearValue}
                className="text-xs text-ink-2 hover:text-ink-0"
              >
                Clear
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
