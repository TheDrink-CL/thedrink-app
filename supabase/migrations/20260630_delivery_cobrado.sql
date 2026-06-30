-- Agrega el cobro de delivery al CLIENTE como campo de la orden.
-- Hasta ahora `ordenes.delivery` guardaba solo el COSTO pagado a terceros
-- (Uber/motoboy), y el cobro al cliente se ingresaba a mano en Caja como un
-- movimiento categoria='Delivery'. Con esta columna el cobro viaja junto a la
-- venta. Aplica solo a ventas futuras; los cobros historicos siguen en Caja.

alter table public.ordenes
  add column if not exists delivery_cobrado numeric not null default 0;

comment on column public.ordenes.delivery_cobrado is
  'Monto cobrado al cliente por el delivery (ingreso). Distinto de `delivery`, que es el costo pagado a un tercero.';
