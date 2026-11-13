(() => {
  "use strict";

  const API = "https://es.wikipedia.org/w/api.php";
  const $ = (id) => document.getElementById(id);

  // La palabra secreta solo vive en memoria mientras esta página está abierta.
  // No se guarda en localStorage, URL ni en el historial.
  let secret = "";
  let position = 1;
  let step = 0;
  let busy = false;

  const normalize = (value) => String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es");

  const lettersOnly = (value) => normalize(value).replace(/[^\p{L}]/gu, "");

  function targetLetter() {
    return Array.from(secret)[step] || "";
  }

  function showNotice(message, isError = false) {
    const box = $("notice");
    box.textContent = message;
    box.classList.remove("hidden", "error");
    if (isError) box.classList.add("error");
  }

  function clearNotice() {
    $("notice").classList.add("hidden");
    $("notice").textContent = "";
  }

  async function api(params) {
    const url = new URL(API);
    Object.entries({ ...params, format: "json", origin: "*" }).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });
    const response = await fetch(url.toString());
    if (!response.ok) throw new Error("Wikipedia no ha respondido correctamente.");
    const data = await response.json();
    if (data.error) throw new Error(data.error.info || "Error consultando Wikipedia.");
    return data;
  }

  $("setup-form").addEventListener("submit", (event) => {
    event.preventDefault();

    const rawSecret = $("secret").value.trim();
    const rawPosition = Number($("position").value);
    const cleanSecret = rawSecret.normalize("NFC").replace(/\s/g, "");

    if (!cleanSecret || !/^\p{L}+$/u.test(cleanSecret)) {
      alert("Escribe una palabra sin espacios ni signos.");
      return;
    }
    if (!Number.isInteger(rawPosition) || rawPosition < 1 || rawPosition > 30) {
      alert("La posición debe ser un número entre 1 y 30.");
      return;
    }
    if (Array.from(cleanSecret).length < 1) {
      alert("La palabra no es válida.");
      return;
    }

    secret = cleanSecret;
    position = rawPosition;
    step = 0;

    $("setup").classList.add("hidden");
    $("audience").classList.remove("hidden");
    $("secret").value = "";
    $("position").value = "2";
    $("search-input").focus();
  });

  $("search-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const query = $("search-input").value.trim();
    if (!query || busy) return;
    await searchWikipedia(query);
  });

  async function searchWikipedia(query) {
    setBusy(true);
    clearNotice();
    $("article-view").classList.add("hidden");
    $("welcome").classList.add("hidden");
    $("search-results").classList.remove("hidden");
    $("results-list").replaceChildren();

    try {
      const data = await api({
        action: "query",
        list: "search",
        srsearch: query,
        srlimit: "10",
        srprop: "snippet"
      });

      const results = data.query?.search || [];
      if (!results.length) {
        showNotice("No se han encontrado resultados. Prueba otra búsqueda.", true);
        return;
      }

      for (const item of results) {
        const row = document.createElement("div");
        row.className = "result";

        const title = document.createElement("button");
        title.type = "button";
        title.textContent = item.title;
        title.addEventListener("click", () => openArticle(item.title, false));

        const snippet = document.createElement("p");
        snippet.innerHTML = item.snippet || "";

        row.append(title, snippet);
        $("results-list").append(row);
      }
    } catch (error) {
      showNotice(error.message || "No se pudo realizar la búsqueda.", true);
    } finally {
      setBusy(false);
    }
  }

  async function openArticle(title, selectedByLink) {
    if (busy) return;
    setBusy(true);
    clearNotice();
    $("search-results").classList.add("hidden");
    $("welcome").classList.add("hidden");
    $("article-view").classList.add("hidden");

    try {
      const data = await api({
        action: "parse",
        page: title,
        prop: "text|displaytitle",
        disableeditsection: "1",
        disabletoc: "0"
      });

      const parsed = data.parse;
      if (!parsed?.text?.["*"]) throw new Error("No se ha podido cargar el artículo.");

      // Solo avanzamos al confirmar que el siguiente artículo se ha cargado.
      if (selectedByLink) step += 1;

      $("article-title").textContent = parsed.title || title;
      $("article-subtitle").textContent = "";
      $("article-content").innerHTML = parsed.text["*"];
      $("source-link").href = "https://es.wikipedia.org/wiki/" + encodeURIComponent((parsed.title || title).replace(/ /g, "_"));

      prepareArticleLinks($("article-content"));
      $("article-view").classList.remove("hidden");

      window.scrollTo({ top: 0, behavior: "instant" });

      if (step >= Array.from(secret).length) {
        showNotice("La navegación ha llegado al final de la secuencia.");
      }
    } catch (error) {
      showNotice(error.message || "No se ha podido abrir ese artículo.", true);
    } finally {
      setBusy(false);
    }
  }

  function prepareArticleLinks(container) {
    const anchors = Array.from(container.querySelectorAll("a[href]"));

    for (const anchor of anchors) {
      const href = anchor.getAttribute("href") || "";
      const isInternalArticle = href.startsWith("/wiki/") &&
        !href.startsWith("/wiki/Especial:") &&
        !href.startsWith("/wiki/Archivo:") &&
        !href.startsWith("/wiki/Categoría:") &&
        !href.startsWith("/wiki/Ayuda:") &&
        !href.startsWith("/wiki/Wikipedia:") &&
        !href.startsWith("/wiki/Portal:");

      let title = "";
      if (isInternalArticle) {
        try {
          title = decodeURIComponent(href.slice("/wiki/".length)).replace(/_/g, " ");
        } catch {
          title = href.slice("/wiki/".length).replace(/_/g, " ");
        }
      }

      // La palabra que el espectador anota es el TEXTO AZUL visible,
      // que no siempre coincide con el título de destino del enlace.
      const visibleWord = (anchor.textContent || "").trim();
      const isSingleWord = /^\p{L}+$/u.test(visibleWord);
      const visibleLetters = Array.from(lettersOnly(visibleWord));
      const target = normalize(targetLetter());
      const candidate = visibleLetters[position - 1] || "";
      const namespaceLink = /^[^/]+:/.test(title) &&
        /^(especial|archivo|categoría|ayuda|wikipedia|portal|discusión|mediawiki|plantilla|usuario|anexo)$/i
          .test(title.split(":")[0]);
      const eligible = isInternalArticle && !namespaceLink && isSingleWord &&
        step < Array.from(secret).length && candidate === target;

      anchor.removeAttribute("href");
      anchor.removeAttribute("title");
      anchor.removeAttribute("onclick");

      if (!eligible) {
        const plain = document.createElement("span");
        plain.className = "acr-plain";
        plain.innerHTML = anchor.innerHTML;
        anchor.replaceWith(plain);
      } else {
        anchor.classList.add("acr-link");
        anchor.setAttribute("role", "link");
        anchor.setAttribute("tabindex", "0");
        anchor.dataset.acrTitle = title;
        anchor.addEventListener("click", (event) => {
          event.preventDefault();
          openArticle(title, true);
        });
        anchor.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openArticle(title, true);
          }
        });
      }
    }

    // Elimina elementos ejecutables y atributos de evento del HTML recibido.
    // Los enlaces válidos anteriores ya tienen sus manejadores propios.
    container.querySelectorAll("script, iframe, form, input, button").forEach((node) => node.remove());
    container.querySelectorAll("*").forEach((node) => {
      Array.from(node.attributes).forEach((attr) => {
        if (/^on/i.test(attr.name)) node.removeAttribute(attr.name);
      });
    });
  }

  function setBusy(value) {
    busy = value;
    $("loading").classList.toggle("hidden", !value);
  }
})();
