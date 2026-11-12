"""Sites built before crm learned to follow the company's currency kept ERPNext's
install-time default (INR). Align the ones with no deals yet."""

from crm.install import align_currency_with_company


def execute():
	align_currency_with_company()
