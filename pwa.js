const APP_VERSION = "20260926a";

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register(`/sw.js?v=${APP_VERSION}`).then(registration => registration.update()).catch(() => {}));
}

const quoteMoney = value => new Intl.NumberFormat("pt-BR", {style:"currency",currency:"BRL"}).format(+value || 0);
const hasPromotion = item => Number.isFinite(+item.valor_original) && +item.valor_original > +item.valor_unitario;
const quoteInstallment = quote => (+quote.valor_total || 0) * 1.14 / 3;

const quoteWhatsAppButton = document.getElementById("sendWhatsApp");
if (quoteWhatsAppButton) {
  quoteWhatsAppButton.onclick = () => {
    const quote = current;
    const phone = (quote?.clientes?.telefone || "").replace(/\D/g, "");
    if (!phone) return toast("Cadastre o WhatsApp do cliente.");
    const itemLines = quote.orcamento_itens.map(item => {
      const price = hasPromotion(item) ? quoteMoney(item.valor_original) + " por " + quoteMoney(item.valor_unitario) : quoteMoney(item.valor_unitario);
      return "• " + item.quantidade + "x " + item.nome + " — " + price;
    }).join("\n");
    const message = "Olá, " + (quote.clientes?.nome || "") + "! Segue seu orçamento Bez Clean:\n\n" + itemLines + "\n\nÀ vista: " + quoteMoney(quote.valor_total) + "\nCartão: 3x de " + quoteMoney(quoteInstallment(quote)) + (quote.validade_em ? "\nVálido até: " + new Date(quote.validade_em + "T12:00").toLocaleDateString("pt-BR") : "") + "\n\nFicamos à disposição para agendar!";
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
    const date = value => value ? new Date(value + "T12:00").toLocaleDateString("pt-BR") : "Não informada";
    const originalTotal = quote.orcamento_itens.reduce((sum, item) => sum + (+item.quantidade || 0) * (hasPromotion(item) ? +item.valor_original : +item.valor_unitario || 0), 0);
    const savings = Math.max(0, originalTotal - (+quote.valor_total || 0));
    const itemRows = quote.orcamento_itens.map(item => {
      const unitPrice = hasPromotion(item) ? '<span class="old-price">' + quoteMoney(item.valor_original) + '</span><strong class="promo-price">' + quoteMoney(item.valor_unitario) + '</strong>' : '<strong>' + quoteMoney(item.valor_unitario) + '</strong>';
      return "<tr><td>" + item.quantidade + "</td><td><strong>" + escapeHtml(item.nome) + "</strong>" + (item.observacoes ? "<small>" + escapeHtml(item.observacoes) + "</small>" : "") + "</td><td>" + unitPrice + "</td><td><strong>" + quoteMoney(item.valor_total) + "</strong></td></tr>";
    }).join("");
    const pdfWindow = window.open("", "_blank");
    if (!pdfWindow) return toast("Permita a abertura de nova aba para gerar o PDF.");

    pdfWindow.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Orçamento Bez Clean</title><style>
@page{size:A4;margin:12mm}*{box-sizing:border-box}body{margin:0;color:#17324d;font:13px Arial,sans-serif;line-height:1.4}.header{display:flex;align-items:center;justify-content:space-between;padding:18px 21px;color:#fff;background:linear-gradient(135deg,#082f5b,#0d609c);border-radius:14px}.brand{display:flex;align-items:center;gap:12px}.brand img{width:58px;height:58px;object-fit:contain;background:#fff;border-radius:12px}.brand strong{display:block;font-size:23px}.brand span,.document-title span{display:block;margin-top:3px;color:#d6f3fa}.document-title{text-align:right}.document-title strong{display:block;font-size:24px;letter-spacing:.04em}.meta{display:grid;grid-template-columns:1fr 1fr;gap:11px;margin:18px 0}.box{min-height:76px;padding:12px 14px;background:#f1f8fb;border:1px solid #d4e7ef;border-radius:10px}.box span{display:block;margin-bottom:5px;color:#567187;font-size:10px;font-weight:bold;letter-spacing:.08em;text-transform:uppercase}.box strong{font-size:15px}.box p{margin:4px 0 0;color:#5d7082}.section-title{margin:19px 0 8px;color:#0b3867;font-size:14px}table{width:100%;border-collapse:collapse}th{padding:9px;color:#49677f;background:#e6f8fc;border-bottom:1px solid #b9d5e4;font-size:10px;letter-spacing:.06em;text-align:left;text-transform:uppercase}td{padding:10px 9px;border-bottom:1px solid #dce8ee;vertical-align:top}td:first-child{width:45px}td:nth-child(3),td:nth-child(4),th:nth-child(3),th:nth-child(4){text-align:right;white-space:nowrap}td small{display:block;margin-top:3px;color:#607789}.old-price{display:block;color:#8a99a7;font-size:11px;text-decoration:line-through}.promo-price{display:block;color:#08724f}.summary{display:grid;grid-template-columns:1fr 1.15fr;gap:11px;margin-top:16px}.saving{display:flex;flex-direction:column;justify-content:center;padding:13px 15px;color:#086344;background:#e7f8ef;border:1px solid #bee6d1;border-radius:10px}.saving span{font-size:11px}.saving strong{font-size:19px}.total{padding:13px 16px;color:#fff;background:#1268b3;border-radius:10px;text-align:right}.total span{display:block;font-size:11px}.total strong{display:block;font-size:23px}.payment{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px}.payment div{padding:11px 13px;background:#fff8e7;border:1px solid #eedaa8;border-radius:9px}.payment span{display:block;color:#78612b;font-size:10px;font-weight:bold;text-transform:uppercase}.payment strong{display:block;margin-top:3px;color:#5f4712;font-size:16px}.notes{margin-top:16px;padding:12px 14px;background:#fff7e5;border-left:4px solid #d5a12e;border-radius:8px}.notes strong{display:block;margin-bottom:4px}.procedure{margin-top:18px;padding:14px 16px;background:#edf8fb;border:1px solid #cce6ed;border-radius:10px}.procedure h2{margin:0 0 6px;color:#0b3867;font-size:14px}.procedure p{margin:0;color:#476277;font-size:11.5px;line-height:1.55}.footer{margin-top:20px;padding-top:12px;border-top:1px solid #cbdce5;text-align:center;color:#526c80;font-size:10.5px}.footer strong{display:block;color:#0b3867;font-size:12px}.footer a{color:#0b6097;text-decoration:none}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style></head><body><header class="header"><div class="brand"><img src="https://bezclean.com.br/imagens/LOGO.png" alt="Bez Clean"><div><strong>BeZ Clean</strong><span>Higienização de estofados</span></div></div><div class="document-title"><strong>ORÇAMENTO</strong><span>Emitido em ${new Date().toLocaleDateString("pt-BR")}</span></div></header><section class="meta"><div class="box"><span>Cliente</span><strong>${escapeHtml(quote.clientes?.nome || "Cliente")}</strong><p>${escapeHtml(quote.clientes?.telefone || "")}</p></div><div class="box"><span>Validade e local</span><strong>${date(quote.validade_em)}</strong><p>${escapeHtml(quote.endereco || "Endereço a confirmar")}</p></div></section><h2 class="section-title">Descrição dos serviços</h2><table><thead><tr><th>Qtd.</th><th>Serviço</th><th>Valor unitário</th><th>Total</th></tr></thead><tbody>${itemRows}</tbody></table><section class="summary">${savings > 0 ? `<div class="saving"><span>Você economiza</span><strong>${quoteMoney(savings)}</strong></div>` : `<div></div>`}<div class="total"><span>Valor à vista</span><strong>${quoteMoney(quote.valor_total)}</strong></div></section><section class="payment"><div><span>Pix ou dinheiro</span><strong>${quoteMoney(quote.valor_total)}</strong></div><div><span>Cartão de crédito</span><strong>3x de ${quoteMoney(quoteInstallment(quote))}</strong></div></section>${quote.observacoes ? `<section class="notes"><strong>Observações</strong>${escapeHtml(quote.observacoes).replace(/\n/g, "<br>")}</section>` : ""}<section class="procedure"><h2>Como realizamos a higienização</h2><p>Iniciamos com a avaliação do estofado e aspiração técnica. Em seguida, aplicamos produtos profissionais de forma controlada, fazemos a escovação adequada ao tecido e a extração da sujeira. Ao final, orientamos sobre ventilação e secagem, cujo tempo pode variar conforme o material e o clima.</p></section><footer class="footer"><strong>BeZ Clean — Higienização de Estofados</strong><div>26.077.324 Bruna Sousa de Oliveira · CNPJ 26.077.324/0001-11</div><div><a href="https://bezclean.com.br">bezclean.com.br</a></div></footer></body></html>`);
    pdfWindow.document.close();
    pdfWindow.onload = () => { pdfWindow.focus(); pdfWindow.print(); };
  };
}
