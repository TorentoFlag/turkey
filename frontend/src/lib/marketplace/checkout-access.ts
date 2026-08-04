export type CheckoutAccount = { email: string } | null;

export function canAccessCheckout(account: CheckoutAccount) {
  return Boolean(account?.email.trim());
}
