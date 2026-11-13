(() => {
  "use strict";

  const API = "https://es.wikipedia.org/w/api.php";
  const $ = (id) => document.getElementById(id);

  const magusCorner = document.createElement("button");
  magusCorner.type = "button";
  magusCorner.className = "magus-corner";
  magusCorner.setAttribute("aria-label", "Acceso privado");
  magusCorner.tabIndex = -1;
  document.querySelector(".wiki-header").append(magusCorner);
  let pressTimer = null;
  const cancelPrivatePress = () => { if (pressTimer) clearTimeout(pressTimer); pressTimer = null; };
  magusCorner.addEventListener("pointerdown", event => {
    if (event.type === "contextmenu") event.preventDefault();
    cancelPrivatePress();
    pressTimer = setTimeout(() => {
      $("audience").classList.add("hidden");
      $("setup").classList.remove("hidden");
      $("secret").value = secret;
      $("position").value = String(position);
      $("search-input").value = "";
      $("search-results").classList.add("hidden");
      $("article-view").classList.add("hidden");
      $("welcome").classList.remove("hidden");
      clearNotice();
      step = 0;
      window.scrollTo({ top: 0, behavior: "instant" });
    }, 3000);
  });
  ["pointerup", "pointerleave", "pointercancel"].forEach(type => magusCorner.addEventListener(type, cancelPrivatePress));
  magusCorner.addEventListener("contextmenu", event => event.preventDefault());

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
    $("position").value = String(position);
    $("search-input").focus();
  });

  let suggestionTimer = null;
  let suggestionRequest = 0;
  const suggestions = document.createElement("div");
  suggestions.id = "wiki-suggestions";
  suggestions.className = "wiki-suggestions hidden";
  $("search-form").append(suggestions);

  $("search-input").addEventListener("input", () => {
    clearTimeout(suggestionTimer);
    const query = $("search-input").value.trim();
    if (query.length < 2) {
      suggestions.classList.add("hidden");
      suggestions.replaceChildren();
      return;
    }
    suggestionTimer = setTimeout(() => loadSuggestions(query), 220);
  });

  async function loadSuggestions(query) {
    const requestId = ++suggestionRequest;
    try {
      const data = await api({ action: "opensearch", search: query, limit: "7", namespace: "0" });
      if (requestId !== suggestionRequest) return;
      suggestions.replaceChildren();
      const titles = data[1] || [];
      const descriptions = data[2] || [];
      titles.forEach((title, index) => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "wiki-suggestion";
        const strong = document.createElement("strong");
        strong.textContent = title;
        const detail = document.createElement("span");
        detail.textContent = descriptions[index] || "Artículo de Wikipedia";
        item.append(strong, detail);
        item.addEventListener("click", () => {
          $("search-input").value = title;
          suggestions.classList.add("hidden");
          openArticle(title, false);
        });
        suggestions.append(item);
      });
      suggestions.classList.toggle("hidden", titles.length === 0);
    } catch (_) { suggestions.classList.add("hidden"); }
  }

  $("search-input").addEventListener("keydown", event => {
    if (event.key === "Escape") suggestions.classList.add("hidden");
  });
  document.addEventListener("click", event => {
    if (!event.target.closest(".search-form")) suggestions.classList.add("hidden");
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

  // Lista positiva de sustantivos: evita que enlaces gramaticales,
  // verbos y adjetivos se conviertan en elecciones.
  const NOUNS = new Set((
    "avion barco buque tren coche moto taxi nave motor rueda freno pista ala fuselaje turbina rotor " +
    "puerto muelle costa isla playa valle monte sierra rio lago mar oceano bahia delta bosque selva " +
    "arbol hoja raiz flor fruto semilla roca piedra arena suelo clima nieve hielo lluvia viento nube " +
    "fuego agua aire metal acero cobre plata oro hierro bronce vidrio papel libro texto dato cifra " +
    "mapa plano carta atlas globo mundo tierra luna astro cometa planeta estrella galaxia espacio " +
    "torre puente muro casa finca plaza calle barrio ciudad pueblo region pais reino estado nacion " +
    "capital museo templo iglesia palacio castillo foro parque jardin fuente estatua cuadro pintura " +
    "musica danza ritmo sonido tono nota tecla piano violin guitarra tambor trompeta ciencia fisica " +
    "quimica biologia historia lengua frase nombre idea teoria metodo norma ley grupo clase orden " +
    "rango nivel punto linea curva angulo forma figura cuerpo fuerza energia calor luz sombra imagen " +
    "foto video camara lente foco pixel pantalla red cable señal codigo robot maquina equipo pieza " +
    "bloque modulo sistema sensor radar sonar radio antena aviso clave cifra firma sello marca modelo " +
    "diseño color sabor aroma perfume animal perro gato lobo zorro oso leon tigre cebra jirafa caballo " +
    "vaca toro oveja cabra cerdo raton conejo liebre ardilla castor nutria foca ballena delfin tiburon " +
    "pulpo calamar trucha aguila buho cisne pato ganso loro cuervo halcon pinguino insecto abeja " +
    "avispa mosca persona autor actor poeta sabio jefe lider rey reina conde duque dama madre padre " +
    "familia amigo vecino socio colega banda tropa guardia piloto capitan marinero soldado medico " +
    "juez cura monje atleta ciclista tenista artista mago musico pintor escultor cargo oficio puesto " +
    "tarea labor obra acto gesto paso viaje ruta camino sendero destino puerta ventana techo pared " +
    "salon cocina patio terraza bodega granero taller tienda banco bolsa caja cesta botella vaso plato " +
    "taza jarra cuchara tenedor cuchillo mantel ropa traje falda camisa blusa zapato bota guante casco " +
    "gorra bolso tela cuero lana seda lino fruta manzana pera mango limon melon sandia fresa cereza " +
    "uva oliva trigo maiz arroz pasta queso leche nata miel azucar sal aceite pan torta sopa salsa " +
    "cafe cacao zumo baraja carta dado ficha juego truco magia naipe as mano mazo avioneta cohete " +
    "satelite orbita eclipse crater volcan arrecife coral glaciar desierto acantilado cascada cueva " +
    "tunel mina cantera pantano embalse canal presa edificio fachada columna escalera pasillo balcon " +
    "tejado cimiento ladrillo cemento marmol ferrocarril estacion anden vagon convoy escala hangar " +
    "avionica cabina panel valvula bateria circuito diodo placa chip fusible bobina iman voltaje carga " +
    "corriente tension potencia resistencia condensador transistor rele estator"
  ).split(/\s+/));

  function isEligibleWord(word) {
    const normalized = normalize(word).replace(/[^a-zñ]/g, "");
    const letters = Array.from(normalized);
    return step < Array.from(secret).length &&
      letters.length >= 4 && letters.length <= 8 &&
      NOUNS.has(normalized) &&
      letters[position - 1] === normalize(targetLetter());
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
    if (blueCount < 5 && step < Array.from(secret).length) addFallbackPassage(container);
  }

  function addFallbackPassage(container) {
    const candidates = [...NOUNS].filter(isEligibleWord).slice(0, 8);
    if (!candidates.length) {
      showNotice("No hay suficientes sustantivos para esta letra y posición. Prueba otro artículo o revisa la configuración.", true);
      return;
    }
    const section = document.createElement("section");
    section.className = "acr-supplement";
    const heading = document.createElement("h2");
    heading.textContent = "Contexto complementario";
    const intro = document.createElement("p");
    intro.textContent = `En relación con ${$("article-title").textContent}, estos conceptos permiten ampliar la navegación temática.`;
    const paragraph = document.createElement("p");
    candidates.forEach((word, index) => {
      if (index) paragraph.append(index === candidates.length - 1 ? " y " : ", ");
      paragraph.append(makeAcronymLink(word));
    });
    paragraph.append(". Estos sustantivos permiten continuar explorando conceptos relacionados.");
    const note = document.createElement("p");
    note.className = "acr-supplement-note";
    note.textContent = "Sección de apoyo generada por Acronym; no pertenece al texto original de Wikipedia.";
    section.append(heading, intro, paragraph, note);
    container.append(section);
  }

  function setBusy(value) {
    busy = value;
    $("loading").classList.toggle("hidden", !value);
  }
})();
