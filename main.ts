import {App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting} from 'obsidian';
import {DEFAULT_SETTINGS, MyPluginSettings, SampleSettingTab} from "./Screens/ScreenSettings";
import {
	addFileToCreated,
	addFileToRemove, addFileToRename,
	addFileToUpdate, downloadRemoteConfig, isInit,
	reCalcLocalConfigFile, runDeleteFiles,
	runDownloadFiles, runMoveFiles,
	runUploadFiles,
	syncFile
} from "./syncFile";
import {minioConfig} from "./utils/s3_client/config";

// Remember to rename these classes and interfaces!

export const PLUGIN_ID = "sync-files-s3";

export let statusBarItemEl: HTMLElement

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;

	async onload() {
		await this.loadSettings();

		// This creates an icon in the left ribbon.
		const ribbonIconEl = this.addRibbonIcon('folder-sync', 'Sync',  async (evt: MouseEvent) => {
			new Notice('Running sync');

			await reCalcLocalConfigFile();
			await runMoveFiles();
			await runUploadFiles();
			await runDownloadFiles();
			await runDeleteFiles();
			await downloadRemoteConfig()

			new Notice('Sync complete');

		});
		// Perform additional things with the ribbon
		ribbonIconEl.addClass('my-plugin-ribbon-class');

		// This adds a status bar item to the bottom of the app. Does not work on mobile apps.
		statusBarItemEl = this.addStatusBarItem();
		statusBarItemEl.setText('Files not synced');

		// This adds a simple command that can be triggered anywhere
		this.addCommand({
			id: 'open-sample-modal-simple',
			name: 'Open sample modal (simple)',
			callback: () => {
				new SampleModal(this.app).open();
			}
		});
		// This adds an editor command that can perform some operation on the current editor instance
		this.addCommand({
			id: 'sample-editor-command',
			name: 'Sample editor command',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				console.log(editor.getSelection());
				editor.replaceSelection('Sample Editor Command');
			}
		});
		// This adds a complex command that can check whether the current state of the app allows execution of the command
		this.addCommand({
			id: 'open-sample-modal-complex',
			name: 'Open sample modal (complex)',
			checkCallback: (checking: boolean) => {
				// Conditions to check
				const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (markdownView) {
					// If checking is true, we're simply "checking" if the command can be run.
					// If checking is false, then we want to actually perform the operation.
					if (!checking) {
						new SampleModal(this.app).open();
					}

					// This command will only show up in Command Palette when the check function returns true
					return true;
				}
			}
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SampleSettingTab(this.app, this));

		// If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin)
		// Using this function will automatically remove the event listener when this plugin is disabled.
		this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
			// console.log('click', evt);
		});

		// When registering intervals, this function will automatically clear the interval when the plugin is disabled.
		// this.registerInterval(window.setInterval(() => console.log('setInterval'), 5 * 60 * 1000));

		this.app.vault.on('create', function (event) {
			if (isInit) {
				console.log(`Event: created ${event.path}`)
				addFileToCreated(event.path)
			}
		})

		this.app.vault.on('rename', function (event, oldPathWithName) {
			console.log(`Event: renamed ${event.path}`)
			addFileToRename(event.path, oldPathWithName);
		})

		this.app.vault.on('modify', function (event) {
			console.log(`Event: modify ${event.path}`)
			addFileToUpdate(event.path)
		})

		this.app.metadataCache.on('deleted', function (event) {
			console.log(`Event: deleted ${event.path}`)
			addFileToRemove(event.path)
		})

		this.app.metadataCache.on('changed', function (event) {
			console.log(`Event: changed ${event.path}`)
			addFileToUpdate(event.path)
		})

		await this.loadData()
		syncFile.init(this.app).then(res => {
			console.log(`End init syncFile`)
		})

	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

		minioConfig.accessKey = this.settings.s3_access_key;
		minioConfig.secretKey = this.settings.s3_secret_key;
		minioConfig.endpoint = this.settings.s3_host;
		minioConfig.region = this.settings.s3_region;
		minioConfig.bucketName = this.settings.s3_backet_name;
		minioConfig.password_e2e = this.settings.password_e2e;

	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class SampleModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen() {
		const {contentEl} = this;
		contentEl.setText('Woah!');
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
	}
}

