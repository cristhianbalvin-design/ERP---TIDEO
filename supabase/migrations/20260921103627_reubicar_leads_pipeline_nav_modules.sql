-- Reubica Leads y Pipeline en la sección Comercial del catálogo de navegación.

update public.nav_modules
set section_key = 'comercial',
    order_index = 45
where key = 'crm.leads_scoring';

update public.nav_modules
set section_key = 'comercial',
    order_index = 46
where key = 'crm.pipeline';
