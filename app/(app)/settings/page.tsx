import type { Metadata } from 'next';
import { requireOwner } from '@/src/lib/auth-guards';
import { getSettingsData } from '@/src/actions/settings';
import { SettingsForm } from '@/components/settings/settings-form';

export const metadata: Metadata = {
  title: 'Store Settings | Jayaweera Logistic & Motors',
};

export default async function SettingsPage() {
  await requireOwner();
  const settingsData = await getSettingsData();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl text-foreground">
          Store Settings
        </h1>
        <p className="text-sm text-muted-foreground">
          Manage shop identity, receipt header/footer details, and cashier checkout policies.
        </p>
      </div>

      <SettingsForm initialData={settingsData} />
    </div>
  );
}
