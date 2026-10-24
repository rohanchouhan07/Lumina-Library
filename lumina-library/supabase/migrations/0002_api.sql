-- =============================================================================
-- Lumina Library · Supabase RPC API  (0002)
--
-- One JSON RPC retains the existing app's { ok, data } / { ok, error } contract.
-- Supabase Auth supplies auth.uid(); this SQL function reads the role/status from
-- profiles on every call. The client never sends a trusted role or member scope.
-- Run after 0001_schema.sql.
-- =============================================================================

create schema if not exists lumina_private;
revoke all on schema lumina_private from public, anon, authenticated;
grant usage on schema lumina_private to postgres, service_role;

-- ------------------------------ internal failures and authorization ---------
create or replace function lumina_private.fail(p_code text, p_message text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  raise exception using message = 'LUMINA|' || p_code || '|' || coalesce(p_message, 'Request failed.'), errcode = 'P0001';
end $$;

create or replace function lumina_private.current_profile()
returns public.profiles language plpgsql security definer
set search_path = public, auth, pg_temp as $$
declare v_profile public.profiles;
begin
  if auth.uid() is null then
    perform lumina_private.fail('UNAUTHORIZED', 'Sign in to continue.');
  end if;
  select * into v_profile from public.profiles where id = auth.uid();
  if not found then
    perform lumina_private.fail('UNAUTHORIZED', 'This account is not provisioned for the library.');
  end if;
  if v_profile.account_status <> 'ACTIVE' then
    perform lumina_private.fail('FORBIDDEN', 'This library account is inactive.');
  end if;
  return v_profile;
end $$;

create or replace function lumina_private.require_role(p_roles text[])
returns public.profiles language plpgsql security definer
set search_path = public, auth, pg_temp as $$
declare v_profile public.profiles;
begin
  v_profile := lumina_private.current_profile();
  if not (v_profile.role::text = any(p_roles)) then
    perform lumina_private.fail('FORBIDDEN', 'Your account does not have permission to do that.');
  end if;
  return v_profile;
end $$;

create or replace function lumina_private.is_staff(p_user_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.profiles p
    where p.id = p_user_id and p.role in ('ADMIN', 'LIBRARIAN') and p.account_status = 'ACTIVE'
  );
$$;

-- ---------------------------------- wire-format mappers --------------------
create or replace function lumina_private.user_json(p_user_id uuid)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'userId', p.user_code,
    'name', p.full_name,
    'email', p.email,
    'institutionalId', p.institutional_id,
    'role', p.role::text,
    'department', p.department,
    'accountStatus', p.account_status::text,
    'phone', p.phone,
    'borrowingLimit', p.borrowing_limit,
    'createdAt', p.created_at,
    'updatedAt', p.updated_at
  )
  from public.profiles p where p.id = p_user_id;
$$;

create or replace function lumina_private.book_json(p_book_id text)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'bookId', b.book_id,
    'title', b.title,
    'author', b.author,
    'isbn', b.isbn,
    'publisher', b.publisher,
    'year', b.year,
    'category', b.category,
    'description', b.description,
    'coverImageUrl', coalesce(b.cover_image_url, ''),
    'shelfLocation', b.shelf_location,
    'totalCopies', b.total_copies,
    'availableCopies', greatest(0, b.total_copies - coalesce(c.active_count, 0)),
    'copiesOnLoan', coalesce(c.active_count, 0),
    'recordStatus', b.record_status::text,
    'createdAt', b.created_at,
    'updatedAt', b.updated_at
  )
  from public.books b
  left join lateral (
    select count(*)::integer as active_count
    from public.loans l where l.book_id = b.book_id and l.loan_status = 'ACTIVE'
  ) c on true
  where b.book_id = p_book_id;
$$;

create or replace function lumina_private.loan_json(p_loan_id text)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'loanId', l.loan_id,
    'bookId', l.book_id,
    'bookTitle', b.title,
    'userId', p.user_code,
    'userName', p.full_name,
    'issuedBy', coalesce(issuer.user_code, p.user_code),
    'issueDate', l.issue_date,
    'dueDate', l.due_date,
    'returnDate', l.return_date,
    'loanStatus', l.loan_status::text,
    'renewalCount', l.renewal_count,
    'fineAmount', case when l.loan_status = 'ACTIVE'
      then public.overdue_days(l.due_date) * public.fine_per_day()
      else l.fine_amount end,
    'overdueDays', case when l.loan_status = 'ACTIVE' then public.overdue_days(l.due_date) else 0 end,
    'createdAt', l.created_at,
    'updatedAt', l.updated_at
  )
  from public.loans l
  join public.books b on b.book_id = l.book_id
  join public.profiles p on p.id = l.user_id
  left join public.profiles issuer on issuer.id = l.issued_by
  where l.loan_id = p_loan_id;
$$;

create or replace function lumina_private.reservation_json(p_reservation_id text)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'reservationId', r.reservation_id,
    'bookId', r.book_id,
    'bookTitle', b.title,
    'userId', p.user_code,
    'userName', p.full_name,
    'reservationDate', r.reservation_date,
    'queuePosition', r.queue_position,
    'reservationStatus', r.reservation_status::text,
    'expiryDate', r.expiry_date,
    'createdAt', r.created_at,
    'updatedAt', r.updated_at
  )
  from public.reservations r
  join public.books b on b.book_id = r.book_id
  join public.profiles p on p.id = r.user_id
  where r.reservation_id = p_reservation_id;
