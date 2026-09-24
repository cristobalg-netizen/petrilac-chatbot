-- Esquema de la base del chatbot Petrilac (Cloudflare D1).
-- Dos registros separados a propósito: contenido por un lado, seguridad por otro.

-- Contenido: qué preguntaron y qué respondió. Sin identificador de visitante.
CREATE TABLE IF NOT EXISTS conversaciones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conv_id TEXT NOT NULL,
  ts INTEGER NOT NULL,
  pregunta TEXT NOT NULL,
  respuesta TEXT NOT NULL,
  tokens_in INTEGER DEFAULT 0,
  tokens_out INTEGER DEFAULT 0,
  costo REAL DEFAULT 0,
  fuentes TEXT
);
CREATE INDEX IF NOT EXISTS idx_conversaciones_ts ON conversaciones(ts);
CREATE INDEX IF NOT EXISTS idx_conversaciones_conv ON conversaciones(conv_id);

-- Seguridad: contadores por visitante (hash de IP) y período. Sin contenido.
CREATE TABLE IF NOT EXISTS uso (
  visitante TEXT NOT NULL,
  periodo TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  actualizado INTEGER NOT NULL,
  PRIMARY KEY (visitante, periodo)
);
CREATE INDEX IF NOT EXISTS idx_uso_periodo ON uso(periodo);

CREATE TABLE IF NOT EXISTS bloqueos (
  visitante TEXT PRIMARY KEY,
  motivo TEXT,
  ts INTEGER NOT NULL,
  automatico INTEGER NOT NULL DEFAULT 0
);

-- Totales diarios de toda la instalación, para el tope global y el costo.
CREATE TABLE IF NOT EXISTS global (
  periodo TEXT PRIMARY KEY,
  n INTEGER NOT NULL DEFAULT 0,
  costo REAL NOT NULL DEFAULT 0
);
