begin;
do $$
declare r uuid=gen_random_uuid(); other uuid=gen_random_uuid(); d jsonb; a jsonb; n int;
begin
 a=public.accela_ingest('start',r);
 if not (a->>'acquired')::boolean then raise exception 'Cannot test while importer active'; end if;
 if (public.accela_ingest('start',other)->>'acquired')::boolean then raise exception 'Overlapping lease allowed'; end if;
 perform public.accela_ingest('discover',r,'{"records":[{"case_number":"TEST-ACCELA-IDEMPOTENCY","source_url":"https://aca-prod.accela.com/INDY/Cap/CapDetail.aspx?capID1=TEST","filed_date":"2026-09-29","address":"Synthetic address","case_type":"Test","record_status":"Open"}]}');
 d='{"case_number":"TEST-ACCELA-IDEMPOTENCY","source_url":"https://aca-prod.accela.com/INDY/Cap/CapDetail.aspx?capID1=TEST","record_status":"Open","owners":[],"occupants":[{"display_name":"OCCUPANT"}],"violators":[{"display_name":"Synthetic Party"}],"related_contacts":[],"project_description":null,"application_tables":[],"parcel_information":[]}';
 perform public.accela_ingest('detail',r,jsonb_build_object('detail',d));
 a=public.accela_ingest('detail',r,jsonb_build_object('detail',d||'{"fetched_at":"2026-09-30T00:00:00Z"}'));
 if (a->>'changed')::boolean then raise exception 'Repeat generated a version'; end if;
 select count(*) into n from public.accela_case_versions where case_number='TEST-ACCELA-IDEMPOTENCY';
 if n<>1 then raise exception 'Expected one version';end if;
 perform public.accela_ingest('error',r,'{"case_number":"TEST-ACCELA-IDEMPOTENCY","error":"synthetic failure"}');
 if (select raw_detail is null or jsonb_array_length(occupants)<>1 or jsonb_array_length(violators)<>1 from public.accela_cases where case_number='TEST-ACCELA-IDEMPOTENCY') then raise exception 'Failure erased prior data';end if;
 perform public.accela_ingest('detail',r,jsonb_build_object('detail',d||'{"record_status":"Closed"}'));
 select count(*) into n from public.accela_case_versions where case_number='TEST-ACCELA-IDEMPOTENCY';
 if n<>2 then raise exception 'Change not versioned';end if;
 update public.accela_import_state set lease_until=now()-interval '1 second' where agency='INDY';
 perform public.accela_ingest('start',other);
 begin
  perform public.accela_ingest('heartbeat',r);
  raise exception 'Stale worker accepted';
 exception when raise_exception then
  if sqlerrm <> 'Accela worker lease lost' then raise; end if;
 end;
 if has_function_privilege('anon','public.accela_ingest(text,uuid,jsonb)','execute') or has_table_privilege('authenticated','public.accela_cases','select') then raise exception 'Private data exposed';end if;
end $$;
rollback;
