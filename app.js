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

  async function openWordArticle(word) {
    if (busy) return;
    try {
      const data = await api({
        action: "query", list: "search", srsearch: word, srlimit: "1"
      });
      const first = data.query?.search?.[0];
      if (!first) {
        showNotice(`No se encontró un artículo para «${word}». Prueba otra palabra.`, true);
        return;
      }
      await openArticle(first.title, true);
    } catch (error) {
      showNotice(error.message || "No se pudo abrir esa palabra.", true);
    }
  }

  function isEligibleWord(word) {
    const letters = Array.from(lettersOnly(word));
    return step < Array.from(secret).length &&
      letters.length > 0 && letters[position - 1] === normalize(targetLetter());
  }

  function makeAcronymLink(word, destinationTitle) {
    const link = document.createElement("a");
    link.className = "acr-link";
    link.href = "#";
    link.textContent = word;
    link.setAttribute("role", "link");
    link.setAttribute("tabindex", "0");
    link.addEventListener("click", (event) => {
      event.preventDefault();
      if (destinationTitle) openArticle(destinationTitle, true);
      else openWordArticle(word);
    });
    link.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        if (destinationTitle) openArticle(destinationTitle, true);
        else openWordArticle(word);
      }
    });
    return link;
  }

  function prepareArticleLinks(container) {
    let blueCount = 0;
    const anchors = Array.from(container.querySelectorAll("a[href]"));

    for (const anchor of anchors) {
      const href = anchor.getAttribute("href") || "";
      const isInternalArticle = href.startsWith("/wiki/") &&
        !/^\/wiki\/(Especial|Archivo|Categoría|Ayuda|Wikipedia|Portal|Discusión|MediaWiki|Plantilla|Usuario|Anexo):/i.test(href);
      let title = "";
      if (isInternalArticle) {
        try { title = decodeURIComponent(href.slice("/wiki/".length)).replace(/_/g, " "); }
        catch { title = href.slice("/wiki/".length).replace(/_/g, " "); }
      }
      const visibleWord = (anchor.textContent || "").trim();
      const eligible = isInternalArticle && /^\p{L}+$/u.test(visibleWord) && isEligibleWord(visibleWord);
      anchor.removeAttribute("href");
      anchor.removeAttribute("title");
      anchor.removeAttribute("onclick");
      if (!eligible) {
        const plain = document.createElement("span");
        plain.className = "acr-plain";
        while (anchor.firstChild) plain.append(anchor.firstChild);
        anchor.replaceWith(plain);
      } else {
        anchor.classList.add("acr-link");
        anchor.setAttribute("role", "link");
        anchor.setAttribute("tabindex", "0");
        anchor.addEventListener("click", (event) => { event.preventDefault(); openArticle(title, true); });
        anchor.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openArticle(title, true); }
        });
        blueCount++;
      }
    }

    // Convierte también palabras normales del texto (no solo enlaces originales)
    // en enlaces azules cuando cumplen la posición y la letra buscadas.
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!node.nodeValue.trim() || !parent || parent.closest("a, script, style, .mw-editsection, .reference, sup, .infobox")) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);
    for (const node of textNodes) {
      const parts = node.nodeValue.split(/([\p{L}]+(?:[’'-][\p{L}]+)*)/gu);
      if (parts.length < 2) continue;
      const fragment = document.createDocumentFragment();
      for (const part of parts) {
        if (/^[\p{L}]+(?:[’'-][\p{L}]+)*$/u.test(part) && isEligibleWord(part)) {
          fragment.append(makeAcronymLink(part));
          blueCount++;
        } else fragment.append(document.createTextNode(part));
      }
      node.replaceWith(fragment);
    }

    container.querySelectorAll("script, iframe, form, input, button").forEach((node) => node.remove());
    container.querySelectorAll("*").forEach((node) => {
      Array.from(node.attributes).forEach((attr) => { if (/^on/i.test(attr.name)) node.removeAttribute(attr.name); });
    });

    // Si el artículo no ofrece ninguna coincidencia, añade una breve continuación
    // coherente y claramente diferenciada del texto original de Wikipedia.
    if (blueCount === 0 && step < Array.from(secret).length) addFallbackPassage(container);
  }

  function addFallbackPassage(container) {
    const vocabulary = [
      "casa", "mapa", "mar", "montaña", "camino", "ciudad", "historia", "ciencia", "planeta", "naturaleza",
      "arte", "cultura", "tecnología", "energía", "materia", "sistema", "universo", "animal", "música", "persona",
      "avión", "barco", "motor", "máquina", "metal", "piedra", "agua", "tierra", "aire", "fuego",
      "río", "bosque", "isla", "puente", "puerto", "torre", "edificio", "región", "país", "capital",
      "astronomía", "geografía", "biología", "física", "química", "matemáticas", "memoria", "lenguaje", "sociedad"
    ];
    const candidates = [...new Set(vocabulary)].filter(isEligibleWord).slice(0, 4);
    if (!candidates.length) {
      showNotice("Este artículo no contiene coincidencias y no se ha encontrado una palabra de apoyo para esta posición. Busca otro artículo.", true);
      return;
    }
    const section = document.createElement("section");
    section.className = "acr-supplement";
    const heading = document.createElement("h2");
    heading.textContent = "Continuación";
    const p1 = document.createElement("p");
    p1.append("Para ampliar el contexto, también pueden consultarse conceptos relacionados con ");
    candidates.slice(0, 2).forEach((word, i) => {
      if (i) p1.append(" y ");
      p1.append(makeAcronymLink(word));
    });
    p1.append(". Estos términos ayudan a conectar el tema con otros ámbitos de conocimiento.");
    const p2 = document.createElement("p");
    p2.append("La relación entre estos elementos permite comprender mejor cómo se organiza la información y cómo evoluciona a lo largo del tiempo.");
    section.append(heading, p1, p2);
    container.append(section);
  }

  function setBusy(value) {
    busy = value;
    $("loading").classList.toggle("hidden", !value);
  }
})();
