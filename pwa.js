const APP_VERSION = "20260922a";

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`/sw.js?v=${APP_VERSION}`).then(registration => registration.update()).catch(() => {});
  });
}

const quoteWhatsAppButton = document.getElementById("sendWhatsApp");
if (quoteWhatsAppButton) {
  quoteWhatsAppButton.onclick = () => {
    const quote = current;
    const phone = (quote?.clientes?.telefone || "").replace(/\D/g, "");
    if (!phone) {
      toast("Cadastre o WhatsApp do cliente.");
      return;
    }
    const message = "Olá, " + (quote.clientes?.nome || "") + "! Segue seu orçamento Bez Clean:\n\n" + quote.orcamento_itens.map(item => "• " + item.quantidade + "x " + item.nome + " — " + new Intl.NumberFormat("pt-BR", {style:"currency",currency:"BRL"}).format(+item.valor_total || 0)).join("\n") + "\n\nTotal: " + new Intl.NumberFormat("pt-BR", {style:"currency",currency:"BRL"}).format(+quote.valor_total || 0) + (quote.validade_em ? "\nVálido até: " + new Date(quote.validade_em + "T12:00").toLocaleDateString("pt-BR") : "") + "\n\nFicamos à disposição para agendar!";
    const number = phone.length === 11 ? "55" + phone : phone;
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    const url = isMobile ? "https://wa.me/" + number + "?text=" + encodeURIComponent(message) : "https://web.whatsapp.com/send?phone=" + number + "&text=" + encodeURIComponent(message);
    window.open(url, "_blank", "noopener");
  };
}

const quoteDetailActions = document.querySelector(".detail-actions");
if (quoteDetailActions) {
  const generatePdfButton = document.createElement("button");
  generatePdfButton.id = "generateQuotePdf";
  generatePdfButton.type = "button";
  generatePdfButton.className = "secondary";
  generatePdfButton.textContent = "Gerar PDF";
  quoteDetailActions.insertBefore(generatePdfButton, quoteWhatsAppButton || quoteDetailActions.firstChild);

  generatePdfButton.onclick = () => {
    const quote = current;
    if (!quote) return;

    const escapeHtml = value => String(value || "").replace(/[&<>\"']/g, character => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"})[character]);
    const money = value => new Intl.NumberFormat("pt-BR", {style:"currency",currency:"BRL"}).format(+value || 0);
    const date = value => value ? new Date(value + "T12:00").toLocaleDateString("pt-BR") : "Não informada";
    const itemRows = quote.orcamento_itens.map(item => "<tr><td>" + item.quantidade + "</td><td><strong>" + escapeHtml(item.nome) + "</strong>" + (item.observacoes ? "<small>" + escapeHtml(item.observacoes) + "</small>" : "") + "</td><td>" + money(item.valor_unitario) + "</td><td>" + money(item.valor_total) + "</td></tr>").join("");
    const pdfWindow = window.open("", "_blank");
    if (!pdfWindow) {
      toast("Permita a abertura de nova aba para gerar o PDF.");
      return;
    }

    pdfWindow.document.write("<!doctype html><html lang=\"pt-BR\"><head><meta charset=\"utf-8\"><title>Orçamento Bez Clean</title><style>@page{size:A4;margin:14mm}*{box-sizing:border-box}body{margin:0;color:#132b43;font:14px Arial,sans-serif}.header{display:flex;align-items:center;justify-content:space-between;padding:18px 22px;color:#fff;background:#0b3867;border-radius:14px}.brand{display:flex;align-items:center;gap:12px}.brand img{width:52px;height:52px;object-fit:contain;background:#fff;border-radius:10px}.brand strong{display:block;font-size:22px}.brand span{display:block;margin-top:4px;color:#c7edf7}.document-title{text-align:right}.document-title strong{display:block;font-size:24px}.document-title span{display:block;margin-top:4px;color:#c7edf7}.meta{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:22px 0}.box{min-height:84px;padding:14px 16px;background:#f0f7fb;border:1px solid #d9e6ee;border-radius:10px}.box span{display:block;margin-bottom:6px;color:#5d7082;font-size:11px;font-weight:bold;letter-spacing:.08em;text-transform:uppercase}.box strong{font-size:16px}.box p{margin:5px 0 0;color:#5d7082;line-height:1.45}h2{margin:24px 0 9px;color:#0b3867;font-size:15px}table{width:100%;border-collapse:collapse}th{padding:10px;color:#5d7082;background:#e6f8fc;border-bottom:1px solid #b9d5e4;font-size:11px;letter-spacing:.05em;text-align:left;text-transform:uppercase}td{padding:12px 10px;border-bottom:1px solid #d9e6ee;vertical-align:top}td:first-child{width:48px}td:nth-child(3),td:nth-child(4),th:nth-child(3),th:nth-child(4){text-align:right;white-space:nowrap}td small{display:block;margin-top:4px;color:#5d7082}.total{display:flex;justify-content:flex-end;align-items:center;gap:28px;margin-top:18px;padding:15px 18px;color:#fff;background:#1268b3;border-radius:10px}.total span{font-size:15px;font-weight:bold}.total strong{font-size:23px}.notes{margin-top:22px;padding:14px 16px;background:#fff6df;border-left:4px solid #9a6508;border-radius:8px;line-height:1.5}.notes strong{display:block;margin-bottom:5px}.footer{margin-top:34px;padding-top:14px;color:#5d7082;border-top:1px solid #d9e6ee;font-size:11px;line-height:1.5}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body><header class=\"header\"><div class=\"brand\"><img src=\"https://bezclean.com.br/imagens/LOGO.png\" alt=\"Bez Clean\"><div><strong>Bez Clean</strong><span>Higienização de estofados</span></div></div><div class=\"document-title\"><strong>ORÇAMENTO</strong><span>Emitido em " + new Date().toLocaleDateString("pt-BR") + "</span></div></header><section class=\"meta\"><div class=\"box\"><span>Cliente</span><strong>" + escapeHtml(quote.clientes?.nome || "Cliente") + "</strong><p>" + escapeHtml(quote.clientes?.telefone || "") + "</p></div><div class=\"box\"><span>Validade</span><strong>" + date(quote.validade_em) + "</strong><p>" + escapeHtml(quote.endereco || "Endereço a confirmar") + "</p></div></section><h2>Itens do orçamento</h2><table><thead><tr><th>Qtd.</th><th>Serviço</th><th>Unitário</th><th>Total</th></tr></thead><tbody>" + itemRows + "</tbody></table><div class=\"total\"><span>Valor total do orçamento</span><strong>" + money(quote.valor_total) + "</strong></div>" + (quote.observacoes ? "<section class=\"notes\"><strong>Observações</strong>" + escapeHtml(quote.observacoes).replace(/\n/g, "<br>") + "</section>" : "") + "<footer class=\"footer\">Obrigado por escolher a Bez Clean. Este orçamento é válido até a data informada acima e poderá ser ajustado caso haja alteração nas peças ou nas condições do atendimento.</footer></body></html>");
    pdfWindow.document.close();
    pdfWindow.onload = () => {
      pdfWindow.focus();
      pdfWindow.print();
    };
  };
}
