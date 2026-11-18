/**
 * Actualiza data/alumnos.json a partir del Excel de inscritos.
 *
 * Uso:  node tools/actualizar-alumnos.js ["ruta/al/archivo.xlsx"]
 *
 * - Lee la primera hoja: columnas N°, "Apellidos, Nombres", Nota final.
 * - Mantiene el nombre en el orden del Excel: "APELLIDOS, NOMBRES".
 * - El código se toma de la columna "codigo" del Excel. Si no existe esa columna,
 *   conserva el código que el alumno ya tenía en el JSON (se compara por nombre)
 *   o le asigna un correlativo.
 * - No modifica la sección "curso" (ahí está el N° de expediente, único para todos).
 */
"use strict";

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const ROOT = path.join(__dirname, "..");
const JSON_PATH = path.join(ROOT, "data", "alumnos.json");
const XLSX_PATH = process.argv[2] || path.join(ROOT, "data", "RELACIÓN DE INSCRITOS PARA CERTIFICADO.xlsx");

// Alumno cuyo código es conocido (certificado de muestra); base del correlativo.
const REF = { n: 49, codigo: 4893 };
const PREFIJO = "ECP-";

// ---------- Lectura mínima de .xlsx (zip) sin dependencias ----------
function leerZip(file) {
  const buf = fs.readFileSync(file);
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error("El archivo no es un .xlsx válido");
  const total = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = {};
  for (let i = 0; i < total; i++) {
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(start, start + size);
    files[name] = () => (method === 0 ? raw : zlib.inflateRawSync(raw)).toString("utf8");
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

const decode = (s) => s
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n))
  .replace(/&amp;/g, "&");

function leerHoja(file) {
  const zip = leerZip(file);
  const strings = zip["xl/sharedStrings.xml"]
    ? [...zip["xl/sharedStrings.xml"]().matchAll(/<si>([\s\S]*?)<\/si>/g)]
        .map((m) => decode([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join("")))
    : [];
  const sheet = zip["xl/worksheets/sheet1.xml"]();
  const filas = [];
  for (const r of sheet.matchAll(/<row [^>]*>([\s\S]*?)<\/row>/g)) {
    const celdas = {};
    for (const c of r[1].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const tipo = (c[2].match(/t="(\w+)"/) || [])[1];
      const inner = c[3] || "";
      const v = (inner.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
      if (tipo === "s") celdas[c[1]] = strings[+v];
      else if (tipo === "inlineStr") celdas[c[1]] = decode((inner.match(/<t[^>]*>([\s\S]*?)<\/t>/) || [])[1] || "");
      else if (v !== undefined) celdas[c[1]] = decode(v);
    }
    filas.push(celdas);
  }
  return filas;
}

// ---------- Conversión ----------
const limpiar = (s) => String(s || "").replace(/\s+/g, " ").trim();
const clave = (s) => limpiar(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();

// Respeta el orden del Excel ("APELLIDOS, NOMBRES"); solo limpia espacios.
function nombreCertificado(apellidosNombres) {
  return limpiar(apellidosNombres).replace(/\s*,\s*/, ", ").toUpperCase();
}

const data = JSON.parse(fs.readFileSync(JSON_PATH, "utf8"));
const previos = new Map(data.alumnos.map((a) => [clave(a.nombres), a]));
const usados = new Set(data.alumnos.map((a) => a.codigo));

// Ubica las columnas por el texto del encabezado (N°, Nombres, Nota, Código, Expediente)
const hoja = leerHoja(XLSX_PATH);
const COLUMNAS = { n: /^N\W*$|^NRO|^NUM/, nombre: /NOMBRE|APELLIDO|ALUMNO/, nota: /NOTA/, codigo: /COD/ };
const encabezado = hoja.find((f) => Object.values(f).some((v) => COLUMNAS.nombre.test(clave(v))));
const col = {};
for (const [letra, texto] of Object.entries(encabezado || {})) {
  const campo = Object.keys(COLUMNAS).find((k) => !col[k] && COLUMNAS[k].test(clave(texto)));
  if (campo) col[campo] = letra;
}
col.n = col.n || "A";
col.nombre = col.nombre || "B";
col.nota = col.nota || "C";
console.log("Columnas detectadas:", JSON.stringify(col));

const filas = hoja.filter((f) => /^\d+$/.test(limpiar(f[col.n])) && limpiar(f[col.nombre]));
if (!filas.length) throw new Error("No se encontraron alumnos en el Excel");

// Validaciones
const errores = [];
const vistos = new Map();
filas.forEach((f) => {
  const n = limpiar(f[col.n]);
  const nota = Number(f[col.nota]);
  if (!Number.isFinite(nota) || nota < 0 || nota > 20) errores.push(`N° ${n}: nota inválida "${f[col.nota] ?? ""}"`);
  if (col.codigo) {
    const c = limpiar(f[col.codigo]).toUpperCase();
    if (!c) errores.push(`N° ${n}: falta el código`);
    else if (vistos.has(c)) errores.push(`N° ${n}: código ${c} repetido (también en N° ${vistos.get(c)})`);
    else vistos.set(c, n);
  }
});
if (errores.length) {
  console.error("No se actualizó el JSON. Corrige en el Excel:\n - " + errores.join("\n - "));
  process.exit(1);
}

const alumnos = filas.map((f) => {
  const n = Number(f[col.n]);
  const nombres = nombreCertificado(f[col.nombre]);
  const nota = Number(f[col.nota]);
  const previo = previos.get(clave(nombres));
  let codigo = col.codigo ? limpiar(f[col.codigo]).toUpperCase() : previo && previo.codigo;
  if (!codigo) {
    let num = REF.codigo + (n - REF.n);
    while (usados.has(PREFIJO + String(num).padStart(7, "0"))) num++;
    codigo = PREFIJO + String(num).padStart(7, "0");
    usados.add(codigo);
  }
  return { id: n, nombres, codigo, nota, promedio: nota };
});

data.alumnos = alumnos;
fs.writeFileSync(JSON_PATH, JSON.stringify(data, null, 2) + "\n", "utf8");
console.log(`Actualizados ${alumnos.length} alumnos en ${path.relative(ROOT, JSON_PATH)}`);
