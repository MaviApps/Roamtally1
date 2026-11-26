import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, signInWithGoogle, signOutUser, testFirestoreConnection } from '../lib/firebase';
import { isSupabaseConfigured, supabase, type AuthUser } from '../lib/supabase';
import {
  ensureUserAccount,
  subscribeTripSubcollections,
  subscribeUserBilling,
  subscribeUserProfile,
  subscribeUserTrips,
} from '../lib/maviService';
import { getTripSnapshotLocally, saveTripSnapshotLocally } from '../lib/offlineDb';
import type {
  EncryptedDocument,
  ExpenseItem,
  ItineraryItem,
  OfflineMapPack,
  Trip,
  TripMember,
  UserBilling,
  UserProfile,
} from '../types/mavi';

interface MaviContextValue {
  authReady: boolean;
  authBackend: 'supabase' | 'firebase';
  firebaseUser: AuthUser | null;
  profile: UserProfile | null;
  billing: UserBilling | null;
  trips: Trip[];
  activeTripId: string | null;
  activeTrip: Trip | null;
  members: TripMember[];
  itinerary: ItineraryItem[];
  expenses: ExpenseItem[];
  encryptedDocs: EncryptedDocument[];
  offlinePacks: OfflineMapPack[];
  loadingTripData: boolean;
  authError: string | null;
  setActiveTripId: (tripId: string | null) => void;
  loginWithGoogle: () => Promise<void>;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  registerWithEmail: (email: string, password: string, displayName: string) => Promise<string | null>;
  logout: () => Promise<void>;
}

const MaviContext = createContext<MaviContextValue | null>(null);

