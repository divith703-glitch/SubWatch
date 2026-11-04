export type BillingCycle = 'weekly' | 'monthly' | 'quarterly' | 'semiannual' | 'yearly';
export type SubStatus = 'active' | 'paused' | 'cancelled';

export type User = {
  id: number;
  name: string;
  email: string;
  currency: string;
};

export type PriceChange = {
  old_cost: number;
  new_cost: number;
  delta: number;
  delta_pct: number;
  changed_at: string;
  source: string;
};

export type Subscription = {
  id: number;
  name: string;
  category: string;
  cost: number;
  currency: string;
  billing_cycle: BillingCycle;
  next_renewal_date: string;
  started_on: string | null;
  status: SubStatus;
  payment_method: string | null;
  cancel_url: string | null;
  cancel_instructions: string | null;
  notes: string | null;
  reminder_days: number;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
  monthly_cost: number;
  yearly_cost: number;
  days_until_renewal: number;
  renewal_label: string;
  last_price_change: PriceChange | null;
  original_cost: number;
};

export type Meta = {
  categories: string[];
  cycles: { value: BillingCycle; label: string }[];
  currencies: string[];
  demo_enabled: boolean;
  provider_sync: { available: boolean; simulated: boolean; note: string };
  csrf_header: string;
  token_ttl_seconds: number;
  allowed_origins: string[];
};

export type Summary = {
  totals: {
    monthly: number;
    yearly: number;
    per_day: number;
    active_count: number;
    paused_count: number;
    cancelled_count: number;
    due_next_7: number;
    due_next_30: number;
    currency: string;
  };
  by_currency: { currency: string; monthly: number; yearly: number; count: number }[];
  mixed_currencies: boolean;
  by_category: { category: string; monthly: number; yearly: number; count: number }[];
  upcoming: {
    id: number;
    name: string;
    category: string;
    cost: number;
    currency: string;
    billing_cycle: BillingCycle;
    date: string;
    days_until: number;
    renews_soon: boolean;
  }[];
  alerts: {
    id: number;
    name: string;
    cost: number;
    currency: string;
    billing_cycle: BillingCycle;
    date: string;
    days_until: number;
    reminder_days: number;
    cancel_url: string | null;
  }[];
  price_changes: {
    id: number;
    subscription_id: number;
    name: string;
    category: string;
    old_cost: number;
    new_cost: number;
    delta: number;
    delta_pct: number;
    currency: string;
    billing_cycle: BillingCycle;
    source: string;
    note: string | null;
    changed_at: string;
  }[];
  price_impact: { increase_count: number; annual_impact: number; monthly_impact: number };
  trend: { month: string; label: string; total: number }[];
  savings: { cancelled_yearly: number; paused_yearly: number };
  most_expensive: {
    id: number;
    name: string;
    yearly_cost: number;
    monthly_cost: number;
    currency: string;
  }[];
};

export type HistoryEntry = {
  id: number;
  old_cost: number;
  new_cost: number;
  delta: number;
  currency: string;
  billing_cycle: BillingCycle;
  source: string;
  note: string | null;
  changed_at: string;
};

export type CatalogItem = {
  key: string;
  name: string;
  category: string;
  cancel_url: string;
  steps: string[];
  typical_price: number;
  currency: string;
};

export type SyncResult = {
  simulated: boolean;
  checked: number;
  changes: { id: number; name: string; old_cost: number; new_cost: number; delta_pct: number }[];
  message: string;
  scanned_at: string;
};

export type SubscriptionInput = {
  name: string;
  category: string;
  cost: number;
  currency: string;
  billing_cycle: BillingCycle;
  next_renewal_date: string;
  started_on?: string | null;
  status: SubStatus;
  payment_method?: string | null;
  cancel_url?: string | null;
  cancel_instructions?: string | null;
  notes?: string | null;
  reminder_days: number;
};
