export type EventRow = {
	id: string;
	title: string;
	location: string | null;
	notes: string | null;
	all_day: boolean;
	starts_at: string | null;
	ends_at: string | null;
	start_date: string | null;
	end_date: string | null;
};

export type FeedRow = {
	id: string;
	name: string;
	url: string;
	visible: boolean;
	last_synced_at: string | null;
	last_error: string | null;
};

export type FeedEventRow = Omit<EventRow, 'id'> & { id: number; feed_id: string; uid: string };

export type Todo = { id: string; title: string; done: boolean; position: number };

/** One thing drawn on the calendar. */
export type CalItem = {
	key: string;
	source: 'own' | 'feed';
	feedName?: string;
	own?: EventRow;
	title: string;
	location: string | null;
	notes: string | null;
	allDay: boolean;
	/** Inclusive local dates covered. */
	firstDay: string;
	lastDay: string;
	start?: Date;
	end?: Date;
};