export function MaviProvider({ children }: { children: React.ReactNode }) {
  const [authReady, setAuthReady] = useState(false);
  const [firebaseUser, setFirebaseUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [billing, setBilling] = useState<UserBilling | null>(null);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [activeTripId, setActiveTripId] = useState<string | null>(null);
  const [members, setMembers] = useState<TripMember[]>([]);
  const [itinerary, setItinerary] = useState<ItineraryItem[]>([]);
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [encryptedDocs, setEncryptedDocs] = useState<EncryptedDocument[]>([]);
  const [offlinePacks, setOfflinePacks] = useState<OfflineMapPack[]>([]);
  const [loadingTripData, setLoadingTripData] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const authBackend: 'supabase' | 'firebase' = isSupabaseConfigured ? 'supabase' : 'firebase';

  useEffect(() => {
    if (isSupabaseConfigured && supabase) {
      let active = true;
      const syncSupabaseUser = async (sbUser: { id: string; email?: string; user_metadata?: Record<string, unknown> } | null) => {
        if (!active) return;
        if (!sbUser) {
          setFirebaseUser(null);
          setProfile(null);
          setBilling(null);
          setTrips([]);
          setActiveTripId(null);
          setAuthReady(true);
          return;
        }
        const mappedUser: AuthUser = {
          uid: sbUser.id,
          email: sbUser.email ?? null,
          displayName:
            (typeof sbUser.user_metadata?.full_name === 'string' && sbUser.user_metadata.full_name) ||
            (typeof sbUser.user_metadata?.display_name === 'string' && sbUser.user_metadata.display_name) ||
            sbUser.email?.split('@')[0] ||
            'Traveler',
        };
        setFirebaseUser(mappedUser);
        try {
          const account = await ensureUserAccount(mappedUser);
          if (active) {
            setProfile(account.profile);
            setBilling(account.billing);
          }
        } catch (err) {
          if (active) {
            setAuthError(err instanceof Error ? err.message : 'Unable to load RoamTally profile.');
          }
        } finally {
          if (active) setAuthReady(true);
        }
      };

      supabase.auth.getSession().then(({ data }) => {
        syncSupabaseUser(data.session?.user ?? null);
      });

      const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
        syncSupabaseUser(session?.user ?? null);
      });

      return () => {
        active = false;
        sub.subscription.unsubscribe();
      };
    }

    testFirestoreConnection();
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setFirebaseUser(null);
        setProfile(null);
        setBilling(null);
        setTrips([]);
        setActiveTripId(null);
        setAuthReady(true);
        return;
      }

      const mappedUser: AuthUser = {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
      };
      setFirebaseUser(mappedUser);

      try {
        const account = await ensureUserAccount(mappedUser);
        setProfile(account.profile);
        setBilling(account.billing);
      } catch (err) {
        setAuthError(err instanceof Error ? err.message : 'Unable to load RoamTally profile.');
      } finally {
        setAuthReady(true);
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!firebaseUser) return;
    const unsubProfile = subscribeUserProfile(firebaseUser.uid, (p) => {
      if (p) setProfile(p);
    });
    const unsubBilling = subscribeUserBilling(firebaseUser.uid, (b) => {
      if (b) setBilling(b);
    });
    const unsubTrips = subscribeUserTrips(firebaseUser.uid, (loadedTrips) => {
      setTrips(loadedTrips);
      setActiveTripId((prev) => {
        if (prev && loadedTrips.some((t) => t.tripId === prev)) return prev;
        return loadedTrips[0]?.tripId ?? null;
      });
    });

    return () => {
      unsubProfile();
      unsubBilling();
      unsubTrips();
    };
  }, [firebaseUser]);

  const activeTrip = useMemo(
    () => trips.find((t) => t.tripId === activeTripId) ?? null,
    [trips, activeTripId]
  );

  useEffect(() => {
    if (!firebaseUser || !activeTripId) {
      setMembers([]);
      setItinerary([]);
      setExpenses([]);
      setEncryptedDocs([]);
      setOfflinePacks([]);
      return;
    }

    setLoadingTripData(true);
    let initialLoaded = 0;
    const markReady = () => {
      initialLoaded += 1;
      if (initialLoaded >= 2) setLoadingTripData(false);
    };

    getTripSnapshotLocally(activeTripId).then((cached) => {
      if (cached && !navigator.onLine) {
        setItinerary(cached.itinerary);
        setExpenses(cached.expenses);
        setLoadingTripData(false);
      }
    });

    const unsub = subscribeTripSubcollections(activeTripId, {
      onMembers: (m) => {
        setMembers(m);
        markReady();
      },
      onItinerary: (i) => {
        setItinerary(i);
        markReady();
      },
      onExpenses: (e) => {
        setExpenses(e);
        markReady();
      },
      onEncryptedDocs: setEncryptedDocs,
      onOfflinePacks: setOfflinePacks,
    });

    return () => unsub();
  }, [firebaseUser, activeTripId]);

  useEffect(() => {
    if (activeTrip && (itinerary.length > 0 || expenses.length > 0)) {
      saveTripSnapshotLocally({
        tripId: activeTrip.tripId,
        trip: activeTrip,
        itinerary,
        expenses,
        cachedAt: new Date().toISOString(),
      });
    }
  }, [activeTrip, itinerary, expenses]);

  const loginWithGoogle = async () => {
    setAuthError(null);
    try {
      if (isSupabaseConfigured && supabase) {
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo: window.location.origin },
        });
        if (error) throw error;
      } else {
        await signInWithGoogle();
      }
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Google Sign-In failed.');
    }
  };

  const loginWithEmail = async (email: string, password: string) => {
    setAuthError(null);
    if (!isSupabaseConfigured || !supabase) {
      setAuthError('Email sign-in is enabled when deployed with Supabase.');
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      setAuthError(error.message);
    }
  };

  const registerWithEmail = async (
    email: string,
    password: string,
    displayName: string
  ): Promise<string | null> => {
    setAuthError(null);
    if (!isSupabaseConfigured || !supabase) {
      setAuthError('Email registration is enabled when deployed with Supabase.');
      return null;
    }
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          full_name: displayName.trim() || email.split('@')[0],
        },
      },
    });
    if (error) {
      setAuthError(error.message);
      return null;
    }
    if (!data.session) {
      return 'Account created! Check your email inbox to confirm your address, then sign in.';
    }
    return null;
  };

  const logout = async () => {
    if (isSupabaseConfigured && supabase) {
      await supabase.auth.signOut();
    } else {
      await signOutUser();
    }
  };

  return (
    <MaviContext.Provider
      value={{
        authReady,
        authBackend,
        firebaseUser,
        profile,
        billing,
        trips,
        activeTripId,
        activeTrip,
        members,
        itinerary,
        expenses,
        encryptedDocs,
        offlinePacks,
        loadingTripData,
        authError,
        setActiveTripId,
        loginWithGoogle,
        loginWithEmail,
        registerWithEmail,
        logout,
      }}
    >
      {children}
    </MaviContext.Provider>
  );
}

export function useMavi() {
  const ctx = useContext(MaviContext);
  if (!ctx) throw new Error('useMavi must be used inside MaviProvider');
  return ctx;
}
