# CastroX · Inventario con lector de códigos QR

CastroX es una aplicación web para llevar el inventario de productos. Lee **códigos QR y de barras** con la cámara del celular o de la computadora, y también con lectores USB. Sirve para registrar productos, entradas, salidas y ajustes, y para ver el stock en tiempo real.

## Funciones

| Módulo | Qué hace |
|---|---|
| **Escáner** | Lee códigos QR y de barras con la cámara o con un lector USB. Tiene 3 modos: *Consultar*, *Entrada rápida* y *Salida rápida* (cada escaneo suma o resta stock al instante). Si el código no existe, ofrece registrar el producto con ese código. |
| **Panel** | Indicadores (productos, unidades, valor del inventario, alertas, movimientos del día), gráfica de entradas y salidas de los últimos 7 días, unidades por categoría, productos por reabastecer y actividad reciente. |
| **Productos** | Alta, edición y eliminación. Búsqueda, filtros por categoría y estado de stock, orden por columna, paginación, exportación a CSV (Excel) e impresión de **etiquetas QR**. |
| **Movimientos** | Historial de entradas, salidas y ajustes, con usuario, motivo y stock anterior/nuevo. Filtros por tipo, fechas y texto. Exportación a CSV. |
| **Categorías** | Agrupa los productos con nombre, descripción y color. |
| **Usuarios** | Roles *Administrador* y *Operador*. Se pueden activar o desactivar cuentas. |
| **Ajustes** | Tema claro u oscuro, moneda, sonido al escanear y cambio de contraseña. |

La app se adapta al celular: tiene barra de navegación inferior y un botón central para escanear, y se puede instalar en la pantalla de inicio.

## Tecnologías

- **Backend:** Node.js 20 (24 en Vercel), Express 5 y TypeScript, con validación en Zod y sesiones con JWT y bcrypt
- **Base de datos:** PostgreSQL 16 (Neon en la nube)
- **Frontend:** HTML, CSS y JavaScript (módulos ES) sin necesidad de compilar. Usa html5-qrcode para el escáner y Chart.js para las gráficas
- **Infraestructura:** Vercel (en la nube) o Docker y Docker Compose (local / VPS)

```
app-inventario/
├── backend/            API en TypeScript
│   └── src/
│       ├── app.ts      app Express: rutas de la API y generador de QR
│       ├── index.ts    servidor HTTP/HTTPS (Docker)
│       ├── db.ts       conexión, creación de tablas y datos iniciales
│       ├── auth.ts     JWT y roles
│       └── routes/     auth, products, movements, categories, dashboard, users
├── frontend/           interfaz web (SPA)
│   ├── css/styles.css
│   └── js/             app.js, api.js, ui.js, scanner.js, forms.js, views/
├── api/index.ts        entrada de la API en Vercel (usa backend/src/app.ts)
├── vercel.json         configuración de Vercel
├── package.json        dependencias para Vercel
├── Dockerfile
├── docker-compose.yml
└── .env.example
```

## En la nube (Vercel)

La app está publicada en **https://castrox.vercel.app**.

- **Vercel** (proyecto `castrox`) sirve el frontend como sitio estático y la API como una función serverless (`api/index.ts`).
- **Neon** (base `castrox-db`) es la base de datos PostgreSQL. Está conectada al proyecto y Vercel define sola la variable `DATABASE_URL`.
- Variables configuradas en Vercel: `JWT_SECRET`, `ADMIN_PASSWORD` y `SEED_DEMO=false`.

Las tablas y el usuario administrador se crean solos con la primera petición. La contraseña inicial del admin es el valor de `ADMIN_PASSWORD`, no `admin123`.

Para publicar cambios necesitas la CLI de Vercel. Sin Node instalado, puedes correrla con Docker; `VERCEL_TOKEN` es un token creado en vercel.com/account/tokens:

```bash
docker run --rm -e VERCEL_TOKEN -v "$PWD":/work -w /work node:24-alpine \
  sh -c 'npx -y vercel@65.7.0 deploy --prod --yes --token "$VERCEL_TOKEN"'
```

El repositorio de GitHub ya está conectado al proyecto, así que cada `git push` a `main` se publica solo.

### Respaldos automáticos

Cada noche a las 2:00 am (hora de Honduras), GitHub Actions ([`.github/workflows/respaldo.yml`](.github/workflows/respaldo.yml)) hace un respaldo completo de la base de Neon y lo guarda en la rama **`respaldos`** de este repositorio, en `respaldos/castrox-AAAA-MM-DD.sql.gz`. Se conservan los últimos 60 días.

