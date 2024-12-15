import {PLUGIN_ID} from "../main";
import {_app, calcIndexFiles} from "../syncFile";

export interface SyncFileConfigFile {
	uid: string,
	path: string,
	fileName: string,
	title: string,
	pathWithName: string,
	pathWithNameCopied?: string,
	properties: { [x: string]: null | string | string[] }
	hash: string,
	lastModified: string,
	historyFile: {
		type: 'created' | 'renamed' | 'moved' | 'deleted' | 'conflict',
		date: string,
		conflictFile?: string, conflictFileHash?: string,
		oldPath?: string,
		oldPathWithName?: string,
	}[]
	meta: {
		ctime: number,
		mtime: number,
		deleted?: string,
	}
}

export interface SyncFileConfig {
	files: SyncFileConfigFile[];
	queue: {
		upload: SyncFileConfigFile[],
		download: SyncFileConfigFile[],
		delete: SyncFileConfigFile[],
		move: SyncFileConfigFile[],

		reUpload: SyncFileConfigFile[],
		reDownload: SyncFileConfigFile[],
		reDelete: SyncFileConfigFile[],
		reMove: SyncFileConfigFile[],
	}
}

export function getEmptySyncFileConfig(): SyncFileConfig {
	return {
		files: [],
		queue: {
			upload: [],
			download: [],
			delete: [],
			move: [],

			reUpload: [],
			reDownload: [],
			reDelete: [],
			reMove: [],
		}
	}
}

export const nameFileConfig = "syncFile.json";
export const nameFileConfigRemote = "syncFileRemote.json";

export let syncFileConfig: SyncFileConfig = getEmptySyncFileConfig()

export let syncFileConfigRemote: SyncFileConfig = getEmptySyncFileConfig()

export async function readConfigFile() {
	const path = `${_app.vault.configDir}/plugins/${PLUGIN_ID}/${nameFileConfig}`

	try {
		if ((await _app.vault.adapter.exists(path))) {
			const file = await _app.vault.adapter.read(path);
			syncFileConfig.files = JSON.parse(file || JSON.stringify(getEmptySyncFileConfig))?.files;
		} else {
			const newConfig: SyncFileConfig = {...getEmptySyncFileConfig(), files: await calcIndexFiles()}
			syncFileConfig.files = newConfig.files;
			await writeConfigFile(newConfig);
		}
	} catch (error) {
		console.log(error)
	}

	return syncFileConfig;
}

export async function readConfigFileRemote() {
	const path = `${_app.vault.configDir}/plugins/${PLUGIN_ID}/${nameFileConfigRemote}`

	try {
		if ((await _app.vault.adapter.exists(path))) {
			const file = await _app.vault.adapter.read(path);
			syncFileConfigRemote.files = JSON.parse(file || '{"files": []}')?.files;
		} else {
			console.error(`File ${nameFileConfigRemote} not found`)
		}
	} catch (error) {
		console.log(error)
	}

	return syncFileConfigRemote;
}

export async function writeConfigFile(config: SyncFileConfig) {
	const path = `${_app.vault.configDir}/plugins/${PLUGIN_ID}/${nameFileConfig}`

	try {
		await _app.vault.adapter.write(path, JSON.stringify(config, null, 2));
	} catch (error) {
		console.log(error)
	}
}

export async function writeConfigFileRemote(config: SyncFileConfig) {
	const path = `${_app.vault.configDir}/plugins/${PLUGIN_ID}/${nameFileConfigRemote}`

	try {
		await _app.vault.adapter.write(path, JSON.stringify(config, null, 2));
	} catch (error) {
		console.log(error)
	}
}

(window as any).syncConfigFiles = {
	syncFileConfig,
	syncFileConfigRemote,
}
