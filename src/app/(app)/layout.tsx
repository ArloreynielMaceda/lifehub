import { redirect } from "next/navigation";
import { connection } from "next/server";

import { MobileNav } from "@/components/app/mobile-nav";
import { QuickAddMenu } from "@/components/app/quick-add-menu";
import { SidebarNav } from "@/components/app/sidebar-nav";
import { UserMenu } from "@/components/app/user-menu";
import { Logo } from "@/components/shared/logo";
import { SetupRequired } from "@/components/shared/setup-required";
import { NotificationBell } from "@/features/notifications/components/notification-bell";
import { getNotificationSummary, syncNotifications } from "@/features/notifications/queries";
import { getProfile, getSessionUser, initials } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Private pages are always rendered per request (never prerendered at build time).
  await connection();
  if (!isSupabaseConfigured()) return <SetupRequired />;

  // Defense in depth: the proxy already redirects signed-out visitors.
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const profile = await getProfile();
  await syncNotifications();
  const notifications = await getNotificationSummary(profile.timezone);

  const displayName = profile.full_name.trim() || user.email?.split("@")[0] || "Your account";
  const userInitials = initials(profile, user.email);

  return (
    <div className="min-h-dvh bg-canvas lg:flex">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-card px-3 py-2 text-sm font-medium focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:ring-2 focus:ring-ring"
      >
        Skip to content
      </a>

      <aside className="hidden w-64 shrink-0 flex-col gap-6 px-4 py-5 lg:sticky lg:top-0 lg:flex lg:h-dvh">
        <Logo href="/dashboard" className="px-2 pt-1" />
        <UserMenu name={displayName} email={user.email} initials={userInitials} />
        <SidebarNav />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col lg:py-2 lg:pr-2">
        <div className="flex min-h-dvh flex-1 flex-col bg-background lg:min-h-0 lg:rounded-2xl lg:border lg:shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/90 px-3 backdrop-blur-sm sm:px-5 lg:static lg:rounded-t-2xl lg:border-transparent lg:bg-transparent lg:px-8 lg:pt-3 lg:backdrop-blur-none">
            <MobileNav name={displayName} email={user.email} initials={userInitials} />
            <Logo href="/dashboard" className="lg:hidden" />
            <div className="ml-auto flex items-center gap-1.5">
              <QuickAddMenu />
              <NotificationBell items={notifications.items} unreadCount={notifications.unreadCount} />
            </div>
          </header>
          <main id="main" tabIndex={-1} className="flex-1 px-4 pt-6 pb-16 outline-none sm:px-6 lg:px-10 lg:pt-4">
            <div className="mx-auto w-full max-w-6xl">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}
