export type MascotId = 'mavi-pelican' | 'pip-otter' | 'sunny-fox' | 'milo-bear';
export type ThemeAccent = 'coastal-teal' | 'sunset-coral';
export type LicenseTier = 'free' | 'solo' | 'group5';

export interface MascotOption {
  id: MascotId;
  name: string;
  role: string;
  tagline: string;
  image: string;
  accentHex: string;
}

export const MASCOT_OPTIONS: MascotOption[] = [
  {
    id: 'mavi-pelican',
    name: 'Mavi Pelican',
    role: 'Navigator & Harbor Guide',
    tagline: 'Keeps flights, weather alerts, and compass routes on track.',
    image: '/src/assets/images/mascot_mavi_pelican_1794801834819.jpg',
    accentHex: '#0D9488',
  },
  {
    id: 'pip-otter',
    name: 'Pip Otter',
    role: 'Trail & Offline Map Scout',
    tagline: 'Caches mountain trails and remote coastal maps before signal drops.',
    image: '/src/assets/images/mascot_pip_otter_1794801835390.jpg',
    accentHex: '#F97316',
  },
  {
    id: 'sunny-fox',
    name: 'Sunny Fox',
    role: 'Budget & Spot Curator',
    tagline: 'Finds hidden local gems and splits every bill fairly.',
    image: '/src/assets/images/mascot_sunny_fox_1794801835653.jpg',
    accentHex: '#0F766E',
  },
  {
    id: 'milo-bear',
    name: 'Captain Milo',
    role: 'Vault & Document Keeper',
    tagline: 'Guards passports, visas, and insurance packets with encryption.',
    image: '/src/assets/images/mascot_milo_bear_1794801835738.jpg',
    accentHex: '#EA580C',
  },
];

export const HERO_BANNER_IMAGE = '/src/assets/images/hero_coastal_travel_1794801836517.jpg';

export interface TouristSpot {
  name: string;
  category: string;
  description: string;
  estimatedCost: number;
  latOffset: number;
  lngOffset: number;
}

export interface RequiredDocItem {
  docType: 'passport' | 'visa' | 'insurance' | 'customs' | 'ticket';
  title: string;
  requirement: string;
  priority: 'mandatory' | 'recommended';
}

export interface UserProfile {
  uid: string;
  displayName: string;
  mascotId: MascotId;
  themeAccent: ThemeAccent;
  licenseTier: LicenseTier;
  referralCode: string;
  referredBy?: string;
  referralCount: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface UserBilling {
  uid: string;
  licenseTier: LicenseTier;
  licensePricePaid: number;
  monthlySyncActive: boolean;
  monthlySyncPrice: number;
  lifetimeVaultUnlocked: boolean;
  lifetimeVaultPrice: number;
  historyRetentionDays: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Trip {
  tripId: string;
  ownerId: string;
  memberIds: string[];
  title: string;
  origin: string;
  destination: string;
  startDate: string;
  endDate: string;
  currency: string;
  totalBudget: number;
  joinCode: string;
  status: 'planning' | 'active' | 'completed';
  isHistoricalArchive: boolean;
  weatherSummary: string;
  flightUpdateSummary: string;
  touristSpots: TouristSpot[];
  requiredDocs: RequiredDocItem[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface TripMember {
  memberId: string;
  tripId: string;
  displayName: string;
  mascotId: MascotId;
  role: 'organizer' | 'traveler';
  budgetLimit: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type ItineraryCategory = 'flight' | 'train' | 'lodging' | 'activity' | 'dining' | 'transport';
export type SplitMethod = 'equal' | 'exact' | 'percentage';

export interface ItineraryItem {
  itemId: string;
  tripId: string;
  title: string;
  category: ItineraryCategory;
  dateTime: string;
  location: string;
  notes: string;
  reminderMinutesBefore: number;
  cost: number;
  paidByMemberId: string;
  splitMethod: SplitMethod;
  linkedExpenseId: string;
  status: 'scheduled' | 'boarding' | 'completed';
  createdBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ExpenseShare {
  memberId: string;
  amount: number;
}

export interface ExpenseItem {
  expenseId: string;
  tripId: string;
  title: string;
  category: string;
  amount: number;
  currency: string;
  paidByMemberId: string;
  splitMethod: SplitMethod | 'settlement';
  shares: ExpenseShare[];
  linkedItineraryId: string;
  date: string;
  createdBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type EncryptedDocCategory = 'passport' | 'visa' | 'insurance' | 'customs' | 'ticket' | 'note';

export interface EncryptedDocument {
  docId: string;
  tripId: string;
  senderUid: string;
  senderName: string;
  docCategory: EncryptedDocCategory;
  title: string;
  ciphertext: string;
  iv: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface OfflineMapPin {
  id: string;
  label: string;
  kind: 'stay' | 'transit' | 'spot' | 'dining';
  x: number;
  y: number;
  lat: number;
  lng: number;
  notes: string;
}

export interface OfflineMapPack {
  packId: string;
  tripId: string;
  destination: string;
  centerLat: number;
  centerLng: number;
  zoomLevel: number;
  pins: OfflineMapPin[];
  downloadedByUid: string;
  sizeKb: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface PartnerDeal {
  id: string;
  partner: 'Expedia' | 'Booking.com';
  title: string;
  discountLabel: string;
  code: string;
  description: string;
  url: string;
  minLicense: LicenseTier;
}

export const PARTNER_DEALS: PartnerDeal[] = [
  {
    id: 'expedia-group-flight',
    partner: 'Expedia',
    title: 'Multi-Traveler Flight + Stay Bundle',
    discountLabel: 'Up to 18% off group bundles',
    code: 'MAVIEXP18',
    description: 'Automatic bundle savings when booking 2–5 seats and coastal hotels together.',
    url: 'https://www.expedia.com',
    minLicense: 'solo',
  },
  {
    id: 'booking-genius-stays',
    partner: 'Booking.com',
    title: 'Flexible Group Villas & Boutique Stays',
    discountLabel: '15% instant member perk + free cancellation',
    code: 'MAVIBK15',
    description: 'Exclusive partner rate on family apartments and multi-room stays with zero upfront deposit.',
    url: 'https://www.booking.com',
    minLicense: 'solo',
  },
  {
    id: 'expedia-rail-transfer',
    partner: 'Expedia',
    title: 'Airport Express & Regional Rail Pass',
    discountLabel: '12% off transit & car rentals',
    code: 'MAVIRAIL12',
    description: 'Sync rail departure reminders directly into your MAVI itinerary timeline.',
    url: 'https://www.expedia.com/Cars',
    minLicense: 'free',
  },
];
