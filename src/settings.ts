import { App, PluginSettingTab, Setting, normalizePath } from "obsidian";
import Homepage from "./main";
import { FileSuggest, WorkspaceSuggest } from "./suggest";
import { getDailynotesAutorun, getDataviewPlugin } from "./utils";

export enum Mode {
	ReplaceAll = "Replace all open notes",
	ReplaceLast = "Replace last note",
	Retain = "Keep open notes"
}

export enum View {
	Default = "Default view",
	Reading = "Reading view",
	Source = "Editing view (Source)",
	LivePreview = "Editing view (Live Preview)"
}

export interface HomepageSettings {
	[member: string]: any,
	version: number,
	defaultNote: string,
	useMoment: boolean,
	momentFormat: string,
	workspace: string,
	workspaceEnabled: boolean,
	openOnStartup: boolean,
	hasRibbonIcon: boolean,
	openMode: string,
	manualOpenMode: string,
	view: string,
	revertView: boolean,
	refreshDataview: boolean,
	autoCreate: boolean,
	autoScroll: boolean,
	pin: boolean
}

export const DEFAULT: HomepageSettings = {
	version: 2,
	defaultNote: "Home",
	useMoment: false,
	momentFormat: "YYYY-MM-DD",
	workspace: "Home",
	workspaceEnabled: false,
	openOnStartup: true,
	hasRibbonIcon: true,
	openMode: Mode.ReplaceAll,
	manualOpenMode: Mode.Retain,
	view: View.Default,
	revertView: true,
	refreshDataview: false,
	autoCreate: true,
	autoScroll: false,
	pin: false
}

export const HIDDEN: string = "nv-workspace-hidden";

export class HomepageSettingTab extends PluginSettingTab {
	plugin: Homepage;
	settings: HomepageSettings;

	constructor(app: App, plugin: Homepage) {
		super(app, plugin);
		this.plugin = plugin;
		this.settings = plugin.settings;
	}

	sanitiseNote(value: string): string {
		if (value === null || value.match(/^\s*$/) !== null) {
			return null;
		}
		return normalizePath(value);
	}
	
