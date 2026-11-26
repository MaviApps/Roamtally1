import React, { useState } from 'react';
import {
  CalendarClock,
  Compass,
  CreditCard,
  LayoutDashboard,
  Lock,
  LogOut,
  Map as MapIcon,
  Menu,
  MoreHorizontal,
  Plus,
  Receipt,
  Smartphone,
  X,
} from 'lucide-react';
import { MaviProvider, useMavi } from './context/MaviContext';
import { createNewTrip, updateUserCustomization } from './lib/maviService';
import { LandingPage } from './components/LandingPage';
import { MascotAvatar, MascotCustomizerModal } from './components/MascotAvatar';
import { NewTripModal } from './components/NewTripModal';
import { MobileAppInstallModal, OfflineIndicator, PWAInstallButton } from './components/PWAControls';
import { RoamTallyLogo } from './components/RoamTallyLogo';
import { OverviewView } from './components/views/OverviewView';
import { ExpensesView } from './components/views/ExpensesView';
import { ItineraryView } from './components/views/ItineraryView';
import { VaultView } from './components/views/VaultView';
import { OfflineMapView } from './components/views/OfflineMapView';
import { SubscriptionsView } from './components/views/SubscriptionsView';

type ActiveTab = 'overview' | 'expenses' | 'itinerary' | 'vault' | 'maps' | 'subscriptions';

const BASE_TABS: Array<{
  id: ActiveTab;
  label: string;
  mobileLabel: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'overview', label: 'Overview', mobileLabel: 'Home', icon: LayoutDashboard },
  { id: 'expenses', label: 'Splitwise Ledger', mobileLabel: 'Split', icon: Receipt },
  { id: 'itinerary', label: 'Itinerary & Spots', mobileLabel: 'Plan', icon: CalendarClock },
  { id: 'vault', label: 'Travel Wallet', mobileLabel: 'Wallet', icon: Lock },
  { id: 'maps', label: 'Offline Maps', mobileLabel: 'Maps', icon: MapIcon },
  { id: 'subscriptions', label: 'Plans & Support', mobileLabel: 'Plans', icon: CreditCard },
];

const MOBILE_PRIMARY_TABS: ActiveTab[] = ['overview', 'expenses', 'itinerary', 'maps'];

