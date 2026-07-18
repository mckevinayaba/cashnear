
-- ENUMS
CREATE TYPE public.app_role AS ENUM (
  'customer','operator_owner','operator_manager','operator_cashier','ops_admin','super_admin'
);
CREATE TYPE public.verification_status AS ENUM (
  'unverified','pending','approved','rejected','suspended'
);
CREATE TYPE public.operator_application_status AS ENUM (
  'draft','submitted','under_review','info_requested','site_verification_required',
  'approved','rejected','suspended','deactivated'
);
CREATE TYPE public.document_type AS ENUM (
  'id_document','business_registration','proof_of_address','bank_confirmation',
  'terminal_proof','premises_photo','signage_photo','other'
);
CREATE TYPE public.terminal_provider AS ENUM (
  'yoco','ikhokha','fnb','standard_bank','nedbank','absa','kazang','flash','other'
);
CREATE TYPE public.sa_province AS ENUM (
  'gauteng','western_cape','kwazulu_natal','eastern_cape',
  'free_state','limpopo','mpumalanga','north_west','northern_cape'
);

-- UPDATED_AT HELPER
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- PROFILES
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT, mobile TEXT, email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- USER ROLES
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  granted_by UUID REFERENCES auth.users(id),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('ops_admin','super_admin')
  );
$$;

CREATE POLICY "Users read own profile" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id OR public.is_admin(auth.uid()));
CREATE POLICY "Users update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "Users insert own profile" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

CREATE POLICY "Users read own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

-- CUSTOMER PROFILES
CREATE TABLE public.customer_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  verification_status public.verification_status NOT NULL DEFAULT 'unverified',
  saved_suburb TEXT, notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.customer_profiles TO authenticated;
GRANT ALL ON public.customer_profiles TO service_role;
ALTER TABLE public.customer_profiles ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_customer_profiles_updated_at BEFORE UPDATE ON public.customer_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE POLICY "Customer reads own record" ON public.customer_profiles
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.is_admin(auth.uid()));
CREATE POLICY "Customer inserts own record" ON public.customer_profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Customer updates own record" ON public.customer_profiles
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- OPERATOR BUSINESSES
CREATE TABLE public.operator_businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  legal_name TEXT, trading_name TEXT, business_type TEXT,
  registration_number TEXT, tax_number TEXT, years_operating INT, description TEXT,
  street_address TEXT, suburb TEXT, city TEXT, province public.sa_province,
  postal_code TEXT, gps_lat NUMERIC(10,7), gps_lng NUMERIC(10,7),
  premises_type TEXT, terminal_provider public.terminal_provider, terminal_model TEXT,
  estimated_mdr NUMERIC(5,2),
  representative_name TEXT, representative_id_number TEXT,
  representative_mobile TEXT, representative_email TEXT, representative_relationship TEXT,
  opening_hours JSONB, max_transaction_amount INT,
  application_status public.operator_application_status NOT NULL DEFAULT 'draft',
  submitted_at TIMESTAMPTZ, reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES auth.users(id), review_notes TEXT,
  agreements_accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_operator_businesses_owner ON public.operator_businesses(owner_id);
CREATE INDEX idx_operator_businesses_status ON public.operator_businesses(application_status);
GRANT SELECT, INSERT, UPDATE ON public.operator_businesses TO authenticated;
GRANT ALL ON public.operator_businesses TO service_role;
ALTER TABLE public.operator_businesses ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_operator_businesses_updated_at BEFORE UPDATE ON public.operator_businesses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- OPERATOR STAFF
CREATE TABLE public.operator_staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.operator_businesses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL CHECK (role IN ('operator_owner','operator_manager','operator_cashier')),
  invited_by UUID REFERENCES auth.users(id),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(business_id, user_id)
);
CREATE INDEX idx_operator_staff_business ON public.operator_staff(business_id);
CREATE INDEX idx_operator_staff_user ON public.operator_staff(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.operator_staff TO authenticated;
GRANT ALL ON public.operator_staff TO service_role;
ALTER TABLE public.operator_staff ENABLE ROW LEVEL SECURITY;

-- Now safe to create is_business_member
CREATE OR REPLACE FUNCTION public.is_business_member(_user_id UUID, _business_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.operator_businesses b
    WHERE b.id = _business_id AND b.owner_id = _user_id
  ) OR EXISTS (
    SELECT 1 FROM public.operator_staff s
    WHERE s.business_id = _business_id AND s.user_id = _user_id AND s.active = TRUE
  );
$$;

CREATE POLICY "Owner or staff reads business" ON public.operator_businesses
  FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR public.is_business_member(auth.uid(), id) OR public.is_admin(auth.uid()));
CREATE POLICY "Owner inserts business" ON public.operator_businesses
  FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Owner updates business" ON public.operator_businesses
  FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Business members read staff" ON public.operator_staff
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_business_member(auth.uid(), business_id) OR public.is_admin(auth.uid()));
CREATE POLICY "Owner manages staff" ON public.operator_staff
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.operator_businesses b WHERE b.id = business_id AND b.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.operator_businesses b WHERE b.id = business_id AND b.owner_id = auth.uid()));