- Requiere el secreto `DATABASE_URL` en GitHub: **Settings → Secrets and variables → Actions**.
- Para hacer un respaldo en el momento: pestaña **Actions → Respaldo de la base de datos → Run workflow**.
- Para restaurar, por ejemplo al mudarse a un VPS, descarga el archivo de la rama `respaldos` y cárgalo en una base vacía:

```bash
gunzip -c castrox-AAAA-MM-DD.sql.gz | docker exec -i castrox-db psql -U castrox -d castrox
```

## En tu computadora (Docker)

Necesitas [Docker Desktop](https://www.docker.com/products/docker-desktop/).

```bash
# 1. Crea el archivo de configuración y cambia las contraseñas
cp .env.example .env

# 2. Construye y levanta la app y PostgreSQL
docker compose up -d --build
```

Abre **http://localhost:3000** e inicia sesión con:

- Usuario: `admin`
- Contraseña: `admin123`

Cambia la contraseña en **Ajustes** después del primer acceso.

> La primera vez, la app crea sola las tablas y unos datos de ejemplo. Si no quieres los datos de ejemplo, pon `SEED_DEMO=false` en `.env`.

### Escanear desde el celular

Los navegadores solo permiten usar la cámara en conexiones seguras (HTTPS). Para eso la app también abre el puerto **3443** con un certificado propio:

1. Conecta el celular a la misma red Wi-Fi que la computadora.
2. Busca la IP de la computadora con `ipconfig` (por ejemplo, `192.168.1.50`).
3. En el celular abre `https://192.168.1.50:3443`.
4. Acepta el aviso del certificado: en Chrome toca *Configuración avanzada* y luego *Continuar*.

Si Windows bloquea la conexión, permite los puertos 3000 y 3443 en el Firewall de Windows.

### Lector de códigos USB

En la pantalla **Escanear**, deja el cursor en el campo "Código manual o lector USB". Estos lectores escriben el código y presionan Enter, así que funcionan sin configurar nada.

## Otras formas de acceso desde internet

La forma más simple es Vercel (ver arriba). Estas opciones sirven si prefieres alojarla tú.

Al iniciar sesión con la contraseña inicial `admin123`, la app obliga a cambiarla. Después de 10 intentos fallidos, bloquea el inicio de sesión de ese usuario desde esa IP durante 15 minutos.

### Opción A · Túnel gratis desde tu PC (Cloudflare Tunnel)

```bash
docker compose --profile tunnel up -d
docker compose logs tunnel | findstr trycloudflare      # en Linux/Mac: | grep trycloudflare
```

La dirección `https://xxxx.trycloudflare.com` que aparece ya se puede abrir desde cualquier celular. Tiene HTTPS válido, así que la cámara funciona sin avisos.

Limitaciones:
- La PC debe estar encendida y con Docker Desktop abierto.
- La dirección **cambia** cada vez que se reinicia el contenedor `tunnel`.

### Opción B · Servidor VPS (24/7, dirección fija)

Necesitas un VPS con **Ubuntu 22.04/24.04 y al menos 1 GB de RAM**, por ejemplo de DigitalOcean, Hetzner, Contabo o Vultr.

1. (Opcional) Si tienes dominio, crea un registro DNS tipo **A** que apunte a la IP del servidor.
2. Entra al servidor por SSH y ejecuta:
   ```bash
   git clone https://github.com/AndrosCastro/CastroX.git && cd CastroX
   sudo bash deploy/setup-vps.sh midominio.com     # sin dominio: sudo bash deploy/setup-vps.sh
   ```
3. El script hace lo siguiente:
   - instala Docker
   - crea memoria swap y abre los puertos 80 y 443
   - genera `.env` con claves aleatorias y **muestra la contraseña del admin**
   - levanta PostgreSQL, la app y **Caddy** (HTTPS automático con Let's Encrypt)
   - programa un respaldo diario de la base a las 3:00 am, que queda en `backups/`

Sin dominio, la app queda en `https://<IP-con-guiones>.sslip.io`, por ejemplo `https://203-0-113-5.sslip.io`.

Para actualizar el servidor cuando cambies el código:

```bash
git pull && docker compose -f docker-compose.prod.yml up -d --build
```

Para hacer un respaldo manual: `bash deploy/backup.sh`. Para restaurar uno:

```bash
gunzip -c backups/ARCHIVO.sql.gz | docker exec -i castrox-db psql -U castrox -d castrox
```

## App Android (APK)

La app nativa está en [`android/`](android/). Carga CastroX desde el servidor y agrega lo siguiente:
- **cámara** para el escáner, con permisos de Android
- **Descargas**: los CSV y las imágenes QR se guardan en la carpeta *Descargas* del teléfono
- **impresión** de etiquetas con el sistema de Android, en una impresora o con *Guardar como PDF*
- el botón **Atrás** cierra ventanas o vuelve al panel
- una pantalla para **conectar o cambiar el servidor**, escribiendo la dirección o escaneando un código QR

### Instalar en el teléfono

1. Desde el teléfono, abre `<tu-servidor>/downloads/CastroX.apk`. El enlace también está en la pantalla de inicio de sesión y en **Ajustes → App Android**.
2. Abre el archivo descargado y permite *Instalar apps desconocidas* cuando Android lo pida.
3. Al abrir la app, se conecta sola al servidor con el que se compiló. Si la dirección cambió, la app muestra la pantalla de conexión. Ahí toca **Escanear código QR de conexión** y apunta al QR de **Ajustes → App Android** de una computadora donde CastroX ya esté abierto.

### Compilar el APK

Necesitas Docker. No hace falta Android Studio.

```powershell
.\build-apk.ps1 -Server https://castrox.vercel.app   # la app publicada en Vercel
.\build-apk.ps1                                  # usa la dirección actual del túnel como predeterminada
.\build-apk.ps1 -Server https://mi-dominio.com   # para un servidor fijo (VPS)
.\build-apk.ps1 -VersionName 1.1.0 -VersionCode 2   # nueva versión (sube VersionCode para poder actualizar)
```

El APK queda en `frontend/downloads/CastroX.apk` y la app lo ofrece para descargar.

> ⚠️ **Respalda `android/keystore/` y `android/keystore.properties`.** Son la firma de la app y no se suben a Git. Sin ellos no podrás publicar actualizaciones que se instalen encima de la versión actual: habría que desinstalarla primero.

## Comandos útiles

```bash
docker compose logs -f app      # ver los registros de la app
docker compose restart app      # reiniciar la app
docker compose down             # detener (los datos se conservan)
docker compose down -v          # detener y BORRAR la base de datos
docker compose up -d --build    # reconstruir después de cambiar el código
```

### Conectarse a la base de datos

Puedes abrir la base local con DBeaver, pgAdmin o la extensión PostgreSQL de VS Code:

- Servidor: `localhost`, puerto `5432`
- Usuario: `castrox`
- Contraseña: el valor de `DB_PASSWORD` en `.env`
- Base de datos: `castrox`

O desde la terminal: `docker exec -it castrox-db psql -U castrox -d castrox`.

La base de la nube se administra en el panel de Vercel: proyecto `castrox` → **Storage** → `castrox-db`.

Tablas: `Users`, `Categories`, `Products` y `Movements`.

## API

Todas las rutas, salvo `/api/health`, `/api/qr` y `/api/auth/login`, piden el encabezado `Authorization: Bearer <token>`.

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/auth/login` | Iniciar sesión |
| GET | `/api/auth/me` | Usuario actual |
| PUT | `/api/auth/password` | Cambiar la contraseña propia |
| GET | `/api/dashboard?tz=` | Indicadores del panel |
| GET | `/api/products` | Lista (`search`, `categoryId`, `stock`, `sort`, `dir`, `page`, `pageSize`) |
| GET | `/api/products/code/:code` | Buscar un producto por código QR |
| GET | `/api/products/:id` | Detalle con historial |
| POST / PUT / DELETE | `/api/products[/:id]` | Crear, editar o eliminar (eliminar es solo para admin) |
| GET | `/api/products/export.csv` | Exportar productos |
| GET | `/api/movements` | Historial (`productId`, `type`, `from`, `to`, `search`) |
| POST | `/api/movements` | Registrar un movimiento `{ productId \| code, type: IN\|OUT\|ADJUST, quantity, reason }` |
| GET | `/api/movements/export.csv` | Exportar movimientos |
| GET / POST / PUT / DELETE | `/api/categories[/:id]` | Categorías |
| GET / POST / PUT / DELETE | `/api/users[/:id]` | Usuarios (solo admin) |
| GET | `/api/qr?text=&size=` | Imagen PNG de un código QR |
