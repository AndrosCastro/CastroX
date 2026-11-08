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

- **Backend:** Node.js 20, Express 5 y TypeScript, con validación en Zod y sesiones con JWT y bcrypt
- **Base de datos:** Microsoft SQL Server 2022
- **Frontend:** HTML, CSS y JavaScript (módulos ES) sin necesidad de compilar. Usa html5-qrcode para el escáner y Chart.js para las gráficas
- **Infraestructura:** Docker y Docker Compose

```
app-inventario/
├── backend/            API en TypeScript
│   └── src/
│       ├── index.ts    servidor HTTP/HTTPS y generador de QR
│       ├── db.ts       conexión, creación de tablas y datos iniciales
│       ├── auth.ts     JWT y roles
│       └── routes/     auth, products, movements, categories, dashboard, users
├── frontend/           interfaz web (SPA)
│   ├── css/styles.css
│   └── js/             app.js, api.js, ui.js, scanner.js, forms.js, views/
├── Dockerfile
├── docker-compose.yml
└── .env.example
```

## Cómo ejecutarla

Necesitas [Docker Desktop](https://www.docker.com/products/docker-desktop/).

```bash
# 1. Crea el archivo de configuración y cambia las contraseñas
cp .env.example .env

# 2. Construye y levanta la app y SQL Server
docker compose up -d --build
```

Abre **http://localhost:3000** e inicia sesión con:

- Usuario: `admin`
- Contraseña: `admin123`

Cambia la contraseña en **Ajustes** después del primer acceso.

> La primera vez, SQL Server tarda entre 20 y 40 segundos en arrancar. Durante ese tiempo la app espera y crea sola la base de datos `CastroX`, las tablas y unos datos de ejemplo. Si no quieres los datos de ejemplo, pon `SEED_DEMO=false` en `.env`.

### Escanear desde el celular

Los navegadores solo permiten usar la cámara en conexiones seguras (HTTPS). Para eso la app también abre el puerto **3443** con un certificado propio:

1. Conecta el celular a la misma red Wi-Fi que la computadora.
2. Busca la IP de la computadora con `ipconfig` (por ejemplo, `192.168.1.50`).
3. En el celular abre `https://192.168.1.50:3443`.
4. Acepta el aviso del certificado: en Chrome toca *Configuración avanzada* y luego *Continuar*.

Si Windows bloquea la conexión, permite los puertos 3000 y 3443 en el Firewall de Windows.

### Lector de códigos USB

En la pantalla **Escanear**, deja el cursor en el campo "Código manual o lector USB". Estos lectores escriben el código y presionan Enter, así que funcionan sin configurar nada.

## Acceso desde internet (cualquier celular, cualquier red)

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

Necesitas un VPS con **Ubuntu 22.04/24.04 y al menos 2 GB de RAM**, por ejemplo de DigitalOcean, Hetzner, Contabo o Vultr.

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
   - levanta SQL Server, la app y **Caddy** (HTTPS automático con Let's Encrypt)
   - programa un respaldo diario de la base a las 3:00 am, que queda en `backups/`

Sin dominio, la app queda en `https://<IP-con-guiones>.sslip.io`, por ejemplo `https://203-0-113-5.sslip.io`.

Para actualizar el servidor cuando cambies el código:

```bash
git pull && docker compose -f docker-compose.prod.yml up -d --build
```

Para hacer un respaldo manual: `bash deploy/backup.sh`.

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

### Conectarse a SQL Server

Puedes abrir la base de datos con SQL Server Management Studio, Azure Data Studio o la extensión de VS Code:

- Servidor: `localhost,1433`
- Usuario: `sa`
- Contraseña: el valor de `DB_PASSWORD` en `.env`
- Base de datos: `CastroX`

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
