import React, { useState } from 'react';
import { Compass, Lock, Map, Receipt, Smartphone, Sparkles } from 'lucide-react';
import { HERO_BANNER_IMAGE, MASCOT_OPTIONS } from '../types/mavi';
import { MascotAvatar } from './MascotAvatar';
import { MobileAppInstallModal, PWAInstallButton } from './PWAControls';
import { RoamTallyLogo } from './RoamTallyLogo';

interface LandingPageProps {
  authBackend: 'supabase' | 'firebase';
  onSignIn: () => Promise<void>;
  onEmailSignIn: (email: string, password: string) => Promise<void>;
  onEmailSignUp: (email: string, password: string, displayName: string) => Promise<string | null>;
  authError: string | null;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  authBackend,
  onSignIn,
  onEmailSignIn,
  onEmailSignUp,
  authError,
}) => {
  const [heroImgFailed, setHeroImgFailed] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [showMobileInstall, setShowMobileInstall] = useState(false);
  const [emailMode, setEmailMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [emailInfo, setEmailInfo] = useState<string | null>(null);

  const handleLogin = async () => {
    setSigningIn(true);
    try {
      await onSignIn();
    } finally {
      setSigningIn(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setSigningIn(true);
    setEmailInfo(null);
    try {
      if (emailMode === 'signup') {
        const msg = await onEmailSignUp(email, password, fullName);
        if (msg) setEmailInfo(msg);
      } else {
        await onEmailSignIn(email, password);
      }
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 sm:gap-8 px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-200 bg-white">
        <a href="#top" className="shrink-0">
          <RoamTallyLogo size="md" showTagline />
        </a>
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
          <a href="#features" className="hover:text-teal-700 transition-colors whitespace-nowrap shrink-0">
            Features
          </a>
          <a href="#companions" className="hover:text-teal-700 transition-colors whitespace-nowrap shrink-0">
            Companions
          </a>
          <a href="#pricing" className="hover:text-teal-700 transition-colors whitespace-nowrap shrink-0">
            Licensing
          </a>
        </nav>
        <div className="flex items-center gap-3 shrink-0">
          <PWAInstallButton />
          <button
            type="button"
            onClick={handleLogin}
            disabled={signingIn}
            className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 transition-colors whitespace-nowrap shrink-0 disabled:opacity-60 cursor-pointer"
          >
            {signingIn ? 'Signing in...' : 'Sign in with Google'}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-8 sm:py-12 space-y-12 sm:space-y-16">
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          <div className="lg:col-span-6 flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
            <div>
              <p className="text-xs font-medium text-teal-700">
                Powered by MaVi · Solo Expense Manager &amp; Group Splitwise
              </p>
              <h1
                className="mt-4 text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 leading-tight"
                style={{ textWrap: 'balance' }}
              >
                Track every solo mile or split every group cost automatically.
              </h1>
              <p className="mt-4 text-base text-slate-600 leading-relaxed max-w-xl">
                RoamTally pairs personal travel expense management for solo explorers with real-time Splitwise group
                splitting. Update a flight, stay, or meal once—local currency conversion, weather alerts, encrypted
                documents, and offline maps stay synced everywhere.
              </p>
            </div>

            <div className="mt-8 space-y-4">
              {authError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-800">
                  {authError}
                </div>
              )}
              {emailInfo && (
                <div className="rounded-lg border border-teal-200 bg-teal-50 px-4 py-2.5 text-sm text-teal-900">
                  {emailInfo}
                </div>
              )}

              {authBackend === 'supabase' && (
                <form onSubmit={handleEmailSubmit} className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-800">
                      {emailMode === 'signin' ? 'Sign in with Email' : 'Create RoamTally Account'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setEmailMode((m) => (m === 'signin' ? 'signup' : 'signin'))}
                      className="text-xs font-medium text-teal-700 hover:underline cursor-pointer"
                    >
                      {emailMode === 'signin' ? 'Need an account? Sign up' : 'Already have an account? Sign in'}
                    </button>
                  </div>
                  {emailMode === 'signup' && (
                    <input
                      type="text"
                      placeholder="Your Name"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                    />
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <input
                      type="email"
                      required
                      placeholder="you@domain.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                    />
                    <input
                      type="password"
                      required
                      minLength={6}
                      placeholder="Password (min 6 chars)"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={signingIn}
                    className="min-h-[44px] w-full rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 transition-colors cursor-pointer disabled:opacity-60"
                  >
                    {signingIn
                      ? 'Connecting...'
                      : emailMode === 'signup'
                      ? 'Create Account with Email'
                      : 'Sign In with Email'}
                  </button>
                </form>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleLogin}
                  disabled={signingIn}
                  className={`min-h-[44px] inline-flex items-center gap-2 rounded-lg px-5 py-3 text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                    authBackend === 'supabase'
                      ? 'border border-slate-300 bg-white text-slate-800 hover:bg-slate-50'
                      : 'bg-teal-600 text-white hover:bg-teal-700'
                  }`}
                >
                  <Compass className="h-4 w-4" />
                  {signingIn
                    ? 'Connecting Account...'
                    : authBackend === 'supabase'
                    ? 'Continue with Google'
                    : 'Start Planning with Google'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowMobileInstall(true)}
                  className="min-h-[44px] inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Smartphone className="h-4 w-4 text-teal-600" />
                  Get Mobile App
                </button>
              </div>
              <p className="text-xs text-slate-500 font-mono-num">
                Monthly $1.99/mo · 6-Month Pass $9.99 · Solo $2.99 · Group (5) $10.00
              </p>
            </div>
          </div>

          <div className="lg:col-span-6 overflow-hidden rounded-2xl border border-slate-200 bg-white">
            {heroImgFailed ? (
              <div className="flex h-full min-h-[340px] flex-col items-center justify-center bg-teal-50 p-8 text-center">
                <Compass className="h-12 w-12 text-teal-600" />
                <p className="mt-3 text-lg font-semibold text-slate-900">MAVI Coastal &amp; Group Travel</p>
                <p className="mt-1 text-sm text-slate-600">
                  Live weather, transit reminders, and Splitwise settlements.
                </p>
              </div>
            ) : (
              <img
                src={HERO_BANNER_IMAGE}
                alt="Sunny coastal town with sailboat and scenic mountain train"
                referrerPolicy="no-referrer"
                onError={() => setHeroImgFailed(true)}
                className="h-full min-h-[340px] w-full object-cover"
              />
            )}
          </div>
        </section>

        <section id="features" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <Receipt className="h-5 w-5 text-teal-600" />
            <h2 className="mt-3 text-base font-semibold text-slate-900">Auto-Synced Splitwise</h2>
            <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">
              Every itinerary flight, hotel, or dinner calculates group shares and simplifies settlements automatically.
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <Sparkles className="h-5 w-5 text-orange-500" />
            <h2 className="mt-3 text-base font-semibold text-slate-900">Live Weather &amp; Spots</h2>
            <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">
              Destination weather forecasts, flight/rail departure reminders, and curated local tourist spots.
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <Lock className="h-5 w-5 text-teal-600" />
            <h2 className="mt-3 text-base font-semibold text-slate-900">Travel Wallet Vault</h2>
            <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">
              Pocket storage for bills, flight tickets, itinerary confirmations, and AES-GCM encrypted trip documents.
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <Map className="h-5 w-5 text-orange-500" />
            <h2 className="mt-3 text-base font-semibold text-slate-900">Offline Remote Maps</h2>
            <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">
              Download destination coordinates, stays, and trail pins directly to local device storage for signal-free zones.
            </p>
          </div>
        </section>

        <section id="companions" className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 pb-6">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">Meet Your MAVI Travel Companions</h2>
              <p className="mt-1 text-sm text-slate-600">
                Friendly illustrated characters for travelers of all ages—pick and customize your companion anytime.
              </p>
            </div>
          </div>
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {MASCOT_OPTIONS.map((m) => (
              <div key={m.id} className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                <MascotAvatar mascotId={m.id} size="xl" className="w-full h-44 rounded-lg" />
                <h3 className="mt-3 text-base font-semibold text-slate-900">{m.name}</h3>
                <p className="text-xs font-medium text-teal-700">{m.role}</p>
                <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">{m.tagline}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="pricing" className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="rounded-xl border border-slate-200 bg-white p-6 flex flex-col justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500">Solo Expense Management</p>
              <h3 className="mt-1 text-xl font-bold text-slate-900">Solo Traveler License</h3>
              <p className="mt-3 text-3xl font-bold text-slate-900 font-mono-num">$2.99</p>
              <p className="mt-1 text-xs text-slate-500">One-time purchase · Personal expense mode</p>
              <ul className="mt-5 space-y-2 text-sm text-slate-600">
                <li>· Personal budget runway, category totals &amp; FX log</li>
                <li>· Encrypted passport &amp; insurance vault</li>
                <li>· 6 months of cloud trip history included</li>
              </ul>
            </div>
          </div>

          <div className="rounded-xl border border-teal-600 bg-white p-6 flex flex-col justify-between">
            <div>
              <p className="text-xs font-medium text-teal-700">For Friends, Families &amp; Teams</p>
              <h3 className="mt-1 text-xl font-bold text-slate-900">5-Member Group License</h3>
              <p className="mt-3 text-3xl font-bold text-slate-900 font-mono-num">$10.00</p>
              <p className="mt-1 text-xs text-slate-500">One-time purchase · Up to 5 members</p>
              <ul className="mt-5 space-y-2 text-sm text-slate-600">
                <li>· Real-time Splitwise ledger &amp; debt simplifier</li>
                <li>· Individual budget tracking for all 5 travelers</li>
                <li>· Exclusive Expedia &amp; Booking.com partner deals</li>
              </ul>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6 flex flex-col justify-between">
            <div>
              <p className="text-xs font-medium text-orange-600">Flexible Subscription Passes</p>
              <h3 className="mt-1 text-xl font-bold text-slate-900">Monthly or 6-Month Pass</h3>
              <p className="mt-3 text-3xl font-bold text-slate-900 font-mono-num">
                $1.99<span className="text-base font-medium text-slate-500">/mo</span> · $9.99<span className="text-base font-medium text-slate-500">/6mo</span>
              </p>
              <p className="mt-1 text-xs text-slate-500">Monthly rolling or 6-Month Pass (Save 16%) · $14.99 Lifetime Archive</p>
              <ul className="mt-5 space-y-2 text-sm text-slate-600">
                <li>· Live weather, FX conversion &amp; flight departure alerts</li>
                <li>· 15 MB Travel Wallet for bills, flight tickets &amp; itineraries</li>
                <li>· Instant cross-device cloud sync &amp; optional Lifetime archive</li>
              </ul>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col sm:flex-row items-start sm:items-center justify-between gap-4 px-4 sm:px-6 py-6 text-xs text-slate-500">
          <div>
            <p className="font-semibold text-slate-800">RoamTally · Powered by MaVi (Mavi Solution)</p>
            <p className="mt-0.5">
              Sales &amp; Support: mavi.apps@mavisolution.com
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowMobileInstall(true)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-teal-700 hover:underline cursor-pointer whitespace-nowrap"
          >
            <Smartphone className="h-3.5 w-3.5" />
            Install RoamTally Mobile App (iOS &amp; Android)
          </button>
        </div>
      </footer>

      <MobileAppInstallModal
        isOpen={showMobileInstall}
        onClose={() => setShowMobileInstall(false)}
      />
    </div>
  );
};