-- OPERATOR DOCUMENTS
CREATE TABLE public.operator_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.operator_businesses(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL REFERENCES auth.users(id),
  doc_type public.document_type NOT NULL,
  storage_path TEXT NOT NULL,
  original_filename TEXT, mime_type TEXT, size_bytes BIGINT, notes TEXT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_operator_documents_business ON public.operator_documents(business_id);
GRANT SELECT, INSERT, DELETE ON public.operator_documents TO authenticated;
GRANT ALL ON public.operator_documents TO service_role;
ALTER TABLE public.operator_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Business owner reads documents" ON public.operator_documents
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.operator_businesses b
      WHERE b.id = business_id AND (b.owner_id = auth.uid() OR public.is_business_member(auth.uid(), b.id)))
    OR public.is_admin(auth.uid())
  );
CREATE POLICY "Owner uploads documents" ON public.operator_documents
  FOR INSERT TO authenticated
  WITH CHECK (uploaded_by = auth.uid()
    AND EXISTS (SELECT 1 FROM public.operator_businesses b WHERE b.id = business_id AND b.owner_id = auth.uid()));
CREATE POLICY "Owner deletes documents" ON public.operator_documents
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.operator_businesses b WHERE b.id = business_id AND b.owner_id = auth.uid()));

-- VERIFICATION REVIEWS
CREATE TABLE public.verification_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.operator_businesses(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES auth.users(id),
  from_status public.operator_application_status,
  to_status public.operator_application_status NOT NULL,
  decision_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_verification_reviews_business ON public.verification_reviews(business_id);
GRANT SELECT, INSERT ON public.verification_reviews TO authenticated;
GRANT ALL ON public.verification_reviews TO service_role;
ALTER TABLE public.verification_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Business owner reads own reviews" ON public.verification_reviews
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.operator_businesses b WHERE b.id = business_id AND b.owner_id = auth.uid())
    OR public.is_admin(auth.uid()));
CREATE POLICY "Admin writes reviews" ON public.verification_reviews
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()) AND reviewer_id = auth.uid());

-- PILOT CONFIG
CREATE TABLE public.pilot_configuration (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  value JSONB NOT NULL,
  description TEXT,
  updated_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pilot_configuration TO authenticated;
GRANT ALL ON public.pilot_configuration TO service_role;
ALTER TABLE public.pilot_configuration ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated reads pilot config" ON public.pilot_configuration
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Super admin writes pilot config" ON public.pilot_configuration
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
CREATE TRIGGER trg_pilot_configuration_updated_at BEFORE UPDATE ON public.pilot_configuration
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- AUDIT LOGS
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES auth.users(id),
  actor_role public.app_role,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_logs_actor ON public.audit_logs(actor_id);
CREATE INDEX idx_audit_logs_entity ON public.audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_created ON public.audit_logs(created_at DESC);
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read audit logs" ON public.audit_logs
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Authenticated inserts audit log for self" ON public.audit_logs
  FOR INSERT TO authenticated WITH CHECK (actor_id = auth.uid() OR actor_id IS NULL);

-- NEW USER TRIGGER
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NULL))
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'customer')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.customer_profiles (user_id, verification_status)
  VALUES (NEW.id, 'unverified') ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- SEED PILOT CONFIG
INSERT INTO public.pilot_configuration (key, value, description) VALUES
  ('pilot_name', to_jsonb('Johannesburg Pilot 1'::text), 'Active pilot programme name'),
  ('pilot_area', to_jsonb('Soweto / Alexandra / Tembisa corridor'::text), 'Illustrative pilot corridor'),
  ('max_cash_amount', to_jsonb(2000), 'Maximum single-request cash amount (ZAR). Pilot assumption.'),
  ('min_cash_amount', to_jsonb(50), 'Minimum single-request cash amount (ZAR).'),
  ('customer_daily_limit', to_jsonb(4000), 'Customer max daily cash across requests (ZAR).'),
  ('operator_max_travel_km', to_jsonb(3), 'Operator max travel radius (km).'),
  ('request_expiry_seconds', to_jsonb(900), 'Request expiry (seconds).'),
  ('operator_response_seconds', to_jsonb(45), 'Operator response window (seconds).'),
  ('verification_code_ttl_seconds', to_jsonb(600), 'Verification code TTL (seconds).'),
  ('matching_batch_size', to_jsonb(3), 'Operators offered per matching batch.'),
  ('cashnear_fee_bands', jsonb_build_array(
      jsonb_build_object('min',100,'max',299,'fee',2),
      jsonb_build_object('min',300,'max',599,'fee',4),
      jsonb_build_object('min',600,'max',999,'fee',6),
      jsonb_build_object('min',1000,'max',2000,'fee',8)
    ), 'Pilot CashNear platform fee bands (ZAR). Pilot assumptions — configurable.');
