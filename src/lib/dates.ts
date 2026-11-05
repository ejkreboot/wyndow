/** Calendar-date helpers. Dates are plain `YYYY-MM-DD` strings in the viewer's local time. */

export type Ymd = { y: number; m: number; d: number };
export type Month = { y: number; m: number };

export const WEEK_STARTS_ON = 0; // 0 = Sunday

const pad = (n: number) => String(n).padStart(2, '0');

export const ymd = (date: Date): string =>
	`${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export const monthKey = ({ y, m }: Month) => `${y}-${pad(m)}`;

export function parseMonth(raw: string | null | undefined, today = new Date()): Month {
	const match = raw?.match(/^(\d{4})-(\d{2})$/);
	if (match) {
		const y = Number(match[1]);
		const m = Number(match[2]);
		if (m >= 1 && m <= 12 && y > 1900 && y < 3000) return { y, m };
	}
	return { y: today.getFullYear(), m: today.getMonth() + 1 };
}

export function addMonths({ y, m }: Month, delta: number): Month {
	const index = y * 12 + (m - 1) + delta;
	return { y: Math.floor(index / 12), m: (index % 12) + 1 };
}

/** First and last day of the six-week grid that shows `month`. Pure date math, no time zones. */
export function gridRange({ y, m }: Month): { first: Ymd; last: Ymd } {
	const firstOfMonth = new Date(Date.UTC(y, m - 1, 1));
	const lead = (firstOfMonth.getUTCDay() - WEEK_STARTS_ON + 7) % 7;
	const first = new Date(Date.UTC(y, m - 1, 1 - lead));
	const last = new Date(Date.UTC(y, m - 1, 1 - lead + 41));
	const toYmd = (d: Date) => ({ y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() });
	return { first: toYmd(first), last: toYmd(last) };
}

/** The 42 local dates of the grid, as `YYYY-MM-DD`. */
export function gridDays(month: Month): string[] {
	const { first } = gridRange(month);
	return Array.from({ length: 42 }, (_, i) => ymd(new Date(first.y, first.m - 1, first.d + i)));
}

export const addDays = (day: string, delta: number): string => {
	const [y, m, d] = day.split('-').map(Number);
	return ymd(new Date(y, m - 1, d + delta));
};

/** Local midnight of a `YYYY-MM-DD`. */
export const startOfDay = (day: string): Date => {
	const [y, m, d] = day.split('-').map(Number);
	return new Date(y, m - 1, d);
};

/** Value for <input type="datetime-local"> */
export const toLocalInput = (date: Date) => `${ymd(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;

export const weekdayLabels = (): string[] =>
	Array.from({ length: 7 }, (_, i) =>
		new Date(2023, 0, 1 + ((i + WEEK_STARTS_ON) % 7)).toLocaleDateString(undefined, { weekday: 'short' })
	);

export const formatTime = (date: Date) =>
	date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }).replace(/:00(?=\s?[ap]\.?m)/i, '')
		.replace(/\s?([ap])\.?m\.?$/i, (_, x: string) => x.toLowerCase());

export const formatMonth = ({ y, m }: Month) =>
	new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

export const formatDayLong = (day: string) =>
	startOfDay(day).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
