# Ruta Segura
Transporte seguro para Bolivia: minibús (por línea/parada/sindicato), taxi y moto con verificación facial del chofer.

## Estructura
- `js/nucleo/`: constantes, geografía y clases de dominio
- `js/servicios/`: lógica (autenticación, biometría, minibús, viajes, tarifa) y cliente Supabase
- `js/ui/`: vistas (acceso, pasajero, conductor), mapa y cámara
- `supabase/01_esquema.sql`: tablas, índices, funciones, triggers, permisos y RLS
- `supabase/02_datos_prueba.sql`: sindicato, línea, paradas y vehículos de ejemplo
- `supabase/03_migracion_sin_login_facial.sql`: solo si ya ejecutaste una versión anterior del esquema

## Cuándo se usa el rostro
1. Al **crear la cuenta** (selfie de verificación, una sola vez; no permite el mismo rostro en dos cuentas).
2. Cuando el pasajero **verifica al conductor** de un taxi o moto.
El ingreso es solo correo y contraseña.

## Base de datos (Supabase)
1. Crea el proyecto en supabase.com.
2. SQL Editor: ejecuta `01_esquema.sql` y luego `02_datos_prueba.sql`.
3. Authentication > Providers > Email: para pruebas desactiva "Confirm email".
4. Project Settings > API: copia la URL y la `anon key` a `js/config.js`.
5. Tras registrar usuarios, sigue los pasos manuales al final de `02_datos_prueba.sql` (administrador y asignación de vehículos).

## Ejecutar en local
1. Copia tu carpeta `modelos-face-api/` a la raíz (tiny_face_detector, face_landmark_68_tiny, face_recognition).
2. `npx serve .` y abre http://localhost:3000 (la cámara y el GPS exigen localhost o HTTPS).

## Subir a GitHub
- La `anon key` es pública por diseño (la protege el RLS). NUNCA subas la `service_role key`.
- `git init && git add . && git commit -m "Ruta Segura" && git push` (GitHub Pages sirve el sitio con HTTPS).
