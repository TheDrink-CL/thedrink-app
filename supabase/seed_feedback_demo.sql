-- ─────────────────────────────────────────────────────────────────────────────
-- OPINIONES DE EJEMPLO — para ver como se ve la pantalla antes de tener datos.
--
-- NO ES UNA MIGRACION. Por eso vive fuera de migrations/: se corre a mano una
-- vez, se mira, y se borra con el bloque del final.
--
-- Todas las filas quedan marcadas con `origen` empezando en 'demo', asi que se
-- ven distintas en la pantalla ("via demo-qr") y se borran de una sola pasada
-- sin riesgo de llevarse una opinion real por delante.
--
-- ⚠ El trigger `feedback_guard_trg` pisa `creado_en` con now() y limita los
-- envios por IP. Las dos cosas estorban aca, asi que se desactiva durante la
-- carga. Va todo en una transaccion: si algo falla, el trigger vuelve solo.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

alter table public.feedback disable trigger feedback_guard_trg;

insert into public.feedback (creado_en, puntaje, aspecto, trago, comentario, origen) values
  (now() - interval '6 hours',  3, 'trago',  'Mojito coco-frambuesa', 'Buenisimo, mejor que el del bar de la esquina. Repetimos.', 'demo-qr'),
  (now() - interval '1 day',    3,  null,     null,                    null,                                                       'demo-qr'),
  (now() - interval '2 days',   2, 'envio',   null,                    'Llego 40 min despues de lo que decia. El trago bien igual.', 'demo-qr'),
  (now() - interval '3 days',   1, 'trago',  'Daikiri maracuya',      'Venia muy aguado, como si se hubiera derretido el hielo.',  'demo-qr'),
  (now() - interval '4 days',   3, 'trago',  'Blue Colada',           'El color es una locura, lo subi a la historia.',            'demo-carta'),
  (now() - interval '5 days',   2, 'pedido',  null,                    'Me costo entender el codigo que sale al final. No sabia si tenia que copiarlo yo.', 'demo-qr'),
  (now() - interval '6 days',   3,  null,    'Gin tonica guisante',   'No sabia que cambiaba de color. Muy buena.',                'demo-qr'),
  (now() - interval '8 days',   2, 'precio',  null,                    'Rico pero un litro me parecio caro para lo que rinde entre 4.', 'demo-carta'),
  (now() - interval '9 days',   1, 'envio',   null,                    'Llego tibio. En verano eso se nota altiro.',                'demo-qr'),
  (now() - interval '10 days',  3,  null,     null,                    null,                                                       'demo-carta'),
  (now() - interval '12 days',  3, 'trago',  'Maracuya Sour',         'Justo el punto de acido. Y llego con el hielo aparte, se agradece.', 'demo-qr'),
  (now() - interval '15 days',  2, 'trago',  'Violetto Tonic',        'Le faltaba tonica creo, quedo muy fuerte.',                 'demo-qr'),
  (now() - interval '18 days',  3,  null,     null,                    'Contestaron por WhatsApp altiro un domingo. Eso vale.',     'demo-wsp'),
  (now() - interval '22 days',  1, 'pedido',  null,                    'La tapa venia mal puesta y goteo en el auto.',              'demo-qr'),
  (now() - interval '26 days',  3, 'trago',  'Berry Bomb',             null,                                                       'demo-qr');

alter table public.feedback enable trigger feedback_guard_trg;

commit;


-- ─── Borrar los ejemplos cuando ya los viste ─────────────────────────────────
--
--   delete from public.feedback where origen like 'demo%';
--
-- Y para confirmar que no quedo ninguno:
--
--   select count(*) from public.feedback where origen like 'demo%';
