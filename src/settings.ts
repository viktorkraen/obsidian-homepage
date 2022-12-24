import { App, PluginSettingTab, Setting, TAbstractFile, TFile, normalizePath } from "obsidian";
import Homepage from "./main";
import { TextInputSuggest } from "./suggest";
import { getDailynotesAutorun, getDataviewPlugin, getWorkspacePlugin, trimFile } from "./utils";

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
	hasRibbonIcon: boolean,
	openMode: string,
	manualOpenMode: string,
	view: string,
	revertView: boolean,
	refreshDataview: boolean,
	autoCreate: boolean,
	pin: boolean
}

export const DEFAULT: HomepageSettings = {
	version: 2,
	defaultNote: "Home",
	useMoment: false,
	momentFormat: "YYYY-MM-DD",
	workspace: "Home",
	workspaceEnabled: false,
	hasRibbonIcon: true,
	openMode: Mode.ReplaceAll,
	manualOpenMode: Mode.Retain,
	view: View.Default,
	revertView: true,
	refreshDataview: false,
	autoCreate: true,
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
		this.containerEl.empty();
		
		if (getDailynotesAutorun(this.app)) {
			this.containerEl.insertAdjacentHTML("afterbegin",
				"<div class='mod-warning' style='margin-bottom: 20px'>Daily Notes' 'Open daily note on startup'" +
				" setting is not compatible with this plugin, so functionality has been disabled.</div>"
			);
		}

		const suggestor = workspacesMode ? WorkspaceSuggest : FileSuggest;
		const homepageDesc = `The name of the ${workspacesMode ? "workspace": "note"} to open on startup.`;
		const homepage = workspacesMode ? "workspace" : "defaultNote";

		// only show the moment field if they're enabled and the workspace isn't, other show the regular entry field
		if (this.plugin.settings.useMoment && !workspacesMode) {
			let dateSetting = new Setting(this.containerEl)
				.setName("Homepage format")
				.setDesc("A valid Moment format specification determining the note to be opened on startup.")
				.addMomentFormat(text => text
					.setDefaultFormat("YYYY-MM-DD")
					.setValue(this.plugin.settings.momentFormat)
					.onChange(async value => {
						this.plugin.settings.momentFormat = value;
						await this.plugin.saveSettings();
					})
				);
			
			dateSetting.descEl.createEl("br");	
			dateSetting.descEl.createEl("a", {
				text: "Moment formatting info", attr: {href: "https://momentjs.com/docs/#/displaying/format/"}
			});
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
				"Use workspaces", "Open a workspace, instead of a note, as the homepage.",
				"workspaceEnabled",
				(_) => this.display(),
				true
			);
		}

		let ribbonSetting = this.addToggle(
			"Display ribbon icon", "Show a little house on the ribbon, allowing you to quickly access the homepage.",
			"hasRibbonIcon",
			(value) => this.plugin.setIcon(value),
			true
		);
		
		ribbonSetting.settingEl.setAttribute("style", "padding-top: 70px; border-top: none !important");

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
		
		this.addDropdown(
			"Opening method", "Determine how existing notes are affected on startup.", 
			"openMode",
			Mode
		);
		
		this.addDropdown(
			"Manual opening method", 
			"Determine how existing notes are affected when opening with commands or the ribbon button.", 
			"manualOpenMode",
			Mode
		);
			
		this.addToggle("Auto-create", "If the homepage doesn't exist, create a note with the specified name.", "autoCreate");
		this.addToggle("Pin", "Pin the homepage when opening.", "pin");
		
		if (getDataviewPlugin(this.plugin.app)) {
			let refreshSetting = this.addToggle(
				"Refresh Dataview", "Always attempt to reload Dataview views when opening the homepage.", "refreshDataview"
			);

			refreshSetting.descEl.createDiv({
				text: "Requires Dataview auto-refresh to be enabled.", attr: {class: "mod-warning"}
			});
		}
		
		if (workspacesMode) {
			Array.from(document.getElementsByClassName(HIDDEN)).forEach(
				s => s.setAttribute("style", "opacity: .5; pointer-events: none !important")
			);
		}
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
			})
		
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

class FileSuggest extends TextInputSuggest<TFile> {
	getSuggestions(inputStr: string): TFile[] {
		const abstractFiles = this.app.vault.getAllLoadedFiles();
		const files: TFile[] = [];
		const inputLower = inputStr.toLowerCase();

		abstractFiles.forEach((file: TAbstractFile) => {
			if (
				file instanceof TFile && file.extension === "md" &&
				file.path.toLowerCase().contains(inputLower)
			) {
				files.push(file);
			}
		});

		return files;
	}

	renderSuggestion(file: TFile, el: HTMLElement) {
		el.setText(trimFile(file));
	 }

	selectSuggestion(file: TFile) {
		this.inputEl.value = trimFile(file);
		this.inputEl.trigger("input");
		this.close();
	}
}

class WorkspaceSuggest extends TextInputSuggest<string> {
	getSuggestions(inputStr: string): string[] {
		const workspaces = Object.keys(getWorkspacePlugin(this.app)?.instance.workspaces);
		const inputLower = inputStr.toLowerCase();

		return workspaces.filter((workspace: string) => workspace.toLowerCase().contains(inputLower));
	}

	renderSuggestion(workspace: string, el: HTMLElement) {
		el.setText(workspace);
	 }

	selectSuggestion(workspace: string) {
		this.inputEl.value = workspace;
		this.inputEl.trigger("input");
		this.close();
	}
}
