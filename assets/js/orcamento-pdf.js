(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.QuotePdf = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  // PDF do orçamento como arquivo de verdade, para o iPhone.
  // O iPhone ignora window.print() (principalmente no app instalado), então o
  // orçamento é desenhado, cortado em páginas A4 e entregue ao menu de
  // compartilhar (Salvar em Arquivos, WhatsApp...). No Android a impressão
  // continua funcionando e não passa por aqui.

  const CONTENT_WIDTH_MM = 186; // A4 (210 mm) menos 12 mm de margem de cada lado
  const CONTENT_HEIGHT_MM = 273; // A4 (297 mm) menos 12 mm de margem de cada lado
  const MARGIN_MM = 12;
  const VIEWPORT_PX = 703; // 186 mm em 96 dpi: mesma largura do layout impresso

  function isIOS(userAgent, platform, touchPoints) {
    return /iPhone|iPad|iPod/.test(userAgent || "") || (platform === "MacIntel" && touchPoints > 1);
  }

  // Divide a altura total em páginas sem cortar blocos no meio.
  // blocks: [{ top, bottom }] em px; um bloco mais alto que a página é cortado mesmo.
  function planPages(blocks, total, pageHeight) {
    const pages = [];
    let start = 0;
    while (start < total - 0.5) {
      let end = Math.min(start + pageHeight, total);
      if (end < total) {
        let moved = true, guard = 0;
        while (moved && guard++ < 100) {
          moved = false;
          for (const block of blocks) {
            if (block.top < end && block.bottom > end && block.top > start + 1) { end = block.top; moved = true; }
          }
        }
      }
      pages.push({ top: start, height: end - start });
      start = end;
    }
    return pages;
  }

  const loaded = {};
  function loadScript(src) {
    if (!loaded[src]) {
      loaded[src] = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = src;
        script.onload = resolve;
        script.onerror = () => { delete loaded[src]; reject(new Error("Não carregou " + src)); };
        document.head.appendChild(script);
      });
    }
    return loaded[src];
  }

  function toDataUrl(url) {
    return fetch(url, { mode: "cors" }).then(response => {
      if (!response.ok) throw new Error("imagem " + response.status);
      return response.blob();
    }).then(blob => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    }));
  }

  const imageReady = image => image.complete ? Promise.resolve() : new Promise(resolve => { image.onload = image.onerror = resolve; setTimeout(resolve, 4000); });
  const BLOCKS = ".procedure,.header,.box,.section-title,thead,tbody tr,.saving,.total,.payment div,.notes,.procedure h2,.procedure .lead,.steps li,.tech,.cta,.footer";

  // html: documento completo do orçamento. Devolve { file, pages }.
  async function build(html, fileName, options) {
    const version = (options && options.version) || "";
    const query = version ? "?v=" + version : "";
    await Promise.all([loadScript("/assets/vendor/html2canvas.min.js" + query), loadScript("/assets/vendor/jspdf.umd.min.js" + query)]);

    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.tabIndex = -1;
    frame.style.cssText = "position:fixed;left:-10000px;top:0;width:" + VIEWPORT_PX + "px;height:1200px;border:0;visibility:hidden";
    document.body.appendChild(frame);
    try {
      await new Promise(resolve => { frame.onload = resolve; frame.srcdoc = html; });
      const doc = frame.contentDocument;
      const reset = doc.createElement("style");
      reset.textContent = "html{background:#fff!important}body{max-width:none!important;margin:0!important;padding:0!important;box-shadow:none!important;border-radius:0!important}";
      doc.head.appendChild(reset);

      // O logo vem de outro endereço; como dado embutido ele entra no PDF sem depender de CORS na hora de desenhar.
      await Promise.all([...doc.images].map(async image => {
        try { image.src = await toDataUrl(image.currentSrc || image.src); } catch { /* segue sem trocar */ }
        await imageReady(image);
      }));

      const total = Math.ceil(doc.body.getBoundingClientRect().height);
      const blocks = [...doc.querySelectorAll(BLOCKS)].map(element => {
        const rect = element.getBoundingClientRect();
        return { top: rect.top, bottom: rect.bottom };
      });
      const pageHeight = Math.floor(VIEWPORT_PX * CONTENT_HEIGHT_MM / CONTENT_WIDTH_MM);
      const pages = planPages(blocks, total, pageHeight);

      const pdf = new root.jspdf.jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
      for (let index = 0; index < pages.length; index++) {
        const page = pages[index];
        const canvas = await root.html2canvas(doc.body, {
          scale: 2, backgroundColor: "#ffffff", logging: false, useCORS: true,
          x: 0, y: Math.floor(page.top), width: VIEWPORT_PX, height: Math.ceil(page.height),
          windowWidth: VIEWPORT_PX, windowHeight: total, scrollX: 0, scrollY: 0
        });
        if (index > 0) pdf.addPage();
        pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", MARGIN_MM, MARGIN_MM, CONTENT_WIDTH_MM, Math.ceil(page.height) * CONTENT_WIDTH_MM / VIEWPORT_PX);
      }
      const file = new File([pdf.output("blob")], fileName, { type: "application/pdf" });
      return { file, pages: pages.length };
    } finally {
      frame.remove();
    }
  }

  // Nome sem acento para o download de reserva: com acento alguns navegadores descartam o nome.
  const asciiName = name => String(name || "orcamento.pdf").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7e]/g, "");

  function download(file) {
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = asciiName(file.name);
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  // Precisa ser chamada direto no toque: o iPhone só abre o compartilhar dentro do gesto.
  // Devolve "shared", "cancelled" ou "downloaded".
  async function share(file, title) {
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title });
        return "shared";
      } catch (error) {
        if (error && error.name === "AbortError") return "cancelled";
      }
    }
    download(file);
    return "downloaded";
  }

  return { isIOS, planPages, asciiName, build, share };
});
