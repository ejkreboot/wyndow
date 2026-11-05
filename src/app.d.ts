// See https://svelte.dev/docs/kit/types#app.d.ts
import type { Db } from '#lib/server/supabase.js';

declare global {
	namespace App {
		interface Locals {
			supabase: Db;
			user: { id: string; email: string } | null;
		}
	}
}

export {};
