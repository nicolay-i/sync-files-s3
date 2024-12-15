import {App, moment} from "obsidian";
import {PLUGIN_ID, statusBarItemEl} from "./main";
import {uniqBy} from "lodash";
import {deleteFile, downloadFile, moveFile, uploadFile} from "./utils/s3_client/s3_client";
import {
	getEmptySyncFileConfig,
	nameFileConfig,
	nameFileConfigRemote,
	readConfigFile,
	readConfigFileRemote,
	syncFileConfig,
	SyncFileConfig,
	SyncFileConfigFile,
	syncFileConfigRemote,
	writeConfigFile
} from "./utils/sync_config";
import {delay} from "./utils/utils";
import { v4 as uuidv4 } from 'uuid';
import * as path from "path";

export let _app: App;

export let isInit = false

export async function calcIndexFiles() {
	console.time('calcIndexFiles')
	const {files}: SyncFileConfig = getEmptySyncFileConfig();

	const allFolders = _app.vault.getAllFolders(true)?.[0]?.children ?? [];

	console.log([...allFolders])

	const allCachedFiles = _app.vault.getFiles();

	for (const file of allCachedFiles) {
		const metaData = _app.metadataCache.getFileCache(file);

		files.push({
			uid: 'LOADING',
			title: file.basename,
			fileName: file.name,
			path: file.path.replace(`/${file.name}`, ''),
			pathWithName: file.path,
			historyFile: [{type: 'created', date: moment(file.stat.mtime).format('YYYY-MM-DDTHH:mm:ss')}],
			properties: metaData?.frontmatter ?? {},
			hash: `${file.stat.size}-${file.stat.mtime}`,
			lastModified: moment(file.stat.mtime).format('YYYY-MM-DDTHH:mm:ss'),
			meta: {
				ctime: file.stat.ctime,
				mtime: file.stat.mtime
			}
		})
	}

	console.log({files})
	console.timeEnd('calcIndexFiles')

	return files;
}

export function resetUidFiles(calcConfigFiles: SyncFileConfigFile[], localConfigFiles: SyncFileConfigFile[]) {
	for (const file of calcConfigFiles) {
		if (file.uid == 'LOADING') {
			const localFile = localConfigFiles.find(f => f.pathWithName == file.pathWithName)
			if (localFile) {
				file.uid = localFile.uid
			} else {
				file.uid = uuidv4()
			}
		}
	}
}

export async function downloadRemoteConfig() {
	await downloadFile(`.plugin/${nameFileConfigRemote}`, `${_app.vault.configDir}/plugins/${PLUGIN_ID}/${nameFileConfigRemote}`, _app.vault)

	return await readConfigFileRemote();
}

async function uploadConfig() {
	await uploadFile(`${_app.vault.configDir}/plugins/${PLUGIN_ID}/${nameFileConfig}`, `.plugin/${nameFileConfigRemote}`, _app.vault)
}

export async function reCalcLocalConfigFile() {
	console.log('reCalcLocalConfigFile')
	const files = await calcIndexFiles();
	resetUidFiles( files, syncFileConfig.files);

	{
		const uniqFiles = uniqBy([...files, ...syncFileConfig.files], 'pathWithName')

		for (const fileKey in uniqFiles) {
			const file = uniqFiles[fileKey];

			const indexFileFromConfig = syncFileConfig.files.findIndex(f => f.pathWithName == file.pathWithName);
			const indexFileFromLocal = files.findIndex(f => f.pathWithName == file.pathWithName);

			const fileFromConfig = syncFileConfig.files[indexFileFromConfig]
			const fileFromLocal = files[indexFileFromLocal]

			// No confirmed of hash
			if (fileFromLocal?.hash != fileFromConfig?.hash) {
				if (fileFromLocal && !fileFromConfig) {
					// Is added new file from outside Obsidian: it exists locally, but it is not in the config
					syncFileConfig.files.push(fileFromLocal)
				} else if (!fileFromLocal && fileFromConfig) {
					// File exists in the config, but it is not in the vault
					syncFileConfig.files.splice(indexFileFromConfig, 1)
				} else if (fileFromLocal && fileFromConfig) {
					// File is updated outside Obsidian
					syncFileConfig.files[indexFileFromConfig] = fileFromLocal
				}
			}
		}

		// Update local config
		await writeConfigFile(syncFileConfig);
	}
}

