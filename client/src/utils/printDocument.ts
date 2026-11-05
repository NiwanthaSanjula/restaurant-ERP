export const POS_PRINT_CSS = "\r\n    body{font-family:Arial,sans-serif;margin:0;padding:8px;color:#111;background:#fff;color-scheme:light}\r\n    .r{width:80mm;margin:0 auto}\r\n    h2,p{margin:0}\r\n    .c{text-align:center}.mt{margin-top:6px}.line{border-top:1px dashed #000;margin:6px 0}\r\n    table{width:100%;border-collapse:collapse;font-size:12px}\r\n    td{padding:2px 0;vertical-align:top}\r\n    .small{font-size:11px}\r\n  ";

/** Existing receipt iframe print path; no API mutations. */
export function printBillHtml(html: string): void {
  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:none;";
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow?.document;
  if (!doc) {
    document.body.removeChild(iframe);
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();

  const doPrint = () => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    const remove = () => {
      if (document.body.contains(iframe)) document.body.removeChild(iframe);
    };
    iframe.contentWindow?.addEventListener("afterprint", remove);
    setTimeout(remove, 3000);
  };

  const tryPrint = () => {
    const images = Array.from(doc.images);
    if (images.length === 0) {
      setTimeout(doPrint, 100);
      return;
    }
    let loaded = 0;
    const check = () => {
      loaded += 1;
      if (loaded >= images.length) setTimeout(doPrint, 50);
    };
    images.forEach((img) => {
      if (img.complete) check();
      else {
        img.onload = check;
        img.onerror = check;
      }
    });
  };

  setTimeout(tryPrint, 150);
}