$$;

create or replace function lumina_private.settings_json()
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_object_agg(s.key, s.value), '{}'::jsonb)
  from public.settings s;
$$;

create or replace function lumina_private.activity_json(p_activity_id bigint)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'activityId', a.id::text,
    'actorUserId', coalesce(p.user_code, 'SYSTEM'),
    'action', a.action,
    'entityType', a.entity_type,
    'entityId', a.entity_id,
    'timestamp', a.created_at,
    'summary', a.summary
  )
  from public.activity_log a
  left join public.profiles p on p.id = a.actor_user_id
  where a.id = p_activity_id;
$$;

create or replace function lumina_private.audit(
  p_actor uuid, p_action text, p_entity_type text, p_entity_id text, p_summary text
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.activity_log (actor_user_id, action, entity_type, entity_id, summary)
  values (p_actor, left(p_action, 80), left(coalesce(p_entity_type, ''), 40),
          left(coalesce(p_entity_id, ''), 120), left(coalesce(p_summary, ''), 300));
exception when others then
  -- Audit failures must not make a successful circulation transaction appear to fail.
  null;
end $$;

-- ----------------------------------- scoped list helpers -------------------
create or replace function lumina_private.list_books(p_include_archived boolean default true)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(lumina_private.book_json(b.book_id) order by lower(b.title)), '[]'::jsonb)
  from public.books b
  where p_include_archived or b.record_status = 'ACTIVE';
$$;

create or replace function lumina_private.list_users(p_actor uuid, p_role text default null)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(
    lumina_private.user_json(p.id) || jsonb_build_object(
      'activeLoans', (select count(*) from public.loans l where l.user_id = p.id and l.loan_status = 'ACTIVE'),
      'activeHolds', (select count(*) from public.reservations r where r.user_id = p.id and r.reservation_status in ('PENDING','READY')),
      'outstandingFine', coalesce((
        select sum(case when l.loan_status = 'ACTIVE'
          then public.overdue_days(l.due_date) * public.fine_per_day()
          else l.fine_amount end)
        from public.loans l where l.user_id = p.id
      ), 0)
    ) order by lower(p.full_name)
  ), '[]'::jsonb)
  from public.profiles p
  where (p_role is null or p.role::text = upper(p_role));
$$;

create or replace function lumina_private.list_loans(p_actor uuid, p_status text default null)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(lumina_private.loan_json(l.loan_id) order by l.issue_date desc), '[]'::jsonb)
  from public.loans l
  where (lumina_private.is_staff(p_actor) or l.user_id = p_actor)
    and (p_status is null or upper(p_status) = 'ALL' or l.loan_status::text = upper(p_status));
$$;

create or replace function lumina_private.list_reservations(p_actor uuid)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(lumina_private.reservation_json(r.reservation_id) order by r.reservation_date), '[]'::jsonb)
  from public.reservations r
  where lumina_private.is_staff(p_actor) or r.user_id = p_actor;
$$;

create or replace function lumina_private.list_wishlist(p_actor uuid)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('bookId', w.book_id, 'createdAt', w.created_at) order by w.created_at desc), '[]'::jsonb)
  from public.wishlists w where w.user_id = p_actor;
$$;

create or replace function lumina_private.list_activity(p_actor uuid, p_limit integer default 40)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(lumina_private.activity_json(x.id) order by x.created_at desc), '[]'::jsonb)
  from (
    select a.id, a.created_at
    from public.activity_log a
    where lumina_private.is_staff(p_actor) or a.actor_user_id = p_actor
    order by a.created_at desc
    limit greatest(1, least(coalesce(p_limit, 40), 200))
  ) x;
$$;