export async function runUploadFiles() {
	if (syncFileConfig.queue.upload.length == 0) {
		return
	}
	const listPromises: { file: SyncFileConfigFile, promise: Promise<void> }[] = [];
	let progress = 0;
	const total = syncFileConfig.queue.upload.length;

	// TODO rewrite interval to obsidian`s
	const intervalId = setInterval(() => {
		console.log(`Total in queue: ${listPromises.length}, progress: ${progress}/${total}`);
		statusBarItemEl.setText(`Total in queue ↑: ${listPromises.length}, progress: ${progress}/${total}`)

		if (syncFileConfig.queue.upload.length == 0 && listPromises.length == 0) {
			uploadConfig();
			clearInterval(intervalId)
			statusBarItemEl.setText('All files synced.');
		}
	}, 1000)

	const sourceUploadingFiles = [...syncFileConfig.queue.upload]
	for (const fileKey in sourceUploadingFiles) {
		const file = sourceUploadingFiles[fileKey]

		console.log(`upload ${file.pathWithName}`)

		const fileExists = await _app.vault.adapter.exists(file.pathWithName);
		if (fileExists) {
			listPromises.push({
				file: file,
				promise: uploadFile(file.pathWithName, file.pathWithName, _app.vault)
					.then(() => {
						progress += 1;
						const indexFile = listPromises.findIndex(f => f.file.uid == file.uid);
						listPromises.splice(indexFile, 1);

						const indexUpload = syncFileConfig.queue.upload.findIndex(f => f.uid == file.uid);
						syncFileConfig.queue.upload.splice(indexUpload, 1);
					})
					.catch(e => {
						progress += 1;
						console.error(e)
						const indexFile = listPromises.findIndex(f => f.file.uid == file.uid);
						listPromises.splice(indexFile, 1);

						const indexUpload = syncFileConfig.queue.upload.findIndex(f => f.uid == file.uid);
						syncFileConfig.queue.upload.splice(indexUpload, 1);
						syncFileConfig.queue.reUpload.push(file);
					}),
			})
		} else {
			progress += 1;
			console.error(`File ${file.pathWithName} not found`)
			const indexUpload = syncFileConfig.queue.upload.findIndex(f => f.uid == file.uid);
			syncFileConfig.queue.upload.splice(indexUpload, 1);
		}


		while (listPromises.length > 10) {
			await delay(1000)
		}
	}
}

export async function runDownloadFiles() {
	if (syncFileConfig.queue.download.length == 0) {
		await reCalcLocalConfigFile();
	}
	let progress = 0;
	const total = syncFileConfig.queue.download.length;

	// TODO rewrite interval to obsidian`s
	const intervalId = setInterval(async () => {
		console.log(`Progress: ${progress}/${total}`);
		statusBarItemEl.setText(`Progress download files: ${progress}/${total}`)

		if (syncFileConfig.queue.download.length == 0) {
			await reCalcLocalConfigFile();

			await uploadConfig();

			clearInterval(intervalId)
			statusBarItemEl.setText('All files synced.');
		}
	}, 1000)

	const sourceDownloadingFiles = [...syncFileConfig.queue.download]
	for (const fileKey in sourceDownloadingFiles) {
		const file = sourceDownloadingFiles[fileKey]

		console.log(`download ${file.pathWithName}`)

		await downloadFile(file.pathWithNameCopied ?? file.pathWithName, file.pathWithName, _app.vault, file)
			.then(() => {
				progress += 1;

				const indexDownload = syncFileConfig.queue.download.findIndex(f => f.pathWithName == file.pathWithName);
				syncFileConfig.queue.download.splice(indexDownload, 1);
			})
			.catch(e => {
				progress += 1;
				console.error(e)

				const indexDownload = syncFileConfig.queue.download.findIndex(f => f.pathWithName == file.pathWithName);
				syncFileConfig.queue.download.splice(indexDownload, 1);
				syncFileConfig.queue.reDownload.push(file);
			})
	}
}

export async function runDeleteFiles() {
	if (syncFileConfig.queue.delete.length == 0) {
		return;
	}
	let progress = 0;
	const total = syncFileConfig.queue.delete.length;

	const sourceDeletingFiles = [...syncFileConfig.queue.delete.reverse()]


	const intervalId = setInterval(async () => {
		console.log(`Progress: ${progress}/${total}`);
		statusBarItemEl.setText(`Progress delete files: ${progress}/${total}`)

		if (syncFileConfig.queue.delete.length == 0) {
			await reCalcLocalConfigFile();

			await uploadConfig();

			clearInterval(intervalId)
			statusBarItemEl.setText('All files synced.');
		}
	}, 1000)

	for (const fileKey in sourceDeletingFiles) {
		const file = sourceDeletingFiles[fileKey]

		try {
			await deleteFile(file.pathWithName)
		} catch (e) {
			console.error(e)
			syncFileConfig.queue.reDelete.push(file);
		}

		const indexDelete = syncFileConfig.queue.delete.findIndex(f => f.pathWithName == file.pathWithName);
		syncFileConfig.queue.delete.splice(indexDelete, 1);
	}
}

