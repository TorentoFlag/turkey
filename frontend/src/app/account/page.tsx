import { MarketplaceShell } from "@/components/marketplace/MarketplaceShell";
import { AccountGate } from "@/components/marketplace/AccountGate";

export default function AccountPage() {
  return (
    <MarketplaceShell currentPath="/account" title="Личный кабинет" description="Ваши заказы, инструкции и каналы доставки в одном месте.">
      <AccountGate />
    </MarketplaceShell>
  );
}
