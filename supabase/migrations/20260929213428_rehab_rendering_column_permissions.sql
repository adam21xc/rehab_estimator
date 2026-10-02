-- Keep quota timestamps and job ownership immutable through the authenticated API.
revoke insert, update on public.rehab_renderings from authenticated;
grant insert (id,user_id,estimate_id,source_photo_id,prompt,style,model,status) on public.rehab_renderings to authenticated;
grant update (status,output_path,error_message) on public.rehab_renderings to authenticated;
