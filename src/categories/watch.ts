/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-return */

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
    isIgnored(cids: number[], uid: number): Promise<boolean[]>;
    getWatchState(cids: number[], uid: number): Promise<number[]>;
    getIgnorers(cid: number, start: number, stop: number): Promise<number[]>;
    filterIgnoringUids(cid: number, uids: number[]): Promise<number[]>;
    getUidsWatchStates(cid: number, uids: number[]): Promise<number[]>;
}

const Categories: CategoriesType = {
	watchStates: {
		ignoring: 1,
		notwatching: 2,
		tracking: 3,
		watching: 4,
	},

	async isIgnored(cids: number[], uid: number): Promise<boolean[]> {
		if (!(parseInt(uid.toString(), 10) > 0)) {
			return cids.map(() => false);
		}
		const states = await this.getWatchState(cids, uid);
		return states.map(state => state === this.watchStates.ignoring);
	},

	async getWatchState(cids: number[], uid: number): Promise<number[]> {
		if (!(parseInt(uid.toString(), 10) > 0)) {
			return cids.map(() => this.watchStates.notwatching);
		}
		if (!Array.isArray(cids) || !cids.length) {
			return [];
		}
		const keys = cids.map(cid => `cid:${cid}:uid:watch:state`);
		const [userSettings, states] = await Promise.all([
            user.getSettings(uid) as Promise<UserSettings>,
            db.sortedSetsScore(keys, uid) as Promise<number[]>,
		]);
		return states.map(state => state || this.watchStates[userSettings.categoryWatchState]);
	},

	async getIgnorers(cid: number, start: number, stop: number): Promise<number[]> {
		const count = (stop === -1) ? -1 : (stop - start + 1);
		return await db.getSortedSetRevRangeByScore(`cid:${cid}:uid:watch:state`, start, count, this.watchStates.ignoring, this.watchStates.ignoring);
	},

	async filterIgnoringUids(cid: number, uids: number[]): Promise<number[]> {
		const states = await this.getUidsWatchStates(cid, uids);
		const readingUids = uids.filter((uid, index) => uid && states[index] !== this.watchStates.ignoring);
		return readingUids;
	},

	async getUidsWatchStates(cid: number, uids: number[]): Promise<number[]> {
		const [userSettings, states] = await Promise.all([
            user.getMultipleUserSettings(uids) as Promise<UserSettings[]>,
            db.sortedSetScores(`cid:${cid}:uid:watch:state`, uids) as Promise<number[]>,
		]);
		return states.map((state, index) => state || this.watchStates[userSettings[index].categoryWatchState]);
	},
};

export default Categories;
