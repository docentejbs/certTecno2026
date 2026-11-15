(function () {
  "use strict";

  const DATA_URL = "data/alumnos.json";
  const PAGE_WIDTH = 1123;
  const MESES = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO",
    "AGOSTO", "SETIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];

  const app = document.getElementById("app");
  const toolbarTitle = document.getElementById("toolbar-title");
  const btnPrint = document.getElementById("btn-print");

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function mensaje(html) {
    app.innerHTML = "";
    const p = el("div", "mensaje");
    p.innerHTML = html;
    app.appendChild(p);
  }

  // "2026-11-16" -> "16 DE NOVIEMBRE DE 2026"
  function fechaLarga(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    return `${d} DE ${MESES[m - 1]} DE ${y}`;
  }

  function fill(root, field, value) {
    root.querySelectorAll(`[data-f="${field}"]`).forEach((n) => {
      n.textContent = value;
    });
  }

  function ajustarEscala() {
    const disponible = Math.min(window.innerWidth - 32, PAGE_WIDTH);
    document.documentElement.style.setProperty("--scale", (disponible / PAGE_WIDTH).toFixed(4));
  }

  // Reduce la fuente del nombre si es muy largo para una línea
  function ajustarNombre(root) {
    const nombre = root.querySelector(".alumno");
    let size = 45;
    while (nombre.scrollWidth > nombre.clientWidth && size > 26) {
      size -= 1;
      nombre.style.fontSize = size + "px";
    }
  }

  function renderLista(data) {
    toolbarTitle.textContent = data.curso.nombre;
    app.innerHTML = "";
    const box = el("div", "lista");
    box.appendChild(el("h1", null, "Alumnos – Curso de " + data.curso.nombre));
    const table = el("table");
    table.innerHTML = "<thead><tr><th>ID</th><th>Alumno</th><th>Código</th><th></th></tr></thead>";
    const tbody = el("tbody");
    data.alumnos.forEach((a) => {
      const tr = el("tr");
      tr.appendChild(el("td", null, a.id));
      tr.appendChild(el("td", null, a.nombres));
      tr.appendChild(el("td", null, a.codigo));
      const td = el("td");
      const link = el("a", null, "Ver certificado →");
      link.href = "?Est=" + encodeURIComponent(a.codigo);
      td.appendChild(link);
      tr.appendChild(td);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    box.appendChild(table);
    app.appendChild(box);
  }

  function renderCertificado(curso, alumno) {
    const tpl = document.getElementById("tpl-certificado");
    const frag = tpl.content.cloneNode(true);

    fill(frag, "institucion", curso.institucion);
    fill(frag, "nombres", alumno.nombres);
    fill(frag, "curso", curso.nombre);
    fill(frag, "herramientas", curso.herramientas);
    fill(frag, "horas", curso.horas);
    fill(frag, "fechaInicio", curso.fechaInicio);
    fill(frag, "fechaFin", curso.fechaFin);
    fill(frag, "modalidad", curso.modalidad);
    fill(frag, "fechaEmision", `${curso.lugarEmision} ${fechaLarga(curso.fechaEmision)}`);
    fill(frag, "codigo", alumno.codigo);
    fill(frag, "expediente", alumno.expediente);
    fill(frag, "nota", alumno.nota);
    fill(frag, "promedio", alumno.promedio);

    // Firmas
    const firmas = frag.querySelector('[data-f="firmas"]');
    curso.firmantes.forEach((f) => {
      const div = el("div");
      div.appendChild(el("div", "firma-nombre", f.nombre));
      div.appendChild(el("div", "firma-cargo", f.cargo));
      firmas.appendChild(div);
    });

    // Módulos / contenidos
    const modulos = frag.querySelector('[data-f="modulos"]');
    curso.modulos.forEach((m) => {
      const col = el("div", "modulo");
      const head = el("div", "modulo-titulo");
      head.appendChild(el("span", null, "✓"));
      head.appendChild(el("span", null, m.titulo));
      col.appendChild(head);

      const body = el("div", "modulo-cuerpo");
      const ul = el("ul");
      ul.appendChild(el("li", "head", "Contenidos:"));
      m.contenidos.forEach((c) => ul.appendChild(el("li", null, c)));
      body.appendChild(ul);
      col.appendChild(body);
      modulos.appendChild(col);
    });

    app.innerHTML = "";
    app.appendChild(frag);
    ajustarNombre(app);

    document.title = "Certificado - " + alumno.nombres;
    toolbarTitle.textContent = alumno.nombres + " · " + alumno.codigo;
    btnPrint.hidden = false;
  }

  async function init() {
    ajustarEscala();
    window.addEventListener("resize", ajustarEscala);
    btnPrint.addEventListener("click", () => window.print());

    let data;
    try {
      const res = await fetch(DATA_URL, { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      data = await res.json();
    } catch (err) {
      mensaje(
        "<strong>No se pudo cargar <code>data/alumnos.json</code>.</strong><br>" +
        "Abre el proyecto desde un servidor local (por ejemplo, la extensión " +
        "<em>Live Server</em> de VS Code o <code>npx serve</code>) en lugar de abrir el archivo directamente."
      );
      console.error(err);
      return;
    }

    const est = new URLSearchParams(location.search).get("Est");
    if (!est) {
      renderLista(data);
      return;
    }

    const codigo = est.trim().toUpperCase();
    const alumno = data.alumnos.find((a) => String(a.codigo).toUpperCase() === codigo);
    if (!alumno) {
      mensaje(`No existe un alumno con código <strong>${est.replace(/[<>&"]/g, "")}</strong>. <a href="index.html">Ver lista</a>`);
      return;
    }
    renderCertificado(data.curso, alumno);
  }

  init();
})();