function MaviWorkspace() {
  const {
    authReady,
    firebaseUser,
    profile,
    trips,
    members,
    activeTrip,
    activeTripId,
    setActiveTripId,
    authBackend,
    loginWithGoogle,
    loginWithEmail,
    registerWithEmail,
    logout,
    authError,
  } = useMavi();

  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showNewTrip, setShowNewTrip] = useState(false);
  const [showCustomize, setShowCustomize] = useState(false);
  const [showMobileInstall, setShowMobileInstall] = useState(false);
  const [simulatedOffline, setSimulatedOffline] = useState(false);

  if (!authReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex items-center gap-3 text-sm font-medium text-slate-600">
          <Compass className="h-5 w-5 animate-spin text-teal-600" />
          Loading RoamTally...
        </div>
      </div>
    );
  }

  if (!firebaseUser || !profile) {
    return (
      <>
        <LandingPage
          authBackend={authBackend}
          onSignIn={loginWithGoogle}
          onEmailSignIn={loginWithEmail}
          onEmailSignUp={registerWithEmail}
          authError={authError}
        />
        <OfflineIndicator />
      </>
    );
  }

  const isSoloMode = profile.licenseTier === 'solo' || members.length <= 1;
  const tabs = BASE_TABS.map((t) =>
    t.id === 'expenses' && isSoloMode
      ? { ...t, label: 'Expense Manager', mobileLabel: 'Expenses' }
      : t
  );

  const isCoralAccent = profile.themeAccent === 'sunset-coral';
  const activeNavClass = isCoralAccent
    ? 'bg-orange-50 text-orange-800 border-orange-200 font-semibold'
    : 'bg-teal-50 text-teal-800 border-teal-200 font-semibold';
  const activeMobileTextClass = isCoralAccent ? 'text-orange-600' : 'text-teal-700';

  const activeTabLabel = tabs.find((t) => t.id === activeTab)?.label || 'Overview';
  const isMoreActive = activeTab === 'vault' || activeTab === 'subscriptions';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex">
      {/* Persistent Desktop Sidebar */}
      <aside className="hidden lg:flex w-64 shrink-0 flex-col justify-between border-r border-slate-200 bg-white p-5">
        <div className="space-y-6">
          <div className="flex items-center justify-between gap-2">
            <RoamTallyLogo size="md" showTagline />
            <span className="text-xs font-mono-num text-slate-500">
              {profile.licenseTier === 'group5' ? '5-Member' : profile.licenseTier === 'solo' ? 'Solo' : 'Trial'}
            </span>
          </div>

          <div>
            <label htmlFor="sidebar-trip-select" className="block text-xs font-medium text-slate-500 mb-1.5">
              Active Trip
            </label>
            <select
              id="sidebar-trip-select"
              value={activeTripId || ''}
              onChange={(e) => setActiveTripId(e.target.value || null)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800"
            >
              {trips.length === 0 ? (
                <option value="">No trips yet</option>
              ) : (
                trips.map((t) => (
                  <option key={t.tripId} value={t.tripId}>
                    {t.title} {t.isHistoricalArchive ? '(Archive)' : ''}
                  </option>
                ))
              )}
            </select>
          </div>

          <nav className="space-y-1">
            {tabs.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors cursor-pointer whitespace-nowrap ${
                    isActive
                      ? activeNavClass
                      : 'border-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="border-t border-slate-200 pt-4 space-y-2.5">
          <button
            type="button"
            onClick={() => setShowCustomize(true)}
            className="w-full flex items-center gap-3 rounded-xl border border-slate-200 p-2.5 text-left hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <MascotAvatar mascotId={profile.mascotId} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-900 truncate">{profile.displayName}</p>
              <p className="text-xs text-slate-500 truncate">Customize mascot</p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setShowMobileInstall(true)}
            className="w-full flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            <Smartphone className="h-3.5 w-3.5 text-teal-600" />
            Get Mobile App
          </button>

          <button
            type="button"
            onClick={logout}
            className="w-full flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 cursor-pointer"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Mobile Bottom Action Sheet (More / Vault / Plans / Trip Switcher / Install App) */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end lg:hidden bg-slate-900/45 backdrop-blur-xs"
          onClick={() => setMobileMenuOpen(false)}
        >
          <div
            className="w-full max-h-[85vh] overflow-y-auto rounded-t-3xl border-t border-slate-200 bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto h-1.5 w-10 rounded-full bg-slate-300" />

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <MascotAvatar mascotId={profile.mascotId} size="sm" />
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900 truncate">{profile.displayName}</p>
                  <p className="text-xs text-slate-500">
                    Mavi Solution ·{' '}
                    {profile.licenseTier === 'group5' ? '5-Member Plan' : profile.licenseTier === 'solo' ? 'Solo Plan' : 'Starter'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Close mobile menu"
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div>
              <label htmlFor="mobile-trip-select" className="block text-xs font-medium text-slate-500 mb-1.5">
                Switch Active Trip
              </label>
              <select
                id="mobile-trip-select"
                value={activeTripId || ''}
                onChange={(e) => {
                  setActiveTripId(e.target.value || null);
                  setMobileMenuOpen(false);
                }}
                className="w-full min-h-[44px] rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800"
              >
                {trips.length === 0 ? (
                  <option value="">No trips yet</option>
                ) : (
                  trips.map((t) => (
                    <option key={t.tripId} value={t.tripId}>
                      {t.title} {t.isHistoricalArchive ? '(Archive)' : ''}
                    </option>
                  ))
                )}
              </select>
            </div>

            <nav className="grid grid-cols-2 gap-2">
              {tabs.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`min-h-[48px] flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors cursor-pointer ${
                      isActive ? activeNavClass : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </nav>

            <div className="grid grid-cols-2 gap-2 border-t border-slate-200 pt-4">
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  setShowMobileInstall(true);
                }}
                className="min-h-[44px] flex items-center justify-center gap-2 rounded-xl border border-teal-200 bg-teal-50/70 px-3 py-2 text-xs font-semibold text-teal-800 cursor-pointer"
              >
                <Smartphone className="h-4 w-4" />
                Install Mobile App
              </button>
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  setShowCustomize(true);
                }}
                className="min-h-[44px] flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 cursor-pointer"
              >
                Customize Mascot
              </button>
            </div>

            <button
              type="button"
              onClick={logout}
              className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-xl border border-slate-200 py-2.5 text-xs font-medium text-slate-600 cursor-pointer"
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 h-[52px] lg:h-auto flex items-center justify-between gap-4 lg:gap-8 border-b border-slate-200 bg-white/95 backdrop-blur-md px-4 lg:px-6 lg:py-3.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open trip and account sheet"
              className="lg:hidden min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg border border-slate-200 text-slate-700 cursor-pointer shrink-0"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-2 min-w-0">
              <RoamTallyLogo size="sm" showWordmark={false} className="lg:hidden" />
              <p className="text-sm text-slate-500 truncate">
                <span className="font-semibold text-slate-900 font-display">RoamTally</span>
                <span className="mx-1.5 lg:mx-2">/</span>
                <span className="hidden sm:inline">{activeTrip ? activeTrip.title : 'Workspace'}</span>
                <span className="hidden sm:inline mx-2">/</span>
                <span className="text-slate-900 font-medium">{activeTabLabel}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <PWAInstallButton />
            <button
              type="button"
              onClick={() => setShowNewTrip(true)}
              className={`min-h-[40px] inline-flex items-center gap-1.5 rounded-lg px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                isCoralAccent ? 'bg-orange-500 hover:bg-orange-600' : 'bg-teal-600 hover:bg-teal-700'
              }`}
            >
              <Plus className="h-4 w-4" />
              <span>New Trip</span>
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 pb-24 lg:p-6 max-w-6xl w-full mx-auto">
          {activeTab === 'overview' && (
            <OverviewView
              onOpenNewTrip={() => setShowNewTrip(true)}
              onOpenCustomize={() => setShowCustomize(true)}
              onNavigateTab={(tab) => setActiveTab(tab)}
            />
          )}
          {activeTab === 'expenses' && <ExpensesView />}
          {activeTab === 'itinerary' && <ItineraryView />}
          {activeTab === 'vault' && <VaultView />}
          {activeTab === 'maps' && (
            <OfflineMapView
              simulatedOffline={simulatedOffline}
              onToggleSimulatedOffline={() => setSimulatedOffline((v) => !v)}
            />
          )}
          {activeTab === 'subscriptions' && <SubscriptionsView />}
        </main>
      </div>

      {/* Mobile Fixed Bottom Thumb-Zone Navigation Bar (<= 64px, keeping total sticky <= 15%) */}
      <nav
        aria-label="Mobile Navigation"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)]"
      >
        <div className="grid grid-cols-5 h-16 items-center">
          {MOBILE_PRIMARY_TABS.map((tabId) => {
            const item = tabs.find((t) => t.id === tabId)!;
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 px-1 transition-colors cursor-pointer ${
                  isActive ? `${activeMobileTextClass} font-semibold` : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Icon className="h-5 w-5" />
                <span className="text-[11px] leading-tight tracking-tight">{item.mobileLabel}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 px-1 transition-colors cursor-pointer ${
              isMoreActive || mobileMenuOpen
                ? `${activeMobileTextClass} font-semibold`
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <MoreHorizontal className="h-5 w-5" />
            <span className="text-[11px] leading-tight tracking-tight">More</span>
          </button>
        </div>
      </nav>

      <NewTripModal
        isOpen={showNewTrip}
        onClose={() => setShowNewTrip(false)}
        licenseTier={profile.licenseTier}
        onOpenSubscriptions={() => setActiveTab('subscriptions')}
        onCreate={async (payload) => {
          const id = await createNewTrip({
            owner: profile,
            ...payload,
          });
          setActiveTripId(id);
          setActiveTab('overview');
        }}
      />

      <MascotCustomizerModal
        isOpen={showCustomize}
        onClose={() => setShowCustomize(false)}
        initialName={profile.displayName}
        initialMascot={profile.mascotId}
        initialAccent={profile.themeAccent}
        onSave={async (displayName, mascotId, themeAccent) => {
          await updateUserCustomization(profile.uid, displayName, mascotId, themeAccent);
        }}
      />

      <MobileAppInstallModal
        isOpen={showMobileInstall}
        onClose={() => setShowMobileInstall(false)}
      />

      <OfflineIndicator simulatedOffline={simulatedOffline} />
    </div>
  );
}

export default function App() {
  return (
    <MaviProvider>
      <MaviWorkspace />
    </MaviProvider>
  );
}
