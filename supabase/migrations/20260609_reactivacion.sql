-- Gestión de reactivación de clientes (vista "Reactivar")
-- estado_contacto: null = pendiente · 'contactado' = 1er toque enviado ·
--                  'contactado_2' = 2do toque · 'frio' = no respondió 2 toques ·
--                  'excluido' = fuera de la lista Y de las estadísticas del Panel
alter table clientes add column if not exists estado_contacto text;
alter table clientes add column if not exists fecha_contacto date;
