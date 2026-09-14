# CRM release CI

The fork ships inside `ghcr.io/holymc2/doco-bench`, published by Muelle's
source-locked image pipeline. The inherited standalone publisher built upstream
`frappe/crm` on Frappe 15 instead of this fork, and failed on mixed-case registry
names. It has been replaced with checks of the actual checkout: frontend unit
tests, production assets, and the complete native CRM suite on a disposable
multi-app Frappe 16 bench.

Set repository variable `CRM_CI_IMAGE` to an approved immutable Muelle digest.
The native job mounts the checkout read-only and copies CRM into its disposable
container. It uses an internal Docker network with no production volumes, ports,
credentials or outgoing integrations. `GITHUB_TOKEN` needs package pull access.

The image must include Payments (the ERPNext fixture graph requires Payment Gateway)
and Doco Meta Catalog (the owner of Social Shop). The runner installs both native
apps and enables Frappe's `mute_emails` setting before app setup.

Record the exact CRM revision, CI run, base digest and final Muelle image digest
in the release receipt. Neither an older green run nor image build alone proves
the current tests passed. Keep existing upstream compatibility workflows for
pull requests; the release workflow runs for reviewed release branches and tags.
