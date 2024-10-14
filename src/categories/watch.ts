/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */

import db from '../database';
import user from '../user';

interface WatchStates {
    ignoring: number;
    notwatching: number;
    tracking: number;
    watching: number;
}

interface UserSettings {
    categoryWatchState: keyof WatchStates;
}

interface CategoriesType {
    watchStates: WatchStates;
    isIgnored: (cids: number[], uid: number) => Promise<boolean[]>;
    getWatchState: (cids: number[], uid: number) => Promise<number[]>;
    getIgnorers: (cid: number, start: number, stop: number) => Promise<number[]>;
    filterIgnoringUids: (cid: number, uids: number[]) => Promise<number[]>;
    getUidsWatchStates: (cid: number, uids: number[]) => Promise<number[]>;
}

const Categories: CategoriesType = {
	watchStates: {
		ignoring: 1,
		notwatching: 2,
		tracking: 3,
		watching: 4,
	},

	isIgnored: async function (this: CategoriesType, cids: number[], uid: number): Promise<boolean[]> {
		if (!(parseInt(uid.toString(), 10) > 0)) {
			return cids.map(() => false);
		}
		const states: number[] = await this.getWatchState(cids, uid);
		return states.map(state => state === this.watchStates.ignoring);
	},

	getWatchState: async function (this: CategoriesType, cids: number[], uid: number): Promise<number[]> {
		if (!(parseInt(uid.toString(), 10) > 0)) {
			return cids.map(() => this.watchStates.notwatching);
		}
		if (!Array.isArray(cids) || !cids.length) {
			return [];
		}
		const keys = cids.map(cid => `cid:${cid}:uid:watch:state`);
		const [userSettings, states]: [UserSettings, (number | null)[]] = await Promise.all([
			user.getSettings(uid) as Promise<UserSettings>,
			db.sortedSetsScore(keys, uid) as Promise<(number | null)[]>,
		]);
		return states.map(state => state ?? this.watchStates[userSettings.categoryWatchState]);
	},

	getIgnorers: async function (this: CategoriesType, cid: number, start: number, stop: number): Promise<number[]> {
		const count = (stop === -1) ? -1 : (stop - start + 1);
		try {
			const result: number[] = await db.getSortedSetRevRangeByScore(`cid:${cid}:uid:watch:state`, start, count, this.watchStates.ignoring, this.watchStates.ignoring) as number[];
			return result;
		} catch (err: unknown) {
			if (err instanceof Error) {
				console.error('Error in getIgnorers:', err.message);
			} else {
				console.error('Unknown error in getIgnorers');
			}
			return [];
		}
	},

	filterIgnoringUids: async function (this: CategoriesType, cid: number, uids: number[]): Promise<number[]> {
		try {
			const states: number[] = await this.getUidsWatchStates(cid, uids);
			const readingUids = uids.filter((uid, index) => uid && states[index] !== this.watchStates.ignoring);
			return readingUids;
		} catch (err: unknown) {
			if (err instanceof Error) {
				console.error('Error in filterIgnoringUids:', err.message);
			} else {
				console.error('Unknown error in filterIgnoringUids');
			}
			return [];
		}
	},

	getUidsWatchStates: async function (this: CategoriesType, cid: number, uids: number[]): Promise<number[]> {
		try {
			const [userSettings, states]: [UserSettings[], (number | null)[]] = await Promise.all([
				user.getMultipleUserSettings(uids) as Promise<UserSettings[]>,
				db.sortedSetScores(`cid:${cid}:uid:watch:state`, uids) as Promise<(number | null)[]>,
			]);
			return states.map((state, index) => state ?? this.watchStates[userSettings[index].categoryWatchState]);
		} catch (err: unknown) {
			if (err instanceof Error) {
				console.error('Error in getUidsWatchStates:', err.message);
			} else {
				console.error('Unknown error in getUidsWatchStates');
			}
			return [];
		}
	},
};

export default Categories;