export async function runMoveFiles() {
	if (syncFileConfig.queue.move.length == 0) {
		return;
	}

	let progress = 0;
	const total = syncFileConfig.queue.move.length;

	const sourceMovingFiles = [...syncFileConfig.queue.move.reverse()]


	const intervalId = setInterval(async () => {
		console.log(`Progress: ${progress}/${total}`);
		statusBarItemEl.setText(`Progress move files: ${progress}/${total}`)

		if (syncFileConfig.queue.move.length == 0) {
			clearInterval(intervalId)

			await reCalcLocalConfigFile();
			await uploadConfig();

			statusBarItemEl.setText('All files synced.');
		}
	}, 1000)

	for (const fileKey in sourceMovingFiles) {
		const file = sourceMovingFiles[fileKey]

		try {
			const historyMove = file.historyFile?.find(h => h.type == 'moved')

			if (historyMove?.oldPathWithName) {
				await moveFile(file.pathWithName, file.pathWithName, _app.vault, historyMove.oldPathWithName);
			}

		} catch (e) {
			console.error(e)
			syncFileConfig.queue.reMove.push(file);
		}

		progress += 1;

		const indexDelete = syncFileConfig.queue.move.findIndex(f => f.uid == file.uid);
		syncFileConfig.queue.move.splice(indexDelete, 1);
	}
}

export const syncFile = {
	init: async (app: App) => {
		console.log('syncFile init')
		_app = app;

		try {
			await downloadRemoteConfig()
		} catch (e) {
			console.error(e)
		}

		setTimeout(async () => {
			await readConfigFile();

			await reCalcLocalConfigFile();

			{
				const uniqFiles = uniqBy([...syncFileConfigRemote.files, ...syncFileConfig.files], 'pathWithName')

				for (const fileKey in uniqFiles) {
					const file = uniqFiles[fileKey]

					const indexFileFromLocal = syncFileConfig.files.findIndex(fileFromLocal => fileFromLocal.pathWithName === file.pathWithName)
					const indexFileFromRemote = syncFileConfigRemote.files.findIndex(fileFromRemote => fileFromRemote.pathWithName === file.pathWithName)

					const fileFromLocal = syncFileConfig.files[indexFileFromLocal]
					const fileFromRemote = syncFileConfigRemote.files[indexFileFromRemote]

					if (fileFromLocal && !fileFromRemote) {
						syncFileConfig.queue.upload.push(fileFromLocal)
					} else if (fileFromRemote && !fileFromLocal) {
						syncFileConfig.queue.download.push(fileFromRemote)
					} else if (fileFromLocal && fileFromRemote) {
						// if (file.fileName == '2024-12-14.md') {
						// 	debugger
						// }
						if (fileFromRemote.uid && fileFromLocal.uid != fileFromRemote.uid) {
							const path = fileFromLocal.pathWithName.replace(`/${fileFromLocal.fileName}`, '')
							const ext = fileFromLocal.fileName.split('.').pop();
							const nameWithOutExt =  fileFromLocal.fileName.split('.').slice(0, -1).join('.');

							const newFileName = `${nameWithOutExt}-${fileFromLocal.uid}.${ext}`
							const newPathWithName = `${path}/${newFileName}`

							syncFileConfig.queue.download.push({...fileFromRemote, pathWithName: newPathWithName, pathWithNameCopied: fileFromRemote.pathWithName})
						} else if (fileFromLocal.hash !== fileFromRemote.hash) {
							if (fileFromLocal.lastModified > fileFromRemote.lastModified) {
								syncFileConfig.queue.upload.push(fileFromLocal)
							} else {
								syncFileConfig.queue.download.push(fileFromRemote)
							}
						}
					}
				}

				console.log({queue: syncFileConfig.queue})
			}

			isInit = true;
		}, 1000)
	},
}

