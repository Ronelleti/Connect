export function schedulePdfFilename(weekStart: string) {
  return `wecomconnect-schedule-${weekStart}.pdf`;
}

export async function createSchedulePdf(element: HTMLElement) {
  // Ensure the exported image uses the same self-hosted font as the live interface.
  await document.fonts?.ready;
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas-pro"),
    import("jspdf")
  ]);
  const width = element.scrollWidth;
  const height = element.scrollHeight;
  // Render at the full scroll width so mobile exports include off-screen days.
  const canvas = await html2canvas(element, {
    backgroundColor: "#ffffff",
    scale: 2,
    useCORS: true,
    width,
    height,
    windowWidth: Math.max(document.documentElement.clientWidth, width),
    ignoreElements: (node) => node instanceof HTMLElement && node.dataset.pdfHide === "true",
    onclone: (documentClone) => {
      const clone = documentClone.querySelector<HTMLElement>("[data-pdf-target='schedule']");
      if (clone) {
        clone.style.width = `${width}px`;
        clone.style.overflow = "visible";
      }
      documentClone.querySelectorAll<HTMLElement>(".pdf-only").forEach((node) => {
        node.style.display = "flex";
      });
    }
  });

  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const margin = 10;
  const pageWidth = pdf.internal.pageSize.getWidth() - margin * 2;
  const pageHeight = pdf.internal.pageSize.getHeight() - margin * 2;
  const scale = Math.min(pageWidth / canvas.width, pageHeight / canvas.height);
  const imageWidth = canvas.width * scale;
  const imageHeight = canvas.height * scale;
  pdf.addImage(
    canvas.toDataURL("image/png"),
    "PNG",
    margin + (pageWidth - imageWidth) / 2,
    margin + (pageHeight - imageHeight) / 2,
    imageWidth,
    imageHeight,
    undefined,
    "FAST"
  );
  return pdf.output("blob");
}

export async function shareOrDownloadPdf(blob: Blob, filename: string) {
  const file = new File([blob], filename, { type: "application/pdf" });
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "סידור עבודה Wecomconnect" });
      return "shared" as const;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return "cancelled" as const;
      }
    }
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return "downloaded" as const;
}