create or replace function lumina_private.dashboard_json(p_actor uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_staff boolean := lumina_private.is_staff(p_actor);
  v_titles integer;
  v_copies integer;
  v_available integer;
  v_members integer;
  v_students integer;
  v_faculty integer;
  v_admins integer;
  v_active integer;
  v_overdue integer;
  v_holds integer;
  v_fines numeric(12,2);
  v_mine_active integer;
  v_mine_overdue integer;
  v_mine_holds integer;
  v_mine_fines numeric(12,2);
  v_limit integer;
  v_profile public.profiles;
begin
  select * into v_profile from public.profiles where id = p_actor;
  select count(*)::int, coalesce(sum(b.total_copies),0)::int,
    coalesce(sum(greatest(0,b.total_copies - coalesce(a.n,0))),0)::int
    into v_titles, v_copies, v_available
  from public.books b
  left join lateral (select count(*)::int n from public.loans l where l.book_id=b.book_id and l.loan_status='ACTIVE') a on true
  where b.record_status='ACTIVE';

  select count(*) filter (where account_status='ACTIVE')::int,
         count(*) filter (where account_status='ACTIVE' and role='STUDENT')::int,
         count(*) filter (where account_status='ACTIVE' and role='FACULTY')::int,
         count(*) filter (where account_status='ACTIVE' and role='ADMIN')::int
    into v_members, v_students, v_faculty, v_admins from public.profiles;

  select count(*) filter (where l.loan_status='ACTIVE')::int,
         count(*) filter (where l.loan_status='ACTIVE' and public.overdue_days(l.due_date)>0)::int,
         coalesce(sum(case when l.loan_status='ACTIVE'
           then public.overdue_days(l.due_date)*public.fine_per_day() else l.fine_amount end),0)::numeric(12,2)
    into v_active, v_overdue, v_fines
  from public.loans l
  where v_staff or l.user_id=p_actor;

  select count(*)::int into v_holds from public.reservations r
  where r.reservation_status in ('PENDING','READY') and (v_staff or r.user_id=p_actor);

  select count(*)::int,
         count(*) filter (where public.overdue_days(l.due_date)>0)::int,
         coalesce(sum(public.overdue_days(l.due_date)*public.fine_per_day()),0)::numeric(12,2)
    into v_mine_active, v_mine_overdue, v_mine_fines
  from public.loans l where l.user_id=p_actor and l.loan_status='ACTIVE';
  select v_mine_fines + coalesce(sum(l.fine_amount),0)
    into v_mine_fines from public.loans l
  where l.user_id=p_actor and l.loan_status='RETURNED';
  select count(*)::int into v_mine_holds from public.reservations r
  where r.user_id=p_actor and r.reservation_status in ('PENDING','READY');
  v_limit := coalesce(v_profile.borrowing_limit,
    case when v_profile.role='STUDENT' then public.setting_int('student_borrow_limit',4)
         else public.setting_int('faculty_borrow_limit',8) end);

  return jsonb_build_object(
    'scope', case when v_staff then 'LIBRARY' else 'SELF' end,
    'totals', jsonb_build_object(
      'titles', case when v_staff then v_titles else 0 end,
      'copies', case when v_staff then v_copies else 0 end,
      'availableCopies', case when v_staff then v_available else 0 end,
      'members', case when v_staff then v_members else 0 end,
      'students', case when v_staff then v_students else 0 end,
      'faculty', case when v_staff then v_faculty else 0 end,
      'admins', case when v_staff then v_admins else 0 end,
      'activeLoans', v_active,
      'overdue', v_overdue,
      'activeHolds', v_holds,
      'simulatedFines', v_fines
    ),
    'mine', jsonb_build_object(
      'activeLoans', v_mine_active,
      'overdue', v_mine_overdue,
      'holds', v_mine_holds,
      'simulatedFines', v_mine_fines,
      'borrowLimit', v_limit
    )
  );
end $$;

-- ------------------------------------ only public data endpoint -------------
create or replace function lumina_private.public_catalogue(p_payload jsonb)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_search text := lower(trim(coalesce(p_payload->>'search','')));
  v_category text := lower(trim(coalesce(p_payload->>'category','')));
  v_books jsonb;
  v_titles integer;
  v_copies integer;
  v_available integer;
  v_on_loan integer;
  v_members integer;
begin
  select coalesce(jsonb_agg(lumina_private.book_json(b.book_id) order by lower(b.title)), '[]'::jsonb)
    into v_books
  from public.books b
  where b.record_status='ACTIVE'
    and (v_search='' or lower(concat_ws(' ',b.title,b.author,b.category,b.isbn)) like '%'||v_search||'%')
    and (v_category='' or v_category='all' or lower(b.category)=v_category);

  select count(*)::int, coalesce(sum(b.total_copies),0)::int,
         coalesce(sum(greatest(0,b.total_copies-coalesce(a.n,0))),0)::int,
         coalesce(sum(coalesce(a.n,0)),0)::int
    into v_titles,v_copies,v_available,v_on_loan
  from public.books b
  left join lateral (select count(*)::int n from public.loans l where l.book_id=b.book_id and l.loan_status='ACTIVE') a on true
  where b.record_status='ACTIVE';
  select count(*)::int into v_members from public.profiles p where p.account_status='ACTIVE';

  return jsonb_build_object(
    'books',v_books,
    'total',jsonb_array_length(v_books),
    'stats',jsonb_build_object('titles',v_titles,'copies',v_copies,'available',v_available,'onLoan',v_on_loan,'members',v_members),
    'serverTime',now()
  );
end $$;

-- ----------------------------------------- main RPC ------------------------
create or replace function public.lumina_api(
  p_action text,
  p_payload jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer
set search_path = public, lumina_private, auth, pg_temp as $$
declare
  v_action text := coalesce(p_action, '');
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_actor public.profiles;
  v_target public.profiles;
  v_book public.books;
  v_loan public.loans;
  v_res public.reservations;
  v_role text;
  v_staff boolean;
  v_target_id uuid;
  v_book_id text;
  v_loan_id text;
  v_res_id text;
  v_json jsonb;
  v_settings jsonb;
  v_count integer;
  v_active integer;
  v_holds integer;
  v_limit integer;
  v_fines numeric(12,2);
  v_due timestamptz;
  v_days integer;
  v_fine numeric(12,2);
  v_month_from date;
  v_month_to date;
  v_error text;
  v_error_code text;
  v_error_message text;
  v_status text;
begin
  if v_action in ('health','ping') then
    return jsonb_build_object('ok',true,'data',jsonb_build_object(
      'service','lumina-library-supabase','version','3.0.0','time',now()
    ));
  end if;

  if v_action = 'catalogue.public' then
    return jsonb_build_object('ok',true,'data',lumina_private.public_catalogue(v_payload));
  end if;

  v_actor := lumina_private.current_profile();
  v_role := v_actor.role::text;
  v_staff := v_role in ('ADMIN','LIBRARIAN');

  case v_action
    when 'auth.session' then
      v_json := jsonb_build_object('user',lumina_private.user_json(v_actor.id));

    when 'users.me' then
      v_json := jsonb_build_object('user',lumina_private.user_json(v_actor.id));

    when 'bootstrap' then
      v_json := jsonb_build_object(
        'user',lumina_private.user_json(v_actor.id),
        'role',v_role,
        'scope',case when v_staff then 'ALL' else 'SELF' end,
        'books',lumina_private.list_books(true),
        'users',case when v_staff then lumina_private.list_users(v_actor.id,null)
                     else jsonb_build_array(lumina_private.user_json(v_actor.id)) end,
        'loans',lumina_private.list_loans(v_actor.id,null),
        'reservations',lumina_private.list_reservations(v_actor.id),
        'settings',lumina_private.settings_json(),
        'activity',lumina_private.list_activity(v_actor.id,40),
        'wishlist',lumina_private.list_wishlist(v_actor.id),
        'stats',lumina_private.dashboard_json(v_actor.id),
        'serverTime',now()
      );

    when 'books.list' then
      v_json := jsonb_build_object('books',lumina_private.list_books(true));
    when 'books.get' then
      v_book_id := nullif(trim(v_payload->>'bookId'),'');
      if v_book_id is null then perform lumina_private.fail('VALIDATION_ERROR','Book ID is required.'); end if;
      if not exists(select 1 from public.books where book_id=v_book_id) then perform lumina_private.fail('NOT_FOUND','That book does not exist.'); end if;
      v_json := jsonb_build_object('book',lumina_private.book_json(v_book_id));

    when 'users.list' then
      perform lumina_private.require_role(array['ADMIN','LIBRARIAN']);
      v_json := jsonb_build_object('users',lumina_private.list_users(v_actor.id,nullif(v_payload->>'role','')));

    when 'loans.list' then
      v_json := jsonb_build_object('loans',lumina_private.list_loans(v_actor.id,nullif(v_payload->>'status','')));

    when 'reservations.list' then
      v_json := jsonb_build_object('reservations',lumina_private.list_reservations(v_actor.id));

    when 'wishlist.list' then
      v_json := jsonb_build_object('wishlist',lumina_private.list_wishlist(v_actor.id));

    when 'wishlist.toggle' then
      v_book_id := nullif(trim(v_payload->>'bookId'),'');
      if v_book_id is null then perform lumina_private.fail('VALIDATION_ERROR','Book ID is required.'); end if;
      if not exists(select 1 from public.books where book_id=v_book_id) then perform lumina_private.fail('NOT_FOUND','That book does not exist.'); end if;
      if exists(select 1 from public.wishlists where user_id=v_actor.id and book_id=v_book_id) then
        delete from public.wishlists where user_id=v_actor.id and book_id=v_book_id;
        v_json := jsonb_build_object('bookId',v_book_id,'saved',false);
      else
        insert into public.wishlists(user_id,book_id) values(v_actor.id,v_book_id) on conflict do nothing;
        v_json := jsonb_build_object('bookId',v_book_id,'saved',true);
      end if;

    when 'settings.get' then
      v_json := jsonb_build_object('settings',lumina_private.settings_json(),'editable',v_role='ADMIN');

    when 'settings.update' then
      perform lumina_private.require_role(array['ADMIN']);
      if coalesce(jsonb_typeof(v_payload->'settings'),'') <> 'object' or v_payload->'settings' = '{}'::jsonb then
        perform lumina_private.fail('VALIDATION_ERROR','Supply one or more library settings.');
      end if;
      for v_status in select jsonb_object_keys(v_payload->'settings') loop
        if v_status not in ('library_name','loan_duration_days','max_renewals','renewal_extension_days','fine_per_day',
                            'student_borrow_limit','faculty_borrow_limit','reservation_hold_days','allow_self_checkout',
                            'block_issue_on_unpaid_fines','fine_block_threshold') then
          perform lumina_private.fail('VALIDATION_ERROR','Unknown setting: '||v_status);
        end if;
      end loop;
      insert into public.settings(key,value)
        select key, value from jsonb_each_text(v_payload->'settings') as x(key,value)
        on conflict(key) do update set value=excluded.value,updated_at=now();
      perform lumina_private.audit(v_actor.id,'settings.updated','settings','library','Updated library policy');
      v_json := jsonb_build_object('settings',lumina_private.settings_json());

    when 'reports.dashboard' then
      v_json := lumina_private.dashboard_json(v_actor.id);

    when 'reports.analytics' then
      if not v_staff then
        select count(*)::int, count(*) filter(where loan_status='RETURNED')::int into v_count,v_active
          from public.loans where user_id=v_actor.id;
        v_json := jsonb_build_object('scope','SELF','range',jsonb_build_object('from',coalesce(v_payload->>'from',(now()-interval '6 months')::text),'to',coalesce(v_payload->>'to',now()::text)),
          'issued',v_count,'returned',v_active,'series','[]'::jsonb,'categories','[]'::jsonb,'topBooks','[]'::jsonb);
      else
        v_month_from := coalesce(nullif(v_payload->>'from','')::date,(date_trunc('month',now())-interval '5 months')::date);
        v_month_to := coalesce(nullif(v_payload->>'to','')::date,current_date);
        select count(*)::int,count(*) filter(where l.loan_status='RETURNED')::int into v_count,v_active
          from public.loans l where l.issue_date::date between v_month_from and v_month_to;
        select coalesce(jsonb_agg(jsonb_build_object('month',x.month_key,'issued',x.issued,'returned',x.returned) order by x.month_key),'[]'::jsonb)
          into v_json from (
            select to_char(date_trunc('month',l.issue_date),'YYYY-MM') as month_key,
                   count(*)::int issued,count(*) filter(where l.loan_status='RETURNED')::int returned
            from public.loans l where l.issue_date::date between v_month_from and v_month_to
            group by 1
          ) x;
        v_settings := (select coalesce(jsonb_agg(jsonb_build_object('category',x.category,'loans',x.loans) order by x.loans desc),'[]'::jsonb)
          from (select b.category,count(*)::int loans from public.loans l join public.books b using(book_id)
                where l.issue_date::date between v_month_from and v_month_to group by b.category) x);
        v_json := jsonb_build_object(
          'scope','LIBRARY','range',jsonb_build_object('from',v_month_from,'to',v_month_to),
          'issued',v_count,'returned',v_active,'series',coalesce(v_json,'[]'::jsonb),'categories',coalesce(v_settings,'[]'::jsonb),
          'topBooks',(select coalesce(jsonb_agg(jsonb_build_object('bookId',x.book_id,'title',x.title,'author',x.author,'loans',x.n) order by x.n desc),'[]'::jsonb)
            from (select b.book_id,b.title,b.author,count(*)::int n from public.loans l join public.books b using(book_id)
                  where l.issue_date::date between v_month_from and v_month_to group by b.book_id,b.title,b.author order by count(*) desc limit 8) x)
        );
      end if;

    when 'activity.list' then
      v_json := jsonb_build_object('activity',lumina_private.list_activity(v_actor.id,coalesce(nullif(v_payload->>'limit','')::integer,40)));

    when 'system.diagnostics' then
      perform lumina_private.require_role(array['ADMIN']);
      v_json := jsonb_build_object('service','lumina-library-supabase','version','3.0.0',
        'user',v_actor.email,'role',v_role,'time',now(),
        'counts',jsonb_build_object(
          'books',(select count(*) from public.books),
          'users',(select count(*) from public.profiles),
          'loans',(select count(*) from public.loans),
          'reservations',(select count(*) from public.reservations)
        ));

    when 'users.updateProfile' then
      update public.profiles set
        full_name=coalesce(nullif(trim(v_payload->>'name'),''),full_name),
        phone=coalesce(v_payload->>'phone',phone),
        department=coalesce(v_payload->>'department',department)
      where id=v_actor.id;
      perform lumina_private.audit(v_actor.id,'user.profile','user',v_actor.user_code,'Updated own profile');
      v_json := jsonb_build_object('user',lumina_private.user_json(v_actor.id));

    -- The remaining account-admin actions are served by the private manage-user
    -- Edge Function so Supabase Auth Admin API keys never reach this RPC/client.
    when 'users.create' then perform lumina_private.fail('CONFIG_ERROR','User creation must go through the deployed manage-user Edge Function.');
    when 'users.update' then perform lumina_private.fail('CONFIG_ERROR','User updates must go through the deployed manage-user Edge Function.');
    when 'users.setStatus' then perform lumina_private.fail('CONFIG_ERROR','Status changes must go through the deployed manage-user Edge Function.');
    when 'users.resetPassword' then perform lumina_private.fail('CONFIG_ERROR','Password resets must go through the deployed manage-user Edge Function.');

    when 'books.create' then
      perform lumina_private.require_role(array['ADMIN','LIBRARIAN']);
      if nullif(trim(v_payload->>'title'),'') is null or nullif(trim(v_payload->>'author'),'') is null then
        perform lumina_private.fail('VALIDATION_ERROR','Title and author are required.');
      end if;
      if coalesce(nullif(v_payload->>'totalCopies','')::integer,0)<1 then perform lumina_private.fail('VALIDATION_ERROR','Total copies must be at least 1.'); end if;
      if exists(select 1 from public.books b where lower(b.title)=lower(trim(v_payload->>'title'))
        or (nullif(trim(v_payload->>'isbn'),'') is not null and b.isbn=trim(v_payload->>'isbn'))) then
        perform lumina_private.fail('CONFLICT','A book with that title or ISBN already exists.');
      end if;
      insert into public.books(title,author,isbn,publisher,year,category,description,shelf_location,total_copies,cover_image_url)
      values(trim(v_payload->>'title'),trim(v_payload->>'author'),coalesce(v_payload->>'isbn',''),coalesce(v_payload->>'publisher',''),
        coalesce(nullif(v_payload->>'year','')::integer,extract(year from now())::integer),coalesce(nullif(trim(v_payload->>'category'),''),'General'),
        coalesce(v_payload->>'description',''),coalesce(v_payload->>'shelf',''),(v_payload->>'totalCopies')::integer,nullif(v_payload->>'coverImageUrl',''))
      returning * into v_book;
      perform lumina_private.audit(v_actor.id,'book.created','book',v_book.book_id,'Created "'||v_book.title||'"');
      v_json := jsonb_build_object('book',lumina_private.book_json(v_book.book_id));

    when 'books.update' then
      perform lumina_private.require_role(array['ADMIN','LIBRARIAN']);
      v_book_id := nullif(trim(v_payload->>'bookId'),'');
      select * into v_book from public.books where book_id=v_book_id for update;
      if not found then perform lumina_private.fail('NOT_FOUND','That book does not exist.'); end if;
      if nullif(trim(v_payload->>'title'),'') is null or nullif(trim(v_payload->>'author'),'') is null then perform lumina_private.fail('VALIDATION_ERROR','Title and author are required.'); end if;
      if exists(select 1 from public.books b where b.book_id<>v_book_id and
        (lower(b.title)=lower(trim(v_payload->>'title')) or
         (nullif(trim(v_payload->>'isbn'),'') is not null and b.isbn=trim(v_payload->>'isbn')))) then
        perform lumina_private.fail('CONFLICT','A book with that title or ISBN already exists.');
      end if;
      v_count := (select count(*) from public.loans where book_id=v_book_id and loan_status='ACTIVE');
      if coalesce(nullif(v_payload->>'totalCopies','')::integer,0)<v_count then perform lumina_private.fail('CONFLICT','Total copies cannot be below the number currently on loan.'); end if;
      update public.books set title=trim(v_payload->>'title'),author=trim(v_payload->>'author'),isbn=coalesce(v_payload->>'isbn',''),
        publisher=coalesce(v_payload->>'publisher',''),year=coalesce(nullif(v_payload->>'year','')::integer,year),
        category=coalesce(nullif(trim(v_payload->>'category'),''),'General'),description=coalesce(v_payload->>'description',''),
        shelf_location=coalesce(v_payload->>'shelf',''),total_copies=(v_payload->>'totalCopies')::integer,
        cover_image_url=nullif(v_payload->>'coverImageUrl','') where book_id=v_book_id;
      perform lumina_private.audit(v_actor.id,'book.updated','book',v_book_id,'Updated "'||trim(v_payload->>'title')||'"');
      v_json := jsonb_build_object('book',lumina_private.book_json(v_book_id));

    when 'books.archive' then
      perform lumina_private.require_role(array['ADMIN','LIBRARIAN']);
      v_book_id := nullif(trim(v_payload->>'bookId'),'');
      update public.books set record_status=case when coalesce((v_payload->>'archived')::boolean,true) then 'ARCHIVED'::public.book_status else 'ACTIVE'::public.book_status end
      where book_id=v_book_id returning * into v_book;
      if not found then perform lumina_private.fail('NOT_FOUND','That book does not exist.'); end if;
      perform lumina_private.audit(v_actor.id,case when v_book.record_status='ARCHIVED' then 'book.archived' else 'book.restored' end,'book',v_book_id,
        case when v_book.record_status='ARCHIVED' then 'Archived "'||v_book.title||'"' else 'Restored "'||v_book.title||'"' end);
      v_json := jsonb_build_object('book',lumina_private.book_json(v_book_id));

    when 'books.delete' then
      perform lumina_private.require_role(array['ADMIN']);
      v_book_id := nullif(trim(v_payload->>'bookId'),'');
      if not exists(select 1 from public.books where book_id=v_book_id) then perform lumina_private.fail('NOT_FOUND','That book does not exist.'); end if;
      if exists(select 1 from public.loans where book_id=v_book_id) then perform lumina_private.fail('CONFLICT','This title has circulation history, so archive it instead.'); end if;
      if exists(select 1 from public.reservations where book_id=v_book_id) then perform lumina_private.fail('CONFLICT','This title has reservation history, so archive it instead.'); end if;
      delete from public.books where book_id=v_book_id;
      perform lumina_private.audit(v_actor.id,'book.deleted','book',v_book_id,'Deleted title with no circulation history');
      v_json := jsonb_build_object('deleted',true,'bookId',v_book_id);

    when 'loans.issue' then
      v_book_id := nullif(trim(v_payload->>'bookId'),'');
      if v_book_id is null then perform lumina_private.fail('VALIDATION_ERROR','Book ID is required.'); end if;
      if v_staff then
        if nullif(trim(v_payload->>'userId'),'') is null then perform lumina_private.fail('VALIDATION_ERROR','Member ID is required at the desk.'); end if;
        select id into v_target_id from public.profiles where user_code=trim(v_payload->>'userId');
      else
        if v_payload ? 'userId' and trim(v_payload->>'userId') <> v_actor.user_code then perform lumina_private.fail('FORBIDDEN','You can only borrow books for your own account.'); end if;
        if public.setting('allow_self_checkout','false') <> 'true' then perform lumina_private.fail('FORBIDDEN','Self checkout is disabled. Ask library staff to issue this book.'); end if;
        v_target_id := v_actor.id;
      end if;
      if v_target_id is null then perform lumina_private.fail('NOT_FOUND','That member does not exist.'); end if;
      select * into v_target from public.profiles where id=v_target_id;
      if v_target.account_status <> 'ACTIVE' then perform lumina_private.fail('FORBIDDEN','This member account is inactive.'); end if;
      select * into v_book from public.books where book_id=v_book_id for update;
      if not found then perform lumina_private.fail('NOT_FOUND','That book does not exist.'); end if;
      if v_book.record_status <> 'ACTIVE' then perform lumina_private.fail('CONFLICT','That title is archived and cannot be issued.'); end if;
      select count(*)::int into v_count from public.loans where book_id=v_book_id and loan_status='ACTIVE';
      if v_count >= v_book.total_copies then perform lumina_private.fail('CONFLICT','No copies are available. Place a reservation instead.'); end if;
      if exists(select 1 from public.loans where book_id=v_book_id and user_id=v_target_id and loan_status='ACTIVE') then perform lumina_private.fail('CONFLICT','This member already has this title on loan.'); end if;
      select count(*)::int into v_active from public.loans where user_id=v_target_id and loan_status='ACTIVE';
      v_limit := coalesce(v_target.borrowing_limit,case when v_target.role='STUDENT' then public.setting_int('student_borrow_limit',4) else public.setting_int('faculty_borrow_limit',8) end);
      if v_active >= v_limit then perform lumina_private.fail('CONFLICT','Borrowing limit reached ('||v_limit||' books).'); end if;
      select coalesce(sum(case when loan_status='ACTIVE' then public.overdue_days(due_date)*public.fine_per_day() else fine_amount end),0)
        into v_fines from public.loans where user_id=v_target_id;
      if public.setting('block_issue_on_unpaid_fines','false')='true' and v_fines >= public.setting_int('fine_block_threshold',100) then
        perform lumina_private.fail('CONFLICT','Outstanding simulated fines block new loans.');
      end if;
      v_due := now() + make_interval(days=>public.setting_int('loan_duration_days',14));
      insert into public.loans(book_id,user_id,issued_by,due_date)
      values(v_book_id,v_target_id,v_actor.id,v_due) returning * into v_loan;
      perform lumina_private.audit(v_actor.id,'loan.issued','loan',v_loan.loan_id,'Issued "'||v_book.title||'" to '||v_target.full_name);
      v_json := jsonb_build_object('loan',lumina_private.loan_json(v_loan.loan_id));

    when 'loans.return' then
      if not v_staff then perform lumina_private.fail('FORBIDDEN','Only library staff can process returns.'); end if;
      v_loan_id := nullif(trim(v_payload->>'loanId'),'');
      select * into v_loan from public.loans where loan_id=v_loan_id for update;
      if not found then perform lumina_private.fail('NOT_FOUND','That loan does not exist.'); end if;
      if v_loan.loan_status='RETURNED' then perform lumina_private.fail('CONFLICT','This loan was already returned.'); end if;
      v_days := public.overdue_days(v_loan.due_date);
      v_fine := v_days * public.fine_per_day();
      update public.loans set loan_status='RETURNED',return_date=now(),fine_amount=v_fine where loan_id=v_loan_id;
      perform lumina_private.audit(v_actor.id,'loan.returned','loan',v_loan_id,'Returned "'||(select title from public.books where book_id=v_loan.book_id)||'" with simulated fine ₹'||v_fine);
      v_json := jsonb_build_object('loan',lumina_private.loan_json(v_loan_id),'fine',v_fine,'daysLate',v_days);

    when 'loans.renew' then
      v_loan_id := nullif(trim(v_payload->>'loanId'),'');
      select * into v_loan from public.loans where loan_id=v_loan_id for update;
      if not found then perform lumina_private.fail('NOT_FOUND','That loan does not exist.'); end if;
      if not v_staff and v_loan.user_id<>v_actor.id then perform lumina_private.fail('FORBIDDEN','You can only renew your own loans.'); end if;
      if v_loan.loan_status='RETURNED' then perform lumina_private.fail('CONFLICT','A returned loan cannot be renewed.'); end if;
      if public.overdue_days(v_loan.due_date)>0 then perform lumina_private.fail('CONFLICT','Overdue loans cannot be renewed. Return the book first.'); end if;
      if v_loan.renewal_count>=public.setting_int('max_renewals',2) then perform lumina_private.fail('CONFLICT','Renewal limit reached.'); end if;
      if exists(select 1 from public.reservations r where r.book_id=v_loan.book_id and r.reservation_status in ('PENDING','READY')) then
        perform lumina_private.fail('CONFLICT','Another member is waiting for this title, so it cannot be renewed.');
      end if;
      v_due := v_loan.due_date + make_interval(days=>public.setting_int('renewal_extension_days',14));
      update public.loans set due_date=v_due,renewal_count=renewal_count+1 where loan_id=v_loan_id;
      perform lumina_private.audit(v_actor.id,'loan.renewed','loan',v_loan_id,'Renewed a loan until '||v_due::date::text);
      v_json := jsonb_build_object('loan',lumina_private.loan_json(v_loan_id));

    when 'reservations.create' then
      v_book_id := nullif(trim(v_payload->>'bookId'),'');
      if v_book_id is null then perform lumina_private.fail('VALIDATION_ERROR','Book ID is required.'); end if;
      if v_staff and nullif(trim(v_payload->>'userId'),'') is not null then
        select id into v_target_id from public.profiles where user_code=trim(v_payload->>'userId');
      else
        if not v_staff and v_payload ? 'userId' and trim(v_payload->>'userId')<>v_actor.user_code then perform lumina_private.fail('FORBIDDEN','You can only reserve a book for your own account.'); end if;
        v_target_id := v_actor.id;
      end if;
      if v_target_id is null then perform lumina_private.fail('NOT_FOUND','That member does not exist.'); end if;
      select * into v_book from public.books where book_id=v_book_id for update;
      if not found then perform lumina_private.fail('NOT_FOUND','That book does not exist.'); end if;
      if v_book.record_status<>'ACTIVE' then perform lumina_private.fail('CONFLICT','That title is archived and cannot be reserved.'); end if;
      select * into v_target from public.profiles where id=v_target_id;
      if v_target.account_status<>'ACTIVE' then perform lumina_private.fail('FORBIDDEN','This account is deactivated.'); end if;
      if exists(select 1 from public.reservations where book_id=v_book_id and user_id=v_target_id and reservation_status in ('PENDING','READY')) then perform lumina_private.fail('CONFLICT','You already have an active reservation for this title.'); end if;
      if exists(select 1 from public.loans where book_id=v_book_id and user_id=v_target_id and loan_status='ACTIVE') then perform lumina_private.fail('CONFLICT','You already have this title on loan.'); end if;
      select count(*)::int+1 into v_count from public.reservations where book_id=v_book_id and reservation_status in ('PENDING','READY');
      insert into public.reservations(book_id,user_id,queue_position) values(v_book_id,v_target_id,v_count) returning * into v_res;
      perform lumina_private.audit(v_actor.id,'reservation.created','reservation',v_res.reservation_id,'Reserved "'||v_book.title||'" (queue #'||v_count||')');
      v_json := jsonb_build_object('reservation',lumina_private.reservation_json(v_res.reservation_id));

    when 'reservations.cancel' then
      v_res_id := nullif(trim(v_payload->>'reservationId'),'');
      select * into v_res from public.reservations where reservation_id=v_res_id for update;
      if not found then perform lumina_private.fail('NOT_FOUND','That reservation does not exist.'); end if;
      if not v_staff and v_res.user_id<>v_actor.id then perform lumina_private.fail('FORBIDDEN','You can only cancel your own reservations.'); end if;
      if v_res.reservation_status not in ('PENDING','READY') then perform lumina_private.fail('CONFLICT','This reservation is already closed.'); end if;
      perform pg_advisory_xact_lock(hashtext(v_res.book_id));
      update public.reservations set reservation_status='CANCELLED',queue_position=0 where reservation_id=v_res_id;
      with ordered as (
        select reservation_id,row_number() over(order by reservation_date,created_at)::integer as pos
        from public.reservations where book_id=v_res.book_id and reservation_status='PENDING'
      )
      update public.reservations r set queue_position=o.pos from ordered o where r.reservation_id=o.reservation_id;
      perform lumina_private.audit(v_actor.id,'reservation.cancelled','reservation',v_res_id,'Cancelled a reservation');
      v_json := jsonb_build_object('reservation',lumina_private.reservation_json(v_res_id));

    else
      perform lumina_private.fail('UNKNOWN_ACTION','Unknown action: '||left(v_action,60));
  end case;

  return jsonb_build_object('ok',true,'data',coalesce(v_json,'{}'::jsonb));
exception
  when others then
    get stacked diagnostics v_error = message_text;
    if v_error like 'LUMINA|%|%' then
      v_error_code := split_part(v_error,'|',2);
      v_error_message := split_part(v_error,'|',3);
    elsif sqlstate = '23505' then
      v_error_code := 'CONFLICT'; v_error_message := 'A record with the same unique value already exists.';
    elsif sqlstate in ('23503','P0002') then
      v_error_code := 'NOT_FOUND'; v_error_message := 'The requested record does not exist.';
    elsif sqlstate in ('23514','22P02','22007','22003') then
      v_error_code := 'VALIDATION_ERROR'; v_error_message := 'The supplied value is invalid.';
    elsif sqlstate in ('42501','28000') then
      v_error_code := 'FORBIDDEN'; v_error_message := 'Your account does not have permission to do that.';
    else
      v_error_code := 'SERVER_ERROR'; v_error_message := 'The library database could not complete this request.';
    end if;
    return jsonb_build_object('ok',false,'error',jsonb_build_object('code',v_error_code,'message',coalesce(v_error_message,'Request failed.')));
end $$;

-- Functions in the private schema are never exposed through PostgREST. Only the
-- single whitelisted public RPC is callable, even by users with the anon key.
revoke all on all functions in schema lumina_private from public, anon, authenticated;
revoke all on function public.lumina_api(text,jsonb) from public, anon, authenticated;
grant execute on function public.lumina_api(text,jsonb) to anon, authenticated;
