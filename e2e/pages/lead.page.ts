import { Page, expect } from "@playwright/test";

/**
 * Lead detail view (/crm/leads/:name): convert-to-deal and email compose.
 */
export class LeadPage {
	constructor(private page: Page) {}

	async goto(name: string) {
		await this.page.goto(`/crm/leads/${name}`);
		await this.page.waitForLoadState("networkidle");
	}

	/**
	 * The email composer caches its draft (recipients/subject/body) in
	 * localStorage. Clear it so the composer starts from this lead's own data,
	 * keeping the flow deterministic across tests that share storage state.
	 */
	async clearComposerDraft() {
		await this.page.evaluate(() => window.localStorage.clear());
		await this.page.reload();
		await this.page.waitForLoadState("networkidle");
	}

	/** Review identity, convert, and leave the explicit success actions visible. */
	async convertToDeal(
		identity: { contact?: string; organization?: string } = {},
	) {
		await this.page.getByRole("button", { name: "Convert to Deal" }).click();
		const dialog = this.page.getByRole("dialog").filter({
			has: this.page.getByRole("heading", {
				name: "Convert to Deal",
				exact: true,
			}),
		});
		await expect(
			dialog.getByRole("heading", { name: "Convert to Deal" }),
		).toBeVisible();
		if (identity.contact) {
			await dialog
				.getByRole("button", { name: identity.contact, exact: true })
				.click();
		}
		if (identity.organization) {
			await dialog
				.getByRole("button", { name: identity.organization, exact: true })
				.click();
		}
		await dialog.getByRole("button", { name: "Convert", exact: true }).click();
		await expect(dialog.getByRole("status")).toContainText("Lead converted to");
		await expect(
			dialog.getByRole("button", { name: "Open deal", exact: true }),
		).toBeVisible();
		await expect(
			dialog.getByRole("button", { name: "Schedule next step", exact: true }),
		).toBeVisible();
		await expect(
			dialog.getByRole("button", { name: "Return to queue", exact: true }),
		).toBeVisible();
		return dialog;
	}

	/** Toggle the email composer open. */
	async openEmailBox() {
		await this.page.getByRole("button", { name: "Reply" }).click();
	}

	/** Type a body into the composer and send. Subject is pre-filled by CRM. */
	async sendEmail(body: string) {
		const editor = this.page.locator('[contenteditable="true"]').last();
		await editor.click();
		await editor.fill(body);
		// The label carries a platform-dependent shortcut hint, e.g. "Send (⌘⏎)".
		// Anchored both ends so it can't match "Send an Email" / "Send Template".
		await this.page.getByRole("button", { name: /^Send(\s*\(.*\))?$/ }).click();
	}

	/** Switch to a named tab in the activity area (Activity, Emails, ...). */
	async openTab(name: string) {
		await this.page.getByRole("tab", { name }).click();
	}
}
