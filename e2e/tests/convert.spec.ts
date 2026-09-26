import { test, expect } from "@playwright/test";
import { LeadPage } from "../pages";
import {
	callMethod,
	createDoc,
	deleteDoc,
	DEAL_DOCTYPE,
	getDoc,
	getList,
	LEAD_DOCTYPE,
	seedLead,
	uniqueSuffix,
} from "../helpers";

test.describe("Reviewed lead conversion and task continuity", () => {
	test("selects identity, creates exactly one deal, preserves an open task and schedules the next step", async ({
		page,
		request,
	}) => {
		const cleanup: Array<{ doctype: string; name: string }> = [];
		const suffix = uniqueSuffix();
		const nextTitle = `E2E conversion next step ${suffix}`;
		const actor = process.env.FRAPPE_USER || "Administrator";
		let leadName = "";
		try {
			const lead = await seedLead(request);
			leadName = lead.name;
			cleanup.push({ doctype: LEAD_DOCTYPE, name: lead.name });
			const organization = await createDoc<{ name: string }>(
				request,
				"CRM Organization",
				{
					organization_name: lead.organization,
				},
			);
			cleanup.push({ doctype: "CRM Organization", name: organization.name });
			const contactLabel = `E2E reviewed person ${suffix}`;
			const contact = await createDoc<{ name: string }>(request, "Contact", {
				first_name: contactLabel,
				email_ids: [{ email_id: lead.email, is_primary: 1 }],
			});
			cleanup.push({ doctype: "Contact", name: contact.name });
			const openTask = await createDoc<{ name: string }>(request, "CRM Task", {
				title: `E2E original next step ${suffix}`,
				status: "Todo",
				activity_type: "Task",
				assigned_to: actor,
				reference_doctype: LEAD_DOCTYPE,
				reference_docname: lead.name,
				due_date: new Date(Date.now() + 86400000)
					.toISOString()
					.slice(0, 19)
					.replace("T", " "),
			});
			cleanup.push({ doctype: "CRM Task", name: openTask.name });
			const leadPage = new LeadPage(page);
			await leadPage.goto(lead.name);
			const conversion = await leadPage.convertToDeal({
				contact: contactLabel,
				organization: organization.name,
			});
			const linkedDeals = () =>
				getList<{ name: string }>(request, DEAL_DOCTYPE, {
					filters: { lead: lead.name },
					fields: ["name"],
				});
			await expect.poll(async () => (await linkedDeals()).length).toBe(1);
			const [{ name: dealName }] = await linkedDeals();
			cleanup.push({ doctype: DEAL_DOCTYPE, name: dealName });
			const deal = await getDoc<{
				organization: string;
				contacts: Array<{ contact: string }>;
			}>(request, DEAL_DOCTYPE, dealName);
			expect(deal.organization).toBe(organization.name);
			expect(deal.contacts.map((row) => row.contact)).toEqual([contact.name]);
			const moved = await getDoc<{
				reference_doctype: string;
				reference_docname: string;
				status: string;
			}>(request, "CRM Task", openTask.name);
			expect(moved).toMatchObject({
				reference_doctype: DEAL_DOCTYPE,
				reference_docname: dealName,
				status: "Todo",
			});
			const replay = await callMethod<string>(
				request,
				"crm.fcrm.doctype.crm_lead.crm_lead.convert_to_deal",
				{ lead: lead.name },
			);
			expect(replay).toBe(dealName);
			expect(await linkedDeals()).toHaveLength(1);

			await conversion
				.getByRole("button", { name: "Schedule next step", exact: true })
				.click();
			const taskDialog = page.getByRole("dialog").filter({
				has: page.getByRole("heading", {
					name: "Create Next step",
					exact: true,
				}),
			});
			await expect(taskDialog).toBeVisible();
			await taskDialog.getByLabel("Title", { exact: true }).fill(nextTitle);
			await taskDialog
				.getByRole("button", { name: "Create", exact: true })
				.click();
			await expect(taskDialog).toBeHidden();
			const nextTasks = () =>
				getList<{
					name: string;
					reference_doctype: string;
					reference_docname: string;
					assigned_to: string;
				}>(request, "CRM Task", {
					filters: { title: nextTitle },
					fields: [
						"name",
						"reference_doctype",
						"reference_docname",
						"assigned_to",
					],
				});
			await expect.poll(async () => (await nextTasks()).length).toBe(1);
			const [nextTask] = await nextTasks();
			expect(nextTask).toMatchObject({
				reference_doctype: DEAL_DOCTYPE,
				reference_docname: dealName,
				assigned_to: actor,
			});
			await conversion
				.getByRole("button", { name: "Open deal", exact: true })
				.click();
			await expect
				.poll(() => new URL(page.url()).pathname)
				.toBe(`/crm/deals/${dealName}`);
			await test.info().attach("conversion-native-receipt", {
				body: JSON.stringify(
					{
						lead: lead.name,
						deal: dealName,
						selected_contact: contact.name,
						selected_organization: organization.name,
						preserved_task: openTask.name,
						next_task: nextTask.name,
						replay,
					},
					null,
					2,
				),
				contentType: "application/json",
			});
		} finally {
			// Only this test's exact synthetic records; no global e2e-* deletion.
			const nextTasks = await getList<{ name: string }>(request, "CRM Task", {
				filters: { title: nextTitle },
				fields: ["name"],
			});
			for (const row of nextTasks)
				cleanup.push({ doctype: "CRM Task", name: row.name });
			if (leadName) {
				const deals = await getList<{ name: string }>(request, DEAL_DOCTYPE, {
					filters: { lead: leadName },
					fields: ["name"],
				});
				for (const row of deals)
					if (
						!cleanup.some(
							(item) => item.doctype === DEAL_DOCTYPE && item.name === row.name,
						)
					)
						cleanup.push({ doctype: DEAL_DOCTYPE, name: row.name });
			}
			for (const doctype of [
				"CRM Task",
				DEAL_DOCTYPE,
				LEAD_DOCTYPE,
				"Contact",
				"CRM Organization",
			]) {
				for (const row of cleanup.filter((item) => item.doctype === doctype))
					await deleteDoc(request, row.doctype, row.name);
			}
		}
	});
});
