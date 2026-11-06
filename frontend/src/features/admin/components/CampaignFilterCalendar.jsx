import { createContext, useContext, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useDayPicker } from "react-day-picker";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import "./campaign-filter-calendar.css";

const CalendarView = createContext(null);
const MONTHS = Array.from({ length: 12 }, (_, month) => new Date(2026, month, 1).toLocaleDateString("en-IN", { month: "long" }));
const EASE_OUT = [0.23, 1, 0.32, 1];

function CalendarCaption({ calendarMonth }) {
  const { goToMonth, previousMonth, nextMonth } = useDayPicker();
  const { view, setView, setYearAnchor } = useContext(CalendarView);
  const month = calendarMonth.date;
  function showYears() { setYearAnchor(month.getFullYear()); setView("years"); }

  return <div className="campaign-calendar-caption">
    <button type="button" className="campaign-calendar-arrow" aria-label="Previous month" disabled={!previousMonth} onClick={() => goToMonth(previousMonth)}><ChevronLeft /></button>
    <div className="campaign-calendar-caption-label">
      <button type="button" title="Jump to month" aria-label="Show month picker" aria-expanded={view === "months"} onClick={() => setView(view === "months" ? "days" : "months")}>{MONTHS[month.getMonth()]}</button>
      <span aria-hidden="true">|</span>
      <button type="button" title="Jump to year" aria-label="Show year picker" aria-expanded={view === "years"} onClick={showYears}>{month.getFullYear()}</button>
    </div>
    <button type="button" className="campaign-calendar-arrow" aria-label="Next month" disabled={!nextMonth} onClick={() => goToMonth(nextMonth)}><ChevronRight /></button>
  </div>;
}

function CalendarGrid({ children, ...props }) {
  const { months, goToMonth } = useDayPicker();
  const { view, setView, yearAnchor, setYearAnchor, direction, latestDate } = useContext(CalendarView);
  const month = months[0].date;
  const reduced = useReducedMotion();
  const latestYear = latestDate.getFullYear();
  const firstYear = Math.min(yearAnchor - 5, latestYear - 11);
  const key = view === "days" ? `days-${month.getFullYear()}-${month.getMonth()}` : view;
  const variants = {
    enter: (dir) => ({ opacity: 0, x: reduced || view !== "days" ? 0 : dir * 12 }),
    visible: { opacity: 1, x: 0 },
    exit: (dir) => ({ opacity: 0, x: reduced || view !== "days" ? 0 : dir * -12 }),
  };

  return <div className="campaign-calendar-body">
    <AnimatePresence initial={false} mode="popLayout" custom={direction}>
      <motion.div key={key} custom={direction} variants={variants} initial="enter" animate="visible" exit="exit" transition={{ duration: reduced ? 0 : 0.18, ease: EASE_OUT }}>
        {view === "days" ? <table {...props}>{children}</table> : view === "months" ? <div className="campaign-calendar-picker" aria-label="Choose month">
          {MONTHS.map((name, index) => {
            const disabled = new Date(month.getFullYear(), index, 1) > latestDate;
            return <button key={name} type="button" disabled={disabled} aria-pressed={index === month.getMonth()} onClick={() => { goToMonth(new Date(month.getFullYear(), index, 1)); setView("days"); }}>{name.slice(0, 3)}</button>;
          })}
        </div> : <>
          <div className="campaign-calendar-year-pager">
            <button type="button" className="campaign-calendar-arrow" aria-label="Previous years" onClick={() => setYearAnchor(firstYear - 7)}><ChevronLeft /></button>
            <span>{firstYear}&ndash;{firstYear + 11}</span>
            <button type="button" className="campaign-calendar-arrow" aria-label="Next years" disabled={firstYear + 11 >= latestYear} onClick={() => setYearAnchor(firstYear + 17)}><ChevronRight /></button>
          </div>
          <div className="campaign-calendar-picker" aria-label="Choose year">
            {Array.from({ length: 12 }, (_, index) => firstYear + index).map((year) => <button key={year} type="button" aria-pressed={year === month.getFullYear()} onClick={() => { goToMonth(new Date(year, Math.min(month.getMonth(), year === latestYear ? latestDate.getMonth() : 11), 1)); setView("months"); }}>{year}</button>)}
          </div>
        </>}
      </motion.div>
    </AnimatePresence>
  </div>;
}

export default function CampaignFilterCalendar({ selected, defaultMonth, onSelect, latestDate }) {
  const [view, setView] = useState("days");
  const [yearAnchor, setYearAnchor] = useState(defaultMonth.getFullYear());
  const [month, setMonth] = useState(defaultMonth > latestDate ? latestDate : defaultMonth);
  const [direction, setDirection] = useState(1);

  return <CalendarView.Provider value={{ view, setView, yearAnchor, setYearAnchor, direction, latestDate }}>
    <Calendar mode="range" selected={selected} onSelect={onSelect} month={month} onMonthChange={(next) => { setDirection(next >= month ? 1 : -1); setMonth(next); }}
      endMonth={latestDate} disabled={{ after: latestDate }} fixedWeeks hideNavigation
      className="campaign-filter-calendar"
      components={{ MonthCaption: CalendarCaption, MonthGrid: CalendarGrid }}
      classNames={{ month: "campaign-calendar-month", day: "campaign-calendar-day", range_start: "campaign-calendar-range-start", range_end: "campaign-calendar-range-end", range_middle: "campaign-calendar-range-middle", today: "campaign-calendar-today", outside: "campaign-calendar-outside" }}
    />
  </CalendarView.Provider>;
}
