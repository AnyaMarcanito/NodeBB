/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-require-imports */

const db = require('../database');
const user = require('../user');

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

module.exports = function (Categories: CategoriesType) {
	Categories.watchStates = {
		ignoring: 1,
		notwatching: 2,
		tracking: 3,
		watching: 4,
	};

	Categories.isIgnored = async function (cids: number[], uid: number): Promise<boolean[]> {
		if (!(parseInt(uid.toString(), 10) > 0)) {
			return cids.map(() => false);
		}
		const states = await Categories.getWatchState(cids, uid);
		return states.map(state => state === Categories.watchStates.ignoring);
	};

	Categories.getWatchState = async function (cids: number[], uid: number): Promise<number[]> {
		if (!(parseInt(uid.toString(), 10) > 0)) {
			return cids.map(() => Categories.watchStates.notwatching);
		}
		if (!Array.isArray(cids) || !cids.length) {
			return [];
		}
		const keys = cids.map(cid => `cid:${cid}:uid:watch:state`);
		const [userSettings, states]: [UserSettings, (number | null)[]] = await Promise.all([
			user.getSettings(uid),
			db.sortedSetsScore(keys, uid),
		]);
		return states.map(state => state || Categories.watchStates[userSettings.categoryWatchState]);
	};

	Categories.getIgnorers = async function (cid: number, start: number, stop: number): Promise<number[]> {
		const count = (stop === -1) ? -1 : (stop - start + 1);
		try {
			return await db.getSortedSetRevRangeByScore(`cid:${cid}:uid:watch:state`, start, count, Categories.watchStates.ignoring, Categories.watchStates.ignoring);
		} catch (err) {
			console.error('Error in getIgnorers:', err);
			return [];
		}
	};

	Categories.filterIgnoringUids = async function (cid: number, uids: number[]): Promise<number[]> {
		try {
			const states = await Categories.getUidsWatchStates(cid, uids);
			const readingUids = uids.filter((uid, index) => uid && states[index] !== Categories.watchStates.ignoring);
			return readingUids;
		} catch (err) {
			console.error('Error in filterIgnoringUids:', err);
			return [];
		}
	};

	Categories.getUidsWatchStates = async function (cid: number, uids: number[]): Promise<number[]> {
		try {
			const [userSettings, states]: [UserSettings[], (number | null)[]] = await Promise.all([
				user.getMultipleUserSettings(uids),
				db.sortedSetScores(`cid:${cid}:uid:watch:state`, uids),
			]);
			return states.map((state, index) => state || Categories.watchStates[userSettings[index].categoryWatchState]);
		} catch (err) {
			console.error('Error in getUidsWatchStates:', err);
			return [];
		}
	};
};