export function addFileToCreated(path: string) {
	const file = _app.vault.getFileByPath(path);
	const fileInConfig = syncFileConfig.files.find(f => f.pathWithName == path);
	if (file && !fileInConfig) {
		const metaData = _app.metadataCache.getFileCache(file);

		const configFile: SyncFileConfigFile = {
			uid: uuidv4(),
			title: file.basename,
			fileName: file.name,
			path: file.path.replace(`/${file.name}`, ''),
			pathWithName: file.path,
			historyFile: [{type: 'created', date: moment(file.stat.mtime).format('YYYY-MM-DDTHH:mm:ss')}],
			properties: metaData?.frontmatter ?? {},
			hash: `${file.stat.size}-${file.stat.mtime}`,
			lastModified: moment(file.stat.mtime).format('YYYY-MM-DDTHH:mm:ss'),
			meta: {
				ctime: file.stat.ctime,
				mtime: file.stat.mtime
			}
		}

		syncFileConfig.files.push(configFile);

		if (syncFileConfig.queue.upload.findIndex(f => f.pathWithName == path) == -1) {
			syncFileConfig.queue.upload.push(configFile)
		}
	}
}

export function addFileToUpdate(path: string) {
	const fileIndex = syncFileConfig.files.findIndex(f => f.pathWithName == path);
	const localFile = _app.vault.getFileByPath(path)

	if (fileIndex != -1 && localFile) {
		syncFileConfig.files[fileIndex].lastModified = moment().format('YYYY-MM-DDTHH:mm:ss')
		syncFileConfig.files[fileIndex].meta.ctime = localFile.stat.ctime
		syncFileConfig.files[fileIndex].meta.mtime = localFile.stat.mtime

		if (syncFileConfig.queue.upload.findIndex(f => f.pathWithName == path) == -1) {
			syncFileConfig.queue.upload.push(syncFileConfig.files[fileIndex])
		}
	}
}

export function addFileToRemove(path: string) {
	const fileIndex = syncFileConfig.files.findIndex(f => f.pathWithName == path);
	const fileRemoveIndex = syncFileConfigRemote.files.findIndex(f => f.pathWithName == path);
	const file = syncFileConfig.files.find(f => f.pathWithName == path);

	if (fileIndex != -1 && fileRemoveIndex != -1) {
		syncFileConfig.files[fileIndex].historyFile.push({
			type: 'deleted',
			date: moment().format('YYYY-MM-DDTHH:mm:ss')
		})
		syncFileConfig.files[fileIndex].meta.deleted = moment().format('YYYY-MM-DDTHH:mm:ss')

		if (
			syncFileConfig.queue.delete.findIndex(f => f.pathWithName == path) == -1 &&
			syncFileConfigRemote.files.find(f => f.uid == file?.uid)
		) {
			syncFileConfig.queue.delete.push(syncFileConfig.files[fileIndex])
		}
	}

	if (fileIndex != -1 && fileRemoveIndex == -1) {
		const indexUpload = syncFileConfig.queue.upload.findIndex(f => f.pathWithName == path);
		const indexDownload = syncFileConfig.queue.download.findIndex(f => f.pathWithName == path);
		const indexMove = syncFileConfig.queue.move.findIndex(f => f.pathWithName == path);

		if (indexUpload != -1) {
			syncFileConfig.queue.upload.splice(indexUpload, 1);
		}

		if (indexDownload != -1) {
			syncFileConfig.queue.download.splice(indexDownload, 1);
		}

		if (indexMove != -1) {
			syncFileConfig.queue.move.splice(indexMove, 1);
		}
	}
}

export function addFileToRename(pathWithName: string, oldPathWithName: string) {
	console.log('addFileToRename', pathWithName, oldPathWithName)
	const fileIndex = syncFileConfig.files.findIndex(f => f.pathWithName == oldPathWithName);
	const fileRemoteIndex = syncFileConfigRemote.files.findIndex(f => f.pathWithName == oldPathWithName);
	const indexUpload = syncFileConfig.queue.upload.findIndex(f => f.pathWithName == oldPathWithName);

	if (fileIndex != -1) {
		const file = syncFileConfig.files[fileIndex];
		syncFileConfig.files[fileIndex].historyFile.push({
			type: 'moved',
			date: moment().format('YYYY-MM-DDTHH:mm:ss'),
			oldPath: file.path,
			oldPathWithName: file.pathWithName
		})
		syncFileConfig.files[fileIndex].pathWithName = pathWithName;
		syncFileConfig.files[fileIndex].fileName = path.basename(pathWithName);
		syncFileConfig.files[fileIndex].title = path.basename(pathWithName, path.extname(pathWithName));
		syncFileConfig.files[fileIndex].path = path.dirname(pathWithName);

		if (fileRemoteIndex != -1) {
			syncFileConfig.queue.move = syncFileConfig.queue.move.filter(f => f.uid != file.uid)
			syncFileConfig.queue.move.push(syncFileConfig.files[fileIndex])

			if (indexUpload != -1) {
				syncFileConfig.queue.upload.splice(indexUpload, 1)
			}
		}
	}

}
