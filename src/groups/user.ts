/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import db from '../database';
import user from '../user';

interface UserData {
    uid?: string;
    username?: string;
    [key: string]: unknown;
}

interface GroupData {
    name?: string;
    [key: string]: unknown;
}

interface Groups {
    getUsersFromSet(set: string, fields?: string[]): Promise<UserData[]>;
    getUserGroups(uids: string[]): Promise<GroupData[][]>;
    getUserGroupsFromSet(set: string, uids: string[]): Promise<GroupData[][]>;
    getUserGroupMembership(set: string, uids: string[]): Promise<string[][]>;
    getUserInviteGroups(uid: string): Promise<GroupData[]>;
    isMemberOfGroups(uid: string, groupNames: string[]): Promise<boolean[]>;
    getGroupsData(groupNames: string[]): Promise<GroupData[]>;
    getNonPrivilegeGroups(set: string, start: number, stop: number): Promise<GroupData[]>;
    ephemeralGroups: string[];
    ownership: {
        isOwner(uid: string, groupName: string): Promise<boolean>;
    };
}

export default function initializeGroups(Groups: Groups): void {
	Groups.getUsersFromSet = async function (set: string, fields: string[] = []): Promise<UserData[]> {
		const uids: unknown = await db.getSetMembers(set);
		const userData: UserData[] = await user.getUsersFields(uids, fields);
		return userData.filter((u: UserData) => u && u.uid);
	};

	Groups.getUserGroups = async function (uids: string[]): Promise<GroupData[][]> {
		return await Groups.getUserGroupsFromSet('groups:visible:createtime', uids);
	};

	Groups.getUserGroupsFromSet = async function (set: string, uids: string[]): Promise<GroupData[][]> {
		const memberOf = await Groups.getUserGroupMembership(set, uids);
		const flattenedMemberOf = memberOf.flat();
		return await Promise.all(flattenedMemberOf.map(member => Groups.getGroupsData([member])));
	};

	async function findUserGroups(uid: string, groupNames: string[]): Promise<string[]> {
		const isMembers = await Groups.isMemberOfGroups(uid, groupNames);
		return groupNames.filter((name, i) => isMembers[i]);
	}

	Groups.getUserGroupMembership = async function (set: string, uids: string[]): Promise<string[][]> {
		const groupNames: string[] = await db.getSortedSetRevRange(set, 0, -1);
		return await Promise.all(uids.map(uid => findUserGroups(uid, groupNames)));
	};

	Groups.getUserInviteGroups = async function (uid: string): Promise<GroupData[]> {
		let allGroups = await Groups.getNonPrivilegeGroups('groups:createtime', 0, -1);
		allGroups = allGroups.filter(group => !Groups.ephemeralGroups.includes(group.name));

		const publicGroups = allGroups.filter(group => group.hidden === 0 && group.system === 0 && group.private === 0);
		const adminModGroups = [
			{ name: 'administrators', displayName: 'administrators' },
			{ name: 'Global Moderators', displayName: 'Global Moderators' },
		];
		// Private (but not hidden)
		const privateGroups = allGroups.filter(group => group.hidden === 0 && group.system === 0 && group.private === 1);

		const [ownership, isAdmin, isGlobalMod]: [unknown, unknown, unknown] = await Promise.all([
			Promise.all(privateGroups.map(group => Groups.ownership.isOwner(uid, group.name))),
			user.isAdministrator(uid),
			user.isGlobalModerator(uid),
		]);
		const ownGroups = privateGroups.filter((group, index) => ownership[index]);

		let inviteGroups: GroupData[] = [];
		if (isAdmin) {
			inviteGroups = inviteGroups.concat(adminModGroups).concat(privateGroups);
		} else if (isGlobalMod) {
			inviteGroups = inviteGroups.concat(privateGroups);
		} else {
			inviteGroups = inviteGroups.concat(ownGroups);
		}

		return inviteGroups.concat(publicGroups);
	};
}
