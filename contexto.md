# Contexto y Troubleshooting del Servidor PeliPlus

Este documento contiene los comandos esenciales y la explicación de cómo resolver problemas comunes con el procesamiento de videos en segundo plano (Worker de BullMQ y FFmpeg).

## 1. El Problema de las Tareas Atascadas ("Ghost Jobs")
El servidor usa BullMQ para gestionar la cola de conversión de videos. BullMQ tiene un límite de concurrencia (1 tarea a la vez por servidor). Si el servidor se reinicia forzosamente o se mata el proceso `ffmpeg` abruptamente, BullMQ puede dejar la tarea marcada como **Activa** ("Active") en Redis. 

Cuando esto pasa, el Worker cree que sigue trabajando, se "atasca" y **no toma tareas nuevas** de la cola (quedan en `QUEUED` eternamente).

## 2. Comandos Esenciales para Destrabar la Cola

Si ves que las películas o series no avanzan y no hay ningún `ffmpeg` ejecutándose (`ps aux | grep ffmpeg` está vacío), sigue esta secuencia exacta en el servidor correspondiente (Películas o Series):

### Paso 1: Detener el Worker
Debemos apagar el proceso para que deje de intentar leer la cola temporalmente.
```bash
pm2 stop peliplus-api
```

### Paso 2: Limpiar la Cola y Resetear la Base de Datos
Ejecutar el script de limpieza profunda. Este script entra a Redis, vacía todas las tareas "fantasma" que quedaron bloqueadas, y luego va a la base de datos de PostgreSQL y cambia los estados `PROCESSING` y `QUEUED` de vuelta a `FAILED` o reseteados.
```bash
npx tsx scripts/clear_stuck.ts
```

### Paso 3: Volver a Iniciar el Worker
Encendemos de nuevo la API de Peliplus. Como la cola ya está limpia, el Worker arrancará fresco y con su ranura de trabajo (concurrencia) libre.
```bash
pm2 start peliplus-api
```

### Paso 4: Volver a Encolar
Corremos el escáner manual para que vuelva a leer la carpeta `/home/media/peliculas/` (o series) y meta de forma limpia a la cola (Redis) todos los videos que faltan procesar.
```bash
npx tsx escanear_peliculas.ts
# O para las series:
# npx tsx escanear_series.ts
```

---

## Otros Comandos Útiles

- **Ver los logs en tiempo real del Worker:**
  Para ver qué está haciendo el servidor de conversión por dentro y si arroja algún error:
  ```bash
  pm2 logs peliplus-api --lines 100
  ```

- **Revisar desde qué carpeta está corriendo PM2:**
  Si notas que los cambios de código no hacen efecto, verifica que PM2 esté corriendo desde `/var/local/flex-streaming-api` y no desde otra ubicación.
  ```bash
  pm2 show peliplus-api
  ```

- **Verificar si FFmpeg está trabajando:**
  Este comando te dirá si el servidor está convirtiendo algo en este instante. Si arroja un proceso activo, está trabajando. Si solo arroja "grep ffmpeg", no está haciendo nada.
  ```bash
  ps aux | grep ffmpeg
  ```