	display(): void {
		const workspacesMode = this.plugin.workspacesMode();
		const dailynotesAutorun = getDailynotesAutorun(this.app);
		this.containerEl.empty();

		const suggestor = workspacesMode ? WorkspaceSuggest : FileSuggest;
		const homepageDesc = `The name of the ${workspacesMode ? "workspace": "note or canvas"} to open.`;
		const homepage = workspacesMode ? "workspace" : "defaultNote";

		// only show the moment field if they're enabled and the workspace isn't, other show the regular entry field
		if (this.plugin.settings.useMoment && !workspacesMode) {
			const dateSetting = new Setting(this.containerEl).setName("Homepage format");
			
			dateSetting.descEl.innerHTML += 
				`A valid Moment format specification determining the note or canvas to open.<br>
				Surround words in <code style="padding:0">[brackets]</code> to include them;
				see the <a href="https://momentjs.com/docs/#/displaying/format/" target="_blank" rel="noopener"> 
				reference</a> for syntax details.<br> Currently, your specification will produce: `;
			
			const sample = dateSetting.descEl.createEl("b", {attr: {class: "u-pop"}});
			
			dateSetting.addMomentFormat(text => text
				.setDefaultFormat("YYYY-MM-DD")
				.setValue(this.plugin.settings.momentFormat)
				.onChange(async value => {
					this.plugin.settings.momentFormat = value;
					await this.plugin.saveSettings();
				})
				.setSampleEl(sample)
			);
		} 
		else {
			new Setting(this.containerEl)
				.setName("Homepage")
				.setDesc(homepageDesc)
				.addText(text => {
					new suggestor(this.app, text.inputEl);
					text.setPlaceholder(DEFAULT[homepage])
						.setValue(DEFAULT[homepage] == this.settings[homepage] ? "" : this.settings[homepage])
						.onChange(async (value) => {
							this.settings[homepage] = this.sanitiseNote(value) || DEFAULT[homepage];
							await this.plugin.saveSettings();
						});
				});
		}

		this.addToggle(
			"Use date formatting", "Open the homepage using Moment date syntax. This allows opening different homepages at different times or dates.",
			"useMoment",
			(_) => this.display()
		);

		if (this.plugin.workspacePlugin?.enabled) {
			this.addToggle(
				"Use workspaces", "Open a workspace, instead of a note or canvas, as the homepage.",
				"workspaceEnabled",
				(_) => this.display(),
				true
			);
		}
		
		let startupSetting = this.addToggle(
			"Open on startup", "When launching Obsidian, open the homepage.",
			"openOnStartup",
			(_) => this.display(),
			true
		);
		
		if (dailynotesAutorun) {
			startupSetting.descEl.createDiv({
				text: `This setting has been disabled, as it isn't compatible with Daily Notes' "Open daily note on startup" functionality. To use it, disable the Daily Notes setting.`, 
				attr: {class: "mod-warning"}
			});
			this.disableSetting(startupSetting.settingEl);
		}
		startupSetting.settingEl.style.cssText += "padding-top: 30px; border-top: none !important";
		
		this.addToggle(
			"Use ribbon icon", "Show a little house on the ribbon, allowing you to quickly access the homepage.",
			"hasRibbonIcon",
			(value) => this.plugin.setIcon(value),
			true
		);

		this.addHeading("Vault environment");
		let openingSetting = this.addDropdown(
			"Opening method", "Determine how extant tabs and panes are affected on startup.", 
			"openMode",
			Mode
		);
		this.addDropdown(
			"Manual opening method", "Determine how extant tabs and panes are affected when opening with commands or the ribbon button.", 
			"manualOpenMode",
			Mode
		);
		this.addToggle("Auto-create", "If the homepage doesn't exist, create a note with the specified name.", "autoCreate");
		this.addToggle("Pin", "Pin the homepage when opening.", "pin");
		
		this.addHeading("Pane");
		this.addDropdown(
			"Homepage view", "Choose what view to open the homepage in.", 
			"view",
			View
		);
		this.addToggle(
			"Revert view on close", "When navigating away from the homepage, restore the default view.", 
			"revertView",
			(value) => this.plugin.setReversion(value)
		);
		this.addToggle("Auto-scroll", "When opening the homepage, scroll to the bottom and focus on the last line.", "autoScroll");
		
		if (getDataviewPlugin(this.plugin.app)) {
			this.addToggle(
				"Refresh Dataview", "Always attempt to reload Dataview views when opening the homepage.", "refreshDataview"
			).descEl.createDiv({
				text: "Requires Dataview auto-refresh to be enabled.", attr: {class: "mod-warning"}
			});
		}
		
		if (workspacesMode) Array.from(document.getElementsByClassName(HIDDEN)).forEach(this.disableSetting);
		if (!this.settings.openOnStartup || dailynotesAutorun) this.disableSetting(openingSetting.settingEl);
	}
	
	disableSetting(setting: Element): void {
		setting.setAttribute("style", "opacity: .5; pointer-events: none !important;");
	}
	
	addHeading(name: string): Setting {
		const heading = new Setting(this.containerEl).setHeading().setName(name);
		heading.settingEl.addClass(HIDDEN);
		return heading;
	}
	
	addDropdown(name: string, desc: string, setting: string, source: object): Setting {
		const dropdown = new Setting(this.containerEl)
			.setName(name).setDesc(desc)
			.addDropdown(async dropdown => {
				for (let key of Object.values(source)) {
					dropdown.addOption(key, key);
				}
				dropdown.setValue(this.settings[setting]);
				dropdown.onChange(async option => {
					this.settings[setting] = option;
					await this.plugin.saveSettings();
				});
			});
		
		dropdown.settingEl.addClass(HIDDEN);
		return dropdown;
	}

	addToggle(name: string, desc: string, setting: string, callback?: (v: any) => any, workspaces: boolean = false): Setting {
		const toggle = new Setting(this.containerEl)
			.setName(name).setDesc(desc)
			.addToggle(toggle => toggle
				.setValue(this.settings[setting])
				.onChange(async value => {
					this.settings[setting] = value;
					await this.plugin.saveSettings();
					if (callback) callback(value);
				})
			);
		
		if (!workspaces) toggle.settingEl.addClass(HIDDEN);
		return toggle;
	}
}
