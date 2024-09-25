import {App, PluginSettingTab, Setting, TextComponent} from "obsidian";
import MyPlugin from "../main";
import {createElement, Eye, EyeOff} from "lucide";
import {uploadFile} from "../utils/uploadCodeExample";


export interface MyPluginSettings {
	s3_host: string
	s3_region: string
	s3_access_key: string
	s3_secret_key: string
	s3_backet_name: string
	password_e2e: string
}

export const DEFAULT_SETTINGS: MyPluginSettings = {
	s3_host: '',
	s3_region: '',
	s3_access_key: '',
	s3_secret_key: '',
	s3_backet_name: '',
	password_e2e: '',
}

export class SampleSettingTab extends PluginSettingTab {
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('S3 host')
			.setDesc('Example: s3.timeweb.cloud')
			.addText(text => text
				.setValue(this.plugin.settings.s3_host)
				.onChange(async (value) => {
					this.plugin.settings.s3_host = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('S3 region')
			.setDesc('Example: en-US')
			.addText(text => text
				.setValue(this.plugin.settings.s3_region)
				.onChange(async (value) => {
					this.plugin.settings.s3_region = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('S3 access key')
			.setDesc('Example: RYDN9J1RC8.....BOM1')
			.addText(text => {
				wrapTextWithPasswordHide(text);

				return text
					.setValue(this.plugin.settings.s3_access_key)
					.onChange(async (value) => {
						this.plugin.settings.s3_access_key = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName('S3 secret key')
			.setDesc('Example: J0F24GQa.....wqgJZsm9sEd')
			.addText(text => {
				wrapTextWithPasswordHide(text);

				return text
					.setValue(this.plugin.settings.s3_secret_key)
					.onChange(async (value) => {
						this.plugin.settings.s3_secret_key = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName('S3 backet name')
			.setDesc('Example: 2266ee23-sample-name')
			.addText(text => text
				.setValue(this.plugin.settings.s3_backet_name)
				.onChange(async (value) => {
					this.plugin.settings.s3_backet_name = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.addButton((button) => {
				button.setButtonText("Check upload file");
				button.onClick(() => {
					uploadFile( 'sample.md', 'hello world')
				});

			})

	}
}

export const wrapTextWithPasswordHide = (text: TextComponent) => {
	const { eye, eyeOff } = getEyesElements();
	const hider = text.inputEl.insertAdjacentElement("afterend", createSpan())!;
	text.inputEl.style.paddingRight = '25px'
	text.inputEl.style.width = '165px'
	// the init type of hider is "hidden" === eyeOff === password
	hider.innerHTML = eyeOff;
	hider.setAttr('style', 'position: absolute; margin-right: 5px;')
	hider.addEventListener("click", (e) => {
		const isText = text.inputEl.getAttribute("type") === "text";
		hider.innerHTML = isText ? eyeOff : eye;
		text.inputEl.setAttribute("type", isText ? "password" : "text");
		text.inputEl.focus();
	});

	// the init type of text el is password
	text.inputEl.setAttribute("type", "password");
	return text;
};

const getEyesElements = () => {
	const eyeEl = createElement(Eye);
	const eyeOffEl = createElement(EyeOff);
	console.log({eyeEl: eyeEl.outerHTML})
	return {
		eye: eyeEl.outerHTML.replace('<svg', '<svg style="width: 15px; height: 15px;"'),
		eyeOff: eyeOffEl.outerHTML.replace('<svg', '<svg style="width: 15px; height: 15px;"'),
	};
};
