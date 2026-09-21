-- Reubica Leads y Cuentas en el catalogo de navegacion.

update public.nav_modules
set section_key = 'crm_marketing',
    order_index = 20
where key = 'crm.leads_scoring';

update public.nav_modules
set section_key = 'comercial',
    order_index = 5
where key = 'crm.cuentas_contactos';
