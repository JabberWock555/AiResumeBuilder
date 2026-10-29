-- Billing moves from Stripe to Razorpay. The billing columns and the event
-- table get provider-neutral names, so a later switch doesn't need another
-- rename. Plan sync (sync_plan) works on kind and status and is unchanged.

alter table public.profiles rename column stripe_customer_id to billing_customer_id;

alter table public.subscriptions rename column stripe_subscription_id to provider_subscription_id;
alter table public.subscriptions rename column stripe_checkout_session_id to provider_checkout_id;   -- Razorpay order id (lifetime)
alter table public.subscriptions rename column stripe_payment_intent_id to provider_payment_id;     -- Razorpay payment id (lifetime)
alter table public.subscriptions rename column stripe_price_id to provider_plan_id;                -- Razorpay plan id
alter table public.subscriptions
  add column provider text not null default 'razorpay' check (provider in ('razorpay', 'stripe'));

-- One row per webhook event id (Razorpay's x-razorpay-event-id), so each is applied once.
alter table public.stripe_events rename to billing_events;

create or replace function public.prune_housekeeping() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_limits integer;
  v_events integer;
  v_runs integer;
begin
  delete from public.rate_limits where window_start < now() - interval '1 day';
  get diagnostics v_limits = row_count;
  delete from public.billing_events
   where processed_at is not null and received_at < now() - interval '90 days';
  get diagnostics v_events = row_count;
  delete from public.job_runs where started_at < now() - interval '90 days';
  get diagnostics v_runs = row_count;
  return jsonb_build_object('rate_limits', v_limits, 'billing_events', v_events, 'job_runs', v_runs);
end $$;
revoke execute on function public.prune_housekeeping() from public, anon, authenticated;
